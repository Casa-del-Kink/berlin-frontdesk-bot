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
  aiDisclosureText?: string;
  privacyContact?: string;
  handoffKeywords?: string[];
  hours: { days: number[]; open: string; close: string };
  services: Service[];
  faq: { q: string; a: string }[];
  tone: string;
  /**
   * "health" for dental/medical/health-data-adjacent clients (§203 StGB scope) —
   * unset/"standard" for beauty/aesthetics. Drives the subprocessor-review gate
   * below. See wiki/decisions/2026-07-01-subprocessor-review-triggers.md.
   */
  dataSensitivity?: "standard" | "health";
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
      name: "llm provider",
      ok: hasEnv("OPENROUTER_API_KEY"),
      severity: "blocker",
      detail: "OPENROUTER_API_KEY is required before real customer conversations.",
    },
    {
      name: "calendar provider",
      ok: hasEnv("GOOGLE_SA_JSON") && process.env.USE_FAKE_CALENDAR !== "true",
      severity: "blocker",
      detail: "GOOGLE_SA_JSON must be set and USE_FAKE_CALENDAR must not be true for live booking.",
    },
    {
      name: "retention policy",
      ok: positiveNumberEnv("DATA_RETENTION_DAYS"),
      severity: "blocker",
      detail: "DATA_RETENTION_DAYS must be a positive number and matched to the client privacy notice / DPA.",
    },
    {
      name: "AI disclosure text",
      ok: Boolean(cfg?.aiDisclosureText?.trim()),
      severity: "blocker",
      detail: "Client YAML must set aiDisclosureText so the first customer message clearly says the assistant is digital/AI.",
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
    {
      name: "subprocessor-by-subprocessor review for health-adjacent data",
      ok: cfg?.dataSensitivity !== "health" || process.env.COMPLIANCE_SUBPROCESSOR_REVIEW_COMPLETE === "true",
      severity: "blocker",
      detail:
        "Client YAML sets dataSensitivity: health (dental/medical/§203 StGB scope) — a full subprocessor-by-subprocessor legal/vendor review (hosting platform, Twilio, OpenRouter, ElevenLabs, Supabase, log storage) is required before go-live, separate from and stricter than the general AVV/DPA review above. Set COMPLIANCE_SUBPROCESSOR_REVIEW_COMPLETE=true only after that review is actually done. See wiki/decisions/2026-07-01-subprocessor-review-triggers.md.",
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
