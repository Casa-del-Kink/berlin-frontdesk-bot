import { readFileSync } from "node:fs";
import yaml from "js-yaml";
import "dotenv/config";

export interface Service {
  name: string;
  durationMin: number;
  price: string;
}

export interface CalcomEventTypeSelector {
  eventTypeId?: number;
  eventTypeSlug?: string;
  username?: string;
  teamSlug?: string;
  organizationSlug?: string;
  durationMin?: number;
}

export interface Client {
  name: string;
  timezone: string;
  language: string;
  calendarId: string;
  calcom?: {
    defaultEventType?: CalcomEventTypeSelector;
    services?: Record<string, CalcomEventTypeSelector>;
  };
  ownerWhatsapp: string;
  bookingFallbackUrl?: string;
  consentText?: string;
  aiDisclosureText?: string;
  privacyContact?: string;
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

export interface ReadinessGate {
  name: string;
  ok: boolean;
  severity: "blocker" | "warning";
  detail: string;
}

export interface LivePilotReadiness {
  ok: boolean;
  generatedAt: string;
  gates: ReadinessGate[];
}

function hasEnv(name: string) {
  return Boolean(process.env[name]?.trim());
}

function positiveNumberEnv(name: string) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0;
}

function schedulingProviderEnv(): "google" | "calcom" | "unsupported" {
  const raw = (process.env.SCHEDULING_PROVIDER || process.env.BOOKING_PROVIDER || "google").trim().toLowerCase();
  if (raw === "calcom" || raw === "cal.com") return "calcom";
  if (raw === "google" || raw === "google_calendar" || raw === "calendar") return "google";
  return "unsupported";
}

function completeCalcomSelector(selector?: CalcomEventTypeSelector) {
  if (!selector) return false;
  if (Number.isFinite(selector.eventTypeId) && Number(selector.eventTypeId) > 0) return true;
  return Boolean(selector.eventTypeSlug?.trim() && (selector.username?.trim() || selector.teamSlug?.trim()));
}

function envHasCompleteCalcomSelector() {
  if (positiveNumberEnv("CALCOM_EVENT_TYPE_ID")) return true;
  return hasEnv("CALCOM_EVENT_TYPE_SLUG") && (hasEnv("CALCOM_USERNAME") || hasEnv("CALCOM_TEAM_SLUG"));
}

function clientHasCompleteCalcomSelector(cfg?: Client) {
  if (completeCalcomSelector(cfg?.calcom?.defaultEventType)) return true;
  return Object.values(cfg?.calcom?.services ?? {}).some(completeCalcomSelector);
}

function schedulingProviderReady(cfg?: Client) {
  const provider = schedulingProviderEnv();
  if (provider === "unsupported") return false;
  if (provider === "calcom") return hasEnv("CALCOM_API_KEY") && (envHasCompleteCalcomSelector() || clientHasCompleteCalcomSelector(cfg));
  return hasEnv("GOOGLE_SA_JSON") && process.env.USE_FAKE_CALENDAR !== "true";
}

function schedulingProviderDetail(cfg?: Client) {
  const provider = schedulingProviderEnv();
  if (provider === "unsupported") return "SCHEDULING_PROVIDER must be google or calcom. Unsupported values fail before live booking.";
  if (provider === "calcom") {
    const source = clientHasCompleteCalcomSelector(cfg) ? "client YAML" : "environment";
    return `SCHEDULING_PROVIDER=calcom requires CALCOM_API_KEY plus a complete Cal.com event type selector in ${source}: CALCOM_EVENT_TYPE_ID, or CALCOM_EVENT_TYPE_SLUG plus CALCOM_USERNAME/CALCOM_TEAM_SLUG. Cal.com must sync to the salon/demo Google Calendar.`;
  }
  return "SCHEDULING_PROVIDER=google requires GOOGLE_SA_JSON and USE_FAKE_CALENDAR must not be true for live booking.";
}

export function hasExplicitAiDisclosure(text?: string) {
  const value = text?.toLowerCase() ?? "";
  return /\bai\b/.test(value) || /\bki\b/.test(value);
}

export function validateLivePilotReadiness(cfg?: Client): LivePilotReadiness {
  const storeBackend = process.env.STORE_BACKEND || "json";
  const gates: ReadinessGate[] = [
    {
      name: "operator auth",
      ok: hasEnv("SERVER_TOOL_TOKEN"),
      severity: "blocker",
      detail: "SERVER_TOOL_TOKEN must be set so tool, privacy, metrics, and readiness endpoints are bearer-protected.",
    },
    {
      name: "twilio signature validation",
      ok: process.env.SKIP_TWILIO_SIGNATURE_VALIDATION !== "true",
      severity: "blocker",
      detail: "SKIP_TWILIO_SIGNATURE_VALIDATION must not be true outside local testing.",
    },
    {
      name: "twilio credentials",
      ok: hasEnv("TWILIO_ACCOUNT_SID") && hasEnv("TWILIO_AUTH_TOKEN") && hasEnv("TWILIO_WHATSAPP_FROM"),
      severity: "blocker",
      detail: "TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_WHATSAPP_FROM are required for live WhatsApp and webhook validation.",
    },
    {
      name: "reviewed follow-up send approval",
      ok: process.env.ENABLE_REVIEWED_FOLLOWUP_SEND !== "true" || hasEnv("FOLLOWUP_SEND_REVIEWED_AT"),
      severity: "blocker",
      detail: "ENABLE_REVIEWED_FOLLOWUP_SEND may only be true after opt-in, provider setup, and operator review are approved; set FOLLOWUP_SEND_REVIEWED_AT to that approval timestamp.",
    },
    {
      name: "llm provider",
      ok: hasEnv("OPENROUTER_API_KEY"),
      severity: "blocker",
      detail: "OPENROUTER_API_KEY is required before real customer conversations.",
    },
    {
      name: "scheduling provider",
      ok: schedulingProviderReady(cfg),
      severity: "blocker",
      detail: schedulingProviderDetail(cfg),
    },
    {
      name: "retention policy",
      ok: positiveNumberEnv("DATA_RETENTION_DAYS"),
      severity: "blocker",
      detail: "DATA_RETENTION_DAYS must be a positive number and matched to the client privacy notice / DPA.",
    },
    {
      name: "AI disclosure text",
      ok: hasExplicitAiDisclosure(cfg?.aiDisclosureText),
      severity: "blocker",
      detail: "Client YAML must set aiDisclosureText with explicit AI/KI wording, e.g. 'Ich bin die KI-Rezeption'.",
    },
    {
      name: "privacy contact",
      ok: Boolean(cfg?.privacyContact?.trim()),
      severity: "blocker",
      detail: "Client YAML must set privacyContact for data export/delete or privacy questions before live traffic.",
    },
    {
      name: "owner alert destination",
      ok: Boolean(cfg?.ownerWhatsapp?.trim()) || process.env.OWNER_ALERT_LOG_ONLY_ACCEPTED === "true",
      severity: "blocker",
      detail: "Client YAML should set ownerWhatsapp so bookings, follow-ups, and daily summaries reach the operator. For internal hosted demos only, set OWNER_ALERT_LOG_ONLY_ACCEPTED=true to accept console-only alerts.",
    },
    {
      name: "owner alert route tested",
      ok: process.env.OWNER_ALERT_LOG_ONLY_ACCEPTED === "true" || (Boolean(cfg?.ownerWhatsapp?.trim()) && hasEnv("OWNER_ALERT_TESTED_AT")),
      severity: "blocker",
      detail: "Before live traffic, run the protected /operator/alert-test route and set OWNER_ALERT_TESTED_AT to the successful test timestamp in the hosted runtime.",
    },
    {
      name: "production store",
      ok: storeBackend !== "json",
      severity: "warning",
      detail: `STORE_BACKEND is ${storeBackend}; JSON is single-process demo storage. Use Postgres or explicitly accept one-worker operational risk.`,
    },
    {
      name: "public webhook base",
      ok: hasEnv("TWILIO_WEBHOOK_BASE_URL"),
      severity: "warning",
      detail: "TWILIO_WEBHOOK_BASE_URL should match the public HTTPS webhook URL so signature validation uses the same URL Twilio signed.",
    },
    {
      name: "AVV/DPA review",
      ok: process.env.COMPLIANCE_DPA_REVIEWED === "true",
      severity: "warning",
      detail: "Set COMPLIANCE_DPA_REVIEWED=true only after AVV/DPA/subprocessor review for hosting, messaging, LLM, calendar, and voice vendors.",
    },
  ];

  return {
    ok: gates.every((gate) => gate.ok || gate.severity === "warning"),
    generatedAt: new Date().toISOString(),
    gates,
  };
}

export function assertLivePilotReadiness(cfg?: Client) {
  const readiness = validateLivePilotReadiness(cfg);
  if (!readiness.ok) {
    const blockers = readiness.gates.filter((gate) => !gate.ok && gate.severity === "blocker").map((gate) => `${gate.name}: ${gate.detail}`);
    throw new Error(`Live pilot readiness blockers:\n- ${blockers.join("\n- ")}`);
  }
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
