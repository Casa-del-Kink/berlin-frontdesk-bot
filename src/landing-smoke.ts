import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { setTimeout as sleep } from "node:timers/promises";

const require = createRequire(import.meta.url);
const TSX_CLI = require.resolve("tsx/cli");
const PORT = Number(process.env.LANDING_SMOKE_PORT || 4542);
const BASE = `http://127.0.0.1:${PORT}`;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function text(path: string) {
  const res = await fetch(`${BASE}${path}`);
  const body = await res.text();
  return { res, body };
}

async function waitForHealth() {
  const deadline = Date.now() + 15_000;
  let lastError = "not attempted";
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/health`);
      if (res.ok) return await res.json();
      lastError = `${res.status} ${await res.text()}`;
    } catch (e: any) {
      lastError = String(e?.message ?? e);
    }
    await sleep(250);
  }
  throw new Error(`landing smoke server did not become healthy: ${lastError}`);
}

async function main() {
  const child = spawn(process.execPath, [TSX_CLI, "src/server.ts"], {
    env: {
      ...process.env,
      PORT: String(PORT),
      CLIENT_FILE: "clients/salon-demo.yaml",
      USE_FAKE_CALENDAR: "true",
      OWNER_ALERT_LOG_ONLY_ACCEPTED: "true",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += String(chunk);
  });

  try {
    const health = (await waitForHealth()) as any;
    assert(health.ok === true, `health should be ok: ${JSON.stringify(health)}`);

    const out = await text("/");
    assert(out.res.ok, `landing should return 200, got ${out.res.status}`);
    assert(out.res.headers.get("content-type")?.includes("text/html"), `landing should be HTML: ${out.res.headers.get("content-type")}`);
    assert(out.body.includes("CallTilder is the AI reception"), "landing should state CallTilder AI reception positioning");
    assert(out.body.includes("independent Berlin salons and barbers"), "landing should keep narrow Berlin salon/barber scope");
    assert(out.body.includes("Ich bin die KI-Rezeption"), "landing should include German AI disclosure");
    assert(out.body.includes("summary"), "landing should mention short summaries");
    assert(out.body.includes("OPERATOR_LEGAL_NAME_PLACEHOLDER"), "landing should retain operator placeholder until Roxu fills values");
    assert(!out.body.toLowerCase().includes("dog grooming"), "landing should not broaden to dog grooming");
    assert(!out.body.toLowerCase().includes("massage"), "landing should not broaden to massage");

    console.log("LANDING_SMOKE_OK");
    console.log(
      JSON.stringify(
        {
          page: "/",
          health: true,
          aiDisclosure: "KI-Rezeption",
          narrowScope: "Berlin salons/barbers",
          legalPlaceholder: true,
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
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
