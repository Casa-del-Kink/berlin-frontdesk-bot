import { spawn } from "node:child_process";
import { createHmac } from "node:crypto";
import { existsSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { setTimeout as sleep } from "node:timers/promises";

// Proves /webhook/voice/post-call's dual auth: bearer token (existing) OR ElevenLabs HMAC
// signature (new, gated by ELEVENLABS_WEBHOOK_SECRET). No real ElevenLabs network call; signs
// requests locally with the same secret the spawned server is given.

const require = createRequire(import.meta.url);
const TSX_CLI = require.resolve("tsx/cli");

const PORT = Number(process.env.VOICE_POST_CALL_AUTH_SMOKE_PORT || 4323);
const PORT_NO_SECRET = PORT + 1;
const BASE = `http://127.0.0.1:${PORT}`;
const BASE_NO_SECRET = `http://127.0.0.1:${PORT_NO_SECRET}`;
const TOKEN = "voice-post-call-auth-smoke-bearer-token";
const WEBHOOK_SECRET = "voice-post-call-auth-smoke-webhook-secret-value";
const STATE_FILE = "data/voice-post-call-auth-smoke-state.json";
const STATE_FILE_NO_SECRET = "data/voice-post-call-auth-smoke-no-secret-state.json";

function removeIfExists(path: string) {
  if (existsSync(path)) rmSync(path);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function json(base: string, path: string, init: RequestInit = {}) {
  const res = await fetch(`${base}${path}`, init);
  const text = await res.text();
  let body: any;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    body = text;
  }
  return { res, body, text };
}

async function waitForHealth(base: string) {
  const deadline = Date.now() + 60_000;
  let lastError = "not attempted";
  while (Date.now() < deadline) {
    try {
      const { res, body } = await json(base, "/health");
      if (res.ok && body?.ok) return;
      lastError = `${res.status} ${JSON.stringify(body)}`;
    } catch (e: any) {
      lastError = String(e?.message ?? e);
    }
    await sleep(250);
  }
  throw new Error(`server did not become healthy: ${lastError}`);
}

function signatureHeaderFor(body: string, secret: string, timestampSeconds: number) {
  const signedPayload = `${timestampSeconds}.${body}`;
  const signature = createHmac("sha256", secret).update(signedPayload, "utf8").digest("hex");
  return `t=${timestampSeconds},v0=${signature}`;
}

async function postCall(base: string, body: unknown, headers: Record<string, string>) {
  return json(base, "/webhook/voice/post-call", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function assertNoSecretLeak(text: string) {
  assert(!text.includes(WEBHOOK_SECRET), "response/output must never contain the real ELEVENLABS_WEBHOOK_SECRET");
  assert(!text.includes(TOKEN), "response/output must never contain the real SERVER_TOOL_TOKEN in an error path");
}

function spawnServer(port: number, stateFile: string, extraEnv: Record<string, string | undefined>) {
  return spawn(process.execPath, [TSX_CLI, "src/server.ts"], {
    env: {
      ...process.env,
      PORT: String(port),
      STATE_FILE: stateFile,
      SERVER_TOOL_TOKEN: TOKEN,
      USE_FAKE_CALENDAR: "true",
      FAKE_CALENDAR_FILE: `${stateFile}.calendar.json`,
      SKIP_TWILIO_SIGNATURE_VALIDATION: "false",
      ...extraEnv,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function main() {
  removeIfExists(STATE_FILE);
  removeIfExists(STATE_FILE_NO_SECRET);

  const child = spawnServer(PORT, STATE_FILE, { ELEVENLABS_WEBHOOK_SECRET: WEBHOOK_SECRET });
  const childNoSecret = spawnServer(PORT_NO_SECRET, STATE_FILE_NO_SECRET, { ELEVENLABS_WEBHOOK_SECRET: undefined });

  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => (stdout += String(chunk)));
  child.stderr.on("data", (chunk) => (stderr += String(chunk)));
  let stdoutNoSecret = "";
  let stderrNoSecret = "";
  childNoSecret.stdout.on("data", (chunk) => (stdoutNoSecret += String(chunk)));
  childNoSecret.stderr.on("data", (chunk) => (stderrNoSecret += String(chunk)));

  try {
    await Promise.all([waitForHealth(BASE), waitForHealth(BASE_NO_SECRET)]);

    // 1. Valid HMAC signature, no bearer -> 200, outcome stored.
    const nowSeconds = Math.floor(Date.now() / 1000);
    const validBody = { callId: "auth-smoke-hmac-1", phone: "+491****9001", status: "answered", summary: "HMAC-authenticated post-call delivery." };
    const validBodyText = JSON.stringify(validBody);
    let out = await postCall(BASE, validBody, { "elevenlabs-signature": signatureHeaderFor(validBodyText, WEBHOOK_SECRET, nowSeconds) });
    assert(out.res.status === 200, `valid HMAC signature should be accepted: ${out.res.status} ${JSON.stringify(out.body)}`);
    assert(out.body?.outcome?.callId === "auth-smoke-hmac-1", `valid HMAC request should store the outcome: ${JSON.stringify(out.body)}`);
    assert(out.body?.idempotentReplay === false, "first HMAC-authenticated post-call should not be a replay");

    // 2. Tampered signature -> 401.
    out = await postCall(BASE, validBody, { "elevenlabs-signature": signatureHeaderFor(validBodyText, "wrong-secret-value", nowSeconds) });
    assert(out.res.status === 401, `tampered signature should be rejected: ${out.res.status} ${JSON.stringify(out.body)}`);

    // 2b. Tampered body (signature computed for different bytes) -> 401.
    const tamperedBodyText = JSON.stringify({ ...validBody, status: "booked" });
    const tamperedRes = await fetch(`${BASE}/webhook/voice/post-call`, {
      method: "POST",
      headers: { "content-type": "application/json", "elevenlabs-signature": signatureHeaderFor(validBodyText, WEBHOOK_SECRET, nowSeconds) },
      body: tamperedBodyText,
    });
    const tamperedBody = await tamperedRes.json().catch(() => undefined);
    assert(tamperedRes.status === 401, `signature computed for a different body should be rejected: ${tamperedRes.status} ${JSON.stringify(tamperedBody)}`);

    // 3. Stale timestamp beyond tolerance -> 401.
    const staleSeconds = nowSeconds - 60 * 60; // 1 hour old, tolerance is 30 minutes
    out = await postCall(BASE, validBody, { "elevenlabs-signature": signatureHeaderFor(validBodyText, WEBHOOK_SECRET, staleSeconds) });
    assert(out.res.status === 401, `stale timestamp beyond tolerance should be rejected: ${out.res.status} ${JSON.stringify(out.body)}`);

    // 4. No bearer, no signature -> 401 (unchanged baseline behavior).
    out = await postCall(BASE, validBody, {});
    assert(out.res.status === 401, `request with neither bearer nor signature should be rejected: ${out.res.status} ${JSON.stringify(out.body)}`);

    // 5. Bearer still works with a webhook secret configured (existing behavior preserved).
    out = await postCall(BASE, { callId: "auth-smoke-bearer-1", phone: "+491****9002", status: "answered", summary: "Bearer-authenticated post-call delivery." }, { authorization: `Bearer ${TOKEN}` });
    assert(out.res.status === 200, `bearer auth should still work with a webhook secret configured: ${out.res.status} ${JSON.stringify(out.body)}`);
    assert(out.body?.outcome?.callId === "auth-smoke-bearer-1", `bearer request should store the outcome: ${JSON.stringify(out.body)}`);

    // 6. Bearer still works with NO webhook secret configured (default/today's behavior, no regression).
    const noSecretBearerOut = await postCall(BASE_NO_SECRET, { callId: "auth-smoke-no-secret-bearer-1", phone: "+491****9003", status: "answered", summary: "Bearer-authenticated post-call delivery, no secret configured." }, { authorization: `Bearer ${TOKEN}` });
    assert(noSecretBearerOut.res.status === 200, `bearer auth should work with no webhook secret configured: ${noSecretBearerOut.res.status} ${JSON.stringify(noSecretBearerOut.body)}`);

    // 6b. HMAC signature is rejected when no webhook secret is configured on the server (nothing to verify against).
    const noSecretHmacOut = await postCall(BASE_NO_SECRET, validBody, { "elevenlabs-signature": signatureHeaderFor(validBodyText, WEBHOOK_SECRET, nowSeconds) });
    assert(noSecretHmacOut.res.status === 401, `HMAC signature should be rejected when the server has no ELEVENLABS_WEBHOOK_SECRET configured: ${noSecretHmacOut.res.status} ${JSON.stringify(noSecretHmacOut.body)}`);

    assertNoSecretLeak(JSON.stringify(out.body));
    assertNoSecretLeak(stdout);
    assertNoSecretLeak(stderr);
    assertNoSecretLeak(stdoutNoSecret);
    assertNoSecretLeak(stderrNoSecret);

    console.log("VOICE_POST_CALL_AUTH_SMOKE_OK");
  } finally {
    for (const c of [child, childNoSecret]) c.kill("SIGTERM");
    await sleep(250);
    for (const c of [child, childNoSecret]) if (!c.killed) c.kill("SIGKILL");
    if (process.env.VOICE_SMOKE_VERBOSE === "true") {
      if (stderr.trim()) console.error(stderr.trim());
      if (stderrNoSecret.trim()) console.error(stderrNoSecret.trim());
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
