import { spawn, spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { setTimeout as sleep } from "node:timers/promises";

const PORT = Number(process.env.BATTLETEST_PORT || 4321);
const BASE = `http://127.0.0.1:${PORT}`;
const TOKEN = "server-battletest-token";
const STATE_FILE = "data/server-battletest-state.json";
const CALENDAR_FILE = "data/server-battletest-calendar.json";
const require = createRequire(import.meta.url);
const TSX_CLI = require.resolve("tsx/cli");

function removeIfExists(path: string) {
  if (existsSync(path)) rmSync(path);
}

async function request(path: string, init: RequestInit = {}) {
  return fetch(`${BASE}${path}`, init);
}

async function json(path: string, init: RequestInit = {}) {
  const res = await request(path, init);
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

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertPostgresBackendRequiresDatabaseUrl() {
  const result = spawnSync(process.execPath, [TSX_CLI, "-e", "import('./src/store.ts')"], {
    env: { ...process.env, STORE_BACKEND: "postgres", DATABASE_URL: "", POSTGRES_URL: "", STATE_FILE: "data/postgres-missing-url-test.json" },
    encoding: "utf8",
  });
  const combined = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  assert(result.status !== 0, "STORE_BACKEND=postgres should fail fast when DATABASE_URL is missing");
  assert(combined.includes("STORE_BACKEND=postgres requires DATABASE_URL"), `unexpected missing database URL error: ${combined}`);
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
  assertPostgresBackendRequiresDatabaseUrl();

  const child = spawn(process.execPath, [TSX_CLI, "src/server.ts"], {
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

    let out = await json("/metrics/today");
    assert(out.res.status === 401, `metrics without bearer should be 401, got ${out.res.status}`);

    out = await json("/readiness/live-pilot");
    assert(out.res.status === 401, `readiness without bearer should be 401, got ${out.res.status}`);

    out = await json("/readiness/live-pilot", { headers: { authorization: `Bearer ${TOKEN}` } });
    assert(out.res.status === 409, `fake/missing-credential readiness should be 409, got ${out.res.status} ${JSON.stringify(out.body)}`);
    assert(out.body?.ok === false, `readiness body should be not ok: ${JSON.stringify(out.body)}`);
    assert(
      Array.isArray(out.body?.gates) && out.body.gates.some((gate: any) => gate.name === "calendar provider" && gate.ok === false),
      `readiness should flag calendar provider: ${JSON.stringify(out.body)}`,
    );

    out = await json("/metrics/today", { headers: { authorization: `Bearer ${TOKEN}` } });
    assert(out.res.ok, `authorized metrics failed: ${out.res.status}`);
    assert(out.body?.booked === 0, "fresh battletest state should start with 0 bookings");

    out = await json(
      "/tools/check_availability",
      authJson({ phone: "whatsapp:+49100000001", args: { service: "Damenhaarschnitt", from: "2026-07-01", days: 3 } }),
    );
    assert(out.res.ok, `availability failed: ${out.res.status} ${JSON.stringify(out.body)}`);
    assert(Array.isArray(out.body?.slots) && out.body.slots.length > 0, "availability should return slots");

    out = await json(
      "/tools/book_appointment",
      authJson({
        phone: "whatsapp:+49100000001",
        args: { name: "Battle Test", service: "Damenhaarschnitt", start: "2026-07-01T10:00:00+02:00", channel: "whatsapp" },
      }),
    );
    assert(out.res.ok, `booking failed: ${out.res.status} ${JSON.stringify(out.body)}`);
    assert(out.body?.ok === true, `booking should return ok: ${JSON.stringify(out.body)}`);
    assert(out.body?.estimatedValueCents === 4500, `booking revenue estimate mismatch: ${JSON.stringify(out.body)}`);

    out = await json(
      "/tools/book_appointment",
      authJson({
        phone: "whatsapp:+491****0001",
        args: { name: "Battle Test", service: "Damenhaarschnitt", start: "2026-07-01T10:00:00+02:00", channel: "whatsapp" },
      }),
    );
    assert(out.res.ok, `idempotent retry failed: ${out.res.status} ${JSON.stringify(out.body)}`);
    assert(out.body?.ok === true && out.body?.idempotentReplay === true, `same booking retry should be idempotent: ${JSON.stringify(out.body)}`);

    out = await json(
      "/tools/book_appointment",
      authJson({
        phone: "whatsapp:+491****0002",
        args: { name: "Double Test", service: "Damenhaarschnitt", start: "2026-07-01T10:00:00+02:00", channel: "phone" },
      }),
    );
    assert(out.res.ok, "double-book guard should return a handled tool error, not crash the endpoint");
    assert(out.body?.error === "Slot is no longer available", `double-book guard missing: ${JSON.stringify(out.body)}`);

    out = await json(
      "/webhook/voice/post-call",
      authJson({ callId: "battle-call-1", phone: "+491****0003", status: "needs_followup", summary: "Asked for colour consultation after hours" }),
    );
    assert(out.res.ok, `voice post-call failed: ${out.res.status} ${JSON.stringify(out.body)}`);
    assert(out.body?.outcome?.status === "needs_followup", "voice status not stored");
    assert(out.body?.idempotentReplay === false, "first voice post-call should not be replay");

    out = await json(
      "/webhook/voice/post-call",
      authJson({ callId: "battle-call-1", phone: "+491****0003", status: "needs_followup", summary: "Provider retry duplicate" }),
    );
    assert(out.res.ok, `voice post-call retry failed: ${out.res.status} ${JSON.stringify(out.body)}`);
    assert(out.body?.idempotentReplay === true, `voice post-call retry should be idempotent: ${JSON.stringify(out.body)}`);

    out = await json("/privacy/retention/purge", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ maxAgeDays: 30 }) });
    assert(out.res.status === 401, `retention purge without bearer should be 401, got ${out.res.status}`);

    out = await json("/privacy/retention/purge", authJson({ maxAgeDays: 30 }));
    assert(out.res.ok, `retention purge dry run failed: ${out.res.status} ${JSON.stringify(out.body)}`);
    assert(out.body?.dryRun === true, `retention purge should default to dryRun: ${JSON.stringify(out.body)}`);

    const leadPhone = "whatsapp:+491****0005";
    out = await json(
      "/tools/register_lead",
      authJson({
        phone: leadPhone,
        args: {
          name: "Lead Retry Test",
          service: "Damenhaarschnitt",
          notes: "Provider retried lead registration",
          channel: "server_tool",
          idempotencyKey: "battle-lead-1",
        },
      }),
    );
    assert(out.res.ok && out.body?.ok === true && out.body?.idempotentReplay === false, `lead registration failed: ${out.res.status} ${JSON.stringify(out.body)}`);

    out = await json(
      "/tools/register_lead",
      authJson({
        phone: leadPhone,
        args: {
          name: "Lead Retry Test",
          service: "Damenhaarschnitt",
          notes: "Provider retried lead registration",
          channel: "server_tool",
          idempotencyKey: "battle-lead-1",
        },
      }),
    );
    assert(out.res.ok && out.body?.idempotentReplay === true, `lead retry should be idempotent: ${out.res.status} ${JSON.stringify(out.body)}`);

    out = await json("/privacy/export", authJson({ phone: leadPhone }));
    assert(out.res.ok && out.body?.leads?.length === 1, `duplicate lead retry should only store once: ${out.res.status} ${JSON.stringify(out.body)}`);
    out = await json("/privacy/delete", authJson({ phone: leadPhone }));
    assert(out.res.ok && out.body?.leadsDeleted === 1, `lead retry fixture cleanup failed: ${out.res.status} ${JSON.stringify(out.body)}`);

    const form = new URLSearchParams();
    form.set("From", "whatsapp:+491****0004");
    form.set("Body", "Hi");
    out = await json("/webhook/whatsapp", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: form });
    assert(out.res.status === 403, `unsigned Twilio webhook should be 403, got ${out.res.status}`);

    out = await json("/privacy/export", authJson({}));
    assert(out.res.status === 400, `privacy export without phone should be 400, got ${out.res.status}`);

    out = await json("/metrics/today", { headers: { authorization: `Bearer ${TOKEN}` } });
    assert(out.res.ok, `final metrics failed: ${out.res.status}`);
    assert(out.body?.booked === 1, `final metrics booked should be 1: ${JSON.stringify(out.body)}`);
    assert(out.body?.estimatedBookedRevenueCents === 4500, `final booked revenue mismatch: ${JSON.stringify(out.body)}`);
    assert(out.body?.byChannel?.whatsapp === 1, `channel attribution mismatch: ${JSON.stringify(out.body)}`);

    const calls = await json("/privacy/export", authJson({ phone: "+491****0003" }));
    assert(calls.res.ok, `call export failed: ${calls.res.status} ${JSON.stringify(calls.body)}`);
    assert(calls.body?.callOutcomes?.length === 1, `duplicate provider call should only be stored once: ${JSON.stringify(calls.body)}`);

    console.log("SERVER_BATTLETEST_OK");
    console.log(JSON.stringify({ metrics: out.body }, null, 2));
  } finally {
    child.kill("SIGTERM");
    await sleep(250);
    if (!child.killed) child.kill("SIGKILL");
    if (stderr.trim()) console.error(stderr.trim());
    if (process.env.BATTLETEST_VERBOSE === "true" && stdout.trim()) console.log(stdout.trim());
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
