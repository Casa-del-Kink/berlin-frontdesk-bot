import { spawn } from "node:child_process";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { existsSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { setTimeout as sleep } from "node:timers/promises";

const PORT = Number(process.env.SERVER_CALCOM_BATTLETEST_PORT || 4542);
const BASE = `http://127.0.0.1:${PORT}`;
const TOKEN = "server-calcom-battletest-token";
const STATE_FILE = `data/server-calcom-battletest-state-${process.pid}.json`;
const require = createRequire(import.meta.url);
const TSX_CLI = require.resolve("tsx/cli");

interface CapturedRequest {
  method?: string;
  url?: string;
  apiVersion?: string;
  hasAuthorization?: boolean;
  body?: unknown;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function removeIfExists(path: string) {
  if (existsSync(path)) rmSync(path);
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

async function withMockCalcom<T>(fn: (baseUrl: string, captured: CapturedRequest[]) => Promise<T>) {
  const captured: CapturedRequest[] = [];
  const server = createServer(async (req, res) => {
    try {
      const body = await readBody(req);
      captured.push({
        method: req.method,
        url: req.url,
        apiVersion: req.headers["cal-api-version"] as string | undefined,
        hasAuthorization: Boolean(req.headers.authorization),
        body,
      });

      if (req.method === "GET" && req.url?.startsWith("/v2/slots")) {
        const url = new URL(req.url, "http://127.0.0.1");
        assert(url.searchParams.get("eventTypeId") === "42", `unexpected Cal.com event type: ${req.url}`);
        writeJson(res, 200, {
          status: "success",
          data: {
            "2050-09-05": [
              { start: "2050-09-05T09:00:00.000+02:00", end: "2050-09-05T10:00:00.000+02:00" },
              { start: "2050-09-05T11:00:00.000+02:00", end: "2050-09-05T12:00:00.000+02:00" },
            ],
          },
        });
        return;
      }

      if (req.method === "POST" && req.url === "/v2/bookings") {
        const input = body as any;
        assert(input.eventTypeId === 42, `booking should use configured eventTypeId: ${JSON.stringify(input)}`);
        assert(input.metadata?.source === "tilda", `booking should carry Tilda metadata: ${JSON.stringify(input)}`);
        assert(input.metadata?.channel === "phone", `booking should preserve source channel: ${JSON.stringify(input)}`);
        assert(String(input.metadata?.idempotencyKey || "").startsWith("booking:"), `booking should carry stable idempotency key: ${JSON.stringify(input)}`);
        writeJson(res, 201, {
          status: "success",
          data: {
            id: 4242,
            uid: "server_calcom_booking_4242",
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
  assert(address && typeof address === "object", "mock Cal.com server did not bind to a port");
  try {
    return await fn(`http://127.0.0.1:${address.port}`, captured);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
}

async function json(path: string, init: RequestInit = {}) {
  const res = await fetch(`${BASE}${path}`, init);
  const text = await res.text();
  let body: any;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    body = text;
  }
  return { res, body };
}

function authJson(body?: unknown): RequestInit {
  return {
    method: "POST",
    headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  };
}

async function waitForHealth() {
  const deadline = Date.now() + 15_000;
  let lastError = "not attempted";
  while (Date.now() < deadline) {
    try {
      const { res, body } = await json("/health");
      if (res.ok && body?.ok === true) return body;
      lastError = `${res.status} ${JSON.stringify(body)}`;
    } catch (err: any) {
      lastError = String(err?.message ?? err);
    }
    await sleep(250);
  }
  throw new Error(`Cal.com battletest server did not become healthy: ${lastError}`);
}

async function main() {
  removeIfExists(STATE_FILE);

  await withMockCalcom(async (calcomBaseUrl, captured) => {
    const child = spawn(process.execPath, [TSX_CLI, "src/server.ts"], {
      env: {
        ...process.env,
        PORT: String(PORT),
        SCHEDULING_PROVIDER: "calcom",
        CALCOM_API_KEY: "cal_test_server_battletest",
        CALCOM_BASE_URL: calcomBaseUrl,
        CALCOM_EVENT_TYPE_ID: "42",
        CALCOM_TIME_ZONE: "Europe/Berlin",
        CALCOM_FALLBACK_ATTENDEE_EMAIL_DOMAIN: "example.test",
        STATE_FILE,
        STORE_BACKEND: "json",
        OWNER_ALERT_LOG_ONLY_ACCEPTED: "true",
        SERVER_TOOL_TOKEN: TOKEN,
        SKIP_TWILIO_SIGNATURE_VALIDATION: "false",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    try {
      const health = await waitForHealth();
      assert(health.storeBackend === "json", `unexpected store backend: ${JSON.stringify(health)}`);
      assert(health.schedulingProvider === "calcom", `health should expose Cal.com provider: ${JSON.stringify(health)}`);

      let out = await json("/tools/check_availability", authJson({ phone: "whatsapp:+491****4242", args: { service: "Damenhaarschnitt", from: "2050-09-05", days: 1 } }));
      assert(out.res.ok, `Cal.com availability HTTP failed: ${out.res.status} ${JSON.stringify(out.body)}`);
      assert(out.body?.schedulingProvider === "calcom", `availability should use Cal.com: ${JSON.stringify(out.body)}`);
      assert(Array.isArray(out.body?.slots) && out.body.slots.length === 2, `availability should return mock Cal.com slots: ${JSON.stringify(out.body)}`);
      const slot = out.body.slots[0].iso;

      out = await json(
        "/tools/book_appointment",
        authJson({ phone: "whatsapp:+491****4242", args: { name: "Server Calcom", service: "Damenhaarschnitt", start: slot, channel: "phone" } }),
      );
      assert(out.res.ok, `Cal.com booking HTTP failed: ${out.res.status} ${JSON.stringify(out.body)}`);
      assert(out.body?.ok === true, `Cal.com booking should succeed: ${JSON.stringify(out.body)}`);
      assert(out.body?.schedulingProvider === "calcom", `booking should report Cal.com: ${JSON.stringify(out.body)}`);
      assert(out.body?.providerBookingId === "server_calcom_booking_4242", `booking should expose provider ID: ${JSON.stringify(out.body)}`);
      const providerBookingId = out.body.providerBookingId;

      out = await json(
        "/tools/book_appointment",
        authJson({ phone: "whatsapp:+491****4242", args: { name: "Server Calcom", service: "Damenhaarschnitt", start: slot, channel: "phone" } }),
      );
      assert(out.res.ok, `Cal.com idempotent retry HTTP failed: ${out.res.status} ${JSON.stringify(out.body)}`);
      assert(out.body?.ok === true && out.body?.idempotentReplay === true, `Cal.com retry should be locally idempotent: ${JSON.stringify(out.body)}`);

      const slotsReq = captured.find((req) => req.url?.startsWith("/v2/slots"));
      const bookingReqs = captured.filter((req) => req.method === "POST" && req.url === "/v2/bookings");
      assert(slotsReq?.apiVersion === "2024-09-04", `slots request used wrong API version: ${JSON.stringify(captured)}`);
      assert(bookingReqs.length === 1, `idempotent retry should not call Cal.com twice: ${JSON.stringify(captured)}`);
      assert(bookingReqs[0].apiVersion === "2026-02-25", `booking request used wrong API version: ${JSON.stringify(captured)}`);
      assert(!JSON.stringify(captured).includes("cal_test_server_battletest"), "captured output must not print mock API key values");

      console.log("SERVER_CALCOM_BATTLETEST_OK");
      console.log(JSON.stringify({ base: BASE, calcomCalls: captured.length, bookingCalls: bookingReqs.length, providerBookingId }, null, 2));
    } finally {
      child.kill("SIGTERM");
      await sleep(250);
      if (!child.killed) child.kill("SIGKILL");
      removeIfExists(STATE_FILE);
      if (stderr.trim()) console.error(stderr.trim());
    }
  });
}

main().catch((err) => {
  console.error("SERVER_CALCOM_BATTLETEST_FAILED");
  console.error(err instanceof Error ? err.stack ?? err.message : err);
  process.exit(1);
});
