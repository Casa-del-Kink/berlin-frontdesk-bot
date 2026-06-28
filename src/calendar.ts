import { google } from "googleapis";
import type { Busy } from "./slots.js";

function client() {
  const raw = process.env.GOOGLE_SA_JSON;
  if (!raw) throw new Error("Missing GOOGLE_SA_JSON in .env");
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(raw),
    scopes: ["https://www.googleapis.com/auth/calendar"],
  });
  return google.calendar({ version: "v3", auth });
}

export async function getBusy(calendarId: string, fromISO: string, toISO: string): Promise<Busy[]> {
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
