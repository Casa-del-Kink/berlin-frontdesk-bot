import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const TSX_CLI = require.resolve("tsx/cli");
const SECRET_SENTINEL = "provider-proof-secret-sentinel";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function run(extraEnv: Record<string, string | undefined> = {}) {
  const result = spawnSync(process.execPath, [TSX_CLI, "src/provider-proof-manifest.ts"], {
    env: {
      ...process.env,
      PROVIDER_PROOF_MANIFEST_JSON: "true",
      PROVIDER_PROOF_MANIFEST_PATH: "tmp/tilda-ops-snapshot/provider-proof-manifest-smoke.md",
      OPENROUTER_API_KEY: SECRET_SENTINEL,
      TWILIO_API_KEY_SECRET: SECRET_SENTINEL,
      SERVER_TOOL_TOKEN: SECRET_SENTINEL,
      DATABASE_URL: `postgres://user:${SECRET_SENTINEL}@example.invalid/db`,
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
  assert(out.status === 0, `provider proof manifest should exit 0: ${out.combined}`);
  assert(!out.combined.includes(SECRET_SENTINEL), `provider proof manifest leaked a secret sentinel: ${out.combined}`);

  const body = JSON.parse(out.stdout);
  assert(body.marker === "PROVIDER_PROOF_MANIFEST_OK", `expected provider proof marker: ${out.stdout}`);
  assert(body.mode === "report-only no-secret provider proof plan", `expected report-only mode: ${out.stdout}`);
  assert(body.noSecretsPrinted === true, `expected noSecretsPrinted true: ${out.stdout}`);
  assert(body.itemCount >= 9, `expected substantial provider proof items: ${out.stdout}`);
  assert(body.approvalRequiredCount >= 7, `expected live checks to require approval: ${out.stdout}`);
  assert(body.providerTrafficCount >= 2, `expected provider-traffic checks to be separated: ${out.stdout}`);

  const items = body.items as any[];
  const ids = new Set(items.map((item) => item.id));
  for (const id of [
    "google-calendar-readonly",
    "google-calendar-live-booking",
    "supabase-postgres-store",
    "supabase-admin-rest",
    "twilio-whatsapp-signature",
    "reviewed-whatsapp-followup-send",
    "elevenlabs-voice-agent-contract",
    "owner-alert-route",
    "llm-provider",
    "deployment-preflight",
  ]) {
    assert(ids.has(id), `provider proof manifest missing ${id}: ${out.stdout}`);
  }

  assert(items.every((item) => item.command && item.expectedMarker && item.cleanupProof), `each item needs command, marker, and cleanup proof: ${out.stdout}`);
  assert(items.some((item) => item.id === "supabase-postgres-store" && item.expectedMarker === "POSTGRES_STORE_SMOKE_OK"), `expected Supabase Postgres marker: ${out.stdout}`);
  assert(items.some((item) => item.id === "elevenlabs-voice-agent-contract" && item.expectedMarker === "VOICE_AGENT_CONTRACT_OK"), `expected voice contract marker: ${out.stdout}`);
  assert(items.some((item) => item.id === "google-calendar-live-booking" && item.cleanupProof.includes("visible proof")), `expected visible-proof cleanup guidance: ${out.stdout}`);
  assert(items.some((item) => item.id === "reviewed-whatsapp-followup-send" && item.sideEffect === "sends-provider-traffic"), `expected WhatsApp send traffic flag: ${out.stdout}`);

  console.log("PROVIDER_PROOF_MANIFEST_SMOKE_OK");
  console.log(
    JSON.stringify(
      {
        marker: body.marker,
        itemCount: body.itemCount,
        approvalRequiredCount: body.approvalRequiredCount,
        providerTrafficCount: body.providerTrafficCount,
        outputPath: body.outputPath,
      },
      null,
      2,
    ),
  );
}

main();
