import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const TSX_CLI = require.resolve("tsx/cli");
const SECRET = "voice-contract-secret-token-12345";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function runContract(extraEnv: Record<string, string | undefined> = {}) {
  const result = spawnSync(process.execPath, [TSX_CLI, "src/elevenlabs-agent-contract.ts"], {
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
    throw new Error(`contract JSON did not parse: ${String(e?.message ?? e)}\n${stdout}`);
  }
}

function assertNoSecretLeak(text: string) {
  assert(!text.includes(SECRET), "voice contract output must not print the real SERVER_TOOL_TOKEN");
}

function main() {
  let out = runContract();
  assert(out.status !== 0, "contract should block live setup when base URL and bearer token are missing");
  assert(out.stdout.includes("VOICE_AGENT_CONTRACT_BLOCKED"), `missing-env run should be blocked: ${out.combined}`);
  assert(out.stdout.includes("voice_contract_blockers="), `missing-env run should print blocker count: ${out.combined}`);
  assertNoSecretLeak(out.combined);

  out = runContract({ ALLOW_VOICE_AGENT_CONTRACT_BLOCKERS: "true" });
  assert(out.status === 0, `review-only contract should exit 0: ${out.combined}`);
  assert(out.stdout.includes("VOICE_AGENT_CONTRACT_REVIEW_ONLY"), `review-only marker missing: ${out.combined}`);
  assert(out.stdout.includes("/tools/check_availability"), `review-only output should include tool mapping: ${out.combined}`);
  assert(out.stdout.includes("/webhook/voice/post-call"), `review-only output should include post-call webhook: ${out.combined}`);
  assertNoSecretLeak(out.combined);

  out = runContract({
    VOICE_AGENT_PUBLIC_BASE_URL: "https://tilda-demo.example.com",
    SERVER_TOOL_TOKEN: SECRET,
    VOICE_AGENT_CONTRACT_JSON: "true",
  });
  assert(out.status === 0, `hosted JSON contract should exit 0: ${out.combined}`);
  assertNoSecretLeak(out.combined);
  const body = parseJson(out.stdout);
  assert(body.marker === "VOICE_AGENT_CONTRACT_OK_WITH_WARNINGS", `expected warnings-only marker: ${out.stdout}`);
  assert(body.blockerCount === 0, `hosted contract should have no blockers: ${out.stdout}`);
  assert(body.warningCount >= 1, `hosted contract should retain provider/compliance warnings: ${out.stdout}`);
  assert(body.publicBaseConfigured === true, `hosted contract should report public base configured: ${out.stdout}`);
  assert(body.checks.some((check: any) => check.name === "client AI disclosure text" && check.ok === true), `hosted contract should accept explicit AI/KI disclosure: ${out.stdout}`);
  assert(Array.isArray(body.tools) && body.tools.length === 3, `contract should expose three server tools: ${out.stdout}`);
  assert(body.tools.every((tool: any) => String(tool.url).startsWith("https://tilda-demo.example.com/tools/")), `tool URLs should use public base: ${out.stdout}`);
  assert(body.tools.every((tool: any) => tool.auth === ["Authorization:", "Bearer", "REDACTED"].join(" ")), `tool auth should be redacted: ${out.stdout}`);
  assert(body.postCallWebhook?.url === "https://tilda-demo.example.com/webhook/voice/post-call", `post-call URL should use public base: ${out.stdout}`);

  console.log("VOICE_AGENT_CONTRACT_SMOKE_OK");
  console.log(
    JSON.stringify(
      {
        blockedMarker: "VOICE_AGENT_CONTRACT_BLOCKED",
        reviewMarker: "VOICE_AGENT_CONTRACT_REVIEW_ONLY",
        hostedMarker: body.marker,
        tools: body.tools.map((tool: any) => tool.name),
        blockerCount: body.blockerCount,
        warningCount: body.warningCount,
      },
      null,
      2,
    ),
  );
}

main();
