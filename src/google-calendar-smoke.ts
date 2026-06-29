import { google } from "googleapis";
import { DateTime } from "luxon";
import { loadClient } from "./config.js";

function googleClient() {
  const raw = process.env.GOOGLE_SA_JSON;
  if (!raw?.trim()) {
    throw new Error("Missing GOOGLE_SA_JSON. Share the Tilda calendar with the service account and set GOOGLE_SA_JSON before running this smoke test.");
  }

  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(raw),
    scopes: ["https://www.googleapis.com/auth/calendar"],
  });

  return google.calendar({ version: "v3", auth });
}

async function main() {
  if (process.env.USE_FAKE_CALENDAR === "true") {
    throw new Error("google-calendar:smoke must run against Google Calendar. Do not set USE_FAKE_CALENDAR=true.");
  }

  const cfg = loadClient();
  if (!cfg.calendarId?.includes("@group.calendar.google.com")) {
    throw new Error(`Client config calendarId does not look like a dedicated shared calendar: ${cfg.calendarId}`);
  }

  const cal = googleClient();
  const start = DateTime.now().setZone(cfg.timezone).plus({ days: 2 }).set({ hour: 8, minute: 15, second: 0, millisecond: 0 });
  const end = start.plus({ minutes: 15 });
  const marker = `tilda-google-smoke-${Date.now()}`;
  const summary = `Tilda smoke test - delete me - ${marker}`;

  console.log(`GOOGLE_CALENDAR_SMOKE calendar=${cfg.calendarId}`);
  console.log(`GOOGLE_CALENDAR_SMOKE start=${start.toISO()}`);

  const before = await cal.freebusy.query({
    requestBody: {
      timeMin: start.toUTC().toISO(),
      timeMax: end.toUTC().toISO(),
      items: [{ id: cfg.calendarId }],
    },
  });
  console.log(`busy_before=${before.data.calendars?.[cfg.calendarId]?.busy?.length ?? 0}`);

  const inserted = await cal.events.insert({
    calendarId: cfg.calendarId,
    requestBody: {
      summary,
      description: `Automated Tilda Google Calendar smoke test. Marker: ${marker}`,
      start: { dateTime: start.toISO(), timeZone: cfg.timezone },
      end: { dateTime: end.toISO(), timeZone: cfg.timezone },
      extendedProperties: { private: { smokeTest: marker } },
    },
  });

  const eventId = inserted.data.id;
  if (!eventId) throw new Error("Google Calendar insert succeeded but returned no event id.");
  console.log(`created_event_id=${eventId}`);

  try {
    const listed = await cal.events.list({
      calendarId: cfg.calendarId,
      privateExtendedProperty: [`smokeTest=${marker}`],
      maxResults: 1,
      singleEvents: true,
    });
    const found = listed.data.items?.[0];
    if (!found?.id) throw new Error("Could not find the inserted smoke event by private extended property.");
    console.log(`found_event_id=${found.id}`);
  } finally {
    await cal.events.delete({ calendarId: cfg.calendarId, eventId });
    console.log(`deleted_event_id=${eventId}`);
  }

  const after = await cal.events.list({
    calendarId: cfg.calendarId,
    privateExtendedProperty: [`smokeTest=${marker}`],
    maxResults: 1,
    singleEvents: true,
  });
  if ((after.data.items?.length ?? 0) !== 0) throw new Error("Smoke event still exists after cleanup.");

  console.log("GOOGLE_CALENDAR_SMOKE_OK");
}

main().catch((err) => {
  console.error("GOOGLE_CALENDAR_SMOKE_FAILED");
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
