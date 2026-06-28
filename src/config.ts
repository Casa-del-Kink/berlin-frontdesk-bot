import { readFileSync } from "node:fs";
import yaml from "js-yaml";
import "dotenv/config";

export interface Service {
  name: string;
  durationMin: number;
  price: string;
}

export interface Client {
  name: string;
  timezone: string;
  language: string;
  calendarId: string;
  ownerWhatsapp: string;
  bookingFallbackUrl?: string;
  consentText?: string;
  handoffKeywords?: string[];
  hours: { days: number[]; open: string; close: string };
  services: Service[];
  faq: { q: string; a: string }[];
  tone: string;
}

export function loadClient(): Client {
  const file = process.env.CLIENT_FILE || "clients/salon-demo.yaml";
  const cfg = yaml.load(readFileSync(file, "utf8")) as Client;
  if (!cfg?.name || !cfg?.timezone || !cfg?.services?.length || !cfg?.hours?.open || !cfg?.hours?.close) {
    throw new Error(`Invalid config in ${file}`);
  }
  return cfg;
}

export function validateRuntimeEnv() {
  const warnings: string[] = [];
  if (!process.env.OPENROUTER_API_KEY) warnings.push("OPENROUTER_API_KEY missing: WhatsApp conversations will fail until set.");
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_WHATSAPP_FROM) {
    warnings.push("Twilio env incomplete: outbound WhatsApp will run in DRYRUN/fail until configured.");
  }
  if (!process.env.GOOGLE_SA_JSON) warnings.push("GOOGLE_SA_JSON missing: calendar availability/booking tools will fail until set.");
  return warnings;
}

// Loose match by name (what the customer types won't be exact).
export function findService(cfg: Client, text: string): Service | undefined {
  const t = (text || "").toLowerCase().trim();
  if (!t) return undefined;
  return (
    cfg.services.find((s) => s.name.toLowerCase() === t) ||
    cfg.services.find((s) => s.name.toLowerCase().includes(t) || t.includes(s.name.toLowerCase()))
  );
}
