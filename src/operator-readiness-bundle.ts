import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { loadClient } from "./config.js";
import { validateDeploymentReadiness, type DeploymentCheck } from "./readiness.js";

type Owner = "engineering" | "provider" | "operator" | "compliance";
type Status = "blocker" | "warning";

interface OwnerSummary {
  owner: Owner;
  blockerCount: number;
  warningCount: number;
  names: string[];
}

const reviewOnly = process.env.ALLOW_OPERATOR_READINESS_BUNDLE_BLOCKERS === "true";
const jsonMode = process.env.OPERATOR_READINESS_BUNDLE_JSON === "true";
const outputPath = process.env.OPERATOR_READINESS_BUNDLE_PATH || "tmp/tilda-ops-snapshot/operator-readiness-bundle.md";

function ownerFor(check: DeploymentCheck): Owner {
  const name = check.name.toLowerCase();
  if (name.includes("owner alert")) return "operator";
  if (name.includes("twilio") || name.includes("llm") || name.includes("calendar") || name.includes("google")) return "provider";
  if (name.includes("retention") || name.includes("privacy") || name.includes("disclosure") || name.includes("avv") || name.includes("dpa")) return "compliance";
  return "engineering";
}

function nextAction(check: DeploymentCheck): string {
  const actions: Record<string, string> = {
    "operator auth": "Set a long SERVER_TOOL_TOKEN in hosted secret storage before exposing operator endpoints.",
    "twilio credentials": "Configure Twilio account/API credentials and WhatsApp sender in secret storage.",
    "llm provider": "Configure OPENROUTER_API_KEY in hosted secret storage.",
    "calendar provider": "Set USE_FAKE_CALENDAR=false and configure Google service-account calendar access.",
    "retention policy": "Set DATA_RETENTION_DAYS to the agreed first-pilot retention window and align it with the privacy notice.",
    "owner alert destination": "Configure ownerWhatsapp in the client YAML, or deliberately accept log-only alerts for an internal hosted demo.",
    "owner alert route tested": "Run the protected /operator/alert-test route and set OWNER_ALERT_TESTED_AT after delivery is confirmed.",
    "fake calendar disabled": "Use fake calendar only for local demos. Disable it for approved live-provider demos or pilots.",
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

function summarize(checks: DeploymentCheck[]): OwnerSummary[] {
  const grouped = new Map<Owner, OwnerSummary>();
  for (const check of checks.filter((item) => !item.ok)) {
    const owner = ownerFor(check);
    const summary = grouped.get(owner) ?? { owner, blockerCount: 0, warningCount: 0, names: [] };
    if (check.severity === "blocker") summary.blockerCount += 1;
    else summary.warningCount += 1;
    summary.names.push(check.name);
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
  const failed = [...readiness.blockers, ...readiness.warnings];
  const marker = readiness.blockers.length > 0 ? (reviewOnly ? "OPERATOR_READINESS_BUNDLE_REVIEW_ONLY" : "OPERATOR_READINESS_BUNDLE_BLOCKED") : readiness.warnings.length > 0 ? "OPERATOR_READINESS_BUNDLE_OK_WITH_WARNINGS" : "OPERATOR_READINESS_BUNDLE_OK";
  return {
    marker,
    generatedAt: new Date().toISOString(),
    client: loadClient().name,
    ok: readiness.ok,
    blockerCount: readiness.blockers.length,
    warningCount: readiness.warnings.length,
    ownerSummaries: summarize(readiness.checks),
    nextActions: failed.map((check) => ({ owner: ownerFor(check), severity: check.severity as Status, name: check.name, action: nextAction(check), detail: check.detail })),
    safeCommands: [
      "npm run typecheck",
      "npm run style:guard",
      "npm run deployment:smoke",
      "npm run deployment:preflight:smoke",
      "npm run operator:readiness:bundle:smoke",
      "npm run voice:smoke",
      "npm run server:battletest",
    ],
    liveCommandsRequireApproval: [
      "npm run google-calendar:smoke",
      "USE_FAKE_CALENDAR=false npm run live-calendar:smoke",
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
    "",
    "## Blockers and warnings by owner",
    "",
    ...report.ownerSummaries.map((summary) => `- ${lineForSummary(summary)}`),
    "",
    "## Next actions",
    "",
    ...report.nextActions.map((item) => `- ${item.owner}/${item.severity}: ${item.name} — ${item.action}`),
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
