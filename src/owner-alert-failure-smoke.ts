import { spawn } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { setTimeout as sleep } from "node:timers/promises";

const PORT = Number(process.env.OWNER_ALERT_SMOKE_PORT || 4532);
const BASE = `http://127.0.0.1:${PORT}`;
const TOKEN = "owner-alert-smoke-token-with-length";
const STATE_FILE = "data/owner-alert-smoke-state.json";
const CALENDAR_FILE = "data/owner-alert-smoke-calendar.json";
const CLIENT_FILE = "data/owner-alert-smoke-client.yaml";
const require = createRequire(import.meta.url);
const TSX_CLI = require.resolve("tsx/cli");

function removeIfExists(path: string) {
  if (existsSync(path)) rmSync(path);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function countOccurrences(haystack: string, needle: string) {
  return haystack.split(needle).length - 1;
}

function prepareClientFile() {
  const base = readFileSync("clients/salon-demo.yaml", "utf8");
  writeFileSync(CLIENT_FILE, base.replace('ownerWhatsapp: ""', 'ownerWhatsapp: "whatsapp:+491****9999"'));
}

async function waitForOutput(getOutput: () => string, needle: string) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (getOutput().includes(needle)) return;
    await sleep(100);
  }
  throw new Error(`timed out waiting for server output: ${needle}`);
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
  prepareClientFile();

  const child = spawn(process.execPath, [TSX_CLI, "src/server.ts"], {
    env: {
      ...process.env,
      PORT: String(PORT),
      CLIENT_FILE,
      USE_FAKE_CALENDAR: "true",
      FAKE_CALENDAR_FILE: CALENDAR_FILE,
      STATE_FILE,
      SERVER_TOOL_TOKEN: TOKEN,
      SKIP_TWILIO_SIGNATURE_VALIDATION: "false",
      FORCE_WHATSAPP_SEND_FAILURE: "true",
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

    let out = await json("/tools/check_availability", authJson({ phone: "+491****9001", args: { service: "Damenhaarschnitt", from: "2026-07-01", days: 3 } }));
    assert(out.res.ok, `availability failed: ${out.res.status} ${JSON.stringify(out.body)}`);
    const selectedSlot = out.body?.slots?.[0]?.iso;
    assert(selectedSlot, `availability should return a slot: ${JSON.stringify(out.body)}`);

    out = await json(
      "/tools/book_appointment",
      authJson({ phone: "+491****9001", args: { name: "Owner Alert Failure", service: "Damenhaarschnitt", start: selectedSlot, channel: "phone" } }),
    );
    assert(out.res.ok, `booking should still return 200 when owner alert send fails: ${out.res.status} ${JSON.stringify(out.body)}`);
    assert(out.body?.ok === true, `booking should be stored despite owner alert failure: ${JSON.stringify(out.body)}`);
    await waitForOutput(() => stderr, "[owner alert:FAILED]");
    assert(countOccurrences(stderr, "[owner alert:FAILED]") === 1, `booking should log one owner alert failure: ${stderr}`);

    out = await json("/operator/alert-test", authJson({ message: "Owner alert failure smoke route" }));
    assert(out.res.ok, `operator alert test should return 200 when provider send fails: ${out.res.status} ${JSON.stringify(out.body)}`);
    assert(out.body?.ownerAlert?.error === "FORCE_WHATSAPP_SEND_FAILURE is set", `alert test should expose redacted failure reason: ${JSON.stringify(out.body)}`);
    assert(countOccurrences(stderr, "[owner alert:FAILED]") === 2, `booking and alert test should each log one alert failure: ${stderr}`);

    out = await json("/metrics/today", { headers: { authorization: `Bearer ${TOKEN}` } });
    assert(out.res.ok && out.body?.booked === 1, `metrics should include booking after alert failure: ${out.res.status} ${JSON.stringify(out.body)}`);

    console.log("OWNER_ALERT_FAILURE_SMOKE_OK");
    console.log(JSON.stringify({ booked: out.body.booked, ownerAlertFailureLogged: true }, null, 2));
  } finally {
    child.kill("SIGTERM");
    await sleep(250);
    if (!child.killed) child.kill("SIGKILL");
    if (process.env.OWNER_ALERT_SMOKE_VERBOSE === "true") {
      if (stdout.trim()) console.log(stdout.trim());
      if (stderr.trim()) console.error(stderr.trim());
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
