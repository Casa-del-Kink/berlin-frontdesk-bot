import { DateTime } from "luxon";
import type { Client } from "./config.js";
import { findService } from "./config.js";
import { getBusy, createEvent } from "./calendar.js";
import { computeFreeSlots } from "./slots.js";
import { addLead } from "./store.js";
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
        },
        required: ["notes"],
      },
    },
  },
];

type Handler = (args: any) => Promise<unknown>;

export function makeHandlers(cfg: Client, phone: string): Record<string, Handler> {
  const tz = cfg.timezone;

  return {
    async check_availability({ service, from, days }) {
      const svc = findService(cfg, service);
      const durationMin = svc?.durationMin ?? 60;
      const start = from ? DateTime.fromISO(from, { zone: tz }) : DateTime.now().setZone(tz);
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
      };
    },

    async book_appointment({ name, service, start }) {
      const svc = findService(cfg, service);
      const durationMin = svc?.durationMin ?? 60;
      const startDt = DateTime.fromISO(start, { zone: tz });
      if (!startDt.isValid) return { error: "Invalid date" };
      const end = startDt.plus({ minutes: durationMin });

      const link = await createEvent(cfg.calendarId, {
        summary: `${svc?.name ?? service} - ${name}`,
        description: `Booked via WhatsApp (${phone}).`,
        startISO: startDt.toISO()!,
        endISO: end.toISO()!,
        tz,
      });

      addLead({
        phone,
        name,
        service: svc?.name ?? service,
        status: "booked",
        startISO: startDt.toISO()!,
        createdAt: DateTime.now().toISO()!,
      });

      // Immediate owner alert (best-effort). ponytail: owner-facing copy is localizable per client.
      await sendWhatsapp(
        cfg.ownerWhatsapp,
        `New booking: ${name} - ${svc?.name ?? service} on ${startDt.toFormat("cccc d.LL. HH:mm")}.`,
      );

      return { ok: true, when: startDt.toFormat("cccc d.LL. HH:mm"), link };
    },

    async register_lead({ name, service, notes }) {
      addLead({
        phone,
        name,
        service,
        status: "needs_followup",
        notes,
        createdAt: DateTime.now().toISO()!,
      });
      return { ok: true };
    },
  };
}
