import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { loadClient } from "./config.js";
import { validateDeploymentReadiness } from "./readiness.js";

const jsonMode = process.env.DEPLOYMENT_HANDOFF_JSON === "true";
const outputPath = process.env.DEPLOYMENT_HANDOFF_PATH || "tmp/tilda-ops-snapshot/deployment-handoff.md";

type Owner = "Michael" | "Roxu" | "engineering" | "provider" | "operator" | "compliance";
type Phase = "host" | "secrets" | "provider-proof" | "operator-proof" | "go-live-gate";
type Safety = "safe-local" | "credential-required" | "live-provider" | "provider-traffic" | "legal-review";

interface HandoffItem {
  phase: Phase;
  owner: Owner;
  name: string;
  requiredEnv: string[];
  configured: boolean | "not-env";
  safety: Safety;
  command?: string;
  expectedMarker?: string;
  next: string;
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

function validTimestampEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp);
}

function anyValidTimestampEnv(names: string[]) {
  return names.some(validTimestampEnv);
}

function configured(requiredEnv: string[]): boolean | "not-env" {
  const plain = requiredEnv.filter((name) => /^[A-Z0-9_]+$/.test(name));
  if (plain.length !== requiredEnv.length) return "not-env";
  return plain.every(hasEnv);
}

function schedulingProvider() {
  const raw = (process.env.SCHEDULING_PROVIDER || process.env.BOOKING_PROVIDER || "google").trim().toLowerCase();
  return raw === "calcom" || raw === "cal.com" ? "calcom" : "google";
}

function schedulingItems(): HandoffItem[] {
  if (schedulingProvider() === "calcom") {
    return [
      {
        phase: "secrets",
        owner: "provider",
        name: "Cal.com booking provider env",
        requiredEnv: ["CALCOM_API_KEY", "CALCOM_TEST_ATTENDEE_EMAIL", "one Cal.com event type selector"],
        configured: "not-env",
        safety: "credential-required",
        command: "npm run scheduling:provider:check",
        expectedMarker: "SCHEDULING_PROVIDER_CHECK_OK",
        next: "Set CALCOM_API_KEY plus one event type selector, then run the mocked provider seam check before the live smoke.",
      },
      {
        phase: "provider-proof",
        owner: "provider",
        name: "Cal.com create/get/cancel proof",
        requiredEnv: ["CALCOM_SMOKE_TESTED_AT"],
        configured: validTimestampEnv("CALCOM_SMOKE_TESTED_AT"),
        safety: "live-provider",
        command: "npm run calcom:smoke",
        expectedMarker: "CALCOM_SMOKE_OK",
        next: "Run only against an approved test event type; verify cancellation or explicitly report visible proof mode.",
      },
    ];
  }
  return [
    {
      phase: "secrets",
      owner: "provider",
      name: "Google Calendar booking provider env",
      requiredEnv: ["GOOGLE_SA_JSON", "USE_FAKE_CALENDAR"],
      configured: configured(["GOOGLE_SA_JSON", "USE_FAKE_CALENDAR"]),
      safety: "credential-required",
      command: "USE_FAKE_CALENDAR=false npm run google-calendar:smoke",
      expectedMarker: "GOOGLE_CALENDAR_SMOKE_OK",
      next: "Store the service-account JSON in secret storage, share only the dev/pilot calendar with it, and run the readonly/cleanup smoke.",
    },
    {
      phase: "provider-proof",
      owner: "provider",
      name: "Google Calendar create/find/delete proof",
      requiredEnv: ["LIVE_CALENDAR_SMOKE_TESTED_AT or GOOGLE_CALENDAR_SMOKE_TESTED_AT"],
      configured: anyValidTimestampEnv(["LIVE_CALENDAR_SMOKE_TESTED_AT", "GOOGLE_CALENDAR_SMOKE_TESTED_AT"]),
      safety: "live-provider",
      command: "USE_FAKE_CALENDAR=false npm run live-calendar:smoke",
      expectedMarker: "LIVE_CALENDAR_BOOKING_SMOKE_OK",
      next: "Run only on the approved dev/pilot calendar; verify cleanup unless visible proof was explicitly requested.",
    },
  ];
}

function buildItems(): HandoffItem[] {
  return [
    {
      phase: "host",
      owner: "Michael",
      name: "Public backend host chosen",
      requiredEnv: ["TWILIO_WEBHOOK_BASE_URL"],
      configured: configured(["TWILIO_WEBHOOK_BASE_URL"]),
      safety: "credential-required",
      command: "ALLOW_DEPLOYMENT_BLOCKERS=true DEPLOYMENT_PREFLIGHT_JSON=true npm run deployment:preflight",
      expectedMarker: "DEPLOYMENT_PREFLIGHT_REVIEW_ONLY or DEPLOYMENT_PREFLIGHT_OK",
      next: "Deploy a Node 20+ backend and set TWILIO_WEBHOOK_BASE_URL to its public HTTPS base URL.",
    },
    {
      phase: "secrets",
      owner: "engineering",
      name: "Core server safety env",
      requiredEnv: ["NODE_ENV", "SERVER_TOOL_TOKEN", "DATA_RETENTION_DAYS", "STORE_BACKEND"],
      configured: configured(["NODE_ENV", "SERVER_TOOL_TOKEN", "DATA_RETENTION_DAYS", "STORE_BACKEND"]),
      safety: "credential-required",
      command: "npm run deployment:preflight",
      expectedMarker: "DEPLOYMENT_PREFLIGHT_OK",
      next: "Set production runtime env, a long bearer token, retention days, and STORE_BACKEND=postgres before exposing protected endpoints.",
    },
    {
      phase: "secrets",
      owner: "provider",
      name: "Supabase/Postgres store env",
      requiredEnv: ["DATABASE_URL or POSTGRES_URL"],
      configured: hasEnv("DATABASE_URL") || hasEnv("POSTGRES_URL"),
      safety: "credential-required",
      command: "npm run supabase:postgres:smoke",
      expectedMarker: "POSTGRES_STORE_SMOKE_OK",
      next: "Use a server-side Postgres URL in secret storage; do not paste or print it in chat.",
    },
    ...schedulingItems(),
    {
      phase: "secrets",
      owner: "Roxu",
      name: "Twilio WhatsApp and webhook validation env",
      requiredEnv: ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_WHATSAPP_FROM", "TWILIO_WEBHOOK_BASE_URL"],
      configured: configured(["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_WHATSAPP_FROM", "TWILIO_WEBHOOK_BASE_URL"]),
      safety: "credential-required",
      command: "npm run server:battletest",
      expectedMarker: "SERVER_BATTLETEST_OK",
      next: "Keep Auth Token for signature validation and use API-key credentials for outbound REST only when live sends are approved.",
    },
    {
      phase: "secrets",
      owner: "provider",
      name: "OpenRouter LLM env",
      requiredEnv: ["OPENROUTER_API_KEY"],
      configured: configured(["OPENROUTER_API_KEY"]),
      safety: "credential-required",
      next: "Add the API key only in secret storage; future live LLM smoke should use fixed non-customer salon fixtures.",
    },
    {
      phase: "operator-proof",
      owner: "operator",
      name: "Owner alert route proof",
      requiredEnv: ["ownerWhatsapp in client YAML or OWNER_ALERT_LOG_ONLY_ACCEPTED", "OWNER_ALERT_TESTED_AT"],
      configured: validTimestampEnv("OWNER_ALERT_TESTED_AT") || hasEnv("OWNER_ALERT_LOG_ONLY_ACCEPTED"),
      safety: "provider-traffic",
      command: "npm run operator:demo:packet, then POST /operator/alert-test with bearer auth for the approved destination",
      expectedMarker: "OPERATOR_DEMO_PACKET_OK plus received owner alert proof",
      next: "For internal hosted demo, log-only can be deliberately accepted; for real pilot, send one approved alert test to the owner route.",
    },
    {
      phase: "provider-proof",
      owner: "provider",
      name: "ElevenLabs voice-agent public tool contract",
      requiredEnv: ["VOICE_AGENT_PUBLIC_BASE_URL", "SERVER_TOOL_TOKEN"],
      configured: configured(["VOICE_AGENT_PUBLIC_BASE_URL", "SERVER_TOOL_TOKEN"]),
      safety: "credential-required",
      command: "VOICE_AGENT_CONTRACT_JSON=true npm run voice:contract",
      expectedMarker: "VOICE_AGENT_CONTRACT_OK",
      next: "Point ElevenLabs tools to the public HTTPS base URL only after bearer auth and readiness checks are configured.",
    },
    {
      phase: "go-live-gate",
      owner: "compliance",
      name: "AVV/DPA and public operator details reviewed",
      requiredEnv: ["COMPLIANCE_DPA_REVIEWED", "TILDA_OPERATOR_LEGAL_NAME", "TILDA_PUBLIC_CONTACT_EMAIL", "TILDA_PRIVACY_EMAIL"],
      configured: configured(["COMPLIANCE_DPA_REVIEWED", "TILDA_OPERATOR_LEGAL_NAME", "TILDA_PUBLIC_CONTACT_EMAIL", "TILDA_PRIVACY_EMAIL"]),
      safety: "legal-review",
      next: "Complete AVV/DPA/subprocessor review and replace landing/operator placeholders before real customer traffic.",
    },
    {
      phase: "go-live-gate",
      owner: "engineering",
      name: "Strict startup gate enabled",
      requiredEnv: ["REQUIRE_LIVE_PILOT_READINESS"],
      configured: process.env.REQUIRE_LIVE_PILOT_READINESS === "true",
      safety: "safe-local",
      command: "REQUIRE_LIVE_PILOT_READINESS=true npm run start",
      expectedMarker: "Server starts only when deployment readiness has no blockers.",
      next: "Set REQUIRE_LIVE_PILOT_READINESS=true in the hosted live-pilot runtime after safe local smokes pass.",
    },
  ];
}

function phaseOrder(phase: Phase) {
  return ["host", "secrets", "provider-proof", "operator-proof", "go-live-gate"].indexOf(phase);
}

function assertNoSecretValues(text: string) {
  for (const pattern of SECRET_VALUE_PATTERNS) {
    if (pattern.test(text)) throw new Error(`deployment handoff may contain a secret-shaped value: ${pattern}`);
  }
}

function buildReport() {
  const client = loadClient();
  const readiness = validateDeploymentReadiness(client);
  const items = buildItems().sort((a, b) => phaseOrder(a.phase) - phaseOrder(b.phase) || a.name.localeCompare(b.name));
  const missing = items.filter((item) => item.configured !== true).length;
  const liveProviderItems = items.filter((item) => item.safety === "live-provider" || item.safety === "provider-traffic").length;
  return {
    marker: missing === 0 && readiness.ok ? "DEPLOYMENT_HANDOFF_READY" : "DEPLOYMENT_HANDOFF_BLOCKED",
    generatedAt: new Date().toISOString(),
    client: client.name,
    schedulingProvider: schedulingProvider(),
    readinessMarker: readiness.ok ? "DEPLOYMENT_READY" : "DEPLOYMENT_BLOCKED",
    blockerCount: readiness.blockers.length,
    warningCount: readiness.warnings.length,
    itemCount: items.length,
    missingItemCount: missing,
    liveProviderItems,
    noSecretsPrinted: true,
    noLiveProviderCalls: true,
    outputPath,
    items,
  };
}

function toMarkdown(report: ReturnType<typeof buildReport>) {
  return [
    "# Tilda deployment handoff",
    "",
    `Generated: ${report.generatedAt}`,
    `Marker: \`${report.marker}\``,
    `Client: ${report.client}`,
    `Scheduling provider: ${report.schedulingProvider}`,
    `Readiness marker: \`${report.readinessMarker}\``,
    `Readiness blockers/warnings: ${report.blockerCount}/${report.warningCount}`,
    `Handoff items: ${report.itemCount}`,
    `Missing or review-only items: ${report.missingItemCount}`,
    `Live-provider/provider-traffic items: ${report.liveProviderItems}`,
    `No live provider calls made: ${String(report.noLiveProviderCalls)}`,
    "",
    "## Action queue",
    "",
    ...report.items.flatMap((item) => [
      `### ${item.phase}: ${item.name}`,
      "",
      `- Owner: ${item.owner}`,
      `- Required env/proof names: ${item.requiredEnv.join(", ")}`,
      `- Configured in this shell: ${String(item.configured)}`,
      `- Safety: ${item.safety}`,
      item.command ? `- Command: \`${item.command}\`` : "- Command: not yet automated",
      item.expectedMarker ? `- Expected marker: \`${item.expectedMarker}\`` : "- Expected marker: not yet automated",
      `- Next: ${item.next}`,
      "",
    ]),
    "## Operator note",
    "",
    "This handoff is report-only. It prints env/proof names and boolean status only, never secret values, and does not call live providers.",
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
  console.log(`deployment_handoff_path=${outputPath}`);
}
