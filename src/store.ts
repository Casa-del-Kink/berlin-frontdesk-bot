import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { DateTime } from "luxon";

// Minimal JSON store. Enough for demos / first clients.
// Atomic writes reduce corruption risk; swap the backend implementation to Postgres before multi-worker paid pilots.

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
}

export interface StoreBackend {
  readonly name: "json";
  getHistory(phone: string): Msg[];
  addMessage(phone: string, role: Msg["role"], content: string): void;
  addLead(lead: Lead): AddLeadResult;
  leadByIdempotencyKey(idempotencyKey: string): Lead | undefined;
  bookedLead(phone: string, service: string, startISO: string): Lead | undefined;
  leadsOn(dateISO: string, tz: string): Lead[];
  addCallOutcome(outcome: CallOutcome): AddCallOutcomeResult;
  callOutcomesOn(dateISO: string, tz: string): CallOutcome[];
  metricsOn(dateISO: string, tz: string): DailyMetrics;
  exportSubjectData(phone: string): SubjectDataExport;
  purgeOldData(maxAgeDays: number, dryRun?: boolean): RetentionPurgeResult;
  deleteSubjectData(phone: string): SubjectDataDeletion;
  withBookingLock<T>(key: string, fn: () => Promise<T>): Promise<T>;
}

class JsonStoreBackend implements StoreBackend {
  readonly name = "json" as const;
  private state: State = { conversations: {}, leads: [], callOutcomes: [] };
  private readonly file = process.env.STATE_FILE || "data/state.json";
  private readonly maxHistoryPerPhone = Number(process.env.MAX_HISTORY_PER_PHONE || 50);
  private readonly inProcessLocks = new Map<string, Promise<unknown>>();

  constructor() {
    if (existsSync(this.file)) {
      const loaded = JSON.parse(readFileSync(this.file, "utf8")) as Partial<State>;
      this.state = { conversations: loaded.conversations ?? {}, leads: loaded.leads ?? [], callOutcomes: loaded.callOutcomes ?? [] };
    }
  }

  getHistory(phone: string): Msg[] {
    return this.state.conversations[phone] ?? [];
  }

  addMessage(phone: string, role: Msg["role"], content: string) {
    const history = (this.state.conversations[phone] ??= []);
    history.push({ role, content, createdAt: new Date().toISOString() });
    if (history.length > this.maxHistoryPerPhone) {
      this.state.conversations[phone] = history.slice(-this.maxHistoryPerPhone);
    }
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
    const leads = this.leadsOn(dateISO, tz);
    const booked = leads.filter((l) => l.status === "booked");
    const followups = leads.filter((l) => l.status === "needs_followup");
    const byChannel: Record<LeadChannel, number> = { whatsapp: 0, phone: 0, server_tool: 0, unknown: 0 };

    for (const lead of leads) {
      byChannel[lead.channel ?? "unknown"] += 1;
    }

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

  exportSubjectData(phone: string): SubjectDataExport {
    return {
      phone,
      conversations: [...(this.state.conversations[phone] ?? [])],
      leads: this.state.leads.filter((lead) => lead.phone === phone),
      callOutcomes: this.state.callOutcomes.filter((call) => call.phone === phone),
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

    if (conversationsDeleted > 0 || leadsDeleted > 0 || callOutcomesDeleted > 0) this.persist();
    return { phone, conversationsDeleted, leadsDeleted, callOutcomesDeleted };
  }

  /**
   * Serializes critical sections inside this Node process. Postgres deployments should
   * back this seam with advisory locks / SELECT FOR UPDATE so multiple workers share it.
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

  private persist() {
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.state, null, 2));
    renameSync(tmp, this.file);
  }
}

function createStoreBackend(): StoreBackend {
  const backend = process.env.STORE_BACKEND || "json";
  if (backend !== "json") {
    throw new Error(`STORE_BACKEND=${backend} is not implemented in this build. Keep STORE_BACKEND=json for demos, or add the Postgres StoreBackend before paid multi-worker pilots.`);
  }
  return new JsonStoreBackend();
}

const store = createStoreBackend();

export function getStoreBackend(): StoreBackend {
  return store;
}

export function getHistory(phone: string): Msg[] {
  return store.getHistory(phone);
}

export function addMessage(phone: string, role: Msg["role"], content: string) {
  return store.addMessage(phone, role, content);
}

export function addLead(lead: Lead): AddLeadResult {
  return store.addLead(lead);
}

export function leadByIdempotencyKey(idempotencyKey: string): Lead | undefined {
  return store.leadByIdempotencyKey(idempotencyKey);
}

export function bookedLead(phone: string, service: string, startISO: string): Lead | undefined {
  return store.bookedLead(phone, service, startISO);
}

export function leadsOn(dateISO: string, tz: string): Lead[] {
  return store.leadsOn(dateISO, tz);
}

export function addCallOutcome(outcome: CallOutcome): AddCallOutcomeResult {
  return store.addCallOutcome(outcome);
}

export function callOutcomesOn(dateISO: string, tz: string): CallOutcome[] {
  return store.callOutcomesOn(dateISO, tz);
}

export function metricsOn(dateISO: string, tz: string): DailyMetrics {
  return store.metricsOn(dateISO, tz);
}

export function exportSubjectData(phone: string): SubjectDataExport {
  return store.exportSubjectData(phone);
}

export function purgeOldData(maxAgeDays: number, dryRun = false): RetentionPurgeResult {
  return store.purgeOldData(maxAgeDays, dryRun);
}

export function deleteSubjectData(phone: string): SubjectDataDeletion {
  return store.deleteSubjectData(phone);
}

export async function withBookingLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  return store.withBookingLock(key, fn);
}
