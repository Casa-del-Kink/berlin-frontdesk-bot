import "dotenv/config";
import { DateTime } from "luxon";
import { CalcomClient, calcomConfigFromEnv } from "./calcom.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function keepSmokeBooking() {
  return process.env.CALCOM_KEEP_SMOKE_BOOKING === "true";
}

async function main() {
  const cfg = calcomConfigFromEnv();
  const client = new CalcomClient({ apiKey: cfg.apiKey, baseUrl: cfg.baseUrl });
  const now = DateTime.now().setZone(cfg.timeZone);
  const days = process.env.CALCOM_TEST_DAYS ? Number(process.env.CALCOM_TEST_DAYS) : 14;
  assert(Number.isFinite(days) && days > 0, "CALCOM_TEST_DAYS must be a positive number when set.");

  const startISO = now.plus({ days: 1 }).startOf("day").toUTC().toISO()!;
  const endISO = now.plus({ days }).endOf("day").toUTC().toISO()!;

  console.log(`CALCOM_SMOKE baseUrl=${cfg.baseUrl}`);
  console.log(`CALCOM_SMOKE window=${startISO}..${endISO} tz=${cfg.timeZone}`);

  let bookingUid: string | undefined;
  try {
    const slots = await client.getAvailableSlots({
      eventTypeId: cfg.eventTypeId,
      eventTypeSlug: cfg.eventTypeSlug,
      username: cfg.username,
      teamSlug: cfg.teamSlug,
      organizationSlug: cfg.organizationSlug,
      startISO,
      endISO,
      timeZone: cfg.timeZone,
      durationMin: cfg.durationMin,
    });
    assert(slots.length > 0, "Cal.com returned zero available slots for the configured event type/test window.");
    const slot = slots[0];
    assert(slot.start, `First Cal.com slot is missing start: ${JSON.stringify(slot)}`);
    console.log(`selected_slot=${slot.start}`);

    const booking = await client.createBooking({
      eventTypeId: cfg.eventTypeId,
      eventTypeSlug: cfg.eventTypeSlug,
      username: cfg.username,
      teamSlug: cfg.teamSlug,
      organizationSlug: cfg.organizationSlug,
      startISO: slot.start,
      attendeeName: cfg.attendeeName,
      attendeeEmail: cfg.attendeeEmail,
      attendeePhoneNumber: cfg.attendeePhoneNumber,
      attendeeTimeZone: cfg.timeZone,
      attendeeLanguage: "de",
      lengthInMinutes: cfg.durationMin,
      metadata: {
        source: "tilda_calcom_smoke",
        createdBy: "berlin-frontdesk-bot",
      },
    });
    bookingUid = booking.uid;
    console.log(`created_booking_uid=${booking.uid}`);
    console.log(`created_booking_status=${booking.status ?? "unknown"}`);

    const fetched = await client.getBooking(booking.uid);
    assert(fetched.uid === booking.uid, `Fetched booking UID mismatch: expected ${booking.uid}, got ${fetched.uid}`);
    console.log(`verified_booking_uid=${fetched.uid}`);
    console.log(`verified_booking_status=${fetched.status ?? "unknown"}`);

    if (keepSmokeBooking()) {
      console.log("CALCOM_SMOKE_OK_KEEP_BOOKING");
      return;
    }

    const cancelled = await client.cancelBooking(booking.uid);
    assert(cancelled.uid === booking.uid, `Cancelled booking UID mismatch: expected ${booking.uid}, got ${cancelled.uid}`);
    console.log(`cancelled_booking_uid=${cancelled.uid}`);
    console.log(`cancelled_booking_status=${cancelled.status ?? "unknown"}`);
    console.log("CALCOM_SMOKE_OK");
  } finally {
    if (!keepSmokeBooking() && bookingUid) {
      await client.cancelBooking(bookingUid, "Tilda Cal.com smoke final cleanup").catch(() => undefined);
    }
  }
}

main().catch((err) => {
  console.error("CALCOM_SMOKE_FAILED");
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
