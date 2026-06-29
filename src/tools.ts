import { DateTime, Interval } from "luxon";
import type { Client } from "./config.js";
import { findService } from "./config.js";
import { createEvent, findEventByIdempotencyKey, findMatchingEvent, getBusy } from "./calendar.js";
import { computeFreeSlots } from "./slots.js";
import { addLead, bookedLead, leadByIdempotencyKey, withBookingLock, type LeadChannel } from "./store.js";
import { sendWhatsapp } from "./whatsapp.js";

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
        },
        required: ["notes"],
      },
    },
  },
];

type Handler = (args: any) => Promise<unknown>;

function overlapsBusy(busy: { start: string; end: string }[], start: DateTime, end: DateTime, tz: string) {
  const requested = Interval.fromDateTimes(start, end);
  return busy.some((b) => requested.overlaps(Interval.fromDateTimes(DateTime.fromISO(b.start).setZone(tz), DateTime.fromISO(b.end).setZone(tz))));
}

async function alertOwner(cfg: Client, message: string) {
  if (cfg.ownerWhatsapp) await sendWhatsapp(cfg.ownerWhatsapp, message);
  else console.log(`[owner alert:DRYRUN] ${message}`);
}

function normalizedChannel(channel: unknown, fallback: LeadChannel): LeadChannel {
  return channel === "whatsapp" || channel === "phone" || channel === "server_tool" || channel === "unknown" ? channel : fallback;
}

export function estimateServiceValueCents(price?: string): number | undefined {
  if (!price) return undefined;
  const match = price.replace(",", ".").match(/(\d+(?:\.\d{1,2})?)/);
  if (!match) return undefined;
  return Math.round(Number(match[1]) * 100);
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
      const to = start.plus({ days: windowDays });

      const busy = await getBusy(cfg.calendarId, start.toUTC().toISO()!, to.toUTC().toISO()!);
      const slots = computeFreeSlots({
        busy,
        from: start,
        days: windowDays,
        openHHMM: cfg.hours.open,
        closeHHMM: cfg.hours.close,
        weekdays: cfg.hours.days,
        durationMin,
        tz,
        max: 6,
      });

      return {
        service: svc?.name ?? service,
        durationMin,
        slots: slots.map((s) => ({
          iso: s.toISO(),
          readable: s.toFormat("cccc d.LL. HH:mm"),
        })),
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
        const existing = leadByIdempotencyKey(idempotencyKey) ?? bookedLead(phone, serviceName, startDt.toISO()!);
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

        const summary = `${serviceName} - ${name}`;
        const existingCalendarLink =
          (await findEventByIdempotencyKey(cfg.calendarId, idempotencyKey)) ??
          (await findMatchingEvent(cfg.calendarId, { summary, startISO: startDt.toISO()!, endISO: end.toISO()! }));
        if (existingCalendarLink) {
          return {
            ok: true,
            when: startDt.toFormat("cccc d.LL. HH:mm"),
            link: existingCalendarLink,
            channel: sourceChannel,
            estimatedValueCents: estimateServiceValueCents(svc?.price),
            idempotencyKey,
            idempotentReplay: true,
          };
        }

        // Re-check the exact requested interval inside the lock immediately before creating the event.
        const busy = await getBusy(cfg.calendarId, startDt.toUTC().toISO()!, end.toUTC().toISO()!);
        if (overlapsBusy(busy, startDt, end, tz)) {
          return {
            error: "Slot is no longer available",
            message: "That time was just taken. Please call check_availability again and offer fresh times.",
          };
        }

        const link = await createEvent(cfg.calendarId, {
          summary,
          description: `Booked via ${sourceChannel} (${phone}). Idempotency-Key: ${idempotencyKey}`,
          startISO: startDt.toISO()!,
          endISO: end.toISO()!,
          tz,
          idempotencyKey,
        });

        const stored = addLead({
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
          channel: sourceChannel,
          estimatedValueCents: estimateServiceValueCents(svc?.price),
          idempotencyKey,
          idempotentReplay: !stored.inserted,
        };
      });
    },

    async register_lead({ name, service, notes, channel, idempotencyKey }) {
      const svc = findService(cfg, service);
      const sourceChannel = normalizedChannel(channel, phone.startsWith("whatsapp:") ? "whatsapp" : "server_tool");
      const serviceName = svc?.name ?? service;
      const stableKey = leadIdempotencyKey(phone, serviceName, notes, idempotencyKey);
      const stored = addLead({
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
      return {
        ok: true,
        channel: stored.lead.channel ?? sourceChannel,
        estimatedValueCents: stored.lead.estimatedValueCents,
        idempotencyKey: stableKey,
        idempotentReplay: !stored.inserted,
      };
    },
  };
}

export async function runTool(cfg: Client, phone: string, name: string, args: any) {
  const handler = makeHandlers(cfg, phone)[name];
  if (!handler) return { error: `Unknown tool: ${name}` };
  return handler(args);
}
