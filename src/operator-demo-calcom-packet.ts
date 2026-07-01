import { spawn } from "node:child_process";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { createRequire } from "node:module";
import { setTimeout as sleep } from "node:timers/promises";

const require = createRequire(import.meta.url);
const TSX_CLI = require.resolve("tsx/cli");
const PORT = Number(process.env.OPERATOR_DEMO_CALCOM_PACKET_PORT || 4554);
const BASE = `http://127.0.0.1:${PORT}`;
const TOKEN = "operator-demo-calcom-packet-token";
const STATE_FILE = `data/operator-demo-calcom-packet-state-${process.pid}.json`;
const OUTPUT_PATH = process.env.OPERATOR_DEMO_CALCOM_PACKET_PATH || "tmp/tilda-ops-snapshot/operator-demo-calcom-packet.md";
const JSON_MODE = process.env.OPERATOR_DEMO_CALCOM_PACKET_JSON === "true";

type Step = { name: string; status: "ok"; detail: string };

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
        assert(url.searchParams.get("format") === "range", `Cal.com slots should request range format: ${req.url}`);
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
        assert(input.attendee?.language === "de", `booking should use German attendee language: ${JSON.stringify(input)}`);
        assert(input.metadata?.source === "tilda", `booking should carry Tilda metadata: ${JSON.stringify(input)}`);
        assert(input.metadata?.channel === "phone", `operator packet booking should preserve phone channel: ${JSON.stringify(input)}`);
        assert(String(input.metadata?.idempotencyKey || "").startsWith("booking:"), `booking should carry stable idempotency key: ${JSON.stringify(input)}`);
        writeJson(res, 201, {
          status: "success",
          data: {
            id: 4554,
            uid: "operator_demo_calcom_booking_4554",
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
  let body: any = text;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    body = text;
  }
  return { res, body };
}

function authHeaders() {
  return { authorization: `Bearer ${TOKEN}` };
}

function authJson(body?: unknown): RequestInit {
  return { method: "POST", headers: { ...authHeaders(), "content-type": "application/json" }, body: JSON.stringify(body ?? {}) };
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
  throw new Error(`operator Cal.com packet server did not become healthy: ${lastError}`);
}

function buildPacketReport(steps: Step[], facts: Record<string, unknown>) {
  return {
    marker: "OPERATOR_DEMO_CALCOM_PACKET_OK",
    generatedAt: new Date().toISOString(),
    mode: "no-credential mock-Cal.com server proof",
    outputPath: OUTPUT_PATH,
    steps,
    facts,
    noLiveProviderCalls: true,
    liveCommandsRequireApproval: ["npm run calcom:smoke", "npm run supabase:postgres:smoke", "npm run voice:contract"],
  };
}

function writePacket(report: ReturnType<typeof buildPacketReport>) {
  const markdown = [
    "# Tilda operator Cal.com demo packet",
    "",
    `Generated: ${report.generatedAt}`,
    `Marker: \`${report.marker}\``,
    `Mode: ${report.mode}. No hosted Cal.com, Google Calendar, Supabase/Postgres, WhatsApp, or voice provider calls were made.`,
    "",
    "## Verified steps",
    "",
    ...report.steps.map((step) => `- ${step.name}: ${step.detail}`),
    "",
    "## Packet facts",
    "",
    `- Health client: ${String(report.facts.healthClient)}`,
    `- Scheduling provider: ${String(report.facts.schedulingProvider)}`,
    `- Readiness status: ${String(report.facts.readinessStatus)}`,
    `- Readiness Cal.com proof blocker: ${String(report.facts.readinessCalcomProofBlocker)}`,
    `- Cal.com mock calls: ${String(report.facts.calcomCalls)}`,
    `- Cal.com booking calls: ${String(report.facts.bookingCalls)}`,
    `- Provider booking ID: ${String(report.facts.providerBookingId)}`,
    `- Idempotent booking replay: ${String(report.facts.bookingRetryIdempotent)}`,
    `- Voice retry idempotent replay: ${String(report.facts.voiceRetryIdempotent)}`,
    `- Output path: ${report.outputPath}`,
    "",
    "## Next live steps",
    "",
    "- Run `npm run calcom:smoke` only after Cal.com API credentials and an approved test event type are configured.",
    "- Verify the live Cal.com smoke cancels its fixture unless visible-proof mode is explicitly requested.",
    "- Keep this packet as a local mock proof, not as evidence that hosted Cal.com is ready.",
    "",
  ].join("\n");
  mkdirSync(dirname(report.outputPath), { recursive: true });
  writeFileSync(report.outputPath, markdown);
}

async function main() {
  removeIfExists(STATE_FILE);

  await withMockCalcom(async (calcomBaseUrl, captured) => {
    const child = spawn(process.execPath, [TSX_CLI, "src/server.ts"], {
      env: {
        ...process.env,
        PORT: String(PORT),
        CLIENT_FILE: "clients/salon-demo.yaml",
        SCHEDULING_PROVIDER: "calcom",
        CALCOM_API_KEY: "cal_test_operator_demo_calcom_packet",
        CALCOM_BASE_URL: calcomBaseUrl,
        CALCOM_EVENT_TYPE_ID: "42",
        CALCOM_TIME_ZONE: "Europe/Berlin",
        CALCOM_FALLBACK_ATTENDEE_EMAIL_DOMAIN: "example.test",
        STATE_FILE,
        STORE_BACKEND: "json",
        SERVER_TOOL_TOKEN: TOKEN,
        SKIP_TWILIO_SIGNATURE_VALIDATION: "false",
        DATA_RETENTION_DAYS: "30",
        OWNER_ALERT_LOG_ONLY_ACCEPTED: "true",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    try {
      const steps: Step[] = [];
      const health = await waitForHealth();
      assert(health.storeBackend === "json", `operator Cal.com packet should use local JSON state: ${JSON.stringify(health)}`);
      assert(health.schedulingProvider === "calcom", `health should expose Cal.com provider: ${JSON.stringify(health)}`);
      steps.push({ name: "server health", status: "ok", detail: `real Express server healthy for ${health.client} with Cal.com scheduling selected` });

      let out = await json("/readiness/live-pilot");
      assert(out.res.status === 401, `readiness without bearer should be 401: ${out.res.status}`);
      steps.push({ name: "readiness auth", status: "ok", detail: "protected readiness rejects missing bearer auth" });

      out = await json("/readiness/live-pilot", { headers: authHeaders() });
      assert(out.res.status === 409, `Cal.com mock readiness should remain blocked for live pilot: ${out.res.status} ${JSON.stringify(out.body)}`);
      const readinessCalcomProofBlocker = out.body?.blockers?.some((check: any) => check.name === "scheduling live smoke proof" && /calcom:smoke/i.test(check.detail));
      assert(readinessCalcomProofBlocker, `readiness should require live Cal.com smoke proof: ${JSON.stringify(out.body)}`);
      steps.push({ name: "readiness blockers", status: "ok", detail: "live-pilot readiness points Cal.com deployments to npm run calcom:smoke" });

      out = await json("/tools/check_availability", authJson({ phone: "whatsapp:+491****4554", args: { service: "Damenhaarschnitt", from: "2050-09-05", days: 1 } }));
      assert(out.res.ok, `Cal.com availability failed: ${out.res.status} ${JSON.stringify(out.body)}`);
      assert(out.body?.schedulingProvider === "calcom", `availability should use Cal.com: ${JSON.stringify(out.body)}`);
      assert(Array.isArray(out.body?.slots) && out.body.slots.length === 2, `availability should return mock Cal.com slots: ${JSON.stringify(out.body)}`);
      const slot = out.body.slots[0].iso;
      steps.push({ name: "Cal.com availability", status: "ok", detail: "one-brain availability calls the mock Cal.com slots API" });

      out = await json("/tools/book_appointment", authJson({ phone: "whatsapp:+491****4554", args: { name: "Mina Calcom", service: "Damenhaarschnitt", start: slot, channel: "phone" } }));
      assert(out.res.ok, `Cal.com booking failed: ${out.res.status} ${JSON.stringify(out.body)}`);
      assert(out.body?.ok === true, `Cal.com booking should succeed: ${JSON.stringify(out.body)}`);
      assert(out.body?.schedulingProvider === "calcom", `booking should report Cal.com: ${JSON.stringify(out.body)}`);
      assert(out.body?.providerBookingId === "operator_demo_calcom_booking_4554", `booking should expose provider booking ID: ${JSON.stringify(out.body)}`);
      const providerBookingId = out.body.providerBookingId;
      steps.push({ name: "Cal.com booking", status: "ok", detail: "one-brain booking creates a mock Cal.com booking and exposes providerBookingId" });

      out = await json("/tools/book_appointment", authJson({ phone: "whatsapp:+491****4554", args: { name: "Mina Calcom", service: "Damenhaarschnitt", start: slot, channel: "phone" } }));
      assert(out.res.ok, `Cal.com booking retry failed: ${out.res.status} ${JSON.stringify(out.body)}`);
      assert(out.body?.idempotentReplay === true, `Cal.com retry should be locally idempotent: ${JSON.stringify(out.body)}`);
      const bookingRetryIdempotent = out.body.idempotentReplay;
      steps.push({ name: "Cal.com booking retry", status: "ok", detail: "duplicate booking request replays locally without a second provider booking call" });

      const postCallPayload = {
        callId: "operator-calcom-packet-call-1",
        phone: "+491****4554",
        status: "booked",
        summary: "Caller booked a haircut through the Cal.com scheduling path.",
        customerName: "Mina",
        requestedService: "Damenhaarschnitt",
        confirmedTime: "2050-09-05 09:00",
      };
      out = await json("/webhook/voice/post-call", authJson(postCallPayload));
      assert(out.res.ok, `voice post-call failed: ${out.res.status} ${JSON.stringify(out.body)}`);
      assert(out.body?.followUpDraft?.shouldSend === true, `post-call should return a sendable booked confirmation draft: ${JSON.stringify(out.body)}`);
      assert(out.body?.followUpDraft?.reviewRequired === false, `booked confirmations should not require manual draft review: ${JSON.stringify(out.body)}`);
      assert(out.body?.idempotentReplay === false, `first post-call should be inserted, not replayed: ${JSON.stringify(out.body)}`);
      steps.push({ name: "voice post-call draft", status: "ok", detail: "booked phone outcome produces a sendable WhatsApp confirmation draft under Cal.com scheduling" });

      out = await json("/webhook/voice/post-call", authJson(postCallPayload));
      assert(out.res.ok, `voice post-call retry failed: ${out.res.status} ${JSON.stringify(out.body)}`);
      assert(out.body?.idempotentReplay === true, `provider retry should be idempotent: ${JSON.stringify(out.body)}`);
      const voiceRetryIdempotent = out.body.idempotentReplay;
      steps.push({ name: "voice post-call retry", status: "ok", detail: "duplicate provider call ID replays without duplicating the stored outcome" });

      out = await json("/metrics/today", { headers: authHeaders() });
      assert(out.res.ok, `operator metrics failed: ${out.res.status} ${JSON.stringify(out.body)}`);
      assert(out.body?.byChannel?.phone >= 1, `operator packet should attribute phone interactions: ${JSON.stringify(out.body)}`);
      steps.push({ name: "metrics", status: "ok", detail: "phone channel metrics remain available on the protected endpoint" });

      const slotsReq = captured.find((req) => req.url?.startsWith("/v2/slots"));
      const bookingReqs = captured.filter((req) => req.method === "POST" && req.url === "/v2/bookings");
      assert(slotsReq?.apiVersion === "2024-09-04", `slots request used wrong API version: ${JSON.stringify(captured)}`);
      assert(bookingReqs.length === 1, `idempotent retry should not call Cal.com twice: ${JSON.stringify(captured)}`);
      assert(bookingReqs[0].apiVersion === "2026-02-25", `booking request used wrong API version: ${JSON.stringify(captured)}`);
      assert(!JSON.stringify(captured).includes("cal_test_operator_demo_calcom_packet"), "captured output must not print mock API key values");
      steps.push({ name: "Cal.com request contract", status: "ok", detail: "slots and booking API versions are pinned and mock API key values are not printed" });

      const report = buildPacketReport(steps, {
        healthClient: health.client,
        schedulingProvider: health.schedulingProvider,
        readinessStatus: 409,
        readinessCalcomProofBlocker,
        calcomCalls: captured.length,
        bookingCalls: bookingReqs.length,
        providerBookingId,
        bookingRetryIdempotent,
        voiceRetryIdempotent,
      });
      writePacket(report);
      if (JSON_MODE) console.log(JSON.stringify(report, null, 2));
      else {
        console.log(report.marker);
        console.log(JSON.stringify({ outputPath: report.outputPath, steps: steps.length, schedulingProvider: "calcom", calcomCalls: captured.length, bookingCalls: bookingReqs.length, providerBookingId }, null, 2));
      }
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
  console.error("OPERATOR_DEMO_CALCOM_PACKET_FAILED");
  console.error(err instanceof Error ? err.stack ?? err.message : err);
  process.exit(1);
});
