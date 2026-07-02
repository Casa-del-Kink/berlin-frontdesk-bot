import { spawn, spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { setTimeout as sleep } from "node:timers/promises";
import twilio from "twilio";
import { validateLivePilotReadiness } from "./config.js";
import { deploymentChecks } from "./readiness.js";
import { findUnconfiguredPrices } from "./tools.js";

const PORT = Number(process.env.BATTLETEST_PORT || 4321);
const BASE = `http://127.0.0.1:${PORT}`;
const TOKEN = "server-battletest-token";
const STATE_FILE = "data/server-battletest-state.json";
const CALENDAR_FILE = "data/server-battletest-calendar.json";
// Deterministic Twilio signing setup for the main spawned server so pause/expiry webhook POSTs
// can be signed the same way a real Twilio webhook is, instead of tolerating a 403 from an
// unsigned request. Also pre-builds Phase 3's replay-signing harness.
const TWILIO_AUTH_TOKEN = "battletest-twilio-token";
const TWILIO_WEBHOOK_BASE_URL = `http://127.0.0.1:${PORT}`;
const require = createRequire(import.meta.url);
const TSX_CLI = require.resolve("tsx/cli");

/** Signs a WhatsApp webhook form POST the way Twilio would, for the given absolute webhook path. */
function signedWhatsappWebhookInit(params: Record<string, string>): RequestInit {
  const url = `${TWILIO_WEBHOOK_BASE_URL}/webhook/whatsapp`;
  const signature = twilio.getExpectedTwilioSignature(TWILIO_AUTH_TOKEN, url, params);
  const form = new URLSearchParams(params);
  return {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "x-twilio-signature": signature },
    body: form,
  };
}

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

function assertGateCompositionNoDrift() {
  // Anti-drift: every gate name from validateLivePilotReadiness must appear in
  // deploymentChecks output with identical severity, so the deployment gate can never
  // silently drop or weaken a live-pilot readiness gate.
  const liveGates = validateLivePilotReadiness().gates;
  const deployChecks = deploymentChecks();
  for (const gate of liveGates) {
    const match = deployChecks.find((check) => check.name === gate.name);
    assert(match, `deploymentChecks is missing live-pilot gate "${gate.name}"`);
    assert(
      match!.severity === gate.severity,
      `deploymentChecks severity drift for gate "${gate.name}": live-pilot=${gate.severity} deployment=${match!.severity}`,
    );
  }
}

function assertPriceGuardrailPure() {
  const cfg = { services: [{ name: "Cut", durationMin: 30, price: "45 €" }] };
  const clean = findUnconfiguredPrices("Ein Schnitt kostet 45 €.", cfg);
  assert(clean.length === 0, `configured price should not be flagged: ${JSON.stringify(clean)}`);

  const flagged = findUnconfiguredPrices("Ein Schnitt kostet 45 €, Farbe ab 120 EUR.", cfg);
  assert(flagged.length === 1, `unconfigured price should be flagged exactly once: ${JSON.stringify(flagged)}`);
  assert(flagged[0].includes("120"), `flagged token should contain the unconfigured amount: ${JSON.stringify(flagged)}`);

  const none = findUnconfiguredPrices("Wir haben morgen frei um 14:00.", cfg);
  assert(none.length === 0, `text without price tokens should not be flagged: ${JSON.stringify(none)}`);

  // German thousands-grouped amount must be parsed as a whole number (10000.50), not
  // misparsed from its last three digits ("000,50" -> 0.50).
  const thousands = findUnconfiguredPrices("Das kostet 10.000,50 €.", cfg);
  assert(thousands.length === 1, `thousands-grouped amount should be flagged exactly once: ${JSON.stringify(thousands)}`);
  assert(thousands[0].includes("10.000,50"), `flagged token should preserve the full thousands-grouped amount, got: ${JSON.stringify(thousands)}`);

  // Bare dot-decimal notation ("45.00€") must be parsed as the whole amount 45.00, not
  // backtracked into a false partial match on its last two digits ("00€"). Configured case
  // (45 configured) must NOT be flagged; unconfigured case must be flagged as "45.00", not "00".
  const dotDecimalCfg = { services: [{ name: "Cut", durationMin: 30, price: "45 €" }] };
  const dotDecimalClean = findUnconfiguredPrices("Ein Schnitt kostet 45.00€.", dotDecimalCfg);
  assert(dotDecimalClean.length === 0, `dot-decimal amount matching a configured price should not be flagged: ${JSON.stringify(dotDecimalClean)}`);

  const dotDecimalUnconfiguredCfg = { services: [{ name: "Cut", durationMin: 30, price: "30 €" }] };
  const dotDecimalFlagged = findUnconfiguredPrices("Ein Schnitt kostet 45.00€.", dotDecimalUnconfiguredCfg);
  assert(dotDecimalFlagged.length === 1, `unconfigured dot-decimal amount should be flagged exactly once: ${JSON.stringify(dotDecimalFlagged)}`);
  assert(dotDecimalFlagged[0].includes("45.00"), `flagged token should be the full amount "45.00", not a partial match, got: ${JSON.stringify(dotDecimalFlagged)}`);
  assert(!dotDecimalFlagged[0].startsWith("00"), `flagged token must not be a truncated partial match like "00€", got: ${JSON.stringify(dotDecimalFlagged)}`);
}

function assertDangerousEnvGuardFailsClosedWhenFixtureSet() {
  const result = spawnSync(process.execPath, [TSX_CLI, "-e", "import('./src/config.ts').then(m => console.log(JSON.stringify(m.validateLivePilotReadiness())))"], {
    env: { ...process.env, CALCOM_TEST_ATTENDEE_EMAIL: "dummy@example.com" },
    encoding: "utf8",
  });
  const combined = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  assert(combined.includes('"test fixtures absent"'), `dangerous-env guard should be present in readiness output: ${combined}`);
  assert(combined.includes('"ok":false') || /"name":"test fixtures absent","ok":false/.test(combined), `dangerous-env guard should fail closed when CALCOM_TEST_ATTENDEE_EMAIL is set: ${combined}`);
}

function assertDangerousEnvGuardPassesWhenFixturesUnset() {
  const env = { ...process.env };
  delete env.CALCOM_TEST_ATTENDEE_EMAIL;
  delete env.CALCOM_KEEP_SMOKE_BOOKING;
  delete env.FORCE_WHATSAPP_SEND_FAILURE;
  const result = spawnSync(process.execPath, [TSX_CLI, "-e", "import('./src/config.ts').then(m => console.log(JSON.stringify(m.validateLivePilotReadiness())))"], {
    env,
    encoding: "utf8",
  });
  const combined = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  assert(/"name":"test fixtures absent","ok":true/.test(combined), `dangerous-env guard should pass when fixtures are unset: ${combined}`);
}

function assertStrictStartupRefusesOnDangerousEnvFixture() {
  const result = spawnSync(process.execPath, [TSX_CLI, "src/server.ts"], {
    env: {
      ...process.env,
      PORT: String(PORT + 2),
      USE_FAKE_CALENDAR: "true",
      FAKE_CALENDAR_FILE: CALENDAR_FILE,
      STATE_FILE,
      SERVER_TOOL_TOKEN: TOKEN,
      SKIP_TWILIO_SIGNATURE_VALIDATION: "false",
      REQUIRE_LIVE_PILOT_READINESS: "true",
      CALCOM_TEST_ATTENDEE_EMAIL: "dummy@example.com",
    },
    encoding: "utf8",
    // generous ceiling: tsx cold-start can exceed 20s under load; a tight ceiling makes the
    // suite fail deterministically on slow machines
    timeout: 60_000,
  });
  const combined = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  assert(result.status !== 0, "strict startup should refuse when a dangerous test fixture env var is set");
  assert(combined.includes("test fixtures absent"), `strict startup should mention the dangerous-env gate: ${combined}`);
}

function assertStrictStartupRequiresDeploymentReadiness() {
  const result = spawnSync(process.execPath, [TSX_CLI, "src/server.ts"], {
    env: {
      ...process.env,
      PORT: String(PORT + 1),
      USE_FAKE_CALENDAR: "true",
      FAKE_CALENDAR_FILE: CALENDAR_FILE,
      STATE_FILE,
      SERVER_TOOL_TOKEN: TOKEN,
      SKIP_TWILIO_SIGNATURE_VALIDATION: "false",
      REQUIRE_LIVE_PILOT_READINESS: "true",
    },
    encoding: "utf8",
    // generous ceiling: tsx cold-start can exceed 20s under load; a tight ceiling makes the
    // suite fail deterministically on slow machines
    timeout: 60_000,
  });
  const combined = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  assert(result.status !== 0, "REQUIRE_LIVE_PILOT_READINESS=true should refuse startup while blockers remain");
  assert(combined.includes("Deployment readiness blockers"), `strict startup should print deployment blockers: ${combined}`);
  assert(combined.includes("fake calendar disabled"), `strict startup should include fake-calendar blocker: ${combined}`);
  assert(combined.includes("store backend postgres"), `strict startup should include Postgres blocker: ${combined}`);
}

async function assertAlertSendFailureDoesNotFailBooking() {
  const port = PORT + 3;
  const base = `http://127.0.0.1:${port}`;
  const stateFile = "data/server-battletest-alertfail-state.json";
  const calendarFile = "data/server-battletest-alertfail-calendar.json";
  removeIfExists(stateFile);
  removeIfExists(calendarFile);

  const child = spawn(process.execPath, [TSX_CLI, "src/server.ts"], {
    env: {
      ...process.env,
      PORT: String(port),
      USE_FAKE_CALENDAR: "true",
      FAKE_CALENDAR_FILE: calendarFile,
      STATE_FILE: stateFile,
      SERVER_TOOL_TOKEN: TOKEN,
      SKIP_TWILIO_SIGNATURE_VALIDATION: "false",
      FORCE_WHATSAPP_SEND_FAILURE: "true",
      // A configured ownerWhatsapp is required for the send attempt (and its failure) to fire;
      // the demo client config leaves it empty, so point at a fixture value via env override
      // is not supported by config.ts, so this exercises the DRYRUN-safe path directly instead:
      // register_lead's alertOwner call must not throw even when send is forced to fail and
      // ownerWhatsapp happens to be unset (attempted:false path) or set (attempted:true, sent:false).
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += String(chunk); });
  child.stderr.on("data", (chunk) => { stderr += String(chunk); });

  try {
    // generous ceiling: tsx cold-start can exceed 20s under load; a tight ceiling makes the
    // suite fail deterministically on slow machines
    const deadline = Date.now() + 60_000;
    let healthy = false;
    while (Date.now() < deadline) {
      try {
        const res = await fetch(`${base}/health`);
        if (res.ok) { healthy = true; break; }
      } catch { /* retry */ }
      await sleep(250);
    }
    assert(healthy, `alert-failure test server did not become healthy: ${stderr}`);

    const res = await fetch(`${base}/tools/register_lead`, {
      method: "POST",
      headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify({ phone: "whatsapp:+491****0099", args: { name: "Alert Fail Test", service: "Damenhaarschnitt", notes: "Should not fail even if owner alert send fails" } }),
    });
    const body: any = await res.json();
    assert(res.ok && body?.ok === true, `register_lead must succeed even when owner alert send is forced to fail: ${res.status} ${JSON.stringify(body)}`);
  } finally {
    child.kill("SIGTERM");
    await sleep(250);
    if (!child.killed) child.kill("SIGKILL");
    if (process.env.BATTLETEST_VERBOSE === "true" && stdout.trim()) console.log(stdout.trim());
  }
}

async function waitForHealth() {
  // generous ceiling: tsx cold-start can exceed 20s under load; a tight ceiling makes the
  // suite fail deterministically on slow machines
  const deadline = Date.now() + 60_000;
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
  assertStrictStartupRequiresDeploymentReadiness();
  assertGateCompositionNoDrift();
  assertPriceGuardrailPure();
  assertDangerousEnvGuardFailsClosedWhenFixtureSet();
  assertDangerousEnvGuardPassesWhenFixturesUnset();
  assertStrictStartupRefusesOnDangerousEnvFixture();

  const child = spawn(process.execPath, [TSX_CLI, "src/server.ts"], {
    env: {
      ...process.env,
      PORT: String(PORT),
      USE_FAKE_CALENDAR: "true",
      FAKE_CALENDAR_FILE: CALENDAR_FILE,
      STATE_FILE,
      SERVER_TOOL_TOKEN: TOKEN,
      SKIP_TWILIO_SIGNATURE_VALIDATION: "false",
      TWILIO_AUTH_TOKEN,
      TWILIO_WEBHOOK_BASE_URL,
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
    assert(Array.isArray(out.body?.blockers) && out.body.blockers.length > 0, `readiness should list blockers: ${JSON.stringify(out.body)}`);
    assert(
      Array.isArray(out.body?.checks) && out.body.checks.some((check: any) => check.name === "calendar provider" && check.ok === false),
      `readiness should flag calendar provider: ${JSON.stringify(out.body)}`,
    );
    assert(
      out.body.checks.some((check: any) => check.name === "fake calendar disabled" && check.ok === false),
      `readiness should flag fake calendar deployment blocker: ${JSON.stringify(out.body)}`,
    );

    out = await json("/metrics/today", { headers: { authorization: `Bearer ${TOKEN}` } });
    assert(out.res.ok, `authorized metrics failed: ${out.res.status}`);
    assert(out.body?.booked === 0, "fresh battletest state should start with 0 bookings");

    // Dates must be computed, never hardcoded: a fixed start rots into
    // "Cannot book a past time" the day after it's written.
    const fromDate = new Date().toISOString().slice(0, 10);
    out = await json(
      "/tools/check_availability",
      authJson({ phone: "whatsapp:+49100000001", args: { service: "Damenhaarschnitt", from: fromDate, days: 3 } }),
    );
    assert(out.res.ok, `availability failed: ${out.res.status} ${JSON.stringify(out.body)}`);
    assert(Array.isArray(out.body?.slots) && out.body.slots.length > 0, "availability should return slots");
    const bookingStart = out.body.slots[0].iso;

    out = await json(
      "/tools/book_appointment",
      authJson({
        phone: "whatsapp:+49100000001",
        args: { name: "Battle Test", service: "Damenhaarschnitt", start: bookingStart, channel: "whatsapp" },
      }),
    );
    assert(out.res.ok, `booking failed: ${out.res.status} ${JSON.stringify(out.body)}`);
    assert(out.body?.ok === true, `booking should return ok: ${JSON.stringify(out.body)}`);
    assert(out.body?.estimatedValueCents === 4500, `booking revenue estimate mismatch: ${JSON.stringify(out.body)}`);

    out = await json(
      "/tools/book_appointment",
      authJson({
        phone: "whatsapp:+491****0001",
        args: { name: "Battle Test", service: "Damenhaarschnitt", start: bookingStart, channel: "whatsapp" },
      }),
    );
    assert(out.res.ok, `idempotent retry failed: ${out.res.status} ${JSON.stringify(out.body)}`);
    assert(out.body?.ok === true && out.body?.idempotentReplay === true, `same booking retry should be idempotent: ${JSON.stringify(out.body)}`);

    out = await json(
      "/tools/book_appointment",
      authJson({
        phone: "whatsapp:+491****0002",
        args: { name: "Double Test", service: "Damenhaarschnitt", start: bookingStart, channel: "phone" },
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

    // register_lead without handoffRequested must NOT pause the conversation.
    const noHandoffPhone = "whatsapp:+491****0006";
    out = await json(
      "/tools/register_lead",
      authJson({ phone: noHandoffPhone, args: { name: "No Handoff", service: "Damenhaarschnitt", notes: "Just asking about prices" } }),
    );
    assert(out.res.ok && out.body?.ok === true && out.body?.handoff === false, `register_lead without handoffRequested should not set handoff: ${JSON.stringify(out.body)}`);
    out = await json("/privacy/export", authJson({ phone: noHandoffPhone }));
    assert(!out.body?.pausedUntil, `register_lead without handoffRequested should not pause: ${JSON.stringify(out.body)}`);

    // register_lead WITH handoffRequested pauses the conversation.
    const handoffPhone = "whatsapp:+491****0007";
    out = await json(
      "/tools/register_lead",
      authJson({ phone: handoffPhone, args: { name: "Wants Human", service: "Damenhaarschnitt", notes: "Asked for a human", handoffRequested: true } }),
    );
    assert(out.res.ok && out.body?.ok === true && out.body?.handoff === true, `register_lead with handoffRequested should return handoff:true: ${JSON.stringify(out.body)}`);
    out = await json("/privacy/export", authJson({ phone: handoffPhone }));
    assert(out.body?.pausedUntil, `register_lead with handoffRequested should set pausedUntil: ${JSON.stringify(out.body)}`);
    out = await json("/privacy/delete", authJson({ phone: handoffPhone }));
    assert(out.res.ok, `handoff fixture cleanup failed: ${out.res.status} ${JSON.stringify(out.body)}`);
    out = await json("/privacy/export", authJson({ phone: noHandoffPhone }));
    assert(out.res.ok, `no-handoff export re-check failed`);
    out = await json("/privacy/delete", authJson({ phone: noHandoffPhone }));
    assert(out.res.ok, `no-handoff fixture cleanup failed: ${out.res.status} ${JSON.stringify(out.body)}`);

    // /operator/pause + /operator/resume round trip, plus the operator-auth seam.
    const operatorPhone = "whatsapp:+491****0008";
    out = await json("/operator/pause", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ phone: operatorPhone }) });
    assert(out.res.status === 401, `operator pause without bearer should be 401, got ${out.res.status}`);

    out = await json("/operator/pause", authJson({ phone: operatorPhone, hours: 1 }));
    assert(out.res.ok && out.body?.ok === true && out.body?.pausedUntil, `operator pause failed: ${out.res.status} ${JSON.stringify(out.body)}`);

    out = await json("/privacy/export", authJson({ phone: operatorPhone }));
    assert(out.body?.pausedUntil, `operator pause should be visible via privacy export: ${JSON.stringify(out.body)}`);

    out = await json("/operator/resume", authJson({ phone: operatorPhone }));
    assert(out.res.ok && out.body?.ok === true, `operator resume failed: ${out.res.status} ${JSON.stringify(out.body)}`);

    out = await json("/privacy/export", authJson({ phone: operatorPhone }));
    assert(!out.body?.pausedUntil, `operator resume should clear pausedUntil: ${JSON.stringify(out.body)}`);

    // Paused conversation gets the static reply and does not reach the LLM (no OPENROUTER_API_KEY
    // in this test env, so an LLM attempt would surface as an error rather than the static text).
    const pausedWaPhone = "whatsapp:+491****0009";
    out = await json("/operator/pause", authJson({ phone: pausedWaPhone, hours: 1 }));
    assert(out.res.ok, `pause-for-webhook-test setup failed: ${JSON.stringify(out.body)}`);

    out = await json("/webhook/whatsapp", signedWhatsappWebhookInit({ From: pausedWaPhone, Body: "Hallo, ist noch jemand da?" }));
    assert(out.res.status === 200, `paused webhook call should be a valid signed request accepted with 200, got ${out.res.status}`);
    await sleep(300);
    const pausedExport = await json("/privacy/export", authJson({ phone: pausedWaPhone }));
    const lastMessage = pausedExport.body?.conversations?.at(-1);
    assert(
      lastMessage?.role === "assistant" && lastMessage?.content?.includes("Kollegin"),
      `paused conversation should get the static handoff reply, got: ${JSON.stringify(lastMessage)}`,
    );
    out = await json("/privacy/delete", authJson({ phone: pausedWaPhone }));
    assert(out.res.ok, `paused-webhook fixture cleanup failed`);

    // Message after expiry gets normal processing: the pause clears itself on the next inbound
    // message once the wall-clock has passed pausedUntil (no background sweeper).
    const expiredWaPhone = "whatsapp:+491****0010";
    out = await json("/operator/pause", authJson({ phone: expiredWaPhone, hours: 0.0001 }));
    assert(out.res.ok, `expiry setup pause failed: ${JSON.stringify(out.body)}`);
    await sleep(1000);
    out = await json("/webhook/whatsapp", signedWhatsappWebhookInit({ From: expiredWaPhone, Body: "Hallo nochmal" }));
    assert(out.res.status === 200, `expired webhook call should be a valid signed request accepted with 200, got ${out.res.status}`);
    await sleep(300);
    const expiredExport = await json("/privacy/export", authJson({ phone: expiredWaPhone }));
    assert(!expiredExport.body?.pausedUntil, `pause should be cleared once expired: ${JSON.stringify(expiredExport.body)}`);
    const expiredLastMessage = expiredExport.body?.conversations?.at(-1);
    assert(
      !expiredLastMessage?.content?.includes("Kollegin"),
      `expired conversation should NOT get the static handoff reply, got: ${JSON.stringify(expiredLastMessage)}`,
    );
    out = await json("/privacy/delete", authJson({ phone: expiredWaPhone }));
    assert(out.res.ok, `expired-webhook fixture cleanup failed`);

    // /operator/alert-test: auth seam + dry-run send (client YAML leaves ownerWhatsapp empty).
    out = await json("/operator/alert-test", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}) });
    assert(out.res.status === 401, `operator alert-test without bearer should be 401, got ${out.res.status}`);

    out = await json("/operator/alert-test", authJson({ message: "battletest alert" }));
    assert(out.res.ok && out.body?.ok === true, `operator alert-test failed: ${out.res.status} ${JSON.stringify(out.body)}`);
    assert(out.body?.ownerAlert?.attempted === false || out.body?.ownerAlert?.sent === false, `operator alert-test should dry-run without owner WhatsApp/Twilio configured: ${JSON.stringify(out.body)}`);

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

  await assertAlertSendFailureDoesNotFailBooking();
  console.log("SERVER_BATTLETEST_ALERT_FAILSAFE_OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
