import { DateTime } from "luxon";
import type { Client, Service } from "./config.js";
import { createEvent, findEventByIdempotencyKey, findMatchingEvent, getBusy } from "./calendar.js";
import { CalcomClient, calcomConfigFromEnv, type CalcomBooking, type CalcomSlot } from "./calcom.js";
import { computeFreeSlots } from "./slots.js";

export interface AvailabilitySlot {
  iso: string;
  readable: string;
}

export interface BookAppointmentInput {
  cfg: Client;
  calendarId: string;
  customerName: string;
  customerPhone: string;
  serviceName: string;
  service?: Service;
  start: DateTime;
  end: DateTime;
  tz: string;
  sourceChannel: string;
  idempotencyKey: string;
}

export interface BookAppointmentResult {
  link: string;
  providerBookingId?: string;
  provider: SchedulingProviderName;
}

export type SchedulingProviderName = "google" | "calcom";

interface SchedulingProvider {
  readonly name: SchedulingProviderName;
  getAvailability(opts: {
    cfg: Client;
    serviceName: string;
    service?: Service;
    from: DateTime;
    days: number;
    durationMin: number;
    max: number;
  }): Promise<AvailabilitySlot[]>;
  findExistingBooking(input: BookAppointmentInput): Promise<string | undefined>;
  isSlotBusy(input: BookAppointmentInput): Promise<boolean>;
  createBooking(input: BookAppointmentInput): Promise<BookAppointmentResult>;
}

export function schedulingProviderName(): SchedulingProviderName {
  const raw = (process.env.SCHEDULING_PROVIDER || process.env.BOOKING_PROVIDER || "google").trim().toLowerCase();
  if (raw === "calcom" || raw === "cal.com") return "calcom";
  if (raw === "google" || raw === "google_calendar" || raw === "calendar") return "google";
  throw new Error(`Unsupported SCHEDULING_PROVIDER=${raw}. Use google or calcom.`);
}

export function getSchedulingProvider(): SchedulingProvider {
  return schedulingProviderName() === "calcom" ? new CalcomSchedulingProvider() : new GoogleSchedulingProvider();
}

class GoogleSchedulingProvider implements SchedulingProvider {
  readonly name = "google" as const;

  async getAvailability(opts: {
    cfg: Client;
    from: DateTime;
    days: number;
    durationMin: number;
    max: number;
  }): Promise<AvailabilitySlot[]> {
    const tz = opts.cfg.timezone;
    const to = opts.from.plus({ days: opts.days });
    const busy = await getBusy(opts.cfg.calendarId, opts.from.toUTC().toISO()!, to.toUTC().toISO()!);
    return computeFreeSlots({
      busy,
      from: opts.from,
      days: opts.days,
      openHHMM: opts.cfg.hours.open,
      closeHHMM: opts.cfg.hours.close,
      weekdays: opts.cfg.hours.days,
      durationMin: opts.durationMin,
      tz,
      max: opts.max,
    }).map((slot) => ({ iso: slot.toISO()!, readable: slot.toFormat("cccc d.LL. HH:mm") }));
  }

  async findExistingBooking(input: BookAppointmentInput): Promise<string | undefined> {
    const summary = `${input.serviceName} - ${input.customerName}`;
    return (
      (await findEventByIdempotencyKey(input.calendarId, input.idempotencyKey)) ??
      (await findMatchingEvent(input.calendarId, { summary, startISO: input.start.toISO()!, endISO: input.end.toISO()! }))
    );
  }

  async isSlotBusy(input: BookAppointmentInput): Promise<boolean> {
    const busy = await getBusy(input.calendarId, input.start.toUTC().toISO()!, input.end.toUTC().toISO()!);
    const requestedStart = input.start.toMillis();
    const requestedEnd = input.end.toMillis();
    return busy.some((b) => {
      const busyStart = DateTime.fromISO(b.start).setZone(input.tz).toMillis();
      const busyEnd = DateTime.fromISO(b.end).setZone(input.tz).toMillis();
      return requestedStart < busyEnd && busyStart < requestedEnd;
    });
  }

  async createBooking(input: BookAppointmentInput): Promise<BookAppointmentResult> {
    const summary = `${input.serviceName} - ${input.customerName}`;
    const link = await createEvent(input.calendarId, {
      summary,
      description: `Booked via ${input.sourceChannel} (${input.customerPhone}). Idempotency-Key: ${input.idempotencyKey}`,
      startISO: input.start.toISO()!,
      endISO: input.end.toISO()!,
      tz: input.tz,
      idempotencyKey: input.idempotencyKey,
    });
    return { link, provider: this.name };
  }
}

class CalcomSchedulingProvider implements SchedulingProvider {
  readonly name = "calcom" as const;

  async getAvailability(opts: {
    cfg: Client;
    serviceName: string;
    service?: Service;
    from: DateTime;
    days: number;
    durationMin: number;
    max: number;
  }): Promise<AvailabilitySlot[]> {
    const calcom = calcomForService(opts.cfg, opts.serviceName, opts.service);
    const client = new CalcomClient({ apiKey: calcom.apiKey, baseUrl: calcom.baseUrl });
    const slots = await client.getAvailableSlots({
      ...calcom.selector,
      startISO: opts.from.toUTC().toISO()!,
      endISO: opts.from.plus({ days: opts.days }).toUTC().toISO()!,
      timeZone: opts.cfg.timezone,
      durationMin: calcom.durationMin ?? opts.durationMin,
    });

    return slots.slice(0, opts.max).map((slot) => slotToAvailability(slot, opts.cfg.timezone));
  }

  async findExistingBooking(): Promise<string | undefined> {
    // Tilda's local store is the idempotency source for Cal.com. Cal.com API v2 metadata search is
    // not relied on here, so retries are stopped before this provider is called.
    return undefined;
  }

  async isSlotBusy(): Promise<boolean> {
    // Cal.com owns conflict checking for its event type/calendar connections. The create call is the
    // final authoritative check; if the slot is gone, Cal.com rejects it and Tilda asks for fresh slots.
    return false;
  }

  async createBooking(input: BookAppointmentInput): Promise<BookAppointmentResult> {
    const calcom = calcomForService(input.cfg, input.serviceName, input.service);
    const client = new CalcomClient({ apiKey: calcom.apiKey, baseUrl: calcom.baseUrl });
    const booking = await client.createBooking({
      ...calcom.selector,
      startISO: input.start.toISO()!,
      attendeeName: input.customerName,
      attendeeEmail: attendeeEmail(input.customerPhone),
      attendeePhoneNumber: publicPhone(input.customerPhone),
      attendeeTimeZone: input.tz,
      attendeeLanguage: input.cfg.language || "de",
      lengthInMinutes: calcom.durationMin ?? input.service?.durationMin,
      metadata: {
        source: "tilda",
        channel: input.sourceChannel,
        idempotencyKey: input.idempotencyKey,
        service: input.serviceName,
      },
    });
    return { link: calcomBookingLink(booking), providerBookingId: booking.uid, provider: this.name };
  }
}

function slotToAvailability(slot: CalcomSlot, tz: string): AvailabilitySlot {
  const start = DateTime.fromISO(slot.start).setZone(tz);
  return { iso: start.toISO()!, readable: start.toFormat("cccc d.LL. HH:mm") };
}

function calcomForService(cfg: Client, serviceName: string, service?: Service) {
  const env = calcomConfigFromEnv();
  const selector = serviceSelector(cfg, serviceName, service) ?? {
    eventTypeId: env.eventTypeId,
    eventTypeSlug: env.eventTypeSlug,
    username: env.username,
    teamSlug: env.teamSlug,
    organizationSlug: env.organizationSlug,
  };
  return {
    apiKey: env.apiKey,
    baseUrl: env.baseUrl,
    durationMin: serviceSelector(cfg, serviceName, service)?.durationMin ?? env.durationMin,
    selector,
  };
}

function serviceSelector(cfg: Client, serviceName: string, service?: Service) {
  const selectors = cfg.calcom?.services ?? {};
  const byExact = selectors[serviceName] ?? (service?.name ? selectors[service.name] : undefined);
  const fallback = byExact ?? cfg.calcom?.defaultEventType;
  if (!fallback) return undefined;
  return {
    eventTypeId: fallback.eventTypeId,
    eventTypeSlug: fallback.eventTypeSlug,
    username: fallback.username,
    teamSlug: fallback.teamSlug,
    organizationSlug: fallback.organizationSlug,
    durationMin: fallback.durationMin,
  };
}

function attendeeEmail(phone: string) {
  if (process.env.CALCOM_TEST_ATTENDEE_EMAIL?.trim()) return process.env.CALCOM_TEST_ATTENDEE_EMAIL;
  const domain = process.env.CALCOM_FALLBACK_ATTENDEE_EMAIL_DOMAIN || "example.test";
  const local = phone.replace(/^whatsapp:/, "").replace(/[^0-9a-zA-Z]+/g, "").slice(-18) || "unknown";
  return `tilda-${local}@${domain}`;
}

function publicPhone(phone: string) {
  const clean = phone.replace(/^whatsapp:/, "");
  return clean.startsWith("+") ? clean : undefined;
}

function calcomBookingLink(booking: CalcomBooking) {
  return `calcom://booking/${booking.uid}`;
}
