import { spawn, spawnSync } from "node:child_process";
import { rmSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { setTimeout as sleep } from "node:timers/promises";

const require = createRequire(import.meta.url);
const TSX_CLI = require.resolve("tsx/cli");
const PORT = Number(process.env.DEPLOYMENT_SMOKE_PORT || 4531);
const BASE = `http://127.0.0.1:${PORT}`;
const TOKEN = "deployment-smoke-token-with-length";
const STATE_FILE = "data/deployment-smoke-state.json";
const CALENDAR_FILE = "data/deployment-smoke-calendar.json";

function removeIfExists(path: string) {
  if (existsSync(path)) rmSync(path);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
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
      if (res.ok && body?.ok) return body;
      lastError = `${res.status} ${JSON.stringify(body)}`;
    } catch (e: any) {
      lastError = String(e?.message ?? e);
    }
    await sleep(250);
  }
  throw new Error(`deployment smoke server did not become healthy: ${lastError}`);
}

function assertStrictStartupBlocksUnsafeEnv() {
  const result = spawnSync(process.execPath, [TSX_CLI, "src/server.ts"], {
    env: {
      ...process.env,
      PORT: String(PORT + 1),
      CLIENT_FILE: "clients/salon-demo.yaml",
      USE_FAKE_CALENDAR: "true",
      FAKE_CALENDAR_FILE: CALENDAR_FILE,
      STATE_FILE,
      SERVER_TOOL_TOKEN: TOKEN,
      SKIP_TWILIO_SIGNATURE_VALIDATION: "false",
      REQUIRE_LIVE_PILOT_READINESS: "true",
    },
    encoding: "utf8",
    timeout: 10_000,
  });
  const combined = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  assert(result.status !== 0, "strict startup should fail in unsafe fake-provider deployment env");
  assert(combined.includes("Deployment readiness blockers"), `strict startup should print blockers: ${combined}`);
}

async function main() {
  removeIfExists(STATE_FILE);
  removeIfExists(CALENDAR_FILE);
  assertStrictStartupBlocksUnsafeEnv();

  const child = spawn(process.execPath, [TSX_CLI, "src/server.ts"], {
    env: {
      ...process.env,
      PORT: String(PORT),
      CLIENT_FILE: "clients/salon-demo.yaml",
      USE_FAKE_CALENDAR: "true",
      FAKE_CALENDAR_FILE: CALENDAR_FILE,
      STATE_FILE,
      SERVER_TOOL_TOKEN: TOKEN,
      SKIP_TWILIO_SIGNATURE_VALIDATION: "false",
      DATA_RETENTION_DAYS: "30",
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
    const health = await waitForHealth();
    assert(health.client === "Glanz & Schnitt Berlin", `unexpected health client: ${JSON.stringify(health)}`);
    assert(health.storeBackend === "json", `demo smoke should expose json backend: ${JSON.stringify(health)}`);

    let out = await json("/readiness/live-pilot");
    assert(out.res.status === 401, `readiness without auth should be 401, got ${out.res.status}`);

    out = await json("/readiness/live-pilot", { headers: { authorization: `Bearer ${TOKEN}` } });
    assert(out.res.status === 409, `unsafe deployment readiness should be 409, got ${out.res.status} ${JSON.stringify(out.body)}`);
    assert(out.body?.ok === false, `readiness should be false: ${JSON.stringify(out.body)}`);
    assert(Array.isArray(out.body?.checks), `readiness should expose checks: ${JSON.stringify(out.body)}`);
    assert(Array.isArray(out.body?.blockers) && out.body.blockers.length > 0, `readiness should expose blockers: ${JSON.stringify(out.body)}`);
    assert(
      out.body.checks.some((check: any) => check.name === "fake calendar disabled" && check.ok === false),
      `readiness should flag fake calendar: ${JSON.stringify(out.body)}`,
    );
    assert(
      out.body.checks.some((check: any) => check.name === "AI disclosure text" && check.ok === true),
      `readiness should accept only explicit AI/KI disclosure text: ${JSON.stringify(out.body)}`,
    );
    assert(
      out.body.checks.some((check: any) => check.name === "store backend postgres" && check.ok === false),
      `readiness should flag JSON store: ${JSON.stringify(out.body)}`,
    );
    assert(
      out.body.checks.some((check: any) => check.name === "public website operator footer" && check.ok === false),
      `readiness should flag missing public operator footer values: ${JSON.stringify(out.body)}`,
    );
    assert(
      out.body.checks.some((check: any) => check.name === "reviewed follow-up send approval" && check.ok === true),
      `readiness should keep reviewed follow-up sending disabled/safe by default: ${JSON.stringify(out.body)}`,
    );
    assert(
      out.body.checks.some((check: any) => check.name === "public contact email" && check.ok === false),
      `readiness should flag missing public contact email: ${JSON.stringify(out.body)}`,
    );
    assert(
      out.body.checks.some((check: any) => check.name === "privacy contact email" && check.ok === false),
      `readiness should flag missing privacy contact email: ${JSON.stringify(out.body)}`,
    );
    const readinessBody = out.body;

    out = await json("/metrics/today", { headers: { authorization: `Bearer ${TOKEN}` } });
    assert(out.res.ok, `authorized metrics should work during deployment smoke: ${out.res.status} ${JSON.stringify(out.body)}`);

    out = await json("/operator/follow-up/send", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}) });
    assert(out.res.status === 401, `follow-up send without auth should be 401, got ${out.res.status}`);

    out = await json("/operator/follow-up/send", authJson({ phone: "whatsapp:+491****2201", message: "Hallo Laura, dein Termin ist eingetragen.", reviewedBy: "operator" }));
    assert(out.res.status === 400, `follow-up send should require opt-in confirmation: ${out.res.status} ${JSON.stringify(out.body)}`);

    out = await json(
      "/operator/follow-up/send",
      authJson({ phone: "whatsapp:+491****2201", message: "Hallo Laura, dein Termin ist eingetragen.", reviewedBy: "operator", optInConfirmed: true }),
    );
    assert(out.res.ok, `follow-up dry-run should pass without provider sends: ${out.res.status} ${JSON.stringify(out.body)}`);
    assert(out.body?.sent === false && out.body?.dryRun === true, `follow-up default should be dry-run: ${JSON.stringify(out.body)}`);

    out = await json(
      "/operator/follow-up/send",
      authJson({ phone: "whatsapp:+491****2201", message: "Hallo Laura, dein Termin ist eingetragen.", reviewedBy: "operator", optInConfirmed: true, dryRun: false }),
    );
    assert(out.res.status === 409, `live follow-up send should fail closed until explicitly enabled: ${out.res.status} ${JSON.stringify(out.body)}`);

    console.log("DEPLOYMENT_SMOKE_OK");
    console.log(
      JSON.stringify(
        {
          health,
          readinessStatus: 409,
          blockerCount: readinessBody.blockers.length,
        },
        null,
        2,
      ),
    );
  } finally {
    child.kill("SIGTERM");
    await sleep(250);
    if (!child.killed) child.kill("SIGKILL");
    if (stderr.trim()) console.error(stderr.trim());
    if (process.env.DEPLOYMENT_SMOKE_VERBOSE === "true" && stdout.trim()) console.log(stdout.trim());
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
