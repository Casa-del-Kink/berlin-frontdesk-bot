import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { rmSync } from "node:fs";
import assert from "node:assert";

interface CapturedRequest {
  method?: string;
  url?: string;
  body?: unknown;
  apiVersion?: string;
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      if (!body) return resolve(undefined);
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

function writeJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

async function withMockCalcom<T>(fn: (baseUrl: string, captured: CapturedRequest[]) => Promise<T>): Promise<T> {
  const captured: CapturedRequest[] = [];
  const server = createServer(async (req, res) => {
    try {
      const body = await readBody(req);
      captured.push({ method: req.method, url: req.url, body, apiVersion: req.headers["cal-api-version"] as string | undefined });

      if (req.method === "GET" && req.url?.startsWith("/v2/slots")) {
        writeJson(res, 200, {
          status: "success",
          data: {
            "2050-09-05": [
              { start: "2050-09-05T09:00:00.000+02:00", end: "2050-09-05T10:00:00.000+02:00" },
              { start: "2050-09-05T10:00:00.000+02:00", end: "2050-09-05T11:00:00.000+02:00" },
            ],
          },
        });
        return;
      }

      if (req.method === "POST" && req.url === "/v2/bookings") {
        writeJson(res, 201, {
          status: "success",
          data: {
            id: 777,
            uid: "calcom_dual_track_booking_777",
            status: "accepted",
            start: "2050-09-05T07:00:00.000Z",
            end: "2050-09-05T08:00:00.000Z",
          },
        });
        return;
      }

      writeJson(res, 404, { status: "error", message: `unexpected ${req.method} ${req.url}` });
    } catch (err) {
      writeJson(res, 500, { status: "error", message: err instanceof Error ? err.message : String(err) });
    }
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address === "object");
  try {
    return await fn(`http://127.0.0.1:${address.port}`, captured);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
}

async function main() {
  const previous = { ...process.env };
  try {
    process.env.SCHEDULING_PROVIDER = "calcom";
    process.env.CALCOM_API_KEY = "cal_test_dual_track";
    process.env.CALCOM_EVENT_TYPE_ID = "42";
    process.env.CALCOM_TIME_ZONE = "Europe/Berlin";
    process.env.CALCOM_FALLBACK_ATTENDEE_EMAIL_DOMAIN = "example.test";
    process.env.STORE_BACKEND = "json";
    const stateFile = `tmp/scheduling-provider-check-state-${process.pid}-${Date.now()}.json`;
    process.env.STATE_FILE = stateFile;
    rmSync(stateFile, { force: true });
    process.env.OWNER_ALERT_LOG_ONLY_ACCEPTED = "true";

    await withMockCalcom(async (baseUrl, captured) => {
      process.env.CALCOM_BASE_URL = baseUrl;
      const { loadClient } = await import("./config.js");
      const { runTool } = await import("./tools.js");
      const cfg = loadClient();
      const phone = "whatsapp:+491****7777";
      const availability = (await runTool(cfg, phone, "check_availability", {
        service: "Damenhaarschnitt",
        from: "2050-09-05",
        days: 1,
      })) as any;
      assert.equal(availability.schedulingProvider, "calcom");
      assert.equal(availability.slots.length, 2);

      const booking = (await runTool(cfg, phone, "book_appointment", {
        name: "Calcom Dual Track",
        service: "Damenhaarschnitt",
        start: availability.slots[0].iso,
        channel: "phone",
      })) as any;
      assert.equal(booking.ok, true);
      assert.equal(booking.schedulingProvider, "calcom");
      assert.equal(booking.providerBookingId, "calcom_dual_track_booking_777");
      assert.equal(booking.link, "calcom://booking/calcom_dual_track_booking_777");

      const slotReq = captured.find((req) => req.url?.startsWith("/v2/slots"));
      assert.equal(slotReq?.apiVersion, "2024-09-04");
      const createReq = captured.find((req) => req.method === "POST" && req.url === "/v2/bookings");
      assert.equal(createReq?.apiVersion, "2026-02-25");
      assert.equal((createReq?.body as any).eventTypeId, 42);
      assert.equal((createReq?.body as any).attendee.language, "de");
    });

    console.log("SCHEDULING_PROVIDER_CHECK_OK");
  } finally {
    process.env = previous;
  }
}

main().catch((err) => {
  console.error("SCHEDULING_PROVIDER_CHECK_FAILED");
  console.error(err instanceof Error ? err.stack ?? err.message : err);
  process.exit(1);
});
