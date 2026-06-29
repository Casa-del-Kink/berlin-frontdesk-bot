import { google } from "googleapis";
import { loadClient } from "./config.js";
import { runTool } from "./tools.js";
import { deleteSubjectData } from "./store.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function googleClient() {
  const raw = process.env.GOOGLE_SA_JSON;
  if (!raw?.trim()) {
    throw new Error("Missing GOOGLE_SA_JSON. Use the Tilda dev calendar service account JSON before running live-calendar:smoke.");
  }

  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(raw),
    scopes: ["https://www.googleapis.com/auth/calendar"],
  });
  return google.calendar({ version: "v3", auth });
}

async function listCalendarEventsByIdempotencyKey(calendarId: string, idempotencyKey: string) {
  const cal = googleClient();
  const listed = await cal.events.list({
    calendarId,
    privateExtendedProperty: [`idempotencyKey=${idempotencyKey}`],
    maxResults: 10,
    singleEvents: true,
    showDeleted: false,
  });
  return listed.data.items ?? [];
}

async function deleteCalendarEventByIdempotencyKey(calendarId: string, idempotencyKey: string) {
  const events = await listCalendarEventsByIdempotencyKey(calendarId, idempotencyKey);

  let deleted = 0;
  const cal = googleClient();
  for (const ev of events) {
    if (!ev.id) continue;
    await cal.events.delete({ calendarId, eventId: ev.id });
    console.log(`deleted_event_id=${ev.id}`);
    deleted += 1;
  }
  return deleted;
}

function keepSmokeEvent() {
  return process.env.KEEP_SMOKE_EVENT === "true";
}

async function main() {
  if (process.env.USE_FAKE_CALENDAR === "true") {
    throw new Error("live-calendar:smoke must run against the real Tilda dev calendar. Do not set USE_FAKE_CALENDAR=true.");
  }

  const cfg = loadClient();
  assert(cfg.calendarId.includes("@group.calendar.google.com"), `Expected dedicated Tilda calendar ID, got ${cfg.calendarId}`);

  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const phone = `phone:+491-live-calendar-${suffix}`;
  const service = "Damenhaarschnitt";

  console.log(`LIVE_CALENDAR_BOOKING_SMOKE calendar=${cfg.calendarId}`);

  let idempotencyKey: string | undefined;
  try {
    const availability = (await runTool(cfg, phone, "check_availability", { service, days: 7 })) as any;
    assert(Array.isArray(availability.slots), `Availability did not return slots: ${JSON.stringify(availability)}`);
    assert(availability.slots.length > 0, `No free slots returned from Tilda dev calendar: ${JSON.stringify(availability)}`);

    const slot = availability.slots[0];
    assert(typeof slot.iso === "string", `First slot missing iso: ${JSON.stringify(slot)}`);
    console.log(`selected_slot=${slot.iso}`);

    const booking = (await runTool(cfg, phone, "book_appointment", {
      name: "Tilda Live Calendar Smoke",
      service,
      start: slot.iso,
      channel: "phone",
    })) as any;

    assert(booking.ok === true, `Booking failed: ${JSON.stringify(booking)}`);
    assert(booking.channel === "phone", `Booking channel should be phone: ${JSON.stringify(booking)}`);
    assert(typeof booking.idempotencyKey === "string", `Booking missing idempotency key: ${JSON.stringify(booking)}`);
    const cleanupKey: string = booking.idempotencyKey;
    idempotencyKey = cleanupKey;
    console.log(`booked_when=${booking.when}`);
    console.log(`booking_idempotency_key=${cleanupKey}`);

    const replay = (await runTool(cfg, phone, "book_appointment", {
      name: "Tilda Live Calendar Smoke",
      service,
      start: slot.iso,
      channel: "phone",
    })) as any;
    assert(replay.ok === true && replay.idempotentReplay === true, `Booking replay was not idempotent: ${JSON.stringify(replay)}`);
    console.log("idempotent_replay_ok=true");

    const events = await listCalendarEventsByIdempotencyKey(cfg.calendarId, cleanupKey);
    const visibleEvent = events[0];
    assert(visibleEvent?.id, `Could not find booked smoke event in Google Calendar for ${cleanupKey}`);
    console.log(`verified_event_id=${visibleEvent.id}`);
    console.log(`verified_event_summary=${visibleEvent.summary}`);

    if (keepSmokeEvent()) {
      console.log(`kept_event_id=${visibleEvent.id}`);
      console.log("LIVE_CALENDAR_BOOKING_SMOKE_OK_KEEP_EVENT");
      return;
    }

    const deleted = await deleteCalendarEventByIdempotencyKey(cfg.calendarId, cleanupKey);
    assert(deleted >= 1, `Expected to delete at least one smoke event for ${cleanupKey}`);

    await deleteSubjectData(phone);
    console.log("LIVE_CALENDAR_BOOKING_SMOKE_OK");
  } finally {
    if (!keepSmokeEvent() && idempotencyKey) await deleteCalendarEventByIdempotencyKey(cfg.calendarId, idempotencyKey).catch(() => undefined);
    await deleteSubjectData(phone).catch(() => undefined);
  }
}

main().catch((err) => {
  console.error("LIVE_CALENDAR_BOOKING_SMOKE_FAILED");
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
