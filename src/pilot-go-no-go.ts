import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { loadClient } from "./config.js";
import { buildVoiceAgentContractReport } from "./elevenlabs-agent-contract.js";
import { validateDeploymentReadiness, type DeploymentCheck } from "./readiness.js";

type Lane = "deployment" | "voice" | "provider-proof" | "operator-proof";
type Owner = "engineering" | "provider" | "operator" | "compliance" | "voice" | "Michael/Roxu";
type Severity = "blocker" | "warning" | "proof";

interface GoNoGoItem {
  lane: Lane;
  owner: Owner;
  severity: Severity;
  name: string;
  detail: string;
  next: string;
  command?: string;
  approvalRequired: boolean;
  sideEffect: "none" | "local-state" | "live-provider" | "provider-traffic";
}

const jsonMode = process.env.PILOT_GO_NO_GO_JSON === "true";
const outputPath = process.env.PILOT_GO_NO_GO_PATH || "tmp/tilda-ops-snapshot/pilot-go-no-go.md";
const SECRET_VALUE_PATTERNS = [
  /[A-Za-z0-9_]*KEY[A-Za-z0-9_]*\s*=\s*[^\s<*]+/i,
  /[A-Za-z0-9_]*SECRET[A-Za-z0-9_]*\s*=\s*[^\s<*]+/i,
  /[A-Za-z0-9_]*TOKEN[A-Za-z0-9_]*\s*=\s*[^\s<*]+/i,
  /DATABASE_URL\s*=\s*[^\s<*]+/i,
  /POSTGRES_URL\s*=\s*[^\s<*]+/i,
  /GOOGLE_SA_JSON\s*=\s*\{.+\}/i,
];

function assertNoSecretValues(text: string) {
  for (const pattern of SECRET_VALUE_PATTERNS) {
    if (pattern.test(text)) throw new Error(`pilot go/no-go report may contain a secret-shaped value: ${pattern}`);
  }
}

function ownerForDeployment(check: DeploymentCheck): Owner {
  const name = check.name.toLowerCase();
  if (name.includes("owner alert")) return "operator";
  if (name.includes("twilio") || name.includes("llm") || name.includes("calendar") || name.includes("google") || name.includes("cal.com") || name.includes("calcom") || name.includes("scheduling") || name.includes("webhook")) return "provider";
  if (name.includes("retention") || name.includes("privacy") || name.includes("disclosure") || name.includes("avv") || name.includes("dpa")) return "compliance";
  return "engineering";
}

function ownerForVoice(name: string): Owner {
  const lowered = name.toLowerCase();
  if (lowered.includes("disclosure") || lowered.includes("privacy") || lowered.includes("transcript") || lowered.includes("recording")) return "compliance";
  if (lowered.includes("provider") || lowered.includes("public https") || lowered.includes("post-call")) return "voice";
  return "engineering";
}

function nextForDeployment(check: DeploymentCheck): string {
  const actions: Record<string, string> = {
    "operator auth": "Set SERVER_TOOL_TOKEN in hosted secret storage before exposing operator endpoints.",
    "twilio credentials": "Configure Twilio account/API credentials and WhatsApp sender in secret storage.",
    "reviewed follow-up send approval": "Keep live reviewed follow-up sends disabled until a test number, opt-in, and approval timestamp are set.",
    "llm provider": "Configure OPENROUTER_API_KEY in hosted secret storage after provider account approval.",
    "scheduling provider": "Configure the selected booking provider: Google Calendar service account or Cal.com API key plus event type selector.",
    "scheduling runtime provider": "For Google, set USE_FAKE_CALENDAR=false. For Cal.com, keep fake-provider smokes separate from the hosted Cal.com runtime.",
    "scheduling live smoke proof": "Run the selected provider smoke and set the matching proof timestamp only after create/get/cancel cleanup succeeds.",
    "retention policy": "Set DATA_RETENTION_DAYS to the agreed first-pilot retention window.",
    "owner alert destination": "Configure ownerWhatsapp in the client YAML or accept log-only mode only for an internal hosted demo.",
    "owner alert route tested": "Run /operator/alert-test with bearer auth and set OWNER_ALERT_TESTED_AT only after delivery is confirmed.",
    "postgres database URL": "Set DATABASE_URL or POSTGRES_URL for STORE_BACKEND=postgres.",
    "store backend postgres": "Use STORE_BACKEND=postgres for a multi-worker hosted pilot.",
    "server tool token length": "Use a random SERVER_TOOL_TOKEN with at least 24 characters.",
    "public webhook https": "Set TWILIO_WEBHOOK_BASE_URL to the public HTTPS host providers call.",
    "public website operator footer": "Replace landing-page operator placeholders before provider review.",
    "public contact email": "Set TILDA_PUBLIC_CONTACT_EMAIL for the landing page footer and contact button.",
    "privacy contact email": "Set TILDA_PRIVACY_EMAIL for the landing page and privacy requests.",
    "node environment": "Set NODE_ENV=production in the hosted runtime.",
    "AVV/DPA review": "Complete AVV/DPA and subprocessor review before real client traffic.",
  };
  return actions[check.name] || check.detail;
}

function hasEnv(name: string) {
  return Boolean(process.env[name]?.trim());
}

function schedulingProviderEnv(): "google" | "calcom" {
  const raw = (process.env.SCHEDULING_PROVIDER || process.env.BOOKING_PROVIDER || "google").trim().toLowerCase();
  return raw === "calcom" || raw === "cal.com" ? "calcom" : "google";
}

function schedulingProofItem(): GoNoGoItem {
  if (schedulingProviderEnv() === "calcom") {
    return {
      lane: "provider-proof",
      owner: "provider",
      severity: "proof",
      name: "Cal.com live booking smoke",
      detail: "Cal.com scheduling demos need a real available-slot, create, get, and cancel proof against the approved test event type.",
      next: "Run only after Cal.com API key and a safe test event type are configured; confirm the fixture was cancelled unless visible proof was explicitly requested.",
      command: "npm run calcom:smoke",
      approvalRequired: true,
      sideEffect: "live-provider",
    };
  }
  return {
    lane: "provider-proof",
    owner: "provider",
    severity: "proof",
    name: "Google Calendar live booking smoke",
    detail: "Confirmed-booking demos need a real create, find, and cleanup proof on the dedicated Tilda calendar.",
    next: "Run only after service-account credentials and calendar sharing are configured for a safe dev or pilot calendar.",
    command: "USE_FAKE_CALENDAR=false npm run live-calendar:smoke",
    approvalRequired: true,
    sideEffect: "live-provider",
  };
}

function providerProofItems(): GoNoGoItem[] {
  return [
    schedulingProofItem(),
    {
      lane: "provider-proof",
      owner: "provider",
      severity: "proof",
      name: "Supabase Postgres store smoke",
      detail: "Multi-worker booking locks, retention, privacy export/delete, and idempotency need direct Postgres proof.",
      next: "Run after DATABASE_URL or POSTGRES_URL is supplied in the runtime, without printing the URL.",
      command: "npm run supabase:postgres:smoke",
      approvalRequired: true,
      sideEffect: "live-provider",
    },
    {
      lane: "provider-proof",
      owner: "provider",
      severity: "proof",
      name: "Supabase admin REST smoke",
      detail: "Server-side Supabase REST reachability is useful but does not replace the Postgres backend smoke.",
      next: "Run after SUPABASE_URL and a server-side secret key are configured in secret storage.",
      command: "npm run supabase:admin:smoke",
      approvalRequired: true,
      sideEffect: "none",
    },
    {
      lane: "provider-proof",
      owner: "voice",
      severity: "proof",
      name: "ElevenLabs voice-agent contract on public HTTPS",
      detail: "The phone agent must call the same secured one-brain tools over the hosted public URL.",
      next: "Run after deployment with VOICE_AGENT_PUBLIC_BASE_URL and SERVER_TOOL_TOKEN set.",
      command: "VOICE_AGENT_CONTRACT_JSON=true npm run voice:contract",
      approvalRequired: true,
      sideEffect: "none",
    },
    {
      lane: "provider-proof",
      owner: "operator",
      severity: "proof",
      name: "Owner alert route delivered",
      detail: "Human handoff is not pilot-ready until the configured owner/operator receives a test alert.",
      next: "POST /operator/alert-test with bearer auth, then set OWNER_ALERT_TESTED_AT after delivery is confirmed.",
      approvalRequired: true,
      sideEffect: "provider-traffic",
    },
  ];
}

function operatorProofItems(): GoNoGoItem[] {
  const configured = hasEnv("OPERATOR_DEMO_PACKET_LAST_OK") || hasEnv("OPERATOR_DEMO_PACKET_REVIEWED_AT");
  if (configured) return [];
  return [
    {
      lane: "operator-proof",
      owner: "operator",
      severity: "proof",
      name: "No-credential operator demo packet reviewed",
      detail: "The local packet proves voice post-call drafts, reviewed follow-up dry-run, fail-closed live send, privacy export, and metrics before provider setup.",
      next: "Run npm run operator:demo:packet and review the generated packet with Michael/Roxu before live-provider checks.",
      command: "npm run operator:demo:packet",
      approvalRequired: false,
      sideEffect: "local-state",
    },
  ];
}

function buildReport() {
  const client = loadClient();
  const deployment = validateDeploymentReadiness(client);
  const voice = buildVoiceAgentContractReport();
  const deploymentItems: GoNoGoItem[] = [...deployment.blockers, ...deployment.warnings].map((check) => ({
    lane: "deployment",
    owner: ownerForDeployment(check),
    severity: check.severity,
    name: check.name,
    detail: check.detail,
    next: nextForDeployment(check),
    approvalRequired: false,
    sideEffect: "none",
  }));
  const voiceItems: GoNoGoItem[] = voice.checks
    .filter((check) => !check.ok)
    .map((check) => ({
      lane: "voice",
      owner: ownerForVoice(check.name),
      severity: check.severity,
      name: check.name,
      detail: check.detail,
      next: check.next,
      approvalRequired: check.name.toLowerCase().includes("provider"),
      sideEffect: "none",
    }));
  const proofItems = [...providerProofItems(), ...operatorProofItems()];
  const blockers = [...deploymentItems, ...voiceItems].filter((item) => item.severity === "blocker");
  const warnings = [...deploymentItems, ...voiceItems].filter((item) => item.severity === "warning");
  const items = [...deploymentItems, ...voiceItems, ...proofItems];
  const go = blockers.length === 0 && proofItems.length === 0;
  return {
    marker: go ? "PILOT_GO_NO_GO_GO" : "PILOT_GO_NO_GO_NO_GO",
    generatedAt: new Date().toISOString(),
    client: client.name,
    go,
    blockerCount: blockers.length,
    warningCount: warnings.length,
    proofCount: proofItems.length,
    deploymentMarker: deployment.ok ? "DEPLOYMENT_READY" : "DEPLOYMENT_BLOCKED",
    voiceContractMarker: voice.marker,
    noSecretsPrinted: true,
    noLiveProviderCalls: true,
    outputPath,
    items,
    commands: {
      safeLocal: ["npm run operator:demo:packet", "npm run deployment:smoke", "npm run server:battletest", "npm run voice:smoke"],
      liveApprovalRequired: proofItems.filter((item) => item.approvalRequired).map((item) => item.command || item.next),
    },
  };
}

function byOwner(items: GoNoGoItem[]) {
  const owners = new Map<Owner, { owner: Owner; blockers: number; warnings: number; proofs: number; names: string[] }>();
  for (const item of items) {
    const current = owners.get(item.owner) ?? { owner: item.owner, blockers: 0, warnings: 0, proofs: 0, names: [] };
    if (item.severity === "blocker") current.blockers += 1;
    else if (item.severity === "warning") current.warnings += 1;
    else current.proofs += 1;
    current.names.push(`${item.lane}:${item.name}`);
    owners.set(item.owner, current);
  }
  return [...owners.values()].sort((a, b) => a.owner.localeCompare(b.owner));
}

function toMarkdown(report: ReturnType<typeof buildReport>) {
  const ownerLines = byOwner(report.items).map((summary) => `- ${summary.owner}: ${summary.blockers} blockers, ${summary.warnings} warnings, ${summary.proofs} proof items - ${summary.names.join(", ")}`);
  return [
    "# Tilda pilot go/no-go",
    "",
    `Generated: ${report.generatedAt}`,
    `Marker: \`${report.marker}\``,
    `Client: ${report.client}`,
    `Go: ${String(report.go)}`,
    `Blockers: ${report.blockerCount}`,
    `Warnings: ${report.warningCount}`,
    `Proof items before live pilot: ${report.proofCount}`,
    `Deployment marker: ${report.deploymentMarker}`,
    `Voice contract marker: \`${report.voiceContractMarker}\``,
    `No secrets printed: ${String(report.noSecretsPrinted)}`,
    `No live provider calls made: ${String(report.noLiveProviderCalls)}`,
    "",
    "## By owner",
    "",
    ...ownerLines,
    "",
    "## Action queue",
    "",
    ...report.items.map((item) => `- ${item.owner}/${item.severity}/${item.lane}: ${item.name} - ${item.next}${item.command ? ` Command: \`${item.command}\`.` : ""}`),
    "",
    "## Safe local commands",
    "",
    ...report.commands.safeLocal.map((command) => `- \`${command}\``),
    "",
    "## Live or approval-required proof commands",
    "",
    ...report.commands.liveApprovalRequired.map((command) => `- \`${command}\``),
    "",
    "This report is a no-credential coordination artifact. It does not call Google Calendar, Supabase/Postgres, WhatsApp, voice providers, or LLM providers.",
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
  console.log(`pilot_go_no_go_path=${outputPath}`);
}
