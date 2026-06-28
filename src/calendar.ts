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
    createdAt: string;
  }>;
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

function client() {
  const raw = process.env.GOOGLE_SA_JSON;
  if (!raw) throw new Error("Missing GOOGLE_SA_JSON in .env. For credential-free local testing, set USE_FAKE_CALENDAR=true.");
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(raw),
    scopes: ["https://www.googleapis.com/auth/calendar"],
  });
  return google.calendar({ version: "v3", auth });
}

export async function getBusy(calendarId: string, fromISO: string, toISO: string): Promise<Busy[]> {
  if (useFakeCalendar()) {
    const state = readFakeState();
    return state.events
      .filter((ev) => ev.calendarId === calendarId && overlaps(ev.start, ev.end, fromISO, toISO))
      .map((ev) => ({ start: ev.start, end: ev.end }));
  }

  const cal = client();
  const res = await cal.freebusy.query({
    requestBody: { timeMin: fromISO, timeMax: toISO, items: [{ id: calendarId }] },
  });
  const busy = res.data.calendars?.[calendarId]?.busy ?? [];
  return busy.map((b) => ({ start: b.start!, end: b.end! }));
}

export async function createEvent(
  calendarId: string,
  ev: { summary: string; description?: string; startISO: string; endISO: string; tz: string },
): Promise<string> {
  if (useFakeCalendar()) {
    const state = readFakeState();
    const id = `fake_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    state.events.push({
      id,
      calendarId,
      summary: ev.summary,
      description: ev.description,
      start: ev.startISO,
      end: ev.endISO,
      tz: ev.tz,
      createdAt: new Date().toISOString(),
    });
    writeFakeState(state);
    return `fake-calendar://${id}`;
  }

  const cal = client();
  const res = await cal.events.insert({
    calendarId,
    requestBody: {
      summary: ev.summary,
      description: ev.description,
      start: { dateTime: ev.startISO, timeZone: ev.tz },
      end: { dateTime: ev.endISO, timeZone: ev.tz },
    },
  });
  return res.data.htmlLink || res.data.id || "ok";
}
