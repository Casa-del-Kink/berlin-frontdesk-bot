import { CalcomClient } from "./calcom.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

interface CapturedRequest {
  url: string;
  method?: string;
  headers: Headers;
  body?: unknown;
}

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function main() {
  const captured: CapturedRequest[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    captured.push({
      url,
      method: init?.method,
      headers: new Headers(init?.headers),
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });

    if (url.includes("/v2/slots")) {
      return response({
        status: "success",
        data: {
          "2050-09-05": [{ start: "2050-09-05T09:00:00.000+02:00", end: "2050-09-05T10:00:00.000+02:00" }],
        },
      });
    }
    if (url.endsWith("/v2/bookings") && init?.method === "POST") {
      return response({
        status: "success",
        data: {
          id: 123,
          uid: "booking_uid_123",
          status: "accepted",
          start: "2050-09-05T07:00:00.000Z",
          end: "2050-09-05T08:00:00.000Z",
        },
      }, 201);
    }
    if (url.endsWith("/v2/bookings/booking_uid_123/cancel")) {
      return response({ status: "success", data: { uid: "booking_uid_123", status: "cancelled" } });
    }
    if (url.endsWith("/v2/bookings/booking_uid_123")) {
      return response({ status: "success", data: { uid: "booking_uid_123", status: "accepted" } });
    }
    return response({ status: "error", message: `unexpected ${url}` }, 404);
  };

  const client = new CalcomClient({ apiKey: "cal_test_key", baseUrl: "https://api.cal.test", fetchImpl });
  const slots = await client.getAvailableSlots({
    eventTypeId: 42,
    startISO: "2050-09-05T00:00:00.000Z",
    endISO: "2050-09-06T00:00:00.000Z",
    timeZone: "Europe/Berlin",
    durationMin: 60,
  });
  assert(slots.length === 1, `Expected one slot, got ${slots.length}`);
  assert(captured[0].headers.get("cal-api-version") === "2024-09-04", "Slots request used wrong cal-api-version.");
  assert(captured[0].url.includes("format=range"), "Slots request must ask for range format.");

  const booking = await client.createBooking({
    eventTypeId: 42,
    startISO: slots[0].start,
    attendeeName: "Tilda Check",
    attendeeEmail: "tilda-check@example.test",
    attendeeTimeZone: "Europe/Berlin",
    attendeeLanguage: "de",
    metadata: { source: "calcom_check" },
  });
  assert(booking.uid === "booking_uid_123", `Unexpected booking UID: ${booking.uid}`);

  const createReq = captured.find((req) => req.url.endsWith("/v2/bookings") && req.method === "POST");
  assert(createReq?.headers.get("cal-api-version") === "2026-02-25", "Booking request used wrong cal-api-version.");
  assert((createReq.body as any).start === "2050-09-05T07:00:00.000Z", "Booking start should be converted to UTC.");
  assert((createReq.body as any).attendee.language === "de", "Booking attendee language should be German for salon pilot smoke.");

  const fetched = await client.getBooking(booking.uid);
  assert(fetched.uid === booking.uid, "Get booking did not return the created UID.");

  const cancelled = await client.cancelBooking(booking.uid);
  assert(cancelled.status === "cancelled", "Cancel booking did not return cancelled status.");

  assert(!JSON.stringify(captured).includes("[REDACTED]"), "Mock check should not depend on redacted placeholders.");
  console.log("CALCOM_PROVIDER_CHECK_OK");
}

main().catch((err) => {
  console.error("CALCOM_PROVIDER_CHECK_FAILED");
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
