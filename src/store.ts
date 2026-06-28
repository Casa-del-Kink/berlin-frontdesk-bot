import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { DateTime } from "luxon";

// Minimal JSON store. Enough for the demo / first clients.
// ponytail: JSON file, switch to SQLite/Postgres when volume demands it.

export interface Msg {
  role: "user" | "assistant";
  content: string;
}

export interface Lead {
  phone: string;
  name?: string;
  service?: string;
  status: "booked" | "needs_followup";
  notes?: string;
  startISO?: string;
  createdAt: string; // ISO
}

interface State {
  conversations: Record<string, Msg[]>;
  leads: Lead[];
}

const FILE = "data/state.json";
let state: State = { conversations: {}, leads: [] };

if (existsSync(FILE)) {
  state = JSON.parse(readFileSync(FILE, "utf8"));
}

function persist() {
  mkdirSync("data", { recursive: true });
  writeFileSync(FILE, JSON.stringify(state, null, 2));
}

export function getHistory(phone: string): Msg[] {
  return state.conversations[phone] ?? [];
}

export function addMessage(phone: string, role: Msg["role"], content: string) {
  (state.conversations[phone] ??= []).push({ role, content });
  persist();
}

export function addLead(lead: Lead) {
  state.leads.push(lead);
  persist();
}

export function leadsOn(dateISO: string, tz: string): Lead[] {
  return state.leads.filter((l) => DateTime.fromISO(l.createdAt).setZone(tz).toISODate() === dateISO);
}
