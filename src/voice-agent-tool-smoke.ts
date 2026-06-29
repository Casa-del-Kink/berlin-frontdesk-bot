import { spawn } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const PORT = Number(process.env.VOICE_SMOKE_PORT || 4322);
const BASE = `http://127.0.0.1:${PORT}`;
const TOKEN = "voice-agent-tool-smoke-token";
const STATE_FILE = "data/voice-agent-tool-smoke-state.json";
const CALENDAR_FILE = "data/voice-agent-tool-smoke-calendar.json";

type JsonResponse = { res: Response; body: any };

function removeIfExists(path: string) {
  if (existsSync(path)) rmSync(path);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function countOccurrences(haystack: string, needle: string) {
  return haystack.split(needle).length - 1;
}

async function waitForOutput(getOutput: () => string, needle: string) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (getOutput().includes(needle)) return;
    await sleep(100);
  }
  throw new Error(`timed out waiting for server output: ${needle}`);
}

async function json(path: string, init: RequestInit = {}): Promise<JsonResponse> {
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
      if (res.ok && body?.ok && body?.storeBackend === "json") return;
      lastError = `${res.status} ${JSON.stringify(body)}`;
    } catch (e: any) {
      lastError = String(e?.message ?? e);
    }
    await sleep(250);
  }
  throw new Error(`server did not become healthy: ${lastError}`);
}

async function main() {
  removeIfExists(STATE_FILE);
  removeIfExists(CALENDAR_FILE);

  const child = spawn(process.execPath, ["./node_modules/.bin/tsx", "src/server.ts"], {
    env: {
      ...process.env,
      PORT: String(PORT),
      USE_FAKE_CALENDAR: "true",
      FAKE_CALENDAR_FILE: CALENDAR_FILE,
      STATE_FILE,
      SERVER_TOOL_TOKEN: TOKEN,
      SKIP_TWILIO_SIGNATURE_VALIDATION: "false",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += String(chunk);
  });
  child.stderr.on("data", (chunk) => {
    stderr += String(chunk);
  });

  try {
    await waitForHealth();

    let out = await json("/tools/check_availability", authJson({ phone: "+491****7001", args: { service: "Damenhaarschnitt", from: "2026-07-01", days: 3 } }));
    assert(out.res.ok, `voice availability failed: ${out.res.status} ${JSON.stringify(out.body)}`);
    assert(Array.isArray(out.body?.slots) && out.body.slots.length >= 2, `voice availability should return at least two slots: ${JSON.stringify(out.body)}`);
    const selectedSlot = out.body.slots[0].iso;

    out = await json(
      "/tools/book_appointment",
      authJson({
        phone: "+491****7001",
        args: { name: "Laura Schneider", service: "Damenhaarschnitt", start: selectedSlot, channel: "phone" },
      }),
    );
    assert(out.res.ok, `voice booking failed: ${out.res.status} ${JSON.stringify(out.body)}`);
    assert(out.body?.ok === true, `voice booking should succeed: ${JSON.stringify(out.body)}`);
    assert(out.body?.channel === "phone", `voice booking should preserve phone channel: ${JSON.stringify(out.body)}`);
    assert(out.body?.estimatedValueCents === 4500, `voice booking should expose revenue estimate: ${JSON.stringify(out.body)}`);
    await waitForOutput(() => stdout, "New booking: Laura Schneider - Damenhaarschnitt");
    assert(countOccurrences(stdout, "New booking: Laura Schneider - Damenhaarschnitt") === 1, `voice booking should alert owner once: ${stdout}`);

    out = await json(
      "/tools/register_lead",
      authJson({
        phone: "+491****7002",
        args: {
          name: "Mina Hoffmann",
          service: "Färben & Strähnen",
          notes: "Caller is unsure between colour and highlights and wants a callback.",
          channel: "phone",
          idempotencyKey: "voice-smoke-lead-1",
        },
      }),
    );
    assert(out.res.ok, `voice lead failed: ${out.res.status} ${JSON.stringify(out.body)}`);
    assert(out.body?.ok === true && out.body?.channel === "phone", `voice lead should use phone channel: ${JSON.stringify(out.body)}`);
    await waitForOutput(() => stdout, "Follow-up needed: Mina Hoffmann");
    assert(countOccurrences(stdout, "Follow-up needed: Mina Hoffmann") === 1, `voice lead should alert owner once: ${stdout}`);

    out = await json(
      "/tools/register_lead",
      authJson({
        phone: "+491****7002",
        args: {
          name: "Mina Hoffmann",
          service: "Färben & Strähnen",
          notes: "Provider retry for same voice lead.",
          channel: "phone",
          idempotencyKey: "voice-smoke-lead-1",
        },
      }),
    );
    assert(out.res.ok && out.body?.idempotentReplay === true, `voice lead retry should be idempotent: ${out.res.status} ${JSON.stringify(out.body)}`);
    assert(countOccurrences(stdout, "Follow-up needed: Mina Hoffmann") === 1, `voice lead retry should not duplicate owner alert: ${stdout}`);

    out = await json("/webhook/voice/post-call", authJson({ callId: "voice-smoke-call-1", phone: "+491****7001", status: "booked", summary: "Caller booked a haircut through the voice agent smoke." }));
    assert(out.res.ok, `voice post-call failed: ${out.res.status} ${JSON.stringify(out.body)}`);
    assert(out.body?.outcome?.status === "booked" && out.body?.idempotentReplay === false, `voice post-call should store booked outcome: ${JSON.stringify(out.body)}`);

    out = await json("/webhook/voice/post-call", authJson({ callId: "voice-smoke-call-1", phone: "+491****7001", status: "booked", summary: "Provider retry duplicate." }));
    assert(out.res.ok && out.body?.idempotentReplay === true, `voice post-call retry should be idempotent: ${out.res.status} ${JSON.stringify(out.body)}`);

    out = await json(
      "/webhook/voice/post-call",
      authJson({ callId: "voice-smoke-call-2", phone: "+491****7003", status: "needs_followup", summary: "Caller asked for colour advice and a human callback." }),
    );
    assert(out.res.ok, `voice follow-up post-call failed: ${out.res.status} ${JSON.stringify(out.body)}`);
    assert(out.body?.outcome?.status === "needs_followup" && out.body?.idempotentReplay === false, `voice follow-up post-call should store outcome: ${JSON.stringify(out.body)}`);
    await waitForOutput(() => stdout, "Phone follow-up needed: +491****7003 · needs_followup");
    assert(countOccurrences(stdout, "Phone follow-up needed: +491****7003 · needs_followup") === 1, `voice follow-up post-call should alert owner once: ${stdout}`);

    out = await json(
      "/webhook/voice/post-call",
      authJson({ callId: "voice-smoke-call-2", phone: "+491****7003", status: "needs_followup", summary: "Provider retry duplicate." }),
    );
    assert(out.res.ok && out.body?.idempotentReplay === true, `voice follow-up post-call retry should be idempotent: ${out.res.status} ${JSON.stringify(out.body)}`);
    assert(countOccurrences(stdout, "Phone follow-up needed: +491****7003 · needs_followup") === 1, `voice follow-up post-call retry should not duplicate owner alert: ${stdout}`);

    out = await json("/metrics/today", { headers: { authorization: `Bearer ${TOKEN}` } });
    assert(out.res.ok, `voice metrics failed: ${out.res.status} ${JSON.stringify(out.body)}`);
    assert(out.body?.booked === 1, `voice metrics should count one booking: ${JSON.stringify(out.body)}`);
    assert(out.body?.followups === 1, `voice metrics should count one follow-up: ${JSON.stringify(out.body)}`);
    assert(out.body?.byChannel?.phone === 2, `voice metrics should attribute booking and follow-up to phone: ${JSON.stringify(out.body)}`);

    const callExport = await json("/privacy/export", authJson({ phone: "+491****7001" }));
    assert(callExport.res.ok, `voice privacy export failed: ${callExport.res.status} ${JSON.stringify(callExport.body)}`);
    assert(callExport.body?.callOutcomes?.length === 1, `voice post-call retry should store one call outcome: ${JSON.stringify(callExport.body)}`);

    const followUpCallExport = await json("/privacy/export", authJson({ phone: "+491****7003" }));
    assert(followUpCallExport.res.ok, `voice follow-up privacy export failed: ${followUpCallExport.res.status} ${JSON.stringify(followUpCallExport.body)}`);
    assert(followUpCallExport.body?.callOutcomes?.length === 1, `voice follow-up retry should store one call outcome: ${JSON.stringify(followUpCallExport.body)}`);

    console.log("VOICE_AGENT_TOOL_SMOKE_OK");
    console.log(JSON.stringify({ metrics: out.body }, null, 2));
  } finally {
    child.kill("SIGTERM");
    await sleep(250);
    if (!child.killed) child.kill("SIGKILL");
    if (stderr.trim()) console.error(stderr.trim());
    if (process.env.VOICE_SMOKE_VERBOSE === "true" && stdout.trim()) console.log(stdout.trim());
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
