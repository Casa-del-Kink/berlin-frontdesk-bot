export interface CalcomSlot {
  start: string;
  end?: string;
}

export interface CalcomBookingInput {
  startISO: string;
  attendeeName: string;
  attendeeEmail: string;
  attendeeTimeZone: string;
  attendeeLanguage?: string;
  attendeePhoneNumber?: string;
  eventTypeId?: number;
  eventTypeSlug?: string;
  username?: string;
  teamSlug?: string;
  organizationSlug?: string;
  lengthInMinutes?: number;
  metadata?: Record<string, string>;
}

export interface CalcomBooking {
  uid: string;
  id?: number;
  title?: string;
  status?: string;
  start?: string;
  end?: string;
}

export interface CalcomClientOptions {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

type CalcomApiResponse<T> = {
  status?: string;
  data?: T;
  message?: string;
  error?: unknown;
};

const SLOT_API_VERSION = "2024-09-04";
const BOOKING_API_VERSION = "2026-02-25";

export class CalcomClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: CalcomClientOptions) {
    if (!opts.apiKey?.trim()) throw new Error("Missing Cal.com API key");
    this.apiKey = opts.apiKey;
    this.baseUrl = (opts.baseUrl || "https://api.cal.com").replace(/\/+$/, "");
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async getAvailableSlots(opts: {
    eventTypeId?: number;
    eventTypeSlug?: string;
    username?: string;
    teamSlug?: string;
    organizationSlug?: string;
    startISO: string;
    endISO: string;
    timeZone?: string;
    durationMin?: number;
    bookingUidToReschedule?: string;
  }): Promise<CalcomSlot[]> {
    const params = new URLSearchParams({
      start: opts.startISO,
      end: opts.endISO,
      format: "range",
    });
    if (opts.eventTypeId) params.set("eventTypeId", String(opts.eventTypeId));
    if (opts.eventTypeSlug) params.set("eventTypeSlug", opts.eventTypeSlug);
    if (opts.username) params.set("username", opts.username);
    if (opts.teamSlug) params.set("teamSlug", opts.teamSlug);
    if (opts.organizationSlug) params.set("organizationSlug", opts.organizationSlug);
    if (opts.timeZone) params.set("timeZone", opts.timeZone);
    if (opts.durationMin) params.set("duration", String(opts.durationMin));
    if (opts.bookingUidToReschedule) params.set("bookingUidToReschedule", opts.bookingUidToReschedule);
    this.assertEventTypeSelector(params);

    const json = await this.request<Record<string, CalcomSlot[]>>(`/v2/slots?${params.toString()}`, {
      method: "GET",
      apiVersion: SLOT_API_VERSION,
    });
    return Object.values(json.data ?? {}).flat().filter((slot) => typeof slot.start === "string");
  }

  async createBooking(input: CalcomBookingInput): Promise<CalcomBooking> {
    const body: Record<string, unknown> = {
      start: toUtcISOString(input.startISO),
      attendee: {
        name: input.attendeeName,
        email: input.attendeeEmail,
        timeZone: input.attendeeTimeZone,
        language: input.attendeeLanguage || "de",
        ...(input.attendeePhoneNumber ? { phoneNumber: input.attendeePhoneNumber } : {}),
      },
    };
    if (input.eventTypeId) body.eventTypeId = input.eventTypeId;
    if (input.eventTypeSlug) body.eventTypeSlug = input.eventTypeSlug;
    if (input.username) body.username = input.username;
    if (input.teamSlug) body.teamSlug = input.teamSlug;
    if (input.organizationSlug) body.organizationSlug = input.organizationSlug;
    if (input.lengthInMinutes) body.lengthInMinutes = input.lengthInMinutes;
    if (input.metadata) body.metadata = input.metadata;
    this.assertBookingSelector(body);

    const json = await this.request<CalcomBooking | CalcomBooking[]>("/v2/bookings", {
      method: "POST",
      apiVersion: BOOKING_API_VERSION,
      body,
    });
    return firstBooking(json.data);
  }

  async getBooking(bookingUid: string): Promise<CalcomBooking> {
    const json = await this.request<CalcomBooking | CalcomBooking[]>(`/v2/bookings/${encodeURIComponent(bookingUid)}`, {
      method: "GET",
      apiVersion: BOOKING_API_VERSION,
    });
    return firstBooking(json.data);
  }

  async cancelBooking(bookingUid: string, cancellationReason = "Tilda Cal.com smoke cleanup"): Promise<CalcomBooking> {
    const json = await this.request<CalcomBooking | CalcomBooking[]>(`/v2/bookings/${encodeURIComponent(bookingUid)}/cancel`, {
      method: "POST",
      apiVersion: BOOKING_API_VERSION,
      body: { cancellationReason },
    });
    return firstBooking(json.data);
  }

  private async request<T>(path: string, opts: { method: string; apiVersion: string; body?: unknown }): Promise<CalcomApiResponse<T>> {
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: opts.method,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "cal-api-version": opts.apiVersion,
        "content-type": "application/json",
      },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
    const text = await res.text();
    const json = (text ? safeJson(text) : {}) as CalcomApiResponse<T>;
    if (!res.ok) {
      throw new Error(`Cal.com ${opts.method} ${path} failed (${res.status}): ${summarizeCalcomError(json)}`);
    }
    if (json.status && json.status !== "success") {
      throw new Error(`Cal.com ${opts.method} ${path} returned status=${json.status}: ${summarizeCalcomError(json)}`);
    }
    return json;
  }

  private assertEventTypeSelector(params: URLSearchParams) {
    if (params.has("eventTypeId")) return;
    if (params.has("eventTypeSlug") && (params.has("username") || params.has("teamSlug"))) return;
    throw new Error("Cal.com slots require CALCOM_EVENT_TYPE_ID or CALCOM_EVENT_TYPE_SLUG plus CALCOM_USERNAME/CALCOM_TEAM_SLUG.");
  }

  private assertBookingSelector(body: Record<string, unknown>) {
    if (body.eventTypeId) return;
    if (body.eventTypeSlug && (body.username || body.teamSlug)) return;
    throw new Error("Cal.com booking requires CALCOM_EVENT_TYPE_ID or CALCOM_EVENT_TYPE_SLUG plus CALCOM_USERNAME/CALCOM_TEAM_SLUG.");
  }
}

export function calcomConfigFromEnv() {
  const eventTypeId = process.env.CALCOM_EVENT_TYPE_ID ? Number(process.env.CALCOM_EVENT_TYPE_ID) : undefined;
  if (process.env.CALCOM_EVENT_TYPE_ID && !Number.isFinite(eventTypeId)) throw new Error("CALCOM_EVENT_TYPE_ID must be numeric.");
  return {
    apiKey: requiredEnv("CALCOM_API_KEY"),
    baseUrl: process.env.CALCOM_BASE_URL || "https://api.cal.com",
    eventTypeId,
    eventTypeSlug: process.env.CALCOM_EVENT_TYPE_SLUG,
    username: process.env.CALCOM_USERNAME,
    teamSlug: process.env.CALCOM_TEAM_SLUG,
    organizationSlug: process.env.CALCOM_ORGANIZATION_SLUG,
    attendeeEmail: requiredEnv("CALCOM_TEST_ATTENDEE_EMAIL"),
    attendeeName: process.env.CALCOM_TEST_ATTENDEE_NAME || "Tilda Cal.com Smoke",
    attendeePhoneNumber: process.env.CALCOM_TEST_ATTENDEE_PHONE,
    timeZone: process.env.CALCOM_TIME_ZONE || "Europe/Berlin",
    durationMin: process.env.CALCOM_DURATION_MIN ? Number(process.env.CALCOM_DURATION_MIN) : undefined,
  };
}

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value?.trim()) throw new Error(`Missing ${name}. See README Cal.com smoke instructions.`);
  return value;
}

function toUtcISOString(value: string) {
  const millis = new Date(value).getTime();
  if (!Number.isFinite(millis)) throw new Error(`Invalid ISO datetime: ${value}`);
  return new Date(millis).toISOString();
}

function firstBooking(data: CalcomBooking | CalcomBooking[] | undefined): CalcomBooking {
  const booking = Array.isArray(data) ? data[0] : data;
  if (!booking?.uid) throw new Error(`Cal.com response did not include booking uid: ${JSON.stringify(data)}`);
  return booking;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { status: "error", message: text.slice(0, 500) };
  }
}

function summarizeCalcomError(json: unknown) {
  if (!json || typeof json !== "object") return String(json);
  const obj = json as Record<string, unknown>;
  return String(obj.message ?? obj.error ?? JSON.stringify(obj).slice(0, 500));
}
