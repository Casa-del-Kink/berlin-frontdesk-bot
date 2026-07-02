import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { DateTime } from "luxon";
import pg from "pg";

// Store backends. JSON remains useful for demos and credential-free tests; Postgres is the
// production/multi-worker backend for paid pilots.

export interface Msg {
  role: "user" | "assistant";
  content: string;
  createdAt?: string;
}

export type LeadStatus = "booked" | "needs_followup";
export type LeadChannel = "whatsapp" | "phone" | "server_tool" | "unknown";

export interface Lead {
  phone: string;
  name?: string;
  service?: string;
  status: LeadStatus;
  channel?: LeadChannel;
  notes?: string;
  startISO?: string;
  estimatedValueCents?: number;
  /** Stable key used to make provider retries safe. */
  idempotencyKey?: string;
  createdAt: string; // ISO
}

export interface AddLeadResult {
  lead: Lead;
  inserted: boolean;
}

export interface AddCallOutcomeResult {
  outcome: CallOutcome;
  inserted: boolean;
}

export interface CallOutcome {
  callId: string;
  phone: string;
  status: "booked" | "needs_followup" | "answered" | "missed" | "voicemail" | "failed";
  summary?: string;
  transcriptUrl?: string;
  recordingUrl?: string;
  createdAt: string;
}

export interface DailyMetrics {
  dateISO: string;
  inquiries: number;
  booked: number;
  followups: number;
  estimatedBookedRevenueCents: number;
  estimatedPipelineRevenueCents: number;
  byChannel: Record<LeadChannel, number>;
}

export interface SubjectDataExport {
  phone: string;
  conversations: Msg[];
  leads: Lead[];
  callOutcomes: CallOutcome[];
  pausedUntil?: string;
}

export interface SubjectDataDeletion {
  phone: string;
  conversationsDeleted: number;
  leadsDeleted: number;
  callOutcomesDeleted: number;
}

export interface RetentionPurgeResult {
  cutoffISO: string;
  conversationsDeleted: number;
  leadsDeleted: number;
  callOutcomesDeleted: number;
  dryRun: boolean;
}

interface State {
  conversations: Record<string, Msg[]>;
  leads: Lead[];
  callOutcomes: CallOutcome[];
  pauses: Record<string, string>; // phone -> pausedUntil ISO
}

type MaybePromise<T> = T | Promise<T>;

export interface StoreBackend {
  readonly name: "json" | "postgres";
  getHistory(phone: string): MaybePromise<Msg[]>;
  addMessage(phone: string, role: Msg["role"], content: string): MaybePromise<void>;
  addLead(lead: Lead): MaybePromise<AddLeadResult>;
  leadByIdempotencyKey(idempotencyKey: string): MaybePromise<Lead | undefined>;
  bookedLead(phone: string, service: string, startISO: string): MaybePromise<Lead | undefined>;
  leadsOn(dateISO: string, tz: string): MaybePromise<Lead[]>;
  addCallOutcome(outcome: CallOutcome): MaybePromise<AddCallOutcomeResult>;
  callOutcomesOn(dateISO: string, tz: string): MaybePromise<CallOutcome[]>;
  metricsOn(dateISO: string, tz: string): MaybePromise<DailyMetrics>;
  exportSubjectData(phone: string): MaybePromise<SubjectDataExport>;
  purgeOldData(maxAgeDays: number, dryRun?: boolean): MaybePromise<RetentionPurgeResult>;
  deleteSubjectData(phone: string): MaybePromise<SubjectDataDeletion>;
  withBookingLock<T>(key: string, fn: () => Promise<T>): Promise<T>;
  setConversationPause(phone: string, hours: number): MaybePromise<string>;
  clearConversationPause(phone: string): MaybePromise<void>;
  getConversationPause(phone: string): MaybePromise<string | undefined>;
}

class JsonStoreBackend implements StoreBackend {
  readonly name = "json" as const;
  private state: State = { conversations: {}, leads: [], callOutcomes: [], pauses: {} };
  private readonly file = process.env.STATE_FILE || "data/state.json";
  private readonly maxHistoryPerPhone = Number(process.env.MAX_HISTORY_PER_PHONE || 50);
  private readonly inProcessLocks = new Map<string, Promise<unknown>>();

  constructor() {
    if (existsSync(this.file)) {
      const loaded = JSON.parse(readFileSync(this.file, "utf8")) as Partial<State>;
      this.state = {
        conversations: loaded.conversations ?? {},
        leads: loaded.leads ?? [],
        callOutcomes: loaded.callOutcomes ?? [],
        pauses: loaded.pauses ?? {},
      };
    }
  }

  getHistory(phone: string): Msg[] {
    return this.state.conversations[phone] ?? [];
  }

  addMessage(phone: string, role: Msg["role"], content: string) {
    const history = (this.state.conversations[phone] ??= []);
    history.push({ role, content, createdAt: new Date().toISOString() });
    if (history.length > this.maxHistoryPerPhone) this.state.conversations[phone] = history.slice(-this.maxHistoryPerPhone);
    this.persist();
  }

  addLead(lead: Lead): AddLeadResult {
    const normalized = { ...lead, channel: lead.channel ?? "unknown" };
    if (normalized.idempotencyKey) {
      const existing = this.state.leads.find((stored) => stored.idempotencyKey === normalized.idempotencyKey);
      if (existing) return { lead: existing, inserted: false };
    }

    this.state.leads.push(normalized);
    this.persist();
    return { lead: normalized, inserted: true };
  }

  leadByIdempotencyKey(idempotencyKey: string): Lead | undefined {
    return this.state.leads.find((lead) => lead.idempotencyKey === idempotencyKey);
  }

  bookedLead(phone: string, service: string, startISO: string): Lead | undefined {
    const startMs = DateTime.fromISO(startISO).toMillis();
    return this.state.leads.find((lead) => {
      if (lead.status !== "booked" || lead.phone !== phone || lead.service !== service || !lead.startISO) return false;
      return lead.startISO === startISO || DateTime.fromISO(lead.startISO).toMillis() === startMs;
    });
  }

  leadsOn(dateISO: string, tz: string): Lead[] {
    return this.state.leads.filter((l) => DateTime.fromISO(l.createdAt).setZone(tz).toISODate() === dateISO);
  }

  addCallOutcome(outcome: CallOutcome): AddCallOutcomeResult {
    const existing = this.state.callOutcomes.find((stored) => stored.callId === outcome.callId);
    if (existing) return { outcome: existing, inserted: false };

    this.state.callOutcomes.push(outcome);
    this.persist();
    return { outcome, inserted: true };
  }

  callOutcomesOn(dateISO: string, tz: string): CallOutcome[] {
    return this.state.callOutcomes.filter((c) => DateTime.fromISO(c.createdAt).setZone(tz).toISODate() === dateISO);
  }

  metricsOn(dateISO: string, tz: string): DailyMetrics {
    return metricsFromLeads(this.leadsOn(dateISO, tz), dateISO);
  }

  exportSubjectData(phone: string): SubjectDataExport {
    return {
      phone,
      conversations: [...(this.state.conversations[phone] ?? [])],
      leads: this.state.leads.filter((lead) => lead.phone === phone),
      callOutcomes: this.state.callOutcomes.filter((call) => call.phone === phone),
      pausedUntil: this.state.pauses[phone],
    };
  }

  purgeOldData(maxAgeDays: number, dryRun = false): RetentionPurgeResult {
    if (!Number.isFinite(maxAgeDays) || maxAgeDays <= 0) throw new Error("maxAgeDays must be a positive number");

    const cutoff = DateTime.now().minus({ days: maxAgeDays });
    const cutoffISO = cutoff.toISO()!;
    let conversationsDeleted = 0;

    const nextConversations: State["conversations"] = {};
    for (const [phone, messages] of Object.entries(this.state.conversations)) {
      const kept = messages.filter((msg) => {
        // Legacy messages without timestamps are retained until subject delete or Postgres migration.
        if (!msg.createdAt) return true;
        return DateTime.fromISO(msg.createdAt) >= cutoff;
      });
      conversationsDeleted += messages.length - kept.length;
      if (kept.length > 0) nextConversations[phone] = kept;
    }

    const nextLeads = this.state.leads.filter((lead) => DateTime.fromISO(lead.createdAt) >= cutoff);
    const leadsDeleted = this.state.leads.length - nextLeads.length;
    const nextCallOutcomes = this.state.callOutcomes.filter((call) => DateTime.fromISO(call.createdAt) >= cutoff);
    const callOutcomesDeleted = this.state.callOutcomes.length - nextCallOutcomes.length;

    if (!dryRun && (conversationsDeleted > 0 || leadsDeleted > 0 || callOutcomesDeleted > 0)) {
      this.state.conversations = nextConversations;
      this.state.leads = nextLeads;
      this.state.callOutcomes = nextCallOutcomes;
      this.persist();
    }

    return { cutoffISO, conversationsDeleted, leadsDeleted, callOutcomesDeleted, dryRun };
  }

  deleteSubjectData(phone: string): SubjectDataDeletion {
    const conversationsDeleted = this.state.conversations[phone]?.length ?? 0;
    delete this.state.conversations[phone];

    const before = this.state.leads.length;
    this.state.leads = this.state.leads.filter((lead) => lead.phone !== phone);
    const leadsDeleted = before - this.state.leads.length;

    const callsBefore = this.state.callOutcomes.length;
    this.state.callOutcomes = this.state.callOutcomes.filter((call) => call.phone !== phone);
    const callOutcomesDeleted = callsBefore - this.state.callOutcomes.length;

    const hadPause = phone in this.state.pauses;
    delete this.state.pauses[phone];

    if (conversationsDeleted > 0 || leadsDeleted > 0 || callOutcomesDeleted > 0 || hadPause) this.persist();
    return { phone, conversationsDeleted, leadsDeleted, callOutcomesDeleted };
  }

  /**
   * Serializes critical sections inside this Node process. Postgres deployments back this seam
   * with advisory locks so multiple workers share the lock.
   */
  async withBookingLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prior = this.inProcessLocks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const chained = prior.then(() => current);
    this.inProcessLocks.set(key, chained);

    try {
      await prior;
      return await fn();
    } finally {
      release();
      if (this.inProcessLocks.get(key) === chained) this.inProcessLocks.delete(key);
    }
  }

  setConversationPause(phone: string, hours: number): string {
    const pausedUntil = DateTime.now().plus({ hours }).toISO()!;
    this.state.pauses[phone] = pausedUntil;
    this.persist();
    return pausedUntil;
  }

  clearConversationPause(phone: string): void {
    if (phone in this.state.pauses) {
      delete this.state.pauses[phone];
      this.persist();
    }
  }

  getConversationPause(phone: string): string | undefined {
    return this.state.pauses[phone];
  }

  private persist() {
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.state, null, 2));
    renameSync(tmp, this.file);
  }
}

const { Pool } = pg;

type DbLeadRow = {
  phone: string;
  name: string | null;
  service: string | null;
  status: LeadStatus;
  channel: LeadChannel | null;
  notes: string | null;
  start_iso: string | null;
  estimated_value_cents: number | null;
  idempotency_key: string | null;
  created_at: Date | string;
};

type DbCallRow = {
  call_id: string;
  phone: string;
  status: CallOutcome["status"];
  summary: string | null;
  transcript_url: string | null;
  recording_url: string | null;
  created_at: Date | string;
};

class PostgresStoreBackend implements StoreBackend {
  readonly name = "postgres" as const;
  private readonly pool: pg.Pool;
  private readonly ready: Promise<void>;
  private readonly maxHistoryPerPhone = Number(process.env.MAX_HISTORY_PER_PHONE || 50);

  constructor() {
    const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!connectionString) throw new Error("STORE_BACKEND=postgres requires DATABASE_URL or POSTGRES_URL");
    this.pool = new Pool({
      connectionString,
      ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: false } : undefined,
    });
    this.ready = this.migrate();
  }

  async getHistory(phone: string): Promise<Msg[]> {
    await this.ready;
    const result = await this.pool.query(
      `select role, content, created_at from conversations where phone = $1 order by id asc`,
      [phone],
    );
    return result.rows.map((row) => ({ role: row.role, content: row.content, createdAt: iso(row.created_at) }));
  }

  async addMessage(phone: string, role: Msg["role"], content: string): Promise<void> {
    await this.ready;
    await this.pool.query(
      `insert into conversations (phone, role, content, created_at) values ($1, $2, $3, now())`,
      [phone, role, content],
    );
    await this.pool.query(
      `delete from conversations where phone = $1 and id not in (
        select id from conversations where phone = $1 order by id desc limit $2
      )`,
      [phone, this.maxHistoryPerPhone],
    );
  }

  async addLead(lead: Lead): Promise<AddLeadResult> {
    await this.ready;
    const normalized = { ...lead, channel: lead.channel ?? "unknown" };
    if (normalized.idempotencyKey) {
      const inserted = await this.pool.query<DbLeadRow>(
        `insert into leads (phone, name, service, status, channel, notes, start_iso, start_utc, estimated_value_cents, idempotency_key, created_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8::timestamptz,$9,$10,$11::timestamptz)
         on conflict (idempotency_key) where idempotency_key is not null do nothing
         returning phone, name, service, status, channel, notes, start_iso, estimated_value_cents, idempotency_key, created_at`,
        leadValues(normalized),
      );
      if (inserted.rows[0]) return { lead: leadFromRow(inserted.rows[0]), inserted: true };
      const existing = await this.leadByIdempotencyKey(normalized.idempotencyKey);
      if (existing) return { lead: existing, inserted: false };
    }

    const inserted = await this.pool.query<DbLeadRow>(
      `insert into leads (phone, name, service, status, channel, notes, start_iso, start_utc, estimated_value_cents, idempotency_key, created_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8::timestamptz,$9,$10,$11::timestamptz)
       returning phone, name, service, status, channel, notes, start_iso, estimated_value_cents, idempotency_key, created_at`,
      leadValues(normalized),
    );
    return { lead: leadFromRow(inserted.rows[0]), inserted: true };
  }

  async leadByIdempotencyKey(idempotencyKey: string): Promise<Lead | undefined> {
    await this.ready;
    const result = await this.pool.query<DbLeadRow>(
      `select phone, name, service, status, channel, notes, start_iso, estimated_value_cents, idempotency_key, created_at
       from leads where idempotency_key = $1 limit 1`,
      [idempotencyKey],
    );
    return result.rows[0] ? leadFromRow(result.rows[0]) : undefined;
  }

  async bookedLead(phone: string, service: string, startISO: string): Promise<Lead | undefined> {
    await this.ready;
    const startUtc = DateTime.fromISO(startISO).toUTC().toISO();
    const result = await this.pool.query<DbLeadRow>(
      `select phone, name, service, status, channel, notes, start_iso, estimated_value_cents, idempotency_key, created_at
       from leads
       where status = 'booked' and phone = $1 and service = $2
         and (start_iso = $3 or start_utc = $4::timestamptz)
       order by created_at asc limit 1`,
      [phone, service, startISO, startUtc],
    );
    return result.rows[0] ? leadFromRow(result.rows[0]) : undefined;
  }

  async leadsOn(dateISO: string, tz: string): Promise<Lead[]> {
    await this.ready;
    const result = await this.pool.query<DbLeadRow>(
      `select phone, name, service, status, channel, notes, start_iso, estimated_value_cents, idempotency_key, created_at
       from leads where (created_at at time zone $2)::date = $1::date order by created_at asc`,
      [dateISO, tz],
    );
    return result.rows.map(leadFromRow);
  }

  async addCallOutcome(outcome: CallOutcome): Promise<AddCallOutcomeResult> {
    await this.ready;
    const inserted = await this.pool.query<DbCallRow>(
      `insert into call_outcomes (call_id, phone, status, summary, transcript_url, recording_url, created_at)
       values ($1,$2,$3,$4,$5,$6,$7::timestamptz)
       on conflict (call_id) do nothing
       returning call_id, phone, status, summary, transcript_url, recording_url, created_at`,
      [outcome.callId, outcome.phone, outcome.status, outcome.summary ?? null, outcome.transcriptUrl ?? null, outcome.recordingUrl ?? null, outcome.createdAt],
    );
    if (inserted.rows[0]) return { outcome: callFromRow(inserted.rows[0]), inserted: true };

    const existing = await this.pool.query<DbCallRow>(
      `select call_id, phone, status, summary, transcript_url, recording_url, created_at from call_outcomes where call_id = $1`,
      [outcome.callId],
    );
    return { outcome: callFromRow(existing.rows[0]), inserted: false };
  }

  async callOutcomesOn(dateISO: string, tz: string): Promise<CallOutcome[]> {
    await this.ready;
    const result = await this.pool.query<DbCallRow>(
      `select call_id, phone, status, summary, transcript_url, recording_url, created_at
       from call_outcomes where (created_at at time zone $2)::date = $1::date order by created_at asc`,
      [dateISO, tz],
    );
    return result.rows.map(callFromRow);
  }

  async metricsOn(dateISO: string, tz: string): Promise<DailyMetrics> {
    return metricsFromLeads(await this.leadsOn(dateISO, tz), dateISO);
  }

  async exportSubjectData(phone: string): Promise<SubjectDataExport> {
    await this.ready;
    const [messages, leads, calls, pausedUntil] = await Promise.all([
      this.getHistory(phone),
      this.pool.query<DbLeadRow>(
        `select phone, name, service, status, channel, notes, start_iso, estimated_value_cents, idempotency_key, created_at
         from leads where phone = $1 order by created_at asc`,
        [phone],
      ),
      this.pool.query<DbCallRow>(
        `select call_id, phone, status, summary, transcript_url, recording_url, created_at
         from call_outcomes where phone = $1 order by created_at asc`,
        [phone],
      ),
      this.getConversationPause(phone),
    ]);
    return { phone, conversations: messages, leads: leads.rows.map(leadFromRow), callOutcomes: calls.rows.map(callFromRow), pausedUntil };
  }

  async purgeOldData(maxAgeDays: number, dryRun = false): Promise<RetentionPurgeResult> {
    if (!Number.isFinite(maxAgeDays) || maxAgeDays <= 0) throw new Error("maxAgeDays must be a positive number");
    await this.ready;
    const cutoffISO = DateTime.now().minus({ days: maxAgeDays }).toISO()!;
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const conversations = await client.query(`select count(*)::int as count from conversations where created_at < $1::timestamptz`, [cutoffISO]);
      const leads = await client.query(`select count(*)::int as count from leads where created_at < $1::timestamptz`, [cutoffISO]);
      const calls = await client.query(`select count(*)::int as count from call_outcomes where created_at < $1::timestamptz`, [cutoffISO]);
      const result = {
        cutoffISO,
        conversationsDeleted: Number(conversations.rows[0].count),
        leadsDeleted: Number(leads.rows[0].count),
        callOutcomesDeleted: Number(calls.rows[0].count),
        dryRun,
      };
      if (!dryRun) {
        await client.query(`delete from conversations where created_at < $1::timestamptz`, [cutoffISO]);
        await client.query(`delete from leads where created_at < $1::timestamptz`, [cutoffISO]);
        await client.query(`delete from call_outcomes where created_at < $1::timestamptz`, [cutoffISO]);
      }
      await client.query("commit");
      return result;
    } catch (e) {
      await client.query("rollback");
      throw e;
    } finally {
      client.release();
    }
  }

  async deleteSubjectData(phone: string): Promise<SubjectDataDeletion> {
    await this.ready;
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const conversations = await client.query(`delete from conversations where phone = $1`, [phone]);
      const leads = await client.query(`delete from leads where phone = $1`, [phone]);
      const calls = await client.query(`delete from call_outcomes where phone = $1`, [phone]);
      await client.query(`delete from conversation_pauses where phone = $1`, [phone]);
      await client.query("commit");
      return { phone, conversationsDeleted: conversations.rowCount ?? 0, leadsDeleted: leads.rowCount ?? 0, callOutcomesDeleted: calls.rowCount ?? 0 };
    } catch (e) {
      await client.query("rollback");
      throw e;
    } finally {
      client.release();
    }
  }

  async setConversationPause(phone: string, hours: number): Promise<string> {
    await this.ready;
    const result = await this.pool.query<{ paused_until: Date | string }>(
      `insert into conversation_pauses (phone, paused_until)
       values ($1, now() + ($2::text || ' hours')::interval)
       on conflict (phone) do update set paused_until = excluded.paused_until
       returning paused_until`,
      [phone, String(hours)],
    );
    return iso(result.rows[0].paused_until);
  }

  async clearConversationPause(phone: string): Promise<void> {
    await this.ready;
    await this.pool.query(`delete from conversation_pauses where phone = $1`, [phone]);
  }

  async getConversationPause(phone: string): Promise<string | undefined> {
    await this.ready;
    const result = await this.pool.query<{ paused_until: Date | string }>(
      `select paused_until from conversation_pauses where phone = $1`,
      [phone],
    );
    return result.rows[0] ? iso(result.rows[0].paused_until) : undefined;
  }

  async withBookingLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    await this.ready;
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query("select pg_advisory_xact_lock(hashtext($1))", [key]);
      const result = await fn();
      await client.query("commit");
      return result;
    } catch (e) {
      await client.query("rollback");
      throw e;
    } finally {
      client.release();
    }
  }

  private async migrate() {
    await this.pool.query(`
      create table if not exists conversations (
        id bigserial primary key,
        phone text not null,
        role text not null check (role in ('user', 'assistant')),
        content text not null,
        created_at timestamptz not null default now()
      );
      create index if not exists conversations_phone_id_idx on conversations (phone, id);
      create index if not exists conversations_created_at_idx on conversations (created_at);

      create table if not exists leads (
        id bigserial primary key,
        phone text not null,
        name text,
        service text,
        status text not null check (status in ('booked', 'needs_followup')),
        channel text not null default 'unknown' check (channel in ('whatsapp', 'phone', 'server_tool', 'unknown')),
        notes text,
        start_iso text,
        start_utc timestamptz,
        estimated_value_cents integer,
        idempotency_key text,
        created_at timestamptz not null default now()
      );
      create unique index if not exists leads_idempotency_key_uidx on leads (idempotency_key) where idempotency_key is not null;
      create index if not exists leads_phone_idx on leads (phone);
      create index if not exists leads_created_at_idx on leads (created_at);
      create index if not exists leads_booked_lookup_idx on leads (phone, service, start_utc) where status = 'booked';

      create table if not exists call_outcomes (
        call_id text primary key,
        phone text not null,
        status text not null check (status in ('booked', 'needs_followup', 'answered', 'missed', 'voicemail', 'failed')),
        summary text,
        transcript_url text,
        recording_url text,
        created_at timestamptz not null default now()
      );
      create index if not exists call_outcomes_phone_idx on call_outcomes (phone);
      create index if not exists call_outcomes_created_at_idx on call_outcomes (created_at);

      create table if not exists conversation_pauses (
        phone text primary key,
        paused_until timestamptz not null
      );
    `);
  }
}

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function leadValues(lead: Lead) {
  return [
    lead.phone,
    lead.name ?? null,
    lead.service ?? null,
    lead.status,
    lead.channel ?? "unknown",
    lead.notes ?? null,
    lead.startISO ?? null,
    lead.startISO ? DateTime.fromISO(lead.startISO).toUTC().toISO() : null,
    lead.estimatedValueCents ?? null,
    lead.idempotencyKey ?? null,
    lead.createdAt,
  ];
}

function leadFromRow(row: DbLeadRow): Lead {
  return {
    phone: row.phone,
    name: row.name ?? undefined,
    service: row.service ?? undefined,
    status: row.status,
    channel: row.channel ?? "unknown",
    notes: row.notes ?? undefined,
    startISO: row.start_iso ?? undefined,
    estimatedValueCents: row.estimated_value_cents ?? undefined,
    idempotencyKey: row.idempotency_key ?? undefined,
    createdAt: iso(row.created_at),
  };
}

function callFromRow(row: DbCallRow): CallOutcome {
  return {
    callId: row.call_id,
    phone: row.phone,
    status: row.status,
    summary: row.summary ?? undefined,
    transcriptUrl: row.transcript_url ?? undefined,
    recordingUrl: row.recording_url ?? undefined,
    createdAt: iso(row.created_at),
  };
}

function metricsFromLeads(leads: Lead[], dateISO: string): DailyMetrics {
  const booked = leads.filter((l) => l.status === "booked");
  const followups = leads.filter((l) => l.status === "needs_followup");
  const byChannel: Record<LeadChannel, number> = { whatsapp: 0, phone: 0, server_tool: 0, unknown: 0 };

  for (const lead of leads) byChannel[lead.channel ?? "unknown"] += 1;

  return {
    dateISO,
    inquiries: leads.length,
    booked: booked.length,
    followups: followups.length,
    estimatedBookedRevenueCents: booked.reduce((sum, lead) => sum + (lead.estimatedValueCents ?? 0), 0),
    estimatedPipelineRevenueCents: leads.reduce((sum, lead) => sum + (lead.estimatedValueCents ?? 0), 0),
    byChannel,
  };
}

function createStoreBackend(): StoreBackend {
  const backend = process.env.STORE_BACKEND || "json";
  if (backend === "json") return new JsonStoreBackend();
  if (backend === "postgres") return new PostgresStoreBackend();
  throw new Error(`STORE_BACKEND=${backend} is not implemented in this build. Supported backends: json, postgres.`);
}

const store = createStoreBackend();

export function getStoreBackend(): StoreBackend {
  return store;
}

export async function getHistory(phone: string): Promise<Msg[]> {
  return store.getHistory(phone);
}

export async function addMessage(phone: string, role: Msg["role"], content: string): Promise<void> {
  return store.addMessage(phone, role, content);
}

export async function addLead(lead: Lead): Promise<AddLeadResult> {
  return store.addLead(lead);
}

export async function leadByIdempotencyKey(idempotencyKey: string): Promise<Lead | undefined> {
  return store.leadByIdempotencyKey(idempotencyKey);
}

export async function bookedLead(phone: string, service: string, startISO: string): Promise<Lead | undefined> {
  return store.bookedLead(phone, service, startISO);
}

export async function leadsOn(dateISO: string, tz: string): Promise<Lead[]> {
  return store.leadsOn(dateISO, tz);
}

export async function addCallOutcome(outcome: CallOutcome): Promise<AddCallOutcomeResult> {
  return store.addCallOutcome(outcome);
}

export async function callOutcomesOn(dateISO: string, tz: string): Promise<CallOutcome[]> {
  return store.callOutcomesOn(dateISO, tz);
}

export async function metricsOn(dateISO: string, tz: string): Promise<DailyMetrics> {
  return store.metricsOn(dateISO, tz);
}

export async function exportSubjectData(phone: string): Promise<SubjectDataExport> {
  return store.exportSubjectData(phone);
}

export async function purgeOldData(maxAgeDays: number, dryRun = false): Promise<RetentionPurgeResult> {
  return store.purgeOldData(maxAgeDays, dryRun);
}

export async function deleteSubjectData(phone: string): Promise<SubjectDataDeletion> {
  return store.deleteSubjectData(phone);
}

export async function withBookingLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  return store.withBookingLock(key, fn);
}

export async function setConversationPause(phone: string, hours: number): Promise<string> {
  return store.setConversationPause(phone, hours);
}

export async function clearConversationPause(phone: string): Promise<void> {
  return store.clearConversationPause(phone);
}

export async function getConversationPause(phone: string): Promise<string | undefined> {
  return store.getConversationPause(phone);
}
