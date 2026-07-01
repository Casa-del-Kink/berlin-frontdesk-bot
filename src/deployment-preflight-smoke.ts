import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const TSX_CLI = require.resolve("tsx/cli");
const SECRET = "deployment-preflight-secret-12345";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function run(extraEnv: Record<string, string | undefined> = {}) {
  const result = spawnSync(process.execPath, [TSX_CLI, "src/deployment-preflight.ts"], {
    env: {
      ...process.env,
      CLIENT_FILE: "clients/salon-demo.yaml",
      ...extraEnv,
    },
    encoding: "utf8",
    timeout: 10_000,
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    combined: `${result.stdout ?? ""}${result.stderr ?? ""}`,
  };
}

function parseJson(stdout: string) {
  try {
    return JSON.parse(stdout);
  } catch (e: any) {
    throw new Error(`deployment preflight JSON did not parse: ${String(e?.message ?? e)}\n${stdout}`);
  }
}

function assertNoSecretLeak(text: string) {
  assert(!text.includes(SECRET), "deployment preflight JSON must not print the real server tool token");
}

function main() {
  let out = run({ DEPLOYMENT_PREFLIGHT_JSON: "true" });
  assert(out.status !== 0, "JSON preflight should fail closed when live blockers remain");
  let body = parseJson(out.stdout);
  assert(body.marker === "DEPLOYMENT_PREFLIGHT_BLOCKED", `expected blocked marker: ${out.stdout}`);
  assert(body.ok === false, `expected ok=false: ${out.stdout}`);
  assert(body.blockerCount > 0, `expected blockers: ${out.stdout}`);
  assert(Array.isArray(body.checks) && Array.isArray(body.blockers) && Array.isArray(body.warnings), `expected machine-readable check arrays: ${out.stdout}`);
  assert(body.checks.some((check: any) => check.name === "reviewed follow-up send approval" && check.ok === true), `reviewed follow-up sending should be safe by default: ${out.stdout}`);
  assertNoSecretLeak(out.combined);

  out = run({ DEPLOYMENT_PREFLIGHT_JSON: "true", ALLOW_DEPLOYMENT_BLOCKERS: "true", ENABLE_REVIEWED_FOLLOWUP_SEND: "true" });
  assert(out.status === 0, `unsafe follow-up review mode should still exit 0 with allow flag: ${out.combined}`);
  body = parseJson(out.stdout);
  assert(
    body.blockers.some((check: any) => check.name === "reviewed follow-up send approval"),
    `enabling reviewed follow-up sending without approval timestamp should be a blocker: ${out.stdout}`,
  );

  out = run({ DEPLOYMENT_PREFLIGHT_JSON: "true", ALLOW_DEPLOYMENT_BLOCKERS: "true", SERVER_TOOL_TOKEN: SECRET });
  assert(out.status === 0, `review-only JSON preflight should exit 0: ${out.combined}`);
  body = parseJson(out.stdout);
  assert(body.marker === "DEPLOYMENT_PREFLIGHT_REVIEW_ONLY", `expected review marker: ${out.stdout}`);
  assert(body.blockerCount > 0, `review mode should preserve blockers: ${out.stdout}`);
  assert(body.checks.some((check: any) => check.name === "server tool token length" && check.ok === true), `expected token length check to pass without leaking token: ${out.stdout}`);
  assertNoSecretLeak(out.combined);

  console.log("DEPLOYMENT_PREFLIGHT_JSON_SMOKE_OK");
  console.log(
    JSON.stringify(
      {
        blockedMarker: "DEPLOYMENT_PREFLIGHT_BLOCKED",
        reviewMarker: body.marker,
        blockerCount: body.blockerCount,
        warningCount: body.warningCount,
      },
      null,
      2,
    ),
  );
}

main();
