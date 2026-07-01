import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { loadClient } from "./config.js";
import { buildVoiceAgentContractReport, type VoiceAgentContractCheck } from "./elevenlabs-agent-contract.js";
import { validateDeploymentReadiness, type DeploymentCheck } from "./readiness.js";

type Owner = "engineering" | "provider" | "operator" | "compliance" | "voice";
type Status = "blocker" | "warning";

interface ReadinessItem {
  owner: Owner;
  severity: Status;
  name: string;
  action: string;
  detail: string;
  source: "deployment" | "voice-agent";
}

interface OwnerSummary {
  owner: Owner;
  blockerCount: number;
  warningCount: number;
  names: string[];
}

type SchedulingProvider = "google" | "calcom";

const reviewOnly = process.env.ALLOW_OPERATOR_READINESS_BUNDLE_BLOCKERS === "true";
const jsonMode = process.env.OPERATOR_READINESS_BUNDLE_JSON === "true";
const outputPath = process.env.OPERATOR_READINESS_BUNDLE_PATH || "tmp/tilda-ops-snapshot/operator-readiness-bundle.md";

function ownerFor(check: DeploymentCheck): Owner {
  const name = check.name.toLowerCase();
  if (name.includes("owner alert")) return "operator";
  if (name.includes("twilio") || name.includes("llm") || name.includes("calendar") || name.includes("google") || name.includes("cal.com") || name.includes("calcom") || name.includes("scheduling")) return "provider";
  if (name.includes("retention") || name.includes("privacy") || name.includes("disclosure") || name.includes("avv") || name.includes("dpa")) return "compliance";
  return "engineering";
}

function activeSchedulingProvider(): SchedulingProvider {
  const raw = (process.env.SCHEDULING_PROVIDER || process.env.BOOKING_PROVIDER || "google").trim().toLowerCase();
  return raw === "calcom" || raw === "cal.com" ? "calcom" : "google";
}

function activeSchedulingProofCommands(provider: SchedulingProvider) {
  return provider === "calcom" ? ["CALCOM_SMOKE_APPROVED=true npm run calcom:smoke"] : ["USE_FAKE_CALENDAR=false npm run live-calendar:smoke"];
}

function nextAction(check: DeploymentCheck): string {
  const actions: Record<string, string> = {
    "operator auth": "Set a long SERVER_TOOL_TOKEN in hosted secret storage before exposing operator endpoints.",
    "twilio credentials": "Configure Twilio account/API credentials and WhatsApp sender in secret storage.",
    "reviewed follow-up send approval": "Keep ENABLE_REVIEWED_FOLLOWUP_SEND unset unless reviewed WhatsApp follow-up sending is approved, then set FOLLOWUP_SEND_REVIEWED_AT to the approval timestamp.",
    "llm provider": "Configure OPENROUTER_API_KEY in hosted secret storage.",
    "scheduling provider": "Configure the selected booking provider: Google Calendar service account or Cal.com API key plus event type selector.",
    "scheduling runtime provider": "For Google, set USE_FAKE_CALENDAR=false. For Cal.com, keep fake-provider smokes separate from the hosted Cal.com runtime.",
    "scheduling live smoke proof": "Run the selected provider smoke and set the matching proof timestamp after cleanup is verified.",
    "retention policy": "Set DATA_RETENTION_DAYS to the agreed first-pilot retention window and align it with the privacy notice.",
    "owner alert destination": "Configure ownerWhatsapp in the client YAML, or deliberately accept log-only alerts for an internal hosted demo.",
    "owner alert route tested": "Run the protected /operator/alert-test route and set OWNER_ALERT_TESTED_AT after delivery is confirmed.",
    "postgres database URL": "Set DATABASE_URL or POSTGRES_URL for STORE_BACKEND=postgres.",
    "store backend postgres": "Use STORE_BACKEND=postgres for a multi-worker hosted pilot.",
    "server tool token length": "Use a random SERVER_TOOL_TOKEN with at least 24 characters.",
    "public webhook https": "Set TWILIO_WEBHOOK_BASE_URL to the public HTTPS host used by provider webhooks.",
    "public webhook base": "Confirm TWILIO_WEBHOOK_BASE_URL matches the public URL providers sign and call.",
    "node environment": "Set NODE_ENV=production in the hosted runtime.",
    "AVV/DPA review": "Complete AVV/DPA and subprocessor review before real client traffic.",
  };
  return actions[check.name] || check.detail;
}

function voiceOwnerFor(check: VoiceAgentContractCheck): Owner {
  const name = check.name.toLowerCase();
  if (name.includes("disclosure") || name.includes("privacy") || name.includes("transcript") || name.includes("recording")) return "compliance";
  if (name.includes("provider") || name.includes("public https") || name.includes("post-call")) return "voice";
  if (name.includes("bearer") || name.includes("documentation")) return "engineering";
  return "voice";
}

function readinessItemLabel(item: ReadinessItem) {
  return item.source === "voice-agent" ? `voice-agent:${item.name}` : item.name;
}

function summarize(items: ReadinessItem[]): OwnerSummary[] {
  const grouped = new Map<Owner, OwnerSummary>();
  for (const check of items) {
    const owner = check.owner;
    const summary = grouped.get(owner) ?? { owner, blockerCount: 0, warningCount: 0, names: [] };
    if (check.severity === "blocker") summary.blockerCount += 1;
    else summary.warningCount += 1;
    summary.names.push(readinessItemLabel(check));
    grouped.set(owner, summary);
  }
  return [...grouped.values()].sort((a, b) => a.owner.localeCompare(b.owner));
}

function lineForSummary(summary: OwnerSummary) {
  const parts = [];
  if (summary.blockerCount) parts.push(`${summary.blockerCount} blockers`);
  if (summary.warningCount) parts.push(`${summary.warningCount} warnings`);
  return `${summary.owner}: ${parts.join(", ")} — ${summary.names.join(", ")}`;
}

function buildReport() {
  const readiness = validateDeploymentReadiness(loadClient());
  const voice = buildVoiceAgentContractReport();
  const schedulingProvider = activeSchedulingProvider();
  const schedulingProofCommands = activeSchedulingProofCommands(schedulingProvider);
  const deploymentFailed: ReadinessItem[] = [...readiness.blockers, ...readiness.warnings].map((check) => ({
    owner: ownerFor(check),
    severity: check.severity as Status,
    name: check.name,
    action: nextAction(check),
    detail: check.detail,
    source: "deployment",
  }));
  const voiceFailed: ReadinessItem[] = voice.checks
    .filter((check) => !check.ok)
    .map((check) => ({ owner: voiceOwnerFor(check), severity: check.severity as Status, name: check.name, action: check.next, detail: check.detail, source: "voice-agent" }));
  const failed = [...deploymentFailed, ...voiceFailed];
  const voiceBlockerCount = voice.checks.filter((check) => !check.ok && check.severity === "blocker").length;
  const voiceWarningCount = voice.checks.filter((check) => !check.ok && check.severity === "warning").length;
  const blockerCount = readiness.blockers.length + voiceBlockerCount;
  const warningCount = readiness.warnings.length + voiceWarningCount;
  const marker = blockerCount > 0 ? (reviewOnly ? "OPERATOR_READINESS_BUNDLE_REVIEW_ONLY" : "OPERATOR_READINESS_BUNDLE_BLOCKED") : warningCount > 0 ? "OPERATOR_READINESS_BUNDLE_OK_WITH_WARNINGS" : "OPERATOR_READINESS_BUNDLE_OK";
  return {
    marker,
    generatedAt: new Date().toISOString(),
    client: loadClient().name,
    ok: blockerCount === 0,
    blockerCount,
    warningCount,
    deploymentBlockerCount: readiness.blockers.length,
    deploymentWarningCount: readiness.warnings.length,
    voiceBlockerCount,
    voiceWarningCount,
    voiceContractMarker: voice.marker,
    activeSchedulingProvider: schedulingProvider,
    activeSchedulingProofCommands: schedulingProofCommands,
    ownerSummaries: summarize(failed),
    nextActions: failed,
    safeCommands: [
      "npm run typecheck",
      "npm run style:guard",
      "npm run deployment:smoke",
      "npm run deployment:preflight:smoke",
      "npm run operator:readiness:bundle:smoke",
      "npm run voice:smoke",
      "npm run voice:contract:smoke",
      "npm run server:battletest",
    ],
    liveCommandsRequireApproval: [
      ...schedulingProofCommands,
      "npm run supabase:postgres:smoke",
      "VOICE_AGENT_PUBLIC_BASE_URL=https://<public-host> SERVER_TOOL_TOKEN=*** VOICE_AGENT_CONTRACT_JSON=true npm run voice:contract",
    ],
  };
}

function toMarkdown(report: ReturnType<typeof buildReport>) {
  return [
    "# Tilda operator readiness bundle",
    "",
    `Generated: ${report.generatedAt}`,
    `Marker: \`${report.marker}\``,
    `Client: ${report.client}`,
    `Blockers: ${report.blockerCount}`,
    `Warnings: ${report.warningCount}`,
    `Deployment blockers/warnings: ${report.deploymentBlockerCount}/${report.deploymentWarningCount}`,
    `Voice-agent blockers/warnings: ${report.voiceBlockerCount}/${report.voiceWarningCount}`,
    `Voice-agent contract marker: \`${report.voiceContractMarker}\``,
    `Active scheduling provider: ${report.activeSchedulingProvider}`,
    `Active scheduling proof commands: ${report.activeSchedulingProofCommands.map((command) => `\`${command}\``).join(", ")}`,
    "",
    "## Blockers and warnings by owner",
    "",
    ...report.ownerSummaries.map((summary) => `- ${lineForSummary(summary)}`),
    "",
    "## Next actions",
    "",
    ...report.nextActions.map((item) => `- ${item.owner}/${item.severity}: ${readinessItemLabel(item)} — ${item.action}`),
    "",
    "## Safe commands before live provider checks",
    "",
    ...report.safeCommands.map((command) => `- \`${command}\``),
    "",
    "## Live commands requiring approval/credentials",
    "",
    ...report.liveCommandsRequireApproval.map((command) => `- \`${command}\``),
    "",
    "## Operator note",
    "",
    "This bundle is report-only. It does not run live Google Calendar, Supabase/Postgres, WhatsApp, or voice-provider checks by itself.",
    "",
  ].join("\n");
}

const report = buildReport();
const markdown = toMarkdown(report);
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, markdown);

if (jsonMode) {
  console.log(JSON.stringify({ ...report, outputPath }, null, 2));
} else {
  console.log(markdown);
  console.log(`operator_readiness_bundle_path=${outputPath}`);
}

if (report.blockerCount > 0 && !reviewOnly) process.exit(1);
