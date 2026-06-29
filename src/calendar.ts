import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { google } from "googleapis";
import type { Busy } from "./slots.js";

interface FakeCalendarState {
  events: Array<{
    id: string;
    calendarId: string;
    summary: string;
    description?: string;
    start: string;
    end: string;
    tz: string;
    idempotencyKey?: string;
    createdAt: string;
  }>;
}

export interface CalendarEventInput {
  summary: string;
  description?: string;
  startISO: string;
  endISO: string;
  tz: string;
  idempotencyKey?: string;
}

export interface CalendarProvider {
  readonly name: "fake" | "google";
  findEventByIdempotencyKey(calendarId: string, idempotencyKey: string): Promise<string | undefined>;
  findMatchingEvent(calendarId: string, ev: Pick<CalendarEventInput, "summary" | "startISO" | "endISO">): Promise<string | undefined>;
  getBusy(calendarId: string, fromISO: string, toISO: string): Promise<Busy[]>;
  createEvent(calendarId: string, ev: CalendarEventInput): Promise<string>;
}

function useFakeCalendar() {
  return process.env.USE_FAKE_CALENDAR === "true";
}

function fakeCalendarFile() {
  return process.env.FAKE_CALENDAR_FILE || "data/fake-calendar.json";
}

function readFakeState(): FakeCalendarState {
  const file = fakeCalendarFile();
  if (!existsSync(file)) return { events: [] };
  return JSON.parse(readFileSync(file, "utf8")) as FakeCalendarState;
}

function writeFakeState(state: FakeCalendarState) {
  const file = fakeCalendarFile();
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(state, null, 2));
  renameSync(tmp, file);
}

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  const a0 = new Date(aStart).getTime();
  const a1 = new Date(aEnd).getTime();
  const b0 = new Date(bStart).getTime();
  const b1 = new Date(bEnd).getTime();
  return a0 < b1 && b0 < a1;
}

function googleClient() {
  const raw = process.env.GOOGLE_SA_JSON;
  if (!raw) throw new Error("Missing GOOGLE_SA_JSON in .env. For credential-free local testing, set USE_FAKE_CALENDAR=true.");
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(raw),
    scopes: ["https://www.googleapis.com/auth/calendar"],
  });
  return google.calendar({ version: "v3", auth });
}

function eventLink(id: string) {
  return `fake-calendar://${id}`;
}

class FakeCalendarProvider implements CalendarProvider {
  readonly name = "fake" as const;

  async findEventByIdempotencyKey(calendarId: string, idempotencyKey: string): Promise<string | undefined> {
    const state = readFakeState();
    const existing = state.events.find((event) => event.calendarId === calendarId && event.idempotencyKey === idempotencyKey);
    return existing ? eventLink(existing.id) : undefined;
  }

  async findMatchingEvent(calendarId: string, ev: Pick<CalendarEventInput, "summary" | "startISO" | "endISO">): Promise<string | undefined> {
    const state = readFakeState();
    const existing = state.events.find(
      (stored) => stored.calendarId === calendarId && stored.summary === ev.summary && stored.start === ev.startISO && stored.end === ev.endISO,
    );
    return existing ? eventLink(existing.id) : undefined;
  }

  async getBusy(calendarId: string, fromISO: string, toISO: string): Promise<Busy[]> {
    const state = readFakeState();
    return state.events
      .filter((ev) => ev.calendarId === calendarId && overlaps(ev.start, ev.end, fromISO, toISO))
      .map((ev) => ({ start: ev.start, end: ev.end }));
  }

  async createEvent(calendarId: string, ev: CalendarEventInput): Promise<string> {
    const state = readFakeState();
    if (ev.idempotencyKey) {
      const existing = state.events.find((stored) => stored.calendarId === calendarId && stored.idempotencyKey === ev.idempotencyKey);
      if (existing) return eventLink(existing.id);
    }

    const id = `fake_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    state.events.push({
      id,
      calendarId,
      summary: ev.summary,
      description: ev.description,
      start: ev.startISO,
      end: ev.endISO,
      tz: ev.tz,
      idempotencyKey: ev.idempotencyKey,
      createdAt: new Date().toISOString(),
    });
    writeFakeState(state);
    return eventLink(id);
  }
}

class GoogleCalendarProvider implements CalendarProvider {
  readonly name = "google" as const;

  async findEventByIdempotencyKey(calendarId: string, idempotencyKey: string): Promise<string | undefined> {
    const cal = googleClient();
    const res = await cal.events.list({
      calendarId,
      privateExtendedProperty: [`idempotencyKey=${idempotencyKey}`],
      maxResults: 1,
      singleEvents: true,
    });
    const existing = res.data.items?.[0];
    return existing ? existing.htmlLink || existing.id || undefined : undefined;
  }

  async findMatchingEvent(calendarId: string, ev: Pick<CalendarEventInput, "summary" | "startISO" | "endISO">): Promise<string | undefined> {
    const cal = googleClient();
    const res = await cal.events.list({
      calendarId,
      timeMin: ev.startISO,
      timeMax: ev.endISO,
      q: ev.summary,
      maxResults: 10,
      singleEvents: true,
    });
    const existing = res.data.items?.find((item) => item.summary === ev.summary);
    return existing ? existing.htmlLink || existing.id || undefined : undefined;
  }

  async getBusy(calendarId: string, fromISO: string, toISO: string): Promise<Busy[]> {
    const cal = googleClient();
    const res = await cal.freebusy.query({
      requestBody: { timeMin: fromISO, timeMax: toISO, items: [{ id: calendarId }] },
    });
    const busy = res.data.calendars?.[calendarId]?.busy ?? [];
    return busy.map((b) => ({ start: b.start!, end: b.end! }));
  }

  async createEvent(calendarId: string, ev: CalendarEventInput): Promise<string> {
    const cal = googleClient();
    const res = await cal.events.insert({
      calendarId,
      requestBody: {
        summary: ev.summary,
        description: ev.description,
        start: { dateTime: ev.startISO, timeZone: ev.tz },
        end: { dateTime: ev.endISO, timeZone: ev.tz },
        extendedProperties: ev.idempotencyKey ? { private: { idempotencyKey: ev.idempotencyKey } } : undefined,
      },
    });
    return res.data.htmlLink || res.data.id || "ok";
  }
}

export function getCalendarProvider(): CalendarProvider {
  return useFakeCalendar() ? new FakeCalendarProvider() : new GoogleCalendarProvider();
}

export async function findEventByIdempotencyKey(calendarId: string, idempotencyKey: string): Promise<string | undefined> {
  return getCalendarProvider().findEventByIdempotencyKey(calendarId, idempotencyKey);
}

export async function findMatchingEvent(calendarId: string, ev: Pick<CalendarEventInput, "summary" | "startISO" | "endISO">): Promise<string | undefined> {
  return getCalendarProvider().findMatchingEvent(calendarId, ev);
}

export async function getBusy(calendarId: string, fromISO: string, toISO: string): Promise<Busy[]> {
  return getCalendarProvider().getBusy(calendarId, fromISO, toISO);
}

export async function createEvent(calendarId: string, ev: CalendarEventInput): Promise<string> {
  return getCalendarProvider().createEvent(calendarId, ev);
}
