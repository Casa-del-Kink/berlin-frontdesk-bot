import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { DateTime } from "luxon";

// Minimal JSON store. Enough for the demo / first clients.
// Atomic writes reduce corruption risk; switch to SQLite/Postgres when volume demands it.

export interface Msg {
  role: "user" | "assistant";
  content: string;
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
  createdAt: string; // ISO
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
  history.push({ role, content });
  if (history.length > MAX_HISTORY_PER_PHONE) {
    state.conversations[phone] = history.slice(-MAX_HISTORY_PER_PHONE);
  }
  persist();
}

export function addLead(lead: Lead) {
  state.leads.push({ ...lead, channel: lead.channel ?? "unknown" });
  persist();
}

export function leadsOn(dateISO: string, tz: string): Lead[] {
  return state.leads.filter((l) => DateTime.fromISO(l.createdAt).setZone(tz).toISODate() === dateISO);
}

export function addCallOutcome(outcome: CallOutcome) {
  state.callOutcomes.push(outcome);
  persist();
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
