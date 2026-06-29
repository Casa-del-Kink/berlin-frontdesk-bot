import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { DateTime } from "luxon";

// Minimal JSON store. Enough for the demo / first clients.
// Atomic writes reduce corruption risk; switch to SQLite/Postgres when volume demands it.

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

const FILE = process.env.STATE_FILE || "data/state.json";
const MAX_HISTORY_PER_PHONE = Number(process.env.MAX_HISTORY_PER_PHONE || 50);
let state: State = { conversations: {}, leads: [], callOutcomes: [] };

if (existsSync(FILE)) {
  const loaded = JSON.parse(readFileSync(FILE, "utf8")) as Partial<State>;
  state = { conversations: loaded.conversations ?? {}, leads: loaded.leads ?? [], callOutcomes: loaded.callOutcomes ?? [] };
}

function persist() {
  mkdirSync(dirname(FILE), { recursive: true });
  const tmp = `${FILE}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(state, null, 2));
  renameSync(tmp, FILE);
}

export function getHistory(phone: string): Msg[] {
  return state.conversations[phone] ?? [];
}

export function addMessage(phone: string, role: Msg["role"], content: string) {
  const history = (state.conversations[phone] ??= []);
  history.push({ role, content, createdAt: new Date().toISOString() });
  if (history.length > MAX_HISTORY_PER_PHONE) {
    state.conversations[phone] = history.slice(-MAX_HISTORY_PER_PHONE);
  }
  persist();
}

export function addLead(lead: Lead): AddLeadResult {
  const normalized = { ...lead, channel: lead.channel ?? "unknown" };
  if (normalized.idempotencyKey) {
    const existing = state.leads.find((stored) => stored.idempotencyKey === normalized.idempotencyKey);
    if (existing) return { lead: existing, inserted: false };
  }

  state.leads.push(normalized);
  persist();
  return { lead: normalized, inserted: true };
}

export function leadByIdempotencyKey(idempotencyKey: string): Lead | undefined {
  return state.leads.find((lead) => lead.idempotencyKey === idempotencyKey);
}

export function bookedLead(phone: string, service: string, startISO: string): Lead | undefined {
  const startMs = DateTime.fromISO(startISO).toMillis();
  return state.leads.find((lead) => {
    if (lead.status !== "booked" || lead.phone !== phone || lead.service !== service || !lead.startISO) return false;
    return lead.startISO === startISO || DateTime.fromISO(lead.startISO).toMillis() === startMs;
  });
}

export function leadsOn(dateISO: string, tz: string): Lead[] {
  return state.leads.filter((l) => DateTime.fromISO(l.createdAt).setZone(tz).toISODate() === dateISO);
}

export function addCallOutcome(outcome: CallOutcome): AddCallOutcomeResult {
  const existing = state.callOutcomes.find((stored) => stored.callId === outcome.callId);
  if (existing) return { outcome: existing, inserted: false };

  state.callOutcomes.push(outcome);
  persist();
  return { outcome, inserted: true };
}

export function callOutcomesOn(dateISO: string, tz: string): CallOutcome[] {
  return state.callOutcomes.filter((c) => DateTime.fromISO(c.createdAt).setZone(tz).toISODate() === dateISO);
}

export function metricsOn(dateISO: string, tz: string): DailyMetrics {
  const leads = leadsOn(dateISO, tz);
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

export function exportSubjectData(phone: string): SubjectDataExport {
  return {
    phone,
    conversations: [...(state.conversations[phone] ?? [])],
    leads: state.leads.filter((lead) => lead.phone === phone),
    callOutcomes: state.callOutcomes.filter((call) => call.phone === phone),
  };
}

const inProcessLocks = new Map<string, Promise<unknown>>();

/**
 * Serializes critical sections inside this Node process. Postgres deployments should
 * back this seam with advisory locks / SELECT FOR UPDATE so multiple workers share it.
 */
export async function withBookingLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prior = inProcessLocks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const chained = prior.then(() => current);
  inProcessLocks.set(key, chained);

  try {
    await prior;
    return await fn();
  } finally {
    release();
    if (inProcessLocks.get(key) === chained) inProcessLocks.delete(key);
  }
}

export function purgeOldData(maxAgeDays: number, dryRun = false): RetentionPurgeResult {
  if (!Number.isFinite(maxAgeDays) || maxAgeDays <= 0) throw new Error("maxAgeDays must be a positive number");

  const cutoff = DateTime.now().minus({ days: maxAgeDays });
  const cutoffISO = cutoff.toISO()!;
  let conversationsDeleted = 0;

  const nextConversations: State["conversations"] = {};
  for (const [phone, messages] of Object.entries(state.conversations)) {
    const kept = messages.filter((msg) => {
      // Legacy messages without timestamps are retained until subject delete or Postgres migration.
      if (!msg.createdAt) return true;
      return DateTime.fromISO(msg.createdAt) >= cutoff;
    });
    conversationsDeleted += messages.length - kept.length;
    if (kept.length > 0) nextConversations[phone] = kept;
  }

  const nextLeads = state.leads.filter((lead) => DateTime.fromISO(lead.createdAt) >= cutoff);
  const leadsDeleted = state.leads.length - nextLeads.length;
  const nextCallOutcomes = state.callOutcomes.filter((call) => DateTime.fromISO(call.createdAt) >= cutoff);
  const callOutcomesDeleted = state.callOutcomes.length - nextCallOutcomes.length;

  if (!dryRun && (conversationsDeleted > 0 || leadsDeleted > 0 || callOutcomesDeleted > 0)) {
    state.conversations = nextConversations;
    state.leads = nextLeads;
    state.callOutcomes = nextCallOutcomes;
    persist();
  }

  return { cutoffISO, conversationsDeleted, leadsDeleted, callOutcomesDeleted, dryRun };
}

export function deleteSubjectData(phone: string): SubjectDataDeletion {
  const conversationsDeleted = state.conversations[phone]?.length ?? 0;
  delete state.conversations[phone];

  const before = state.leads.length;
  state.leads = state.leads.filter((lead) => lead.phone !== phone);
  const leadsDeleted = before - state.leads.length;

  const callsBefore = state.callOutcomes.length;
  state.callOutcomes = state.callOutcomes.filter((call) => call.phone !== phone);
  const callOutcomesDeleted = callsBefore - state.callOutcomes.length;

  if (conversationsDeleted > 0 || leadsDeleted > 0 || callOutcomesDeleted > 0) persist();
  return { phone, conversationsDeleted, leadsDeleted, callOutcomesDeleted };
}
