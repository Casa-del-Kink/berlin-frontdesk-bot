import { DateTime } from "luxon";
import type { Client } from "./config.js";
import { findService } from "./config.js";
import { getSchedulingProvider } from "./scheduling.js";
import { addLead, bookedLead, leadByIdempotencyKey, setConversationPause, withBookingLock, type LeadChannel } from "./store.js";
import { alertOwner } from "./owner-alerts.js";

// Tool definitions in OpenAI format (compatible with OpenRouter).
export const toolDefs = [
  {
    type: "function" as const,
    function: {
      name: "check_availability",
      description: "Returns real free slots from the calendar for a service. ALWAYS use before offering times.",
      parameters: {
        type: "object",
        properties: {
          service: { type: "string", description: "Name of the service the customer asks for" },
          from: { type: "string", description: "Start date YYYY-MM-DD. Defaults to today." },
          days: { type: "number", description: "How many days ahead to look (default 7)" },
        },
        required: ["service"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "book_appointment",
      description: "Creates the appointment in the calendar once the customer confirms a time and gives their name.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          service: { type: "string" },
          start: { type: "string", description: "Start in ISO with zone, e.g. 2026-07-01T14:00:00+02:00" },
          channel: { type: "string", enum: ["whatsapp", "phone", "server_tool", "unknown"], description: "Where the booking request came from" },
        },
        required: ["name", "service", "start"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "register_lead",
      description: "Saves a lead who asked but hasn't booked yet, so the team can follow up.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          service: { type: "string" },
          notes: { type: "string", description: "Short summary of what the customer wants" },
          channel: { type: "string", enum: ["whatsapp", "phone", "server_tool", "unknown"], description: "Where the inquiry came from" },
          idempotencyKey: { type: "string", description: "Optional stable provider/request key. Reusing it makes lead registration safe to retry." },
          handoffRequested: { type: "boolean", description: "true when the customer explicitly asks for a human / the owner" },
        },
        required: ["notes"],
      },
    },
  },
];

type Handler = (args: any) => Promise<unknown>;

function normalizedChannel(channel: unknown, fallback: LeadChannel): LeadChannel {
  return channel === "whatsapp" || channel === "phone" || channel === "server_tool" || channel === "unknown" ? channel : fallback;
}

/** Default 4h human-handoff pause window, overridable via HANDOFF_PAUSE_HOURS (must be positive). */
export function handoffPauseHours(): number {
  const value = Number(process.env.HANDOFF_PAUSE_HOURS);
  return Number.isFinite(value) && value > 0 ? value : 4;
}

export function estimateServiceValueCents(price?: string): number | undefined {
  if (!price) return undefined;
  const match = price.replace(",", ".").match(/(\d+(?:\.\d{1,2})?)/);
  if (!match) return undefined;
  return Math.round(Number(match[1]) * 100);
}

/**
 * Cheap price guardrail. Scans reply text for euro-shaped amounts and flags any that don't
 * match a configured service price. Pure and side-effect free so it is unit-testable without
 * spinning up the LLM loop; the webhook wires this in as a log-only, non-blocking check.
 */
export function findUnconfiguredPrices(text: string, cfg: Pick<Client, "services">): string[] {
  const configured = new Set(
    cfg.services.map((s) => estimateServiceValueCents(s.price)).filter((v): v is number => v !== undefined),
  );
  // German-style amount: optional thousands groups separated by "." (e.g. "10.000"), optional
  // ",dd" decimal (e.g. "10.000,50"). Also accepts bare dot-decimal notation (e.g. "45.00").
  // Alternatives are ordered longest-first so a full thousands-grouped or dot-decimal amount is
  // matched whole, rather than the regex backtracking into a false partial match (e.g. "45.00"
  // matching only its last two digits "00" if the bare-digit fallback were tried first).
  const amount = /\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+\.\d{2}|\d+(?:,\d{1,2})?/.source;
  const matches = text.matchAll(new RegExp(`(${amount})\\s*(?:€|EUR)|(?:€|EUR)\\s*(${amount})`, "gi"));
  const flagged: string[] = [];
  for (const m of matches) {
    const token = m[1] ?? m[2] ?? "";
    // Exactly one "." with exactly 2 trailing digits and no other "." groups = dot-decimal
    // (e.g. "45.00"); anything else with a "." is thousands-grouping (e.g. "10.000",
    // "10.000,50") where every "." is a grouping separator to strip.
    const isDotDecimal = /^\d+\.\d{2}$/.test(token);
    const raw = isDotDecimal ? token : token.replace(/\./g, "").replace(",", ".");
    const value = Number(raw);
    if (!Number.isFinite(value)) continue;
    const cents = Math.round(value * 100);
    if (!configured.has(cents)) flagged.push(m[0].trim());
  }
  return flagged;
}

function safeKeyPart(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9:+@._-]+/g, "_").slice(0, 120);
}

function bookingIdempotencyKey(phone: string, service: string, startISO: string) {
  return ["booking", safeKeyPart(phone), safeKeyPart(service), safeKeyPart(DateTime.fromISO(startISO).toUTC().toISO() ?? startISO)].join(":");
}

function leadIdempotencyKey(phone: string, service: string | undefined, notes: string, explicit?: string) {
  if (explicit?.trim()) return `lead:${safeKeyPart(explicit)}`;
  return ["lead", safeKeyPart(phone), safeKeyPart(service ?? "unknown"), safeKeyPart(notes)].join(":");
}

export function makeHandlers(cfg: Client, phone: string): Record<string, Handler> {
  const tz = cfg.timezone;

  return {
    async check_availability({ service, from, days }) {
      const svc = findService(cfg, service);
      const durationMin = svc?.durationMin ?? 60;
      const start = from ? DateTime.fromISO(from, { zone: tz }) : DateTime.now().setZone(tz);
      if (!start.isValid) return { error: "Invalid from date" };
      const windowDays = days ?? 7;

      const provider = getSchedulingProvider();
      const slots = await provider.getAvailability({
        cfg,
        serviceName: svc?.name ?? service,
        service: svc,
        from: start,
        days: windowDays,
        durationMin,
        max: 6,
      });

      return {
        service: svc?.name ?? service,
        durationMin,
        schedulingProvider: provider.name,
        slots,
        fallbackUrl: slots.length === 0 ? cfg.bookingFallbackUrl : undefined,
      };
    },

    async book_appointment({ name, service, start, channel }) {
      const svc = findService(cfg, service);
      const serviceName = svc?.name ?? service;
      const durationMin = svc?.durationMin ?? 60;
      const sourceChannel = normalizedChannel(channel, phone.startsWith("whatsapp:") ? "whatsapp" : "server_tool");
      const startDt = DateTime.fromISO(start, { zone: tz });
      if (!startDt.isValid) return { error: "Invalid date" };
      if (startDt <= DateTime.now().setZone(tz)) return { error: "Cannot book a past time" };
      const end = startDt.plus({ minutes: durationMin });
      const idempotencyKey = bookingIdempotencyKey(phone, serviceName, startDt.toISO()!);
      const lockKey = `calendar:${cfg.calendarId}:${startDt.toUTC().toISO()}:${end.toUTC().toISO()}`;

      return withBookingLock(lockKey, async () => {
        const existing = (await leadByIdempotencyKey(idempotencyKey)) ?? (await bookedLead(phone, serviceName, startDt.toISO()!));
        if (existing) {
          return {
            ok: true,
            when: startDt.toFormat("cccc d.LL. HH:mm"),
            link: "idempotent-replay",
            channel: existing.channel ?? sourceChannel,
            estimatedValueCents: existing.estimatedValueCents,
            idempotencyKey,
            idempotentReplay: true,
          };
        }

        const provider = getSchedulingProvider();
        const bookingInput = {
          cfg,
          calendarId: cfg.calendarId,
          customerName: name,
          customerPhone: phone,
          serviceName,
          service: svc,
          start: startDt,
          end,
          tz,
          sourceChannel,
          idempotencyKey,
        };

        const existingProviderLink = await provider.findExistingBooking(bookingInput);
        if (existingProviderLink) {
          return {
            ok: true,
            when: startDt.toFormat("cccc d.LL. HH:mm"),
            link: existingProviderLink,
            schedulingProvider: provider.name,
            channel: sourceChannel,
            estimatedValueCents: estimateServiceValueCents(svc?.price),
            idempotencyKey,
            idempotentReplay: true,
          };
        }

        // Re-check the exact requested interval inside the lock immediately before creating the booking.
        const busy = await provider.isSlotBusy(bookingInput);
        if (busy) {
          return {
            error: "Slot is no longer available",
            message: "That time was just taken. Please call check_availability again and offer fresh times.",
          };
        }

        const booked = await provider.createBooking(bookingInput);
        const link = booked.link;

        const stored = await addLead({
          phone,
          name,
          service: serviceName,
          status: "booked",
          channel: sourceChannel,
          startISO: startDt.toISO()!,
          estimatedValueCents: estimateServiceValueCents(svc?.price),
          idempotencyKey,
          createdAt: DateTime.now().toISO()!,
        });

        if (stored.inserted) {
          await alertOwner(
            cfg,
            `New booking: ${name} - ${serviceName} on ${startDt.toFormat("cccc d.LL. HH:mm")}. Customer: ${phone}`,
          );
        }

        return {
          ok: true,
          when: startDt.toFormat("cccc d.LL. HH:mm"),
          link,
          schedulingProvider: booked.provider,
          providerBookingId: booked.providerBookingId,
          channel: sourceChannel,
          estimatedValueCents: estimateServiceValueCents(svc?.price),
          idempotencyKey,
          idempotentReplay: !stored.inserted,
        };
      });
    },

    async register_lead({ name, service, notes, channel, idempotencyKey, handoffRequested }) {
      const svc = findService(cfg, service);
      const sourceChannel = normalizedChannel(channel, phone.startsWith("whatsapp:") ? "whatsapp" : "server_tool");
      const serviceName = svc?.name ?? service;
      const stableKey = leadIdempotencyKey(phone, serviceName, notes, idempotencyKey);
      const stored = await addLead({
        phone,
        name,
        service: serviceName,
        status: "needs_followup",
        channel: sourceChannel,
        notes,
        estimatedValueCents: estimateServiceValueCents(svc?.price),
        idempotencyKey: stableKey,
        createdAt: DateTime.now().toISO()!,
      });
      if (stored.inserted) {
        await alertOwner(cfg, `Follow-up needed: ${name ?? "Unknown"} (${phone}) · ${serviceName ?? "unknown service"} · ${notes}`);
      }
      // Unlike the alertOwner call above, this is NOT gated on stored.inserted: an idempotent
      // replay of the same handoff request still re-extends pausedUntil. That is deliberate,
      // not an oversight — the safe direction for a human-handoff pause is to stay silent
      // longer, not to let a retried/duplicate handoff request silently shorten or skip the
      // pause window.
      if (handoffRequested === true) {
        await setConversationPause(phone, handoffPauseHours());
      }
      return {
        ok: true,
        channel: stored.lead.channel ?? sourceChannel,
        estimatedValueCents: stored.lead.estimatedValueCents,
        idempotencyKey: stableKey,
        idempotentReplay: !stored.inserted,
        handoff: handoffRequested === true,
      };
    },
  };
}

export async function runTool(cfg: Client, phone: string, name: string, args: any) {
  const handler = makeHandlers(cfg, phone)[name];
  if (!handler) return { error: `Unknown tool: ${name}` };
  return handler(args);
}
