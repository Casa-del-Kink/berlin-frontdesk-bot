import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const TSX_CLI = require.resolve("tsx/cli");
const SECRET_SENTINEL = "calcom-smoke-secret-sentinel-12345";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function run(extraEnv: Record<string, string | undefined> = {}) {
  const result = spawnSync(process.execPath, [TSX_CLI, "src/calcom-smoke.ts"], {
    env: {
      ...process.env,
      CALCOM_API_KEY: SECRET_SENTINEL,
      CALCOM_EVENT_TYPE_ID: "42",
      CALCOM_TEST_ATTENDEE_EMAIL: "tilda-calcom-smoke@example.test",
      CALCOM_BASE_URL: "https://calcom-smoke-contract.invalid",
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
  const unapproved = run({ CALCOM_SMOKE_APPROVED: undefined });
  assert(unapproved.status !== 0, `Cal.com smoke must fail closed without explicit approval: ${unapproved.combined}`);
  assert(unapproved.combined.includes("CALCOM_SMOKE_APPROVED=true"), `Cal.com smoke should explain approval gate: ${unapproved.combined}`);
  assert(!unapproved.combined.includes(SECRET_SENTINEL), `Unapproved Cal.com smoke leaked a secret sentinel: ${unapproved.combined}`);
  assert(!unapproved.combined.includes("CALCOM_SMOKE baseUrl="), `Unapproved Cal.com smoke should stop before provider setup/logging: ${unapproved.combined}`);

  const missingAttendee = run({ CALCOM_SMOKE_APPROVED: "true", CALCOM_TEST_ATTENDEE_EMAIL: undefined });
  assert(missingAttendee.status !== 0, `Cal.com smoke should require test attendee email before live booking: ${missingAttendee.combined}`);
  assert(missingAttendee.combined.includes("CALCOM_TEST_ATTENDEE_EMAIL"), `Missing-attendee failure should be actionable: ${missingAttendee.combined}`);
  assert(!missingAttendee.combined.includes(SECRET_SENTINEL), `Missing-attendee Cal.com smoke leaked a secret sentinel: ${missingAttendee.combined}`);

  console.log("CALCOM_SMOKE_CONTRACT_OK");
}

main();
