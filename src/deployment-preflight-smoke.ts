import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
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
  mkdirSync("tmp", { recursive: true });
  const calcomClientFile = `tmp/deployment-preflight-calcom-client-${process.pid}.yaml`;
  try {
  let out = run({ DEPLOYMENT_PREFLIGHT_JSON: "true" });
  assert(out.status !== 0, "JSON preflight should fail closed when live blockers remain");
  let body = parseJson(out.stdout);
  assert(body.marker === "DEPLOYMENT_PREFLIGHT_BLOCKED", `expected blocked marker: ${out.stdout}`);
  assert(body.ok === false, `expected ok=false: ${out.stdout}`);
  assert(body.blockerCount > 0, `expected blockers: ${out.stdout}`);
  assert(Array.isArray(body.checks) && Array.isArray(body.blockers) && Array.isArray(body.warnings), `expected machine-readable check arrays: ${out.stdout}`);
  assert(body.checks.some((check: any) => check.name === "reviewed follow-up send approval" && check.ok === true), `reviewed follow-up sending should be safe by default: ${out.stdout}`);
  assert(body.blockers.some((check: any) => check.name === "scheduling live smoke proof"), `live scheduling proof should block by default: ${out.stdout}`);
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

  out = run({ DEPLOYMENT_PREFLIGHT_JSON: "true", ALLOW_DEPLOYMENT_BLOCKERS: "true", SCHEDULING_PROVIDER: "bogus" });
  assert(out.status === 0, `unsupported scheduling provider review mode should exit 0: ${out.combined}`);
  body = parseJson(out.stdout);
  assert(
    body.blockers.some((check: any) => check.name === "scheduling provider" && /must be google or calcom/.test(check.detail)),
    `unsupported scheduling provider should be a blocker: ${out.stdout}`,
  );

  out = run({
    DEPLOYMENT_PREFLIGHT_JSON: "true",
    ALLOW_DEPLOYMENT_BLOCKERS: "true",
    SCHEDULING_PROVIDER: "calcom",
    CALCOM_API_KEY: "cal_test_preflight",
    CALCOM_EVENT_TYPE_ID: "",
    CALCOM_EVENT_TYPE_SLUG: "haircut",
    CALCOM_USERNAME: "",
    CALCOM_TEAM_SLUG: "",
  });
  assert(out.status === 0, `incomplete Cal.com selector review mode should exit 0: ${out.combined}`);
  body = parseJson(out.stdout);
  assert(
    body.blockers.some((check: any) => check.name === "scheduling provider" && /CALCOM_EVENT_TYPE_SLUG plus CALCOM_USERNAME/.test(check.detail)),
    `Cal.com slug without username/team should be a blocker: ${out.stdout}`,
  );

  out = run({
    DEPLOYMENT_PREFLIGHT_JSON: "true",
    ALLOW_DEPLOYMENT_BLOCKERS: "true",
    SCHEDULING_PROVIDER: "calcom",
    CALCOM_API_KEY: "cal_test_preflight",
    CALCOM_EVENT_TYPE_ID: "",
    CALCOM_EVENT_TYPE_SLUG: "haircut",
    CALCOM_USERNAME: "tilda-demo",
    CALCOM_TEAM_SLUG: "",
  });
  assert(out.status === 0, `complete Cal.com selector review mode should exit 0: ${out.combined}`);
  body = parseJson(out.stdout);
  assert(
    body.checks.some((check: any) => check.name === "scheduling provider" && check.ok === true),
    `Cal.com API key plus slug and username should satisfy scheduling provider readiness: ${out.stdout}`,
  );
  assert(
    body.checks.some((check: any) => check.name === "scheduling runtime provider" && check.ok === true && /calcom/.test(check.detail)),
    `Cal.com deployment should not be blocked by USE_FAKE_CALENDAR: ${out.stdout}`,
  );
  assert(
    body.blockers.some((check: any) => check.name === "scheduling live smoke proof" && /calcom:smoke/.test(check.detail)),
    `Cal.com deployment should require Cal.com live smoke proof: ${out.stdout}`,
  );

  out = run({
    DEPLOYMENT_PREFLIGHT_JSON: "true",
    ALLOW_DEPLOYMENT_BLOCKERS: "true",
    SCHEDULING_PROVIDER: "calcom",
    CALCOM_API_KEY: "cal_test_preflight",
    CALCOM_EVENT_TYPE_SLUG: "haircut",
    CALCOM_USERNAME: "tilda-demo",
    CALCOM_SMOKE_TESTED_AT: "not-a-timestamp",
  });
  assert(out.status === 0, `invalid Cal.com timestamp review mode should exit 0: ${out.combined}`);
  body = parseJson(out.stdout);
  assert(
    body.blockers.some((check: any) => check.name === "scheduling live smoke proof" && check.ok === false && /valid ISO proof timestamp/.test(check.detail)),
    `invalid CALCOM_SMOKE_TESTED_AT should not satisfy live smoke proof: ${out.stdout}`,
  );

  out = run({
    DEPLOYMENT_PREFLIGHT_JSON: "true",
    ALLOW_DEPLOYMENT_BLOCKERS: "true",
    SCHEDULING_PROVIDER: "calcom",
    CALCOM_API_KEY: "cal_test_preflight",
    CALCOM_EVENT_TYPE_ID: "",
    CALCOM_EVENT_TYPE_SLUG: "haircut",
    CALCOM_USERNAME: "tilda-demo",
    CALCOM_TEAM_SLUG: "",
    CALCOM_SMOKE_TESTED_AT: "2026-07-01T08:00:00Z",
  });
  assert(out.status === 0, `Cal.com smoke-proof review mode should exit 0: ${out.combined}`);
  body = parseJson(out.stdout);
  assert(
    body.checks.some((check: any) => check.name === "scheduling live smoke proof" && check.ok === true),
    `CALCOM_SMOKE_TESTED_AT should satisfy live smoke proof: ${out.stdout}`,
  );

  writeFileSync(
    calcomClientFile,
    `name: "Cal.com Readiness Test"\ntimezone: "Europe/Berlin"\nlanguage: "de"\ncalendarId: "demo@example.com"\ncalcom:\n  defaultEventType:\n    eventTypeSlug: "haircut"\n    username: "tilda-demo"\n    durationMin: 60\nownerWhatsapp: ""\naiDisclosureText: "Hallo, hier ist Tilda. Ich bin die KI-Rezeption."\nprivacyContact: "privacy@example.com"\nhours:\n  days: [1, 2, 3, 4, 5]\n  open: "09:00"\n  close: "18:00"\nservices:\n  - name: "Damenhaarschnitt"\n    durationMin: 60\n    price: "ab 45 €"\nfaq: []\ntone: "Warm and short."\n`,
  );
  out = run({
    DEPLOYMENT_PREFLIGHT_JSON: "true",
    ALLOW_DEPLOYMENT_BLOCKERS: "true",
    CLIENT_FILE: calcomClientFile,
    SCHEDULING_PROVIDER: "calcom",
    CALCOM_API_KEY: "cal_test_preflight",
    CALCOM_EVENT_TYPE_ID: "",
    CALCOM_EVENT_TYPE_SLUG: "",
    CALCOM_USERNAME: "",
    CALCOM_TEAM_SLUG: "",
  });
  assert(out.status === 0, `client YAML Cal.com selector review mode should exit 0: ${out.combined}`);
  body = parseJson(out.stdout);
  assert(
    body.checks.some((check: any) => check.name === "scheduling provider" && check.ok === true && /client YAML/.test(check.detail)),
    `complete client YAML Cal.com selector should satisfy scheduling provider readiness: ${out.stdout}`,
  );

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
  } finally {
    rmSync(calcomClientFile, { force: true });
  }
}

main();
