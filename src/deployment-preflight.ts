import { existsSync } from "node:fs";
import { loadClient, validateLivePilotReadiness, type ReadinessGate } from "./config.js";

interface Check {
  name: string;
  ok: boolean;
  severity: "blocker" | "warning";
  detail: string;
}

function hasEnv(name: string) {
  return Boolean(process.env[name]?.trim());
}

function envEquals(name: string, value: string) {
  return process.env[name] === value;
}

function checkFile(path: string): Check {
  return {
    name: `file:${path}`,
    ok: existsSync(path),
    severity: "blocker",
    detail: `${path} must exist in the deployment artifact.`,
  };
}

function fromReadinessGate(gate: ReadinessGate): Check {
  return { name: gate.name, ok: gate.ok, severity: gate.severity, detail: gate.detail };
}

function printCheck(check: Check) {
  const marker = check.ok ? "ok" : check.severity;
  console.log(`${marker.toUpperCase()} ${check.name}: ${check.detail}`);
}

function deploymentChecks(): Check[] {
  const cfg = loadClient();
  const readiness = validateLivePilotReadiness(cfg).gates.map(fromReadinessGate);
  const checks: Check[] = [
    ...readiness,
    checkFile("clients/salon-demo.yaml"),
    checkFile("docs/live-provider-demo.md"),
    checkFile("docs/deployment-readiness.md"),
    {
      name: "client config path",
      ok: (process.env.CLIENT_FILE || "clients/salon-demo.yaml") === "clients/salon-demo.yaml",
      severity: "warning",
      detail: "CLIENT_FILE should point at clients/salon-demo.yaml for the current Tilda pilot demo.",
    },
    {
      name: "fake calendar disabled",
      ok: envEquals("USE_FAKE_CALENDAR", "false"),
      severity: "blocker",
      detail: "USE_FAKE_CALENDAR=false is required for a live deployment. Fake calendar is only for no-credential demos and CI checks.",
    },
    {
      name: "postgres database URL",
      ok: hasEnv("DATABASE_URL") || hasEnv("POSTGRES_URL"),
      severity: "blocker",
      detail: "DATABASE_URL or POSTGRES_URL must be set for STORE_BACKEND=postgres.",
    },
    {
      name: "store backend postgres",
      ok: envEquals("STORE_BACKEND", "postgres"),
      severity: "blocker",
      detail: "STORE_BACKEND=postgres is required for a multi-worker live pilot. JSON state is demo-only.",
    },
    {
      name: "server tool token length",
      ok: (process.env.SERVER_TOOL_TOKEN?.trim().length ?? 0) >= 24,
      severity: "blocker",
      detail: "SERVER_TOOL_TOKEN should be a non-trivial secret of at least 24 characters.",
    },
    {
      name: "node environment",
      ok: process.env.NODE_ENV === "production",
      severity: "warning",
      detail: "NODE_ENV=production should be set in the hosted runtime.",
    },
    {
      name: "public webhook https",
      ok: /^https:\/\//.test(process.env.TWILIO_WEBHOOK_BASE_URL || ""),
      severity: "blocker",
      detail: "TWILIO_WEBHOOK_BASE_URL must be the public HTTPS base URL used by Twilio signature validation.",
    },
  ];

  return checks;
}

function main() {
  const checks = deploymentChecks();
  const blockers = checks.filter((check) => !check.ok && check.severity === "blocker");
  const warnings = checks.filter((check) => !check.ok && check.severity === "warning");

  console.log("DEPLOYMENT_PREFLIGHT_START");
  for (const check of checks) printCheck(check);
  console.log(`deployment_blockers=${blockers.length}`);
  console.log(`deployment_warnings=${warnings.length}`);

  if (blockers.length > 0) {
    console.log("DEPLOYMENT_PREFLIGHT_BLOCKED");
    if (process.env.ALLOW_DEPLOYMENT_BLOCKERS === "true") {
      console.log("DEPLOYMENT_PREFLIGHT_REVIEW_ONLY");
      return;
    }
    process.exit(1);
  }

  console.log(warnings.length > 0 ? "DEPLOYMENT_PREFLIGHT_OK_WITH_WARNINGS" : "DEPLOYMENT_PREFLIGHT_OK");
}

main();
