import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const jsonMode = process.env.HOSTING_HANDOFF_JSON === "true";
const outputPath = process.env.HOSTING_HANDOFF_PATH || "tmp/tilda-ops-snapshot/hosting-handoff.md";

type TargetId = "hetzner-vps" | "render" | "fly";
type Owner = "Michael" | "Roxu" | "engineering";
type StepKind = "host" | "env" | "smoke" | "provider-routing" | "rollback";
type Safety = "safe-local" | "credential-required" | "provider-config";

interface HostingStep {
  kind: StepKind;
  owner: Owner;
  name: string;
  command?: string;
  expectedMarker?: string;
  envNames: string[];
  safety: Safety;
  done: boolean | "manual";
  next: string;
}

interface HostingTarget {
  id: TargetId;
  label: string;
  recommendation: "first-choice" | "acceptable" | "later";
  why: string;
  risk: string;
  steps: HostingStep[];
}

const SECRET_VALUE_PATTERNS = [
  /[A-Za-z0-9_]*KEY[A-Za-z0-9_]*\s*=\s*[^\s<*]+/i,
  /[A-Za-z0-9_]*SECRET[A-Za-z0-9_]*\s*=\s*[^\s<*]+/i,
  /[A-Za-z0-9_]*TOKEN[A-Za-z0-9_]*\s*=\s*[^\s<*]+/i,
  /DATABASE_URL\s*=\s*[^\s<*]+/i,
  /POSTGRES_URL\s*=\s*[^\s<*]+/i,
  /GOOGLE_SA_JSON\s*=\s*\{.+\}/i,
];

function hasEnv(name: string) {
  return Boolean(process.env[name]?.trim());
}

function isConfigured(envNames: string[]) {
  if (envNames.length === 0) return false;
  return envNames.every(hasEnv);
}

function envDone(envNames: string[]) {
  return envNames.length > 0 ? isConfigured(envNames) : "manual";
}

function commonSteps(target: TargetId): HostingStep[] {
  return [
    {
      kind: "host",
      owner: "Michael",
      name: "Public HTTPS backend URL assigned",
      envNames: ["TWILIO_WEBHOOK_BASE_URL"],
      safety: "credential-required",
      done: hasEnv("TWILIO_WEBHOOK_BASE_URL"),
      next: "Point the chosen host at the Node app and set TWILIO_WEBHOOK_BASE_URL to the public HTTPS base URL.",
    },
    {
      kind: "env",
      owner: "engineering",
      name: "Core safety env loaded in host secret storage",
      envNames: ["NODE_ENV", "SERVER_TOOL_TOKEN", "DATA_RETENTION_DAYS", "STORE_BACKEND", "DATABASE_URL"],
      safety: "credential-required",
      done: isConfigured(["NODE_ENV", "SERVER_TOOL_TOKEN", "DATA_RETENTION_DAYS", "STORE_BACKEND"]) && (hasEnv("DATABASE_URL") || hasEnv("POSTGRES_URL")),
      next: "Load production env through the host secret manager, not a committed env file.",
    },
    {
      kind: "smoke",
      owner: "engineering",
      name: "No-credential local deployment smoke passed before host deploy",
      command: "npm run deployment:smoke",
      expectedMarker: "DEPLOYMENT_SMOKE_OK",
      envNames: [],
      safety: "safe-local",
      done: "manual",
      next: "Run the local fake-provider deployment smoke before changing provider routes.",
    },
    {
      kind: "smoke",
      owner: "engineering",
      name: "Hosted preflight returns machine-readable readiness",
      command: "ALLOW_DEPLOYMENT_BLOCKERS=true DEPLOYMENT_PREFLIGHT_JSON=true npm run deployment:preflight",
      expectedMarker: "DEPLOYMENT_PREFLIGHT_REVIEW_ONLY or DEPLOYMENT_PREFLIGHT_OK",
      envNames: [],
      safety: "safe-local",
      done: "manual",
      next: "Run this on the host after env is loaded; review blockers before routing provider webhooks.",
    },
    {
      kind: "provider-routing",
      owner: "Roxu",
      name: "Provider webhook and outbound WhatsApp routing held until hosted smoke passes",
      envNames: ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_API_KEY_SID", "TWILIO_API_KEY_SECRET", "TWILIO_WHATSAPP_FROM"],
      safety: "provider-config",
      done: envDone(["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_API_KEY_SID", "TWILIO_API_KEY_SECRET", "TWILIO_WHATSAPP_FROM"]),
      next: "Do not point Twilio, ElevenLabs, or WhatsApp provider traffic at the host until health, readiness, and signature checks pass.",
    },
    {
      kind: "rollback",
      owner: "engineering",
      name: "Rollback path documented for selected host",
      envNames: [],
      safety: "safe-local",
      done: "manual",
      next: target === "hetzner-vps" ? "Keep the previous systemd release directory and switch the service symlink back if health fails." : target === "render" ? "Keep the previous Render deploy available and roll back from the dashboard if health fails." : "Keep the previous Fly release available and roll back with fly releases rollback if health fails.",
    },
  ];
}

function buildTargets(): HostingTarget[] {
  return [
    {
      id: "hetzner-vps",
      label: "Hetzner VPS Node service",
      recommendation: "first-choice",
      why: "Best fit for German/EU hosting control, predictable cost, and a simple long-running Node backend for provider webhooks.",
      risk: "Needs engineering-owned process management, logs, HTTPS reverse proxy, backups, and patching discipline.",
      steps: commonSteps("hetzner-vps"),
    },
    {
      id: "render",
      label: "Render web service",
      recommendation: "acceptable",
      why: "Fastest low-ops hosted demo path if EU region, secret storage, and wake behavior are acceptable for the pilot demo.",
      risk: "Region, cold-start, and account ownership details must be checked before real customer traffic.",
      steps: commonSteps("render"),
    },
    {
      id: "fly",
      label: "Fly.io app",
      recommendation: "later",
      why: "Good deploy and rollback primitives, but more moving parts than needed for the first Tilda provider-review backend.",
      risk: "Requires Fly account setup, regions, secrets, and release operations before it is less work than the VPS path.",
      steps: commonSteps("fly"),
    },
  ];
}

function assertNoSecretValues(text: string) {
  for (const pattern of SECRET_VALUE_PATTERNS) {
    if (pattern.test(text)) throw new Error(`hosting handoff may contain a secret-shaped value: ${pattern}`);
  }
}

function selectedTarget(targets: HostingTarget[]) {
  const requested = (process.env.HOSTING_TARGET || "hetzner-vps").trim().toLowerCase();
  return targets.find((target) => target.id === requested) ?? targets[0];
}

function buildReport() {
  const targets = buildTargets();
  const selected = selectedTarget(targets);
  const selectedMissing = selected.steps.filter((step) => step.done !== true).length;
  return {
    marker: "HOSTING_HANDOFF_OK",
    generatedAt: new Date().toISOString(),
    selectedTarget: selected.id,
    selectedLabel: selected.label,
    selectedMissingItems: selectedMissing,
    targetCount: targets.length,
    noSecretsPrinted: true,
    noLiveProviderCalls: true,
    outputPath,
    recommendation: selected.recommendation,
    targets,
  };
}

function toMarkdown(report: ReturnType<typeof buildReport>) {
  const selected = report.targets.find((target) => target.id === report.selectedTarget)!;
  return [
    "# Tilda hosting handoff",
    "",
    `Generated: ${report.generatedAt}`,
    `Marker: \`${report.marker}\``,
    `Selected target: ${selected.label}`,
    `Recommendation: ${selected.recommendation}`,
    `Missing or manual selected-target items: ${report.selectedMissingItems}`,
    `No secrets printed: ${String(report.noSecretsPrinted)}`,
    `No live provider calls made: ${String(report.noLiveProviderCalls)}`,
    "",
    "## Recommendation",
    "",
    `${selected.why} Risk: ${selected.risk}`,
    "",
    "## Selected target checklist",
    "",
    ...selected.steps.map((step) => `- ${step.owner}/${step.kind}: ${step.name}. Status: ${String(step.done)}. Next: ${step.next}${step.command ? ` Command: \`${step.command}\`.` : ""}${step.expectedMarker ? ` Marker: \`${step.expectedMarker}\`.` : ""}`),
    "",
    "## Target options",
    "",
    ...report.targets.map((target) => `- ${target.label}: ${target.recommendation}. ${target.why}`),
    "",
    "This report is no-credential. It does not deploy, route provider traffic, call live providers, or print secret values.",
    "",
  ].join("\n");
}

const report = buildReport();
const markdown = toMarkdown(report);
const json = JSON.stringify(report, null, 2);
assertNoSecretValues(markdown);
assertNoSecretValues(json);
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, markdown);

if (jsonMode) console.log(json);
else {
  console.log(markdown);
  console.log(`hosting_handoff_path=${outputPath}`);
}
