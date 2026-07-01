import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const TSX_CLI = require.resolve("tsx/cli");
const SECRET_SENTINEL = "deployment-handoff-secret-sentinel-12345";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function run(extraEnv: Record<string, string | undefined> = {}) {
  const result = spawnSync(process.execPath, [TSX_CLI, "src/deployment-handoff.ts"], {
    env: {
      ...process.env,
      CLIENT_FILE: "clients/salon-demo.yaml",
      DEPLOYMENT_HANDOFF_JSON: "true",
      DEPLOYMENT_HANDOFF_PATH: "tmp/tilda-ops-snapshot/deployment-handoff-smoke.md",
      SERVER_TOOL_TOKEN: SECRET_SENTINEL,
      OPENROUTER_API_KEY: SECRET_SENTINEL,
      TWILIO_AUTH_TOKEN: SECRET_SENTINEL,
      TWILIO_ACCOUNT_SID: SECRET_SENTINEL,
      TWILIO_WHATSAPP_FROM: "whatsapp:+15551234567",
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
  assert(out.status === 0, `deployment handoff should be report-only and exit 0: ${out.combined}`);
  assert(!out.combined.includes(SECRET_SENTINEL), `deployment handoff leaked a secret sentinel: ${out.combined}`);
  const body = JSON.parse(out.stdout);
  assert(body.marker === "DEPLOYMENT_HANDOFF_BLOCKED", `expected blocked handoff with incomplete hosted env: ${out.stdout}`);
  assert(body.noLiveProviderCalls === true, `expected no live provider calls: ${out.stdout}`);
  assert(body.noSecretsPrinted === true, `expected noSecretsPrinted: ${out.stdout}`);
  assert(body.schedulingProvider === "google", `expected default google scheduling provider: ${out.stdout}`);
  assert(body.readinessMarker === "DEPLOYMENT_BLOCKED", `expected deployment blocked marker: ${out.stdout}`);
  assert(body.itemCount >= 10, `expected substantial handoff queue: ${out.stdout}`);
  assert(body.missingItemCount > 0, `expected missing/review-only items: ${out.stdout}`);
  assert(body.liveProviderItems >= 2, `expected live-provider proof items: ${out.stdout}`);
  assert(Array.isArray(body.items), `expected items array: ${out.stdout}`);
  assert(body.items.some((item: any) => item.name === "Public backend host chosen" && item.owner === "Michael"), `expected host owner handoff: ${out.stdout}`);
  assert(body.items.some((item: any) => item.name === "Twilio WhatsApp and webhook validation env" && item.owner === "Roxu"), `expected Roxu Twilio handoff: ${out.stdout}`);
  assert(body.items.some((item: any) => item.name === "Google Calendar create/find/delete proof" && item.command.includes("live-calendar:smoke")), `expected Google Calendar proof command: ${out.stdout}`);
  assert(String(body.outputPath).endsWith("deployment-handoff-smoke.md"), `expected smoke output path: ${out.stdout}`);

  const calcom = run({
    SCHEDULING_PROVIDER: "calcom",
    CALCOM_API_KEY: SECRET_SENTINEL,
    CALCOM_TEST_ATTENDEE_EMAIL: "demo@example.invalid",
    CALCOM_SMOKE_TESTED_AT: "2026-07-01T09:00:00Z",
  });
  assert(calcom.status === 0, `calcom handoff should also be report-only: ${calcom.combined}`);
  assert(!calcom.combined.includes(SECRET_SENTINEL), `calcom handoff leaked a secret sentinel: ${calcom.combined}`);
  const calcomBody = JSON.parse(calcom.stdout);
  assert(calcomBody.schedulingProvider === "calcom", `expected calcom scheduling provider: ${calcom.stdout}`);
  assert(calcomBody.items.some((item: any) => item.name === "Cal.com create/get/cancel proof" && item.expectedMarker === "CALCOM_SMOKE_OK"), `expected Cal.com proof command: ${calcom.stdout}`);

  console.log("DEPLOYMENT_HANDOFF_SMOKE_OK");
  console.log(
    JSON.stringify(
      {
        marker: body.marker,
        itemCount: body.itemCount,
        missingItemCount: body.missingItemCount,
        schedulingProvider: body.schedulingProvider,
        calcomSchedulingProvider: calcomBody.schedulingProvider,
        outputPath: body.outputPath,
      },
      null,
      2,
    ),
  );
}

main();
