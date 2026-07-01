import { existsSync } from "node:fs";
import { loadClient, validateLivePilotReadiness, type Client, type ReadinessGate } from "./config.js";
import { hasOperatorPlaceholders, landingOperatorFromEnv } from "./landing.js";

export interface DeploymentCheck {
  name: string;
  ok: boolean;
  severity: "blocker" | "warning";
  detail: string;
}

export interface DeploymentReadiness {
  ok: boolean;
  generatedAt: string;
  checks: DeploymentCheck[];
  blockers: DeploymentCheck[];
  warnings: DeploymentCheck[];
}

function hasEnv(name: string) {
  return Boolean(process.env[name]?.trim());
}

function envEquals(name: string, value: string) {
  return process.env[name] === value;
}

function checkFile(path: string): DeploymentCheck {
  return {
    name: `file:${path}`,
    ok: existsSync(path),
    severity: "blocker",
    detail: `${path} must exist in the deployment artifact.`,
  };
}

function fromReadinessGate(gate: ReadinessGate): DeploymentCheck {
  return { name: gate.name, ok: gate.ok, severity: gate.severity, detail: gate.detail };
}

export function deploymentChecks(cfg: Client = loadClient()): DeploymentCheck[] {
  const readiness = validateLivePilotReadiness(cfg).gates.map(fromReadinessGate);
  const landingOperator = landingOperatorFromEnv();
  return [
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
      name: "public website operator footer",
      ok: !hasOperatorPlaceholders(landingOperator),
      severity: "blocker",
      detail: "TILDA_OPERATOR_LEGAL_NAME, TILDA_PUBLIC_CONTACT_EMAIL, and TILDA_PRIVACY_EMAIL must replace placeholders before Twilio/provider review.",
    },
    {
      name: "public contact email",
      ok: /@/.test(landingOperator.contactEmail),
      severity: "blocker",
      detail: "TILDA_PUBLIC_CONTACT_EMAIL must be a public contact email for the landing page footer and contact button.",
    },
    {
      name: "privacy contact email",
      ok: /@/.test(landingOperator.privacyEmail),
      severity: "blocker",
      detail: "TILDA_PRIVACY_EMAIL must be a privacy/admin email shown on the public landing page.",
    },
    {
      name: "public webhook https",
      ok: /^https:\/\//.test(process.env.TWILIO_WEBHOOK_BASE_URL || ""),
      severity: "blocker",
      detail: "TWILIO_WEBHOOK_BASE_URL must be the public HTTPS base URL used by Twilio signature validation.",
    },
  ];
}

export function validateDeploymentReadiness(cfg: Client = loadClient()): DeploymentReadiness {
  const checks = deploymentChecks(cfg);
  const blockers = checks.filter((check) => !check.ok && check.severity === "blocker");
  const warnings = checks.filter((check) => !check.ok && check.severity === "warning");
  return {
    ok: blockers.length === 0,
    generatedAt: new Date().toISOString(),
    checks,
    blockers,
    warnings,
  };
}

export function assertDeploymentReadiness(cfg: Client = loadClient()) {
  const readiness = validateDeploymentReadiness(cfg);
  if (!readiness.ok) {
    const blockers = readiness.blockers.map((check) => `${check.name}: ${check.detail}`);
    throw new Error(`Deployment readiness blockers:\n- ${blockers.join("\n- ")}`);
  }
}

export function printDeploymentCheck(check: DeploymentCheck) {
  const marker = check.ok ? "ok" : check.severity;
  console.log(`${marker.toUpperCase()} ${check.name}: ${check.detail}`);
}
