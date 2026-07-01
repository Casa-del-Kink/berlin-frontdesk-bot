import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const TSX_CLI = require.resolve("tsx/cli");
const SECRET_SENTINEL = "pilot-status-secret-sentinel-12345";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function run(extraEnv: Record<string, string | undefined> = {}) {
  const result = spawnSync(process.execPath, [TSX_CLI, "src/pilot-go-no-go.ts"], {
    env: {
      ...process.env,
      CLIENT_FILE: "clients/salon-demo.yaml",
      PILOT_GO_NO_GO_JSON: "true",
      PILOT_GO_NO_GO_PATH: "tmp/tilda-ops-snapshot/pilot-go-no-go-smoke.md",
      SERVER_TOOL_TOKEN: SECRET_SENTINEL,
      OPENROUTER_API_KEY: SECRET_SENTINEL,
      TWILIO_AUTH_TOKEN: SECRET_SENTINEL,
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
  assert(out.status === 0, `pilot go/no-go should be report-only and exit 0: ${out.combined}`);
  assert(!out.combined.includes(SECRET_SENTINEL), `pilot go/no-go leaked a secret sentinel: ${out.combined}`);
  const body = JSON.parse(out.stdout);
  assert(body.marker === "PILOT_GO_NO_GO_NO_GO", `expected no-go marker while blockers remain: ${out.stdout}`);
  assert(body.go === false, `expected go=false while blockers remain: ${out.stdout}`);
  assert(body.noSecretsPrinted === true, `expected noSecretsPrinted flag: ${out.stdout}`);
  assert(body.noLiveProviderCalls === true, `expected no live provider calls: ${out.stdout}`);
  assert(body.blockerCount > 0, `expected blockers: ${out.stdout}`);
  assert(body.proofCount >= 5, `expected live proof checklist items: ${out.stdout}`);
  assert(body.voiceContractMarker, `expected voice contract marker: ${out.stdout}`);
  assert(body.activeSchedulingProvider === "google", `expected default active scheduling provider to be google: ${out.stdout}`);
  assert(body.activeSchedulingProofCommands.some((command: string) => command.includes("live-calendar:smoke")), `expected active Google proof command: ${out.stdout}`);
  assert(Array.isArray(body.items), `expected action items: ${out.stdout}`);
  assert(body.items.some((item: any) => item.lane === "deployment" && item.name === "scheduling runtime provider"), `expected scheduling runtime blocker: ${out.stdout}`);
  assert(body.items.some((item: any) => item.lane === "voice" && item.name === "public HTTPS base URL"), `expected voice blocker: ${out.stdout}`);
  assert(body.items.some((item: any) => item.lane === "provider-proof" && item.name === "Supabase Postgres store smoke"), `expected Supabase proof item: ${out.stdout}`);
  assert(body.items.some((item: any) => item.lane === "operator-proof" && item.name === "No-credential operator demo packet reviewed"), `expected operator proof review item: ${out.stdout}`);
  assert(body.commands.safeLocal.includes("npm run operator:demo:packet"), `expected safe local operator packet command: ${out.stdout}`);
  assert(body.commands.liveApprovalRequired.some((command: string) => command.includes("live-calendar:smoke")), `expected live calendar command to require approval: ${out.stdout}`);
  assert(String(body.outputPath).endsWith("pilot-go-no-go-smoke.md"), `expected smoke output path: ${out.stdout}`);

  const calcomOut = run({ SCHEDULING_PROVIDER: "calcom", CALCOM_API_KEY: SECRET_SENTINEL, CALCOM_EVENT_TYPE_ID: "42" });
  assert(calcomOut.status === 0, `pilot go/no-go Cal.com branch should exit 0: ${calcomOut.combined}`);
  assert(!calcomOut.combined.includes(SECRET_SENTINEL), `pilot go/no-go Cal.com branch leaked a secret sentinel: ${calcomOut.combined}`);
  const calcomBody = JSON.parse(calcomOut.stdout);
  assert(calcomBody.activeSchedulingProvider === "calcom", `expected active Cal.com provider: ${calcomOut.stdout}`);
  assert(calcomBody.activeSchedulingProofCommands.length === 1, `expected one active Cal.com proof command: ${calcomOut.stdout}`);
  assert(calcomBody.activeSchedulingProofCommands[0] === "npm run calcom:smoke", `expected Cal.com smoke as active proof command: ${calcomOut.stdout}`);
  assert(calcomBody.commands.liveApprovalRequired.some((command: string) => command === "npm run calcom:smoke"), `expected Cal.com smoke to require approval: ${calcomOut.stdout}`);
  assert(calcomBody.items.some((item: any) => item.lane === "deployment" && item.name === "scheduling live smoke proof" && item.detail.includes("calcom:smoke")), `expected Cal.com scheduling live-smoke blocker: ${calcomOut.stdout}`);

  console.log("PILOT_GO_NO_GO_SMOKE_OK");
  console.log(
    JSON.stringify(
      {
        marker: body.marker,
        blockerCount: body.blockerCount,
        warningCount: body.warningCount,
        proofCount: body.proofCount,
        outputPath: body.outputPath,
      },
      null,
      2,
    ),
  );
}

main();
