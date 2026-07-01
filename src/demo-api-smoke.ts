import { spawn } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { setTimeout as sleep } from "node:timers/promises";
import { DateTime } from "luxon";

const PORT = Number(process.env.DEMO_API_SMOKE_PORT || 4326);
const BASE = `http://127.0.0.1:${PORT}`;
const STATE_FILE = `data/demo-api-smoke-state-${process.pid}.json`;
const CALENDAR_FILE = `data/demo-api-smoke-calendar-${process.pid}.json`;
const require = createRequire(import.meta.url);
const TSX_CLI = require.resolve("tsx/cli");

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function removeIfExists(path: string) {
  if (existsSync(path)) rmSync(path);
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

function postJson(body: unknown): RequestInit {
  return { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
}

async function waitForHealth() {
  const deadline = Date.now() + 15_000;
  let lastError = "not attempted";
  while (Date.now() < deadline) {
    try {
      const { res, body } = await json("/health");
      if (res.ok && body?.ok === true) return;
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

  const child = spawn(process.execPath, [TSX_CLI, "src/server.ts"], {
    env: {
      ...process.env,
      PORT: String(PORT),
      DEMO_PUBLIC_API_ENABLED: "true",
      DEMO_PUBLIC_API_MODE: "fake",
      USE_FAKE_CALENDAR: "true",
      FAKE_CALENDAR_FILE: CALENDAR_FILE,
      STATE_FILE,
      OWNER_ALERT_LOG_ONLY_ACCEPTED: "true",
      SERVER_TOOL_TOKEN: "demo-api-smoke-server-tool-token",
      SKIP_TWILIO_SIGNATURE_VALIDATION: "false",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += String(chunk);
  });

  try {
    await waitForHealth();

    let out = await json("/api/demo/config");
    assert(out.res.ok, `demo config failed: ${out.res.status} ${JSON.stringify(out.body)}`);
    assert(out.body?.brand?.product === "CallTilda", `demo config should expose CallTilda brand: ${JSON.stringify(out.body)}`);
    assert(out.body?.brand?.category?.includes("appointment businesses"), `demo config should stay business-agnostic: ${JSON.stringify(out.body)}`);
    assert(out.body?.brand?.firstWedge?.includes("Berlin salons and barbers"), `demo config should state narrow wedge separately: ${JSON.stringify(out.body)}`);
    assert(out.body?.scheduling?.publicMode === "fake", `demo config should report fake public mode: ${JSON.stringify(out.body)}`);
    assert(out.body?.scheduling?.canBook === true, `fake demo should allow public demo bookings: ${JSON.stringify(out.body)}`);

    out = await json("/api/demo/readiness");
    assert(out.res.ok, `demo readiness should be OK in fake smoke: ${out.res.status} ${JSON.stringify(out.body)}`);
    assert(out.body?.enabled === true && out.body?.mode === "fake", `demo readiness mismatch: ${JSON.stringify(out.body)}`);

    const from = DateTime.now().setZone("Europe/Berlin").plus({ days: 1 }).toISODate()!;
    out = await json("/api/demo/check-availability", postJson({ sessionId: "frontend-smoke", service: "Damenhaarschnitt", from, days: 3 }));
    assert(out.res.ok, `demo availability failed: ${out.res.status} ${JSON.stringify(out.body)}`);
    assert(out.body?.ok === true, `demo availability should include ok=true: ${JSON.stringify(out.body)}`);
    assert(out.body?.schedulingProvider === "google", `demo availability should expose provider: ${JSON.stringify(out.body)}`);
    assert(Array.isArray(out.body?.slots) && out.body.slots.length > 0, `demo availability should return slots: ${JSON.stringify(out.body)}`);
    const slot = out.body.slots[0].iso;

    out = await json("/api/demo/book-appointment", postJson({ sessionId: "frontend-smoke", name: "Frontend Demo", service: "Damenhaarschnitt", start: slot }));
    assert(out.res.ok, `demo booking failed: ${out.res.status} ${JSON.stringify(out.body)}`);
    assert(out.body?.ok === true, `demo booking should succeed: ${JSON.stringify(out.body)}`);
    assert(out.body?.demo?.mode === "fake", `demo booking should report fake mode: ${JSON.stringify(out.body)}`);
    assert(out.body?.estimatedValueCents === 4500, `demo booking should expose value proof: ${JSON.stringify(out.body)}`);

    out = await json("/api/demo/book-appointment", postJson({ sessionId: "frontend-smoke-2", name: "Double Book", service: "Damenhaarschnitt", start: slot }));
    assert(out.res.ok, `demo double-book should be handled, not crash: ${out.res.status} ${JSON.stringify(out.body)}`);
    assert(out.body?.error === "Slot is no longer available", `demo double-book guard missing: ${JSON.stringify(out.body)}`);

    console.log("DEMO_API_SMOKE_OK");
    console.log(JSON.stringify({ base: BASE, mode: "fake", bookedSlot: slot }, null, 2));
  } finally {
    child.kill("SIGTERM");
    await sleep(250);
    if (!child.killed) child.kill("SIGKILL");
    removeIfExists(STATE_FILE);
    removeIfExists(CALENDAR_FILE);
    if (stderr.trim()) console.error(stderr.trim());
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
