import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const TSX_CLI = require.resolve("tsx/cli");
const SECRET_SENTINEL = "hosting-handoff-secret-sentinel-12345";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function run(extraEnv: Record<string, string | undefined> = {}) {
  const result = spawnSync(process.execPath, [TSX_CLI, "src/hosting-handoff.ts"], {
    env: {
      ...process.env,
      HOSTING_HANDOFF_JSON: "true",
      HOSTING_HANDOFF_PATH: "tmp/tilda-ops-snapshot/hosting-handoff-smoke.md",
      SERVER_TOOL_TOKEN: SECRET_SENTINEL,
      TWILIO_AUTH_TOKEN: SECRET_SENTINEL,
      TWILIO_ACCOUNT_SID: SECRET_SENTINEL,
      OPENROUTER_API_KEY: SECRET_SENTINEL,
      GOOGLE_SA_JSON: SECRET_SENTINEL,
      DATABASE_URL: "postgres://user:***@example.invalid/db",
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

function main() {
  const out = run();
  assert(out.status === 0, `hosting handoff should be report-only and exit 0: ${out.combined}`);
  assert(!out.combined.includes(SECRET_SENTINEL), `hosting handoff leaked a secret sentinel: ${out.combined}`);
  const body = JSON.parse(out.stdout);
  assert(body.marker === "HOSTING_HANDOFF_OK", `expected hosting handoff marker: ${out.stdout}`);
  assert(body.selectedTarget === "hetzner-vps", `expected default Hetzner target: ${out.stdout}`);
  assert(body.noSecretsPrinted === true, `expected noSecretsPrinted flag: ${out.stdout}`);
  assert(body.noLiveProviderCalls === true, `expected no live provider calls: ${out.stdout}`);
  assert(body.targetCount === 3, `expected three target options: ${out.stdout}`);
  assert(body.selectedMissingItems > 0, `expected manual or missing deployment items: ${out.stdout}`);
  assert(Array.isArray(body.targets), `expected targets array: ${out.stdout}`);
  assert(body.targets.some((target: any) => target.id === "hetzner-vps" && target.recommendation === "first-choice"), `expected Hetzner first-choice target: ${out.stdout}`);
  assert(body.targets.some((target: any) => target.id === "render" && target.recommendation === "acceptable"), `expected Render acceptable target: ${out.stdout}`);
  assert(body.targets.some((target: any) => target.id === "fly" && target.recommendation === "later"), `expected Fly later target: ${out.stdout}`);
  assert(body.targets.every((target: any) => target.steps.some((step: any) => step.name === "Hosted preflight returns machine-readable readiness")), `expected hosted preflight step for each target: ${out.stdout}`);
  assert(String(body.outputPath).endsWith("hosting-handoff-smoke.md"), `expected smoke output path: ${out.stdout}`);

  const render = run({ HOSTING_TARGET: "render" });
  assert(render.status === 0, `render target report should be report-only: ${render.combined}`);
  assert(!render.combined.includes(SECRET_SENTINEL), `render target report leaked a secret sentinel: ${render.combined}`);
  const renderBody = JSON.parse(render.stdout);
  assert(renderBody.selectedTarget === "render", `expected render target selection: ${render.stdout}`);
  assert(renderBody.recommendation === "acceptable", `expected render recommendation: ${render.stdout}`);

  console.log("HOSTING_HANDOFF_SMOKE_OK");
  console.log(
    JSON.stringify(
      {
        marker: body.marker,
        selectedTarget: body.selectedTarget,
        selectedMissingItems: body.selectedMissingItems,
        renderTarget: renderBody.selectedTarget,
        outputPath: body.outputPath,
      },
      null,
      2,
    ),
  );
}

main();
