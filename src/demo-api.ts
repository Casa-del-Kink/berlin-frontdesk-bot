import { DateTime } from "luxon";
import type { Client } from "./config.js";
import { findService } from "./config.js";
import { runTool } from "./tools.js";

export type DemoApiMode = "disabled" | "fake" | "live-readonly" | "live-booking";

export interface DemoApiReadiness {
  enabled: boolean;
  mode: DemoApiMode;
  canCheckAvailability: boolean;
  canBook: boolean;
  blockers: string[];
  warnings: string[];
}

function boolEnv(name: string) {
  return process.env[name] === "true";
}

function envMode(): DemoApiMode {
  const raw = (process.env.DEMO_PUBLIC_API_MODE || "fake").trim().toLowerCase();
  if (raw === "fake") return "fake";
  if (raw === "live-readonly" || raw === "live_readonly" || raw === "readonly") return "live-readonly";
  if (raw === "live-booking" || raw === "live_booking" || raw === "live") return "live-booking";
  return "disabled";
}

function schedulingProvider() {
  const raw = (process.env.SCHEDULING_PROVIDER || "google").trim().toLowerCase();
  if (raw === "cal.com") return "calcom";
  return raw || "google";
}

export function demoApiReadiness(): DemoApiReadiness {
  const enabled = boolEnv("DEMO_PUBLIC_API_ENABLED");
  const mode = enabled ? envMode() : "disabled";
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (!enabled) blockers.push("Set DEMO_PUBLIC_API_ENABLED=true to expose public demo API endpoints for demo.calltilda.com.");
  if (mode === "disabled") blockers.push("Set DEMO_PUBLIC_API_MODE to fake, live-readonly, or live-booking.");

  if (mode === "fake") {
    if (process.env.USE_FAKE_CALENDAR !== "true") blockers.push("DEMO_PUBLIC_API_MODE=fake requires USE_FAKE_CALENDAR=true so public demo bookings cannot hit a live calendar.");
    if (process.env.OWNER_ALERT_LOG_ONLY_ACCEPTED !== "true") warnings.push("For fake public demos, set OWNER_ALERT_LOG_ONLY_ACCEPTED=true unless a demo owner WhatsApp is intentionally configured.");
  }

  if (mode === "live-readonly") {
    warnings.push("Live-readonly mode can show real availability but refuses public booking creates.");
  }

  if (mode === "live-booking") {
    if (!boolEnv("DEMO_PUBLIC_LIVE_BOOKING_ENABLED")) blockers.push("DEMO_PUBLIC_API_MODE=live-booking requires DEMO_PUBLIC_LIVE_BOOKING_ENABLED=true as an explicit go-live gate.");
    if (!process.env.SERVER_TOOL_TOKEN?.trim()) warnings.push("SERVER_TOOL_TOKEN should still protect operator and provider endpoints even if public demo endpoints are open.");
  }

  const canCheckAvailability = enabled && mode !== "disabled" && blockers.every((b) => !b.includes("DEMO_PUBLIC_API_MODE=fake requires"));
  const canBook = enabled && (mode === "fake" || mode === "live-booking") && blockers.length === 0;

  return { enabled, mode, canCheckAvailability, canBook, blockers, warnings };
}

export function publicDemoConfig(cfg: Client) {
  const readiness = demoApiReadiness();
  return {
    brand: {
      product: "CallTilda",
      assistant: "Tilda",
      domain: "calltilda.com",
      category: "AI reception for appointment businesses",
      firstWedge: "Launching first with Berlin salons and barbers",
    },
    copy: {
      hero: "No more missed bookings.",
      subhero: "Tilda answers when you can't.",
      description: "CallTilda helps appointment-based businesses answer calls and messages, check availability, and turn missed inquiries into bookings.",
      disclosureGerman: "Hallo, hier ist Tilda von [Business]. Ich bin die KI-Rezeption. Wie kann ich dir helfen?",
      disclosureEnglish: "Hi, this is Tilda from [Business]. I'm the AI reception. How can I help?",
    },
    demoBusiness: {
      name: cfg.name,
      timezone: cfg.timezone,
      language: cfg.language,
      services: cfg.services.map((service) => ({ name: service.name, durationMin: service.durationMin, price: service.price })),
      openingHours: cfg.hours,
    },
    endpoints: {
      config: { method: "GET", path: "/api/demo/config" },
      availability: { method: "POST", path: "/api/demo/check-availability" },
      booking: { method: "POST", path: "/api/demo/book-appointment" },
      readiness: { method: "GET", path: "/api/demo/readiness" },
    },
    scheduling: {
      provider: schedulingProvider(),
      publicMode: readiness.mode,
      canCheckAvailability: readiness.canCheckAvailability,
      canBook: readiness.canBook,
    },
    readiness,
  };
}

function demoPhone(sessionId?: string) {
  const suffix = (sessionId || "anonymous").trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "_").slice(0, 48) || "anonymous";
  return `demo:${suffix}`;
}

export function parseDemoAvailabilityArgs(body: any, cfg: Client) {
  const service = String(body?.service || cfg.services[0]?.name || "").trim();
  const days = body?.days === undefined ? 7 : Number(body.days);
  const from = body?.from ? String(body.from) : DateTime.now().setZone(cfg.timezone).toISODate()!;
  if (!service) throw new Error("Missing service");
  if (!Number.isFinite(days) || days < 1 || days > 30) throw new Error("days must be between 1 and 30");
  return { service, from, days };
}

export function parseDemoBookingArgs(body: any, cfg: Client) {
  const name = String(body?.name || "Demo Customer").trim().slice(0, 120);
  const service = String(body?.service || cfg.services[0]?.name || "").trim();
  const start = String(body?.start || "").trim();
  if (!name) throw new Error("Missing name");
  if (!service) throw new Error("Missing service");
  if (!findService(cfg, service)) throw new Error(`Unknown service: ${service}`);
  const startDt = DateTime.fromISO(start, { zone: cfg.timezone });
  if (!start || !startDt.isValid) throw new Error("start must be an ISO datetime with timezone");
  return { name, service, start: startDt.toISO()!, channel: "server_tool" };
}

export async function runDemoAvailability(cfg: Client, body: any) {
  const readiness = demoApiReadiness();
  if (!readiness.canCheckAvailability) return { status: 409, body: { ok: false, error: "Demo availability is not enabled", readiness } };
  const args = parseDemoAvailabilityArgs(body, cfg);
  const result = (await runTool(cfg, demoPhone(body?.sessionId), "check_availability", args)) as Record<string, unknown>;
  return { status: 200, body: { ok: true, ...result, demo: { mode: readiness.mode, sessionId: body?.sessionId || null } } };
}

export async function runDemoBooking(cfg: Client, body: any) {
  const readiness = demoApiReadiness();
  if (!readiness.canBook) return { status: 409, body: { ok: false, error: "Demo booking is not enabled", readiness } };
  const args = parseDemoBookingArgs(body, cfg);
  const result = (await runTool(cfg, demoPhone(body?.sessionId), "book_appointment", args)) as Record<string, unknown>;
  return { status: 200, body: { ...result, demo: { mode: readiness.mode, sessionId: body?.sessionId || null } } };
}
