import { spawn } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { setTimeout as sleep } from "node:timers/promises";

const PORT = Number(process.env.RATE_LIMIT_SMOKE_PORT || 4331);
const BASE = `http://127.0.0.1:${PORT}`;
const TOKEN = "rate-limit-smoke-token";
const STATE_FILE = `data/rate-limit-smoke-state-${process.pid}.json`;
const CALENDAR_FILE = `data/rate-limit-smoke-calendar-${process.pid}.json`;
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
      USE_FAKE_CALENDAR: "true",
      FAKE_CALENDAR_FILE: CALENDAR_FILE,
      STATE_FILE,
      OWNER_ALERT_LOG_ONLY_ACCEPTED: "true",
      SERVER_TOOL_TOKEN: TOKEN,
      DEMO_PUBLIC_API_ENABLED: "true",
      DEMO_PUBLIC_API_MODE: "fake",
      DEMO_PUBLIC_ALLOWED_ORIGINS: "https://demo.calltilda.com",
      PUBLIC_DEMO_RATE_LIMIT_MAX: "2",
      PUBLIC_DEMO_RATE_LIMIT_WINDOW_MS: "60000",
      SERVER_TOOL_RATE_LIMIT_MAX: "2",
      SERVER_TOOL_RATE_LIMIT_WINDOW_MS: "60000",
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

    let out = await json("/api/demo/config", { headers: { origin: "https://demo.calltilda.com" } });
    assert(out.res.ok, `first public demo request should pass: ${out.res.status} ${JSON.stringify(out.body)}`);
    assert(out.res.headers.get("x-ratelimit-limit") === "2", "public demo response should expose rate limit header");
    assert(out.res.headers.get("access-control-allow-origin") === "https://demo.calltilda.com", "rate-limited demo path should still apply CORS before limiting");

    out = await json("/api/demo/readiness", { headers: { origin: "https://demo.calltilda.com" } });
    assert(out.res.ok, `second public demo request should pass: ${out.res.status} ${JSON.stringify(out.body)}`);

    out = await json("/api/demo/config", { headers: { origin: "https://demo.calltilda.com" } });
    assert(out.res.status === 429, `third public demo request should rate limit: ${out.res.status} ${JSON.stringify(out.body)}`);
    assert(out.body?.rateLimit === "public-demo", `public demo 429 should name limiter: ${JSON.stringify(out.body)}`);
    assert(out.res.headers.get("retry-after"), "public demo 429 should include Retry-After");
    assert(out.res.headers.get("access-control-allow-origin") === "https://demo.calltilda.com", "public demo 429 should retain CORS header");

    out = await json("/health");
    assert(out.res.ok, `health should not be rate-limited by public/tool limiters: ${out.res.status} ${JSON.stringify(out.body)}`);

    out = await json("/tools/check_availability", authJson({ phone: "+491****7701", args: { service: "Damenhaarschnitt", from: "2026-07-01", days: 1 } }));
    assert(out.res.ok, `first tool request should pass: ${out.res.status} ${JSON.stringify(out.body)}`);
    assert(out.res.headers.get("x-ratelimit-limit") === "2", "tool response should expose rate limit header");

    out = await json("/metrics/today", { headers: { authorization: `Bearer ${TOKEN}` } });
    assert(out.res.ok, `second tool/operator request should pass: ${out.res.status} ${JSON.stringify(out.body)}`);

    out = await json("/tools/check_availability", authJson({ phone: "+491****7701", args: { service: "Damenhaarschnitt", from: "2026-07-01", days: 1 } }));
    assert(out.res.status === 429, `third tool/operator request should rate limit: ${out.res.status} ${JSON.stringify(out.body)}`);
    assert(out.body?.rateLimit === "server-tools", `tool 429 should name limiter: ${JSON.stringify(out.body)}`);

    console.log("RATE_LIMIT_SMOKE_OK");
    console.log(JSON.stringify({ publicDemoLimit: 2, serverToolLimit: 2, base: BASE }, null, 2));
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
