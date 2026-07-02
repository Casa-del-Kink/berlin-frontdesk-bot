import { existsSync } from "node:fs";
import { loadClient, validateLivePilotReadiness, type Client, type ReadinessGate } from "./config.js";

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

function validTimestampEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp);
}

function anyValidTimestampEnv(names: string[]) {
  return names.some(validTimestampEnv);
}

function envEquals(name: string, value: string) {
  return process.env[name] === value;
}

function schedulingProviderEnv(): "google" | "calcom" | "unsupported" {
  const raw = (process.env.SCHEDULING_PROVIDER || process.env.BOOKING_PROVIDER || "google").trim().toLowerCase();
  if (raw === "calcom" || raw === "cal.com") return "calcom";
  if (raw === "google" || raw === "google_calendar" || raw === "calendar") return "google";
  return "unsupported";
}

function schedulingRuntimeCheck(): DeploymentCheck {
  const provider = schedulingProviderEnv();
  if (provider === "calcom") {
    return {
      name: "scheduling runtime provider",
      ok: true,
      severity: "blocker",
      detail: "SCHEDULING_PROVIDER=calcom selected. Cal.com owns booking conflicts; USE_FAKE_CALENDAR is ignored for live scheduling but local fake-provider smokes remain separate.",
    };
  }
  if (provider === "google") {
    return {
      name: "scheduling runtime provider",
      ok: envEquals("USE_FAKE_CALENDAR", "false"),
      severity: "blocker",
      detail: "SCHEDULING_PROVIDER=google requires USE_FAKE_CALENDAR=false for live deployment. Fake calendar is only for no-credential demos and CI checks.",
    };
  }
  return {
    name: "scheduling runtime provider",
    ok: false,
    severity: "blocker",
    detail: "SCHEDULING_PROVIDER must be google or calcom before live deployment.",
  };
}

function schedulingLiveSmokeCheck(): DeploymentCheck {
  const provider = schedulingProviderEnv();
  if (provider === "calcom") {
    return {
      name: "scheduling live smoke proof",
      ok: validTimestampEnv("CALCOM_SMOKE_TESTED_AT"),
      severity: "blocker",
      detail: "Run CALCOM_SMOKE_APPROVED=true npm run calcom:smoke against the approved Cal.com test event type, verify create/get/cancel cleanup, then set CALCOM_SMOKE_TESTED_AT to a valid ISO proof timestamp in the hosted runtime.",
    };
  }
  if (provider === "google") {
    return {
      name: "scheduling live smoke proof",
      ok: anyValidTimestampEnv(["GOOGLE_CALENDAR_SMOKE_TESTED_AT", "LIVE_CALENDAR_SMOKE_TESTED_AT"]),
      severity: "blocker",
      detail: "Run USE_FAKE_CALENDAR=false npm run live-calendar:smoke against the approved dev/pilot calendar, verify fixture cleanup or visible-proof mode, then set LIVE_CALENDAR_SMOKE_TESTED_AT or GOOGLE_CALENDAR_SMOKE_TESTED_AT to a valid ISO proof timestamp.",
    };
  }
  return {
    name: "scheduling live smoke proof",
    ok: false,
    severity: "blocker",
    detail: "A live scheduling smoke proof is required after choosing SCHEDULING_PROVIDER=google or calcom.",
  };
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
    schedulingRuntimeCheck(),
    schedulingLiveSmokeCheck(),
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
    voiceWebhookSecretCheck(),
  ];
}

function voiceConfigured(): boolean {
  return hasEnv("VOICE_AGENT_PUBLIC_BASE_URL") || hasEnv("ELEVENLABS_AGENT_ID");
}

function voiceWebhookSecretCheck(): DeploymentCheck {
  return {
    name: "voice post-call webhook secret",
    ok: !voiceConfigured() || hasEnv("ELEVENLABS_WEBHOOK_SECRET"),
    severity: "warning",
    detail: "Voice is configured (VOICE_AGENT_PUBLIC_BASE_URL or ELEVENLABS_AGENT_ID is set) but ELEVENLABS_WEBHOOK_SECRET is not. Real ElevenLabs post-call deliveries authenticate only via the elevenlabs-signature HMAC header (no bearer token is sent), so /webhook/voice/post-call cannot authenticate them until ELEVENLABS_WEBHOOK_SECRET is set.",
  };
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
