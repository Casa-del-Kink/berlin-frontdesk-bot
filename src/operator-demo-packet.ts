import { spawn } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { createRequire } from "node:module";
import { setTimeout as sleep } from "node:timers/promises";

const require = createRequire(import.meta.url);
const TSX_CLI = require.resolve("tsx/cli");
const PORT = Number(process.env.OPERATOR_DEMO_PACKET_PORT || 4542);
const BASE = `http://127.0.0.1:${PORT}`;
const TOKEN = "operator-demo-packet-token";
const STATE_FILE = "data/operator-demo-packet-state.json";
const CALENDAR_FILE = "data/operator-demo-packet-calendar.json";
const OUTPUT_PATH = process.env.OPERATOR_DEMO_PACKET_PATH || "tmp/tilda-ops-snapshot/operator-demo-packet.md";
const JSON_MODE = process.env.OPERATOR_DEMO_PACKET_JSON === "true";

type Step = { name: string; status: "ok"; detail: string };

function removeIfExists(path: string) {
  if (existsSync(path)) rmSync(path);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function json(path: string, init: RequestInit = {}) {
  const res = await fetch(`${BASE}${path}`, init);
  const text = await res.text();
  let body: any;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    body = text;
  }
  return { res, body };
}

function authHeaders() {
  return { authorization: `Bearer ${TOKEN}` };
}

function authJson(body?: unknown): RequestInit {
  return {
    method: "POST",
    headers: { ...authHeaders(), "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  };
}

async function waitForHealth() {
  const deadline = Date.now() + 15_000;
  let lastError = "not attempted";
  while (Date.now() < deadline) {
    try {
      const { res, body } = await json("/health");
      if (res.ok && body?.ok) return body;
      lastError = `${res.status} ${JSON.stringify(body)}`;
    } catch (e: any) {
      lastError = String(e?.message ?? e);
    }
    await sleep(250);
  }
  throw new Error(`operator demo packet server did not become healthy: ${lastError}`);
}

function buildPacketReport(steps: Step[], facts: Record<string, unknown>) {
  return {
    marker: "OPERATOR_DEMO_PACKET_OK",
    generatedAt: new Date().toISOString(),
    mode: "no-credential fake-provider server proof",
    outputPath: OUTPUT_PATH,
    steps,
    facts,
    noLiveProviderCalls: true,
    liveCommandsRequireApproval: ["npm run google-calendar:smoke", "USE_FAKE_CALENDAR=false npm run live-calendar:smoke", "npm run supabase:postgres:smoke"],
  };
}

function writePacket(report: ReturnType<typeof buildPacketReport>) {
  const markdown = [
    "# Tilda operator demo packet",
    "",
    `Generated: ${report.generatedAt}`,
    `Marker: \`${report.marker}\``,
    `Mode: ${report.mode}. No live Google Calendar, Supabase/Postgres, WhatsApp, or voice provider calls were made.`,
    "",
    "## Verified steps",
    "",
    ...report.steps.map((step) => `- ${step.name}: ${step.detail}`),
    "",
    "## Packet facts",
    "",
    `- Health client: ${String(report.facts.healthClient)}`,
    `- Readiness status: ${String(report.facts.readinessStatus)}`,
    `- Readiness blockers: ${String(report.facts.readinessBlockers)}`,
    `- Follow-up dry-run sent: ${String(report.facts.followUpDryRunSent)}`,
    `- Live follow-up blocked status: ${String(report.facts.liveFollowUpBlockedStatus)}`,
    `- Exported call outcomes: ${String(report.facts.exportedCallOutcomes)}`,
    `- Output path: ${report.outputPath}`,
    "",
    "## Next live steps",
    "",
    "- Replace operator footer placeholders before provider review.",
    "- Configure real owner alert routing and run the protected alert test before any client pilot.",
    "- Run Google Calendar, Supabase/Postgres, WhatsApp, and voice smokes only with approved credentials and explicit safe scope.",
    "",
  ].join("\n");
  mkdirSync(dirname(report.outputPath), { recursive: true });
  writeFileSync(report.outputPath, markdown);
}

async function main() {
  removeIfExists(STATE_FILE);
  removeIfExists(CALENDAR_FILE);
  const steps: Step[] = [];

  const child = spawn(process.execPath, [TSX_CLI, "src/server.ts"], {
    env: {
      ...process.env,
      PORT: String(PORT),
      CLIENT_FILE: "clients/salon-demo.yaml",
      USE_FAKE_CALENDAR: "true",
      FAKE_CALENDAR_FILE: CALENDAR_FILE,
      STATE_FILE,
      SERVER_TOOL_TOKEN: TOKEN,
      SKIP_TWILIO_SIGNATURE_VALIDATION: "false",
      DATA_RETENTION_DAYS: "30",
      OWNER_ALERT_LOG_ONLY_ACCEPTED: "true",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += String(chunk);
  });

  try {
    const health = await waitForHealth();
    assert(health.storeBackend === "json", `operator packet should use local JSON state: ${JSON.stringify(health)}`);
    steps.push({ name: "server health", status: "ok", detail: `real Express server healthy for ${health.client}` });

    let out = await json("/readiness/live-pilot");
    assert(out.res.status === 401, `readiness without bearer should be 401: ${out.res.status}`);
    steps.push({ name: "readiness auth", status: "ok", detail: "protected readiness rejects missing bearer auth" });

    out = await json("/readiness/live-pilot", { headers: authHeaders() });
    assert(out.res.status === 409, `fake-provider readiness should be 409: ${out.res.status} ${JSON.stringify(out.body)}`);
    assert(out.body?.blockers?.some((check: any) => check.name === "fake calendar disabled"), `readiness should expose fake-calendar blocker: ${JSON.stringify(out.body)}`);
    steps.push({ name: "readiness blockers", status: "ok", detail: `${out.body.blockers.length} live blockers exposed for operator handoff` });
    const readinessBody = out.body;

    out = await json("/operator/alert-test", authJson({ message: "Tilda operator demo packet alert test" }));
    assert(out.res.ok, `operator alert test failed: ${out.res.status} ${JSON.stringify(out.body)}`);
    assert(out.body?.ownerAlert?.attempted === false, `operator packet should stay log-only without owner destination: ${JSON.stringify(out.body)}`);
    steps.push({ name: "owner alert route", status: "ok", detail: "protected alert test executes in accepted log-only demo mode" });

    out = await json(
      "/webhook/voice/post-call",
      authJson({
        callId: "operator-packet-call-1",
        phone: "+491****8801",
        status: "needs_followup",
        summary: "Caller wants colour advice before booking.",
        customerName: "Mina",
        requestedService: "Balayage",
        preferredTime: "morgen Nachmittag",
        missingInfo: "Welche Haarlänge hast du ungefähr?",
      }),
    );
    assert(out.res.ok, `voice post-call packet failed: ${out.res.status} ${JSON.stringify(out.body)}`);
    assert(out.body?.followUpDraft?.reviewRequired === true, `post-call should return reviewed draft: ${JSON.stringify(out.body)}`);
    assert(out.body?.followUpDraft?.text?.includes("Welche Haarlänge hast du ungefähr?"), `draft should use typed missing info: ${JSON.stringify(out.body)}`);
    steps.push({ name: "voice post-call draft", status: "ok", detail: "typed call fields produce a reviewed WhatsApp follow-up draft" });
    const draftText = out.body.followUpDraft.text;

    out = await json(
      "/operator/follow-up/send",
      authJson({ phone: "whatsapp:+491****8801", message: draftText, reviewedBy: "operator-demo", sourceCallId: "operator-packet-call-1", optInConfirmed: true }),
    );
    assert(out.res.ok, `reviewed dry-run follow-up failed: ${out.res.status} ${JSON.stringify(out.body)}`);
    assert(out.body?.sent === false && out.body?.dryRun === true, `reviewed follow-up should default to dry-run: ${JSON.stringify(out.body)}`);
    steps.push({ name: "reviewed follow-up dry-run", status: "ok", detail: "operator-reviewed follow-up validates opt-in without provider sending" });
    const dryRunBody = out.body;

    out = await json(
      "/operator/follow-up/send",
      authJson({ phone: "whatsapp:+491****8801", message: draftText, reviewedBy: "operator-demo", sourceCallId: "operator-packet-call-1", optInConfirmed: true, dryRun: false }),
    );
    assert(out.res.status === 409, `live follow-up send should fail closed: ${out.res.status} ${JSON.stringify(out.body)}`);
    steps.push({ name: "live follow-up fail-closed", status: "ok", detail: "non-dry-run send remains blocked until explicit provider approval env is set" });
    const liveFollowUpBlockedStatus = out.res.status;

    out = await json("/privacy/export", authJson({ phone: "+491****8801" }));
    assert(out.res.ok, `privacy export failed: ${out.res.status} ${JSON.stringify(out.body)}`);
    assert(out.body?.callOutcomes?.length === 1, `privacy export should include one call outcome: ${JSON.stringify(out.body)}`);
    steps.push({ name: "privacy export", status: "ok", detail: "operator export retrieves the stored post-call outcome for the caller" });
    const exportBody = out.body;

    out = await json(
      "/tools/register_lead",
      authJson({
        phone: "+491****8801",
        args: {
          name: "Mina",
          service: "Balayage",
          notes: "Operator packet follow-up lead created from reviewed voice call.",
          channel: "phone",
          idempotencyKey: "operator-packet-lead-1",
        },
      }),
    );
    assert(out.res.ok && out.body?.ok === true, `operator lead registration failed: ${out.res.status} ${JSON.stringify(out.body)}`);
    steps.push({ name: "lead capture", status: "ok", detail: "phone follow-up is captured as a lead for owner metrics" });

    out = await json("/metrics/today", { headers: authHeaders() });
    assert(out.res.ok, `operator metrics failed: ${out.res.status} ${JSON.stringify(out.body)}`);
    assert(out.body?.byChannel?.phone >= 1, `operator packet should attribute at least one phone interaction: ${JSON.stringify(out.body)}`);
    steps.push({ name: "metrics", status: "ok", detail: "phone channel metrics are available through the protected endpoint" });

    const facts = {
      healthClient: health.client,
      readinessStatus: 409,
      readinessBlockers: readinessBody.blockers.length,
      followUpDryRunSent: dryRunBody.sent,
      liveFollowUpBlockedStatus,
      exportedCallOutcomes: exportBody.callOutcomes.length,
    };
    const report = buildPacketReport(steps, facts);
    writePacket(report);
    if (JSON_MODE) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(report.marker);
      console.log(JSON.stringify({ outputPath: report.outputPath, steps: steps.length, ...facts }, null, 2));
    }
  } finally {
    child.kill("SIGTERM");
    await sleep(250);
    if (!child.killed) child.kill("SIGKILL");
    if (stderr.trim()) console.error(stderr.trim());
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
