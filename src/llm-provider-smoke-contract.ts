import { spawnSync } from "node:child_process";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function runBlockedSmoke() {
  const env = { ...process.env };
  delete env.OPENROUTER_API_KEY;
  delete env.LLM_PROVIDER_SMOKE_APPROVED;

  const result = spawnSync(process.execPath, ["--import", "tsx", "src/llm-provider-smoke.ts"], {
    env,
    encoding: "utf8",
  });

  assert(result.status === 1, `blocked LLM smoke should exit 1, got ${result.status}\n${result.stdout}\n${result.stderr}`);
  assert(result.stdout.includes("LLM_PROVIDER_SMOKE_BLOCKED"), `missing blocked marker: ${result.stdout}`);
  assert(result.stdout.includes("OPENROUTER_API_KEY"), `missing env name should be reported without values: ${result.stdout}`);
  assert(result.stdout.includes("LLM_PROVIDER_SMOKE_APPROVED=true"), `approval gate should be reported: ${result.stdout}`);
  assert(!result.stdout.includes("sk-or-v1-"), "blocked smoke stdout should not print secret-shaped values");
  assert(!result.stderr.includes("sk-or-v1-"), "blocked smoke stderr should not print secret-shaped values");
}

function main() {
  runBlockedSmoke();
  console.log("LLM_PROVIDER_SMOKE_CONTRACT_OK");
}

main();
