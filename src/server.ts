import express from "express";
import cron from "node-cron";
import twilio from "twilio";
import { DateTime } from "luxon";
import { loadClient, validateRuntimeEnv } from "./config.js";
import { assertDeploymentReadiness, validateDeploymentReadiness } from "./readiness.js";
import { buildSystemPrompt } from "./prompt.js";
import { runConversation } from "./llm.js";
import { toolDefs, makeHandlers, runTool, findUnconfiguredPrices, handoffPauseHours } from "./tools.js";
import {
  addCallOutcome,
  addMessage,
  callOutcomesOn,
  clearConversationPause,
  deleteSubjectData,
  exportSubjectData,
  getConversationPause,
  getHistory,
  getStoreBackend,
  leadsOn,
  metricsOn,
  purgeOldData,
  setConversationPause,
  type CallOutcome,
} from "./store.js";
import { sendWhatsapp } from "./whatsapp.js";
import { alertOwner as alertOwnerSafe } from "./owner-alerts.js";

const cfg = loadClient();
const app = express();
app.set("trust proxy", true);
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

for (const warning of validateRuntimeEnv()) console.warn(`[config] ${warning}`);
if (process.env.REQUIRE_LIVE_PILOT_READINESS === "true") assertDeploymentReadiness(cfg);

app.get("/", (_req, res) => res.send(`OK - ${cfg.name}`));
app.get("/health", (_req, res) => res.json({ ok: true, client: cfg.name, storeBackend: getStoreBackend().name, time: new Date().toISOString() }));
app.get("/readiness/live-pilot", (req, res) => {
  if (!validateToolRequest(req)) return res.status(401).json({ error: "Unauthorized" });
  const readiness = validateDeploymentReadiness(cfg);
  res.status(readiness.ok ? 200 : 409).json(readiness);
});

function publicWebhookUrl(req: express.Request) {
  const base = process.env.TWILIO_WEBHOOK_BASE_URL;
  if (base) return `${base.replace(/\/$/, "")}${req.originalUrl}`;
  return `${req.protocol}://${req.get("host")}${req.originalUrl}`;
}

function validateTwilioRequest(req: express.Request) {
  if (process.env.SKIP_TWILIO_SIGNATURE_VALIDATION === "true") return true;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const signature = req.get("x-twilio-signature") || "";
  if (!token || !signature) return false;
  return twilio.validateRequest(token, signature, publicWebhookUrl(req), req.body);
}

function validateToolRequest(req: express.Request) {
  const token = process.env.SERVER_TOOL_TOKEN;
  if (!token) return true; // local/demo mode
  return req.get("authorization") === `Bearer ${token}`;
}

// Owner-only operator actions (pause/resume, alert-test) use a distinct token when set, so the
// voice-agent/server-tool token cannot drive operator actions. Falls back to SERVER_TOOL_TOKEN
// behavior (including the existing unset=open local/demo semantics) when OPERATOR_TOKEN is unset.
function validateOperatorRequest(req: express.Request) {
  const token = process.env.OPERATOR_TOKEN || process.env.SERVER_TOOL_TOKEN;
  if (!token) return true; // local/demo mode
  return req.get("authorization") === `Bearer ${token}`;
}

function euros(cents: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(cents / 100);
}

function subjectPhone(req: express.Request) {
  const phone = String(req.body?.phone || req.query.phone || "").trim();
  if (!phone) throw new Error("Missing required phone");
  return phone;
}

function callStatus(value: unknown): CallOutcome["status"] {
  const status = String(value || "answered");
  const allowed: CallOutcome["status"][] = ["booked", "needs_followup", "answered", "missed", "voicemail", "failed"];
  return allowed.includes(status as CallOutcome["status"]) ? (status as CallOutcome["status"]) : "answered";
}

function retentionDays(value: unknown): number {
  const days = Number(value || process.env.DATA_RETENTION_DAYS || 90);
  if (!Number.isFinite(days) || days <= 0) throw new Error("maxAgeDays must be a positive number");
  return days;
}

function booleanBody(value: unknown) {
  return value === true || value === "true" || value === "1";
}

async function alertOwner(message: string) {
  await alertOwnerSafe(cfg, message);
}

// Shared "one brain" endpoint for WhatsApp, ElevenLabs server tools, or internal tests.
app.post("/tools/:name", async (req, res) => {
  if (!validateToolRequest(req)) return res.status(401).json({ error: "Unauthorized" });
  const phone = String(req.body.phone || "external-tool");
  try {
    const result = await runTool(cfg, phone, req.params.name, req.body.args ?? req.body);
    res.json(result);
  } catch (e: any) {
    console.error(`Error running tool ${req.params.name}:`, e);
    res.status(500).json({ error: String(e?.message ?? e) });
  }
});

// Operator-facing proof point for the narrow wedge: inquiries, bookings, and estimated recovered revenue.
app.get("/metrics/today", async (req, res) => {
  if (!validateToolRequest(req)) return res.status(401).json({ error: "Unauthorized" });
  const today = DateTime.now().setZone(cfg.timezone).toISODate()!;
  res.json(await metricsOn(today, cfg.timezone));
});

// Voice/phone post-call webhook for ElevenLabs/Twilio-style call summaries.
// Do not store raw transcripts by default; store a short summary + optional URLs only when configured upstream.
app.post("/webhook/voice/post-call", async (req, res) => {
  if (!validateToolRequest(req)) return res.status(401).json({ error: "Unauthorized" });
  const phone = String(req.body.phone || req.body.caller || "").trim();
  if (!phone) return res.status(400).json({ error: "Missing required phone" });

  const outcome = {
    callId: String(req.body.callId || req.body.call_id || `call_${Date.now()}`),
    phone,
    status: callStatus(req.body.status),
    summary: req.body.summary ? String(req.body.summary).slice(0, 1000) : undefined,
    transcriptUrl: req.body.transcriptUrl ? String(req.body.transcriptUrl) : undefined,
    recordingUrl: req.body.recordingUrl ? String(req.body.recordingUrl) : undefined,
    createdAt: new Date().toISOString(),
  };
  const stored = await addCallOutcome(outcome);

  if (stored.inserted && (outcome.status === "needs_followup" || outcome.status === "missed" || outcome.status === "voicemail" || outcome.status === "failed")) {
    await alertOwner(`Phone follow-up needed: ${phone} · ${outcome.status}${outcome.summary ? ` · ${outcome.summary}` : ""}`);
  }

  res.json({ ok: true, outcome: stored.outcome, idempotentReplay: !stored.inserted });
});

// GDPR-support endpoints for first pilots: export/delete one customer's stored conversation and lead data.
// These are operator-only and must be bearer-protected in any real deployment via SERVER_TOOL_TOKEN.
app.post("/privacy/export", async (req, res) => {
  if (!validateToolRequest(req)) return res.status(401).json({ error: "Unauthorized" });
  try {
    res.json(await exportSubjectData(subjectPhone(req)));
  } catch (e: any) {
    res.status(400).json({ error: String(e?.message ?? e) });
  }
});

app.post("/privacy/delete", async (req, res) => {
  if (!validateToolRequest(req)) return res.status(401).json({ error: "Unauthorized" });
  try {
    res.json(await deleteSubjectData(subjectPhone(req)));
  } catch (e: any) {
    res.status(400).json({ error: String(e?.message ?? e) });
  }
});

// GDPR/data-minimization helper for first pilots. Protected operator endpoint; dryRun defaults true.
app.post("/privacy/retention/purge", async (req, res) => {
  if (!validateToolRequest(req)) return res.status(401).json({ error: "Unauthorized" });
  try {
    res.json(await purgeOldData(retentionDays(req.body?.maxAgeDays), req.body?.dryRun === undefined ? true : booleanBody(req.body.dryRun)));
  } catch (e: any) {
    res.status(400).json({ error: String(e?.message ?? e) });
  }
});

// Operator-only human-handoff controls. Distinct OPERATOR_TOKEN auth (falls back to
// SERVER_TOOL_TOKEN) so the voice-agent/server-tool token cannot pause/resume conversations
// or trigger a real owner alert on its own.
app.post("/operator/pause", async (req, res) => {
  if (!validateOperatorRequest(req)) return res.status(401).json({ error: "Unauthorized" });
  const phone = String(req.body?.phone || "").trim();
  if (!phone) return res.status(400).json({ error: "Missing required phone" });
  const hours = req.body?.hours === undefined ? handoffPauseHours() : Number(req.body.hours);
  if (!Number.isFinite(hours) || hours <= 0) return res.status(400).json({ error: "hours must be a positive number" });
  const pausedUntil = await setConversationPause(phone, hours);
  res.json({ ok: true, phone, pausedUntil });
});

app.post("/operator/resume", async (req, res) => {
  if (!validateOperatorRequest(req)) return res.status(401).json({ error: "Unauthorized" });
  const phone = String(req.body?.phone || "").trim();
  if (!phone) return res.status(400).json({ error: "Missing required phone" });
  await clearConversationPause(phone);
  res.json({ ok: true, phone });
});

// Operator smoke-test for the owner-alert path. Bearer-protected; goes through the same
// fail-safe alertOwner used by real bookings/leads so operators can verify wiring before go-live.
app.post("/operator/alert-test", async (req, res) => {
  if (!validateOperatorRequest(req)) return res.status(401).json({ error: "Unauthorized" });
  const message = String(req.body?.message || `Tilda alert test for ${cfg.name}`);
  const result = await alertOwnerSafe(cfg, message.slice(0, 1000));
  res.json({ ok: true, ownerAlert: result });
});

// Static bilingual reply sent while a conversation is paused for human handoff. The owner alert
// already fired when the pause was set, so this path must not re-alert or call the LLM.
const HANDOFF_PAUSE_REPLY =
  "Eine Kollegin meldet sich gleich persönlich bei dir. / A colleague will get back to you personally in a moment.";

// Inbound Twilio WhatsApp webhook.
app.post("/webhook/whatsapp", async (req, res) => {
  if (!validateTwilioRequest(req)) return res.status(403).send("Invalid Twilio signature");

  const from = String(req.body.From || "");
  const body = String(req.body.Body || "").trim();
  res.sendStatus(200); // respond fast; the reply goes out via the REST API

  if (!from || !body) return;
  try {
    const pausedUntil = await getConversationPause(from);
    if (pausedUntil) {
      if (DateTime.fromISO(pausedUntil) > DateTime.now()) {
        await addMessage(from, "user", body);
        await addMessage(from, "assistant", HANDOFF_PAUSE_REPLY);
        await sendWhatsapp(from, HANDOFF_PAUSE_REPLY);
        return;
      }
      await clearConversationPause(from);
    }

    await addMessage(from, "user", body);
    const history = (await getHistory(from)).slice(-12);
    const messages = [
      { role: "system", content: buildSystemPrompt(cfg) },
      ...history.map((h) => ({ role: h.role, content: h.content })),
    ];
    const reply = await runConversation(messages, toolDefs, makeHandlers(cfg, from));
    for (const price of findUnconfiguredPrices(reply, cfg)) {
      console.log(`[guardrail] price token not in config: ${price}`);
    }
    await addMessage(from, "assistant", reply);
    await sendWhatsapp(from, reply);
  } catch (e) {
    console.error("Error handling message:", e);
    await sendWhatsapp(from, "Sorry, brief technical hiccup. Please message me again. 🙏");
  }
});

// Daily summary to the owner at 20:00 (business timezone).
async function dailySummary() {
  const today = DateTime.now().setZone(cfg.timezone).toISODate()!;
  const leads = await leadsOn(today, cfg.timezone);
  const calls = await callOutcomesOn(today, cfg.timezone);
  const metrics = await metricsOn(today, cfg.timezone);
  const booked = leads.filter((l) => l.status === "booked");
  const followups = leads.filter((l) => l.status === "needs_followup");

  const lines = [
    `📋 Daily summary ${cfg.name} (${DateTime.now().setZone(cfg.timezone).toFormat("dd.LL.")})`,
    `• Inquiries today: ${leads.length}`,
    `• Booked appointments: ${booked.length}`,
    `• Estimated booked revenue: ${euros(metrics.estimatedBookedRevenueCents)}`,
    `• Phone calls logged: ${calls.length}`,
    `• Channel mix: WhatsApp ${metrics.byChannel.whatsapp}, phone ${metrics.byChannel.phone}, tools ${metrics.byChannel.server_tool}`,
    ...booked.map(
      (b) => `   - ${b.name ?? "?"} · ${b.service ?? "?"} · ${b.startISO ? DateTime.fromISO(b.startISO).setZone(cfg.timezone).toFormat("dd.LL. HH:mm") : ""}`,
    ),
    `• Still to follow up: ${followups.length}`,
    ...followups.map((f) => `   - ${f.name ?? "?"} · ${f.notes ?? ""}`),
  ];
  const msg = lines.join("\n");

  if (cfg.ownerWhatsapp) sendWhatsapp(cfg.ownerWhatsapp, msg);
  else console.log("[daily summary]\n" + msg);
}

cron.schedule("0 20 * * *", dailySummary, { timezone: cfg.timezone });

const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`Front-desk bot listening on :${port} - client: ${cfg.name}`));
