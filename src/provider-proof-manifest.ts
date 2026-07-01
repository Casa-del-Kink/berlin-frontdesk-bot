import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const jsonMode = process.env.PROVIDER_PROOF_MANIFEST_JSON === "true";
const outputPath = process.env.PROVIDER_PROOF_MANIFEST_PATH || "tmp/tilda-ops-snapshot/provider-proof-manifest.md";

type Owner = "Michael/Roxu" | "operator" | "provider" | "engineering" | "compliance";
type SideEffect = "none" | "creates-and-deletes-fixture" | "may-keep-visible-fixture" | "sends-provider-traffic";

type ProviderProof = {
  id: string;
  owner: Owner;
  purpose: string;
  requiredEnv: string[];
  optionalEnv?: string[];
  command: string;
  expectedMarker: string;
  sideEffect: SideEffect;
  approvalRequired: boolean;
  cleanupProof: string;
  blockerIfMissing: string;
  notes: string[];
};

const SECRET_VALUE_PATTERNS = [
  /[A-Za-z0-9_]*KEY[A-Za-z0-9_]*\s*=\s*[^\s<*]+/i,
  /[A-Za-z0-9_]*SECRET[A-Za-z0-9_]*\s*=\s*[^\s<*]+/i,
  /[A-Za-z0-9_]*TOKEN[A-Za-z0-9_]*\s*=\s*[^\s<*]+/i,
  /DATABASE_URL\s*=\s*[^\s<*]+/i,
  /POSTGRES_URL\s*=\s*[^\s<*]+/i,
  /GOOGLE_SA_JSON\s*=\s*\{.+\}/i,
];

function proofItems(): ProviderProof[] {
  return [
    {
      id: "google-calendar-readonly",
      owner: "provider",
      purpose: "Prove the service account can reach the Tilda dev calendar without creating bookings.",
      requiredEnv: ["GOOGLE_SA_JSON", "CLIENT_FILE with calendarId", "USE_FAKE_CALENDAR=false"],
      optionalEnv: ["KEEP_SMOKE_EVENT=false"],
      command: "USE_FAKE_CALENDAR=false npm run google-calendar:smoke",
      expectedMarker: "GOOGLE_CALENDAR_SMOKE_OK",
      sideEffect: "creates-and-deletes-fixture",
      approvalRequired: true,
      cleanupProof: "Reports deleted_event_id unless KEEP_SMOKE_EVENT=true is deliberately set for human-visible proof.",
      blockerIfMissing: "Missing service-account JSON or calendar access blocks confirmed booking demos.",
      notes: ["Use only the dedicated dev or pilot calendar.", "Do not run against a personal calendar."],
    },
    {
      id: "google-calendar-live-booking",
      owner: "provider",
      purpose: "Prove a full booking create, find, and cleanup flow against Google Calendar.",
      requiredEnv: ["GOOGLE_SA_JSON", "CLIENT_FILE with calendarId", "USE_FAKE_CALENDAR=false", "LIVE_CALENDAR_SMOKE_TESTED_AT after success"],
      optionalEnv: ["KEEP_SMOKE_EVENT=true for visible proof only"],
      command: "USE_FAKE_CALENDAR=false npm run live-calendar:smoke",
      expectedMarker: "LIVE_CALENDAR_BOOKING_SMOKE_OK",
      sideEffect: "creates-and-deletes-fixture",
      approvalRequired: true,
      cleanupProof: "Reports created fixture details and deletion confirmation, or states the kept event when visible proof is requested.",
      blockerIfMissing: "Calendar booking remains fake-provider only.",
      notes: ["Fixture must be uniquely marked as Tilda smoke data.", "Visible proof mode must be reported as not cleaned up."],
    },
    {
      id: "calcom-live-booking",
      owner: "provider",
      purpose: "Prove a full available-slot, booking create, fetch, and cleanup flow against hosted Cal.com.",
      requiredEnv: ["CALCOM_API_KEY", "one complete Cal.com event type selector", "CALCOM_TEST_ATTENDEE_EMAIL", "CALCOM_SMOKE_TESTED_AT after success"],
      optionalEnv: ["CALCOM_KEEP_SMOKE_BOOKING=true for visible proof only"],
      command: "npm run calcom:smoke",
      expectedMarker: "CALCOM_SMOKE_OK",
      sideEffect: "creates-and-deletes-fixture",
      approvalRequired: true,
      cleanupProof: "Reports created_booking_uid, verified_booking_uid, and cancelled_booking_uid unless CALCOM_KEEP_SMOKE_BOOKING=true is deliberately set.",
      blockerIfMissing: "Cal.com scheduling remains contract-tested only and not proven against the hosted booking layer.",
      notes: ["Use only an approved test event type synced to a demo/pilot calendar.", "Visible proof mode must be reported as not cleaned up."],
    },
    {
      id: "supabase-postgres-store",
      owner: "provider",
      purpose: "Prove the production-path Postgres store can write, read, de-dupe, export, delete, purge, and use booking locks.",
      requiredEnv: ["DATABASE_URL or POSTGRES_URL"],
      optionalEnv: ["STORE_BACKEND=postgres"],
      command: "npm run supabase:postgres:smoke",
      expectedMarker: "POSTGRES_STORE_SMOKE_OK",
      sideEffect: "creates-and-deletes-fixture",
      approvalRequired: true,
      cleanupProof: "Smoke uses uniquely marked rows and verifies cleanup or empty-after-delete behavior.",
      blockerIfMissing: "Hosted pilot cannot claim Postgres readiness or multi-worker booking-lock safety.",
      notes: ["API/admin reachability is not a substitute for direct Postgres migration smoke.", "Do not print database URLs."],
    },
    {
      id: "supabase-admin-rest",
      owner: "provider",
      purpose: "Prove server-side Supabase REST/admin reachability without exposing the secret key.",
      requiredEnv: ["SUPABASE_URL", "SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY"],
      command: "npm run supabase:admin:smoke",
      expectedMarker: "SUPABASE_ADMIN_SMOKE_OK",
      sideEffect: "none",
      approvalRequired: true,
      cleanupProof: "No app data fixture is created by the admin reachability smoke.",
      blockerIfMissing: "Admin API reachability remains unverified in the local shell.",
      notes: ["A missing-table response can prove auth reachability but not app migrations.", "Send secret only via environment or secret storage, never chat."],
    },
    {
      id: "twilio-whatsapp-signature",
      owner: "provider",
      purpose: "Prove public webhook URL and Twilio signature validation before real WhatsApp traffic.",
      requiredEnv: ["TWILIO_WEBHOOK_BASE_URL", "TWILIO_AUTH_TOKEN", "SERVER_TOOL_TOKEN"],
      optionalEnv: ["SKIP_TWILIO_SIGNATURE_VALIDATION=false"],
      command: "npm run deployment:smoke && npm run server:battletest",
      expectedMarker: "SERVER_BATTLETEST_OK",
      sideEffect: "none",
      approvalRequired: false,
      cleanupProof: "Credential-free smoke rejects unsigned webhooks locally; live URL verification still needs provider console setup.",
      blockerIfMissing: "WhatsApp review or live sandbox testing should not proceed with unsigned webhook acceptance.",
      notes: ["Use Twilio Auth Token only for validation.", "Use API key credentials for outbound REST calls when live sending is approved."],
    },
    {
      id: "reviewed-whatsapp-followup-send",
      owner: "operator",
      purpose: "Prove reviewed post-call follow-up can be sent only after opt-in and explicit send approval.",
      requiredEnv: ["ENABLE_REVIEWED_FOLLOWUP_SEND=true", "FOLLOWUP_SEND_REVIEWED_AT", "TWILIO_ACCOUNT_SID", "TWILIO_API_KEY_SID", "TWILIO_API_KEY_SECRET", "TWILIO_WHATSAPP_FROM"],
      optionalEnv: ["SERVER_TOOL_TOKEN"],
      command: "npm run operator:demo:packet, then run a scoped live follow-up send only with an approved test number",
      expectedMarker: "OPERATOR_DEMO_PACKET_OK plus provider send receipt",
      sideEffect: "sends-provider-traffic",
      approvalRequired: true,
      cleanupProof: "Operator packet proves fail-closed dry-run first; live send proof must name the test number owner and avoid customer traffic.",
      blockerIfMissing: "Voice post-call drafts remain review-only and cannot be sent from Tilda.",
      notes: ["Do not send to real customers during smoke testing.", "Opt-in and reviewedBy are mandatory."],
    },
    {
      id: "elevenlabs-voice-agent-contract",
      owner: "provider",
      purpose: "Prove the voice agent can call the same secured one-brain HTTP tools over public HTTPS.",
      requiredEnv: ["VOICE_AGENT_PUBLIC_BASE_URL", "SERVER_TOOL_TOKEN"],
      optionalEnv: ["VOICE_AGENT_CONTRACT_JSON=true"],
      command: "VOICE_AGENT_CONTRACT_JSON=true npm run voice:contract",
      expectedMarker: "VOICE_AGENT_CONTRACT_OK",
      sideEffect: "none",
      approvalRequired: true,
      cleanupProof: "Contract check is report-only and should not place a call.",
      blockerIfMissing: "Voice remains local-tool ready but not provider-connected.",
      notes: ["Phone answering is pilot scope.", "Public URL must match the provider tool configuration."],
    },
    {
      id: "owner-alert-route",
      owner: "operator",
      purpose: "Prove urgent owner handoff alerts reach the configured salon/operator destination.",
      requiredEnv: ["ownerWhatsapp in client YAML or OWNER_ALERT_LOG_ONLY_ACCEPTED=true for internal demo", "OWNER_ALERT_TESTED_AT"],
      optionalEnv: ["SERVER_TOOL_TOKEN"],
      command: "POST /operator/alert-test with bearer auth, then set OWNER_ALERT_TESTED_AT only after delivery is confirmed",
      expectedMarker: "ownerAlert.attempted true for live route or accepted log-only internal demo",
      sideEffect: "sends-provider-traffic",
      approvalRequired: true,
      cleanupProof: "For internal demo, no provider send occurs. For live route, proof is a single test alert received by the approved owner destination.",
      blockerIfMissing: "Human handoff can silently degrade to logs only.",
      notes: ["Do not use a salon customer's number as the owner alert test destination.", "Log-only is acceptable only for internal hosted demos."],
    },
    {
      id: "llm-provider",
      owner: "provider",
      purpose: "Prove OpenRouter is configured for the WhatsApp loop without leaking key material.",
      requiredEnv: ["OPENROUTER_API_KEY"],
      command: "Run a scoped non-customer LLM smoke after provider account approval",
      expectedMarker: "LLM_PROVIDER_SMOKE_OK when added, or documented provider response marker",
      sideEffect: "none",
      approvalRequired: true,
      cleanupProof: "No customer data should be sent in the provider smoke.",
      blockerIfMissing: "Local fake-provider and tool smokes pass, but live WhatsApp language handling is not proven.",
      notes: ["Use a fixed German salon fixture prompt.", "Keep customer PII out of provider smoke prompts."],
    },
    {
      id: "deployment-preflight",
      owner: "engineering",
      purpose: "Prove hosted runtime refuses unsafe live-pilot startup unless blockers are cleared or explicitly in review-only mode.",
      requiredEnv: ["NODE_ENV=production", "SERVER_TOOL_TOKEN", "DATA_RETENTION_DAYS", "TWILIO_WEBHOOK_BASE_URL"],
      optionalEnv: ["ALLOW_DEPLOYMENT_BLOCKERS=true for report-only review"],
      command: "npm run deployment:preflight && npm run deployment:smoke",
      expectedMarker: "DEPLOYMENT_PREFLIGHT_OK and DEPLOYMENT_SMOKE_OK",
      sideEffect: "none",
      approvalRequired: false,
      cleanupProof: "Local fake-provider smoke writes only ignored temporary state.",
      blockerIfMissing: "Hosted deploy may start with fake providers, weak auth, or missing retention policy.",
      notes: ["Default preflight should fail closed while blockers remain.", "Review-only mode must not be called readiness."],
    },
  ];
}

function envStatus(requiredEnv: string[]) {
  return requiredEnv.map((name) => {
    const envName = name.split(" ")[0];
    const isPlainEnvName = /^[A-Z0-9_]+$/.test(envName);
    return { name, configured: isPlainEnvName ? Boolean(process.env[envName]) : undefined };
  });
}

function buildReport() {
  const items = proofItems();
  const reportItems = items.map((item) => ({ ...item, envStatus: envStatus(item.requiredEnv) }));
  const approvalRequiredCount = items.filter((item) => item.approvalRequired).length;
  const providerTrafficCount = items.filter((item) => item.sideEffect === "sends-provider-traffic").length;
  return {
    marker: "PROVIDER_PROOF_MANIFEST_OK",
    generatedAt: new Date().toISOString(),
    mode: "report-only no-secret provider proof plan",
    outputPath,
    itemCount: items.length,
    approvalRequiredCount,
    providerTrafficCount,
    noSecretsPrinted: true,
    items: reportItems,
  };
}

function assertNoSecretValues(text: string) {
  for (const pattern of SECRET_VALUE_PATTERNS) {
    if (pattern.test(text)) throw new Error(`provider proof manifest may contain a secret-shaped value: ${pattern}`);
  }
}

function toMarkdown(report: ReturnType<typeof buildReport>) {
  return [
    "# Tilda provider proof manifest",
    "",
    `Generated: ${report.generatedAt}`,
    `Marker: \`${report.marker}\``,
    `Mode: ${report.mode}. This command does not call Google Calendar, Supabase/Postgres, WhatsApp, voice providers, or LLM providers.`,
    `Items: ${report.itemCount}`,
    `Approval-required checks: ${report.approvalRequiredCount}`,
    `Provider-traffic checks: ${report.providerTrafficCount}`,
    "",
    "## Live proof items",
    "",
    ...report.items.flatMap((item) => [
      `### ${item.id}`,
      "",
      `- Owner: ${item.owner}`,
      `- Purpose: ${item.purpose}`,
      `- Required env names: ${item.requiredEnv.join(", ")}`,
      `- Command: \`${item.command}\``,
      `- Expected marker: \`${item.expectedMarker}\``,
      `- Side effect: ${item.sideEffect}`,
      `- Approval required: ${String(item.approvalRequired)}`,
      `- Cleanup proof: ${item.cleanupProof}`,
      `- Blocker if missing: ${item.blockerIfMissing}`,
      `- Notes: ${item.notes.join("; ")}`,
      "",
    ]),
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
  console.log(`provider_proof_manifest_path=${outputPath}`);
}
