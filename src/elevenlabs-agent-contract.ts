import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { hasExplicitAiDisclosure, loadClient } from "./config.js";

type Severity = "blocker" | "warning";

export interface VoiceAgentContractCheck {
  name: string;
  ok: boolean;
  severity: Severity;
  detail: string;
  next: string;
}

export interface ToolContract {
  name: "check_availability" | "book_appointment" | "register_lead";
  method: "POST";
  url: string;
  auth: string;
  purpose: string;
  requiredBody: Record<string, unknown>;
  voiceInstruction: string;
  successMarker: string;
}

export interface VoiceAgentContractReport {
  marker: "VOICE_AGENT_CONTRACT_BLOCKED" | "VOICE_AGENT_CONTRACT_REVIEW_ONLY" | "VOICE_AGENT_CONTRACT_OK_WITH_WARNINGS" | "VOICE_AGENT_CONTRACT_OK";
  generatedAt: string;
  provider: string;
  client: string;
  publicBaseConfigured: boolean;
  blockerCount: number;
  warningCount: number;
  checks: VoiceAgentContractCheck[];
  tools: ToolContract[];
  postCallWebhook: {
    method: "POST";
    url: string;
    auth: string;
    expectedFields: string[];
    allowedStatuses: string[];
    storageDefault: string;
    successMarker: string;
  };
  localProofBeforeProvider: string[];
  liveProofWhenHosted: string[];
}

const REDACTED_AUTH = ["Authorization:", "Bearer", "REDACTED"].join(" ");
const publicBase = (process.env.VOICE_AGENT_PUBLIC_BASE_URL || process.env.TWILIO_WEBHOOK_BASE_URL || "").replace(/\/$/, "");
const reviewOnly = process.env.ALLOW_VOICE_AGENT_CONTRACT_BLOCKERS === "true";
const jsonMode = process.env.VOICE_AGENT_CONTRACT_JSON === "true";

function hasEnv(name: string) {
  return Boolean(process.env[name]?.trim());
}

function tokenLengthOk() {
  return (process.env.SERVER_TOOL_TOKEN?.trim().length ?? 0) >= 24;
}

function endpoint(path: string) {
  return publicBase ? `${publicBase}${path}` : `https://<public-tilda-host>${path}`;
}

function toolContracts(): ToolContract[] {
  return [
    {
      name: "check_availability",
      method: "POST",
      url: endpoint("/tools/check_availability"),
      auth: REDACTED_AUTH,
      purpose: "Let the phone agent offer real available appointment times before promising anything.",
      requiredBody: { phone: "+491********", args: { service: "Damenhaarschnitt", from: "YYYY-MM-DD", days: 7 } },
      voiceInstruction: "Offer at most two returned slots. If slots[] is empty, register a lead or mention the fallback booking path.",
      successMarker: "Response JSON contains service, durationMin, and slots[] with ISO start times.",
    },
    {
      name: "book_appointment",
      method: "POST",
      url: endpoint("/tools/book_appointment"),
      auth: REDACTED_AUTH,
      purpose: "Create one appointment through the same backend used by WhatsApp.",
      requiredBody: { phone: "+491********", args: { name: "Customer name", service: "Damenhaarschnitt", start: "ISO datetime with timezone", channel: "phone" } },
      voiceInstruction: "Use only after the caller confirms a slot and name. If the slot is gone, call check_availability again.",
      successMarker: "Response JSON has ok=true, channel=phone, estimatedValueCents, and idempotentReplay metadata.",
    },
    {
      name: "register_lead",
      method: "POST",
      url: endpoint("/tools/register_lead"),
      auth: REDACTED_AUTH,
      purpose: "Capture a human follow-up when the voice agent cannot or should not book autonomously.",
      requiredBody: { phone: "+491********", args: { name: "Customer name", service: "Optional service", notes: "Short callback reason", channel: "phone", idempotencyKey: "provider-call-or-tool-id" } },
      voiceInstruction: "Use for uncertainty, complex advice, complaints, medical/aesthetic cautions, or any caller request for a human.",
      successMarker: "Response JSON has ok=true, channel=phone, and retry-safe idempotency metadata.",
    },
  ];
}

export function voiceAgentContractChecks(): VoiceAgentContractCheck[] {
  const cfg = loadClient();
  return [
    {
      name: "public HTTPS base URL",
      ok: /^https:\/\//.test(publicBase),
      severity: "blocker",
      detail: "VOICE_AGENT_PUBLIC_BASE_URL or TWILIO_WEBHOOK_BASE_URL must be the hosted HTTPS origin ElevenLabs can reach.",
      next: "Set VOICE_AGENT_PUBLIC_BASE_URL=https://<host> after deployment. Never point a live provider to localhost.",
    },
    {
      name: "server tool bearer token",
      ok: tokenLengthOk(),
      severity: "blocker",
      detail: "SERVER_TOOL_TOKEN must be long enough and configured as the voice-agent Authorization bearer token.",
      next: "Generate a 24+ character token in the host secret manager; do not paste secrets into docs, git, or Telegram.",
    },
    {
      name: "post-call webhook target",
      ok: /^https:\/\//.test(publicBase) && tokenLengthOk(),
      severity: "blocker",
      detail: "The provider must call /webhook/voice/post-call with the same bearer auth as server tools.",
      next: "Configure the provider post-call webhook only after the backend is hosted and npm run voice:smoke passes locally.",
    },
    {
      name: "client AI disclosure text",
      ok: hasExplicitAiDisclosure(cfg.aiDisclosureText),
      severity: "blocker",
      detail: "The voice opening must clearly disclose AI/KI in client-approved wording.",
      next: "Keep the opening close to aiDisclosureText in the client YAML, preferably 'Ich bin die KI-Rezeption'.",
    },
    {
      name: "privacy contact",
      ok: Boolean(cfg.privacyContact?.trim()),
      severity: "blocker",
      detail: "A real client pilot needs an operator route for privacy/export/delete questions.",
      next: "Set privacyContact in the client YAML before live customer calls.",
    },
    {
      name: "voice provider selected",
      ok: hasEnv("ELEVENLABS_AGENT_ID") || hasEnv("ELEVENLABS_API_KEY"),
      severity: "warning",
      detail: "Provider credentials are intentionally absent for local work; a live provider agent must exist before paid calls.",
      next: "Select/create the ElevenLabs Conversational AI agent during daytime setup and map the tools below.",
    },
    {
      name: "transcript and recording minimization",
      ok: process.env.VOICE_TRANSCRIPT_STORAGE_REVIEWED === "true" || (!hasEnv("VOICE_STORE_TRANSCRIPTS") && !hasEnv("VOICE_STORE_RECORDINGS")),
      severity: "warning",
      detail: "First pilots should store summaries only unless transcript/recording notice, consent, retention, and AVV/DPA scope are reviewed.",
      next: "Keep transcript/recording storage off or summary-only until Michael/Roxu approve the compliance scope with counsel review as needed.",
    },
    {
      name: "voice setup documentation",
      ok: existsSync("docs/elevenlabs-voice-agent-setup.md") && existsSync("docs/voice-phone-readiness.md"),
      severity: "blocker",
      detail: "Provider setup docs must exist so endpoint/auth/payload mapping stays reviewable.",
      next: "Update docs whenever endpoint names, auth behavior, or payload fields change.",
    },
  ];
}

export function buildVoiceAgentContractReport(): VoiceAgentContractReport {
  const allChecks = voiceAgentContractChecks();
  const blockers = allChecks.filter((check) => !check.ok && check.severity === "blocker");
  const warnings = allChecks.filter((check) => !check.ok && check.severity === "warning");
  return {
    marker: blockers.length > 0 ? (reviewOnly ? "VOICE_AGENT_CONTRACT_REVIEW_ONLY" : "VOICE_AGENT_CONTRACT_BLOCKED") : warnings.length > 0 ? "VOICE_AGENT_CONTRACT_OK_WITH_WARNINGS" : "VOICE_AGENT_CONTRACT_OK",
    generatedAt: new Date().toISOString(),
    provider: "ElevenLabs Conversational AI / server tools",
    client: loadClient().name,
    publicBaseConfigured: Boolean(publicBase),
    blockerCount: blockers.length,
    warningCount: warnings.length,
    checks: allChecks,
    tools: toolContracts(),
    postCallWebhook: {
      method: "POST",
      url: endpoint("/webhook/voice/post-call"),
      auth: REDACTED_AUTH,
      expectedFields: ["callId/call_id/conversation_id", "phone/caller/from", "status/call_status/outcome", "summary/call_summary/analysis summary"],
      allowedStatuses: ["booked", "needs_followup", "answered", "missed", "voicemail", "failed"],
      storageDefault: "Store short summary only; avoid raw transcript or recording storage unless explicitly reviewed and disclosed.",
      successMarker: "Response JSON has ok=true, outcome, and idempotentReplay for provider retries.",
    },
    localProofBeforeProvider: ["npm run voice:contract with ALLOW_VOICE_AGENT_CONTRACT_BLOCKERS=true", "npm run voice:smoke", "npm run server:battletest"],
    liveProofWhenHosted: ["npm run deployment:preflight", "GET /readiness/live-pilot with bearer auth", "one provider test call after credentials and disclosure are configured"],
  };
}

export function printVoiceAgentContractReport(report: VoiceAgentContractReport) {
  console.log("VOICE_AGENT_CONTRACT_START");
  console.log(`provider=${report.provider}`);
  console.log(`client=${report.client}`);
  console.log(`public_base_configured=${report.publicBaseConfigured}`);
  console.log(`voice_contract_blockers=${report.blockerCount}`);
  console.log(`voice_contract_warnings=${report.warningCount}`);

  console.log("\nCHECKS");
  for (const check of report.checks) {
    const status = check.ok ? "OK" : check.severity.toUpperCase();
    console.log(`${status} ${check.name}: ${check.detail}`);
    if (!check.ok) console.log(`  next=${check.next}`);
  }

  console.log("\nELEVENLABS_TOOL_MAPPING");
  for (const tool of report.tools) {
    console.log(`- ${tool.name}: ${tool.method} ${tool.url}`);
    console.log(`  auth=${tool.auth}`);
    console.log(`  body=${JSON.stringify(tool.requiredBody)}`);
    console.log(`  voice_instruction=${tool.voiceInstruction}`);
  }
  console.log(`- post_call_webhook: ${report.postCallWebhook.method} ${report.postCallWebhook.url}`);
  console.log(`  auth=${report.postCallWebhook.auth}`);

  console.log("\nLOCAL_PROOF_BEFORE_PROVIDER");
  for (const command of report.localProofBeforeProvider) console.log(`- ${command}`);
  console.log("\nLIVE_PROOF_WHEN_HOSTED");
  for (const command of report.liveProofWhenHosted) console.log(`- ${command}`);
  console.log(report.marker);
}

export function runVoiceAgentContractCli() {
  const report = buildVoiceAgentContractReport();
  if (jsonMode) console.log(JSON.stringify(report, null, 2));
  else printVoiceAgentContractReport(report);

  if (report.blockerCount > 0 && !reviewOnly) process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) runVoiceAgentContractCli();
