import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const TSX_CLI = require.resolve("tsx/cli");
const SECRET = "operator-readiness-secret-12345";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function run(extraEnv: Record<string, string | undefined> = {}) {
  const result = spawnSync(process.execPath, [TSX_CLI, "src/operator-readiness-bundle.ts"], {
    env: {
      ...process.env,
      CLIENT_FILE: "clients/salon-demo.yaml",
      OPERATOR_READINESS_BUNDLE_PATH: "tmp/tilda-ops-snapshot/operator-readiness-bundle-smoke.md",
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
    throw new Error(`operator readiness bundle JSON did not parse: ${String(e?.message ?? e)}\n${stdout}`);
  }
}

function assertNoSecretLeak(text: string) {
  assert(!text.includes(SECRET), "operator readiness output must not print the real bearer token");
}

function main() {
  let out = run({ OPERATOR_READINESS_BUNDLE_JSON: "true" });
  assert(out.status !== 0, "operator readiness bundle should fail closed when blockers remain");
  let body = parseJson(out.stdout);
  assert(body.marker === "OPERATOR_READINESS_BUNDLE_BLOCKED", `expected blocked marker: ${out.stdout}`);
  assert(body.blockerCount > 0, `expected blockers: ${out.stdout}`);
  assert(Array.isArray(body.ownerSummaries), `expected owner summaries: ${out.stdout}`);
  assert(body.ownerSummaries.some((summary: any) => summary.owner === "operator"), `expected operator owner group: ${out.stdout}`);
  assert(body.ownerSummaries.some((summary: any) => summary.owner === "provider"), `expected provider owner group: ${out.stdout}`);
  assert(body.ownerSummaries.some((summary: any) => summary.owner === "engineering"), `expected engineering owner group: ${out.stdout}`);
  assert(body.ownerSummaries.some((summary: any) => summary.owner === "voice"), `expected voice owner group: ${out.stdout}`);
  assert(body.voiceContractMarker === "VOICE_AGENT_CONTRACT_BLOCKED", `expected blocked voice contract marker: ${out.stdout}`);
  assert(body.voiceBlockerCount > 0, `expected voice blockers to be included: ${out.stdout}`);
  assert(body.nextActions.some((item: any) => item.source === "voice-agent" && item.name === "public HTTPS base URL"), `expected voice-agent next actions: ${out.stdout}`);
  assertNoSecretLeak(out.combined);

  out = run({ OPERATOR_READINESS_BUNDLE_JSON: "true", ALLOW_OPERATOR_READINESS_BUNDLE_BLOCKERS: "true", SERVER_TOOL_TOKEN: SECRET });
  assert(out.status === 0, `review-only operator bundle should exit 0: ${out.combined}`);
  body = parseJson(out.stdout);
  assert(body.marker === "OPERATOR_READINESS_BUNDLE_REVIEW_ONLY", `expected review marker: ${out.stdout}`);
  assert(body.nextActions.some((item: any) => item.name === "server tool token length" && item.owner === "engineering") === false, `long token should satisfy token-length action: ${out.stdout}`);
  assert(body.nextActions.some((item: any) => item.name === "server tool bearer token" && item.source === "voice-agent") === false, `long token should satisfy voice bearer action: ${out.stdout}`);
  assert(body.nextActions.some((item: any) => item.name === "owner alert destination" && item.owner === "operator"), `expected owner alert next action: ${out.stdout}`);
  assertNoSecretLeak(out.combined);

  console.log("OPERATOR_READINESS_BUNDLE_SMOKE_OK");
  console.log(
    JSON.stringify(
      {
        blockedMarker: "OPERATOR_READINESS_BUNDLE_BLOCKED",
        reviewMarker: body.marker,
        blockerCount: body.blockerCount,
        warningCount: body.warningCount,
        outputPath: body.outputPath,
      },
      null,
      2,
    ),
  );
}

main();
