import express from "express";
import cron from "node-cron";
import twilio from "twilio";
import { DateTime } from "luxon";
import { loadClient, validateRuntimeEnv } from "./config.js";
import { assertDeploymentReadiness, validateDeploymentReadiness } from "./readiness.js";
import { buildSystemPrompt } from "./prompt.js";
import { runConversation } from "./llm.js";
import { toolDefs, makeHandlers, runTool } from "./tools.js";
import {
  addCallOutcome,
  addMessage,
  callOutcomesOn,
  deleteSubjectData,
  exportSubjectData,
  getHistory,
  getStoreBackend,
  leadsOn,
  metricsOn,
  purgeOldData,
} from "./store.js";
import { sendWhatsapp } from "./whatsapp.js";
import { alertOwner as sendOwnerAlert } from "./owner-alerts.js";
import { normalizeVoicePostCallPayload } from "./voice-post-call.js";
import { renderLandingPage } from "./landing.js";

const cfg = loadClient();
const app = express();
app.set("trust proxy", true);
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

for (const warning of validateRuntimeEnv()) console.warn(`[config] ${warning}`);
if (process.env.REQUIRE_LIVE_PILOT_READINESS === "true") assertDeploymentReadiness(cfg);

app.get("/", (_req, res) => res.type("html").send(renderLandingPage()));
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

function euros(cents: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(cents / 100);
}

function subjectPhone(req: express.Request) {
  const phone = String(req.body?.phone || req.query.phone || "").trim();
  if (!phone) throw new Error("Missing required phone");
  return phone;
}

function retentionDays(value: unknown): number {
  const days = Number(value || process.env.DATA_RETENTION_DAYS || 90);
  if (!Number.isFinite(days) || days <= 0) throw new Error("maxAgeDays must be a positive number");
  return days;
}

function booleanBody(value: unknown) {
  return value === true || value === "true" || value === "1";
}

function stringBody(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function requireReviewedFollowUpBody(req: express.Request) {
  const phone = stringBody(req.body?.phone);
  const message = stringBody(req.body?.message);
  const reviewedBy = stringBody(req.body?.reviewedBy);
  const sourceCallId = stringBody(req.body?.sourceCallId);
  const dryRun = req.body?.dryRun === undefined ? true : booleanBody(req.body?.dryRun);
  const optInConfirmed = booleanBody(req.body?.optInConfirmed);

  if (!phone) throw new Error("Missing required phone");
  if (!message) throw new Error("Missing required message");
  if (message.length > 1000) throw new Error("Follow-up message must be 1000 characters or less");
  if (!reviewedBy) throw new Error("Missing required reviewedBy");
  if (!optInConfirmed) throw new Error("optInConfirmed must be true before a follow-up can be queued or sent");
  if (!phone.startsWith("whatsapp:")) throw new Error("phone must use whatsapp:+... format for WhatsApp follow-up sending");

  return { phone, message, reviewedBy, sourceCallId, dryRun };
}

async function alertOwner(message: string) {
  return sendOwnerAlert(cfg, message);
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

// Operator-only owner-alert proof path. Useful before live pilots to verify the alert route
// without booking a fake customer appointment.
app.post("/operator/alert-test", async (req, res) => {
  if (!validateToolRequest(req)) return res.status(401).json({ error: "Unauthorized" });
  const message = String(req.body?.message || `Tilda alert test for ${cfg.name}`);
  const result = await alertOwner(message.slice(0, 1000));
  res.json({ ok: true, ownerAlert: result });
});

// Operator-reviewed follow-up path for voice post-call drafts. Dry-run is the default so
// operators can validate wording and consent state without sending WhatsApp traffic.
app.post("/operator/follow-up/send", async (req, res) => {
  if (!validateToolRequest(req)) return res.status(401).json({ error: "Unauthorized" });
  try {
    const followUp = requireReviewedFollowUpBody(req);
    if (!followUp.dryRun && process.env.ENABLE_REVIEWED_FOLLOWUP_SEND !== "true") {
      return res.status(409).json({
        ok: false,
        sent: false,
        dryRun: false,
        error: "Reviewed follow-up sending is disabled. Set ENABLE_REVIEWED_FOLLOWUP_SEND=true only after opt-in and provider setup are approved.",
      });
    }

    if (followUp.dryRun) {
      return res.json({ ok: true, sent: false, dryRun: true, phone: followUp.phone, reviewedBy: followUp.reviewedBy, sourceCallId: followUp.sourceCallId || undefined });
    }

    const sent = await sendWhatsapp(followUp.phone, followUp.message);
    await addMessage(followUp.phone, "assistant", followUp.message);
    res.json({ ok: true, sent, dryRun: false, phone: followUp.phone, reviewedBy: followUp.reviewedBy, sourceCallId: followUp.sourceCallId || undefined });
  } catch (e: any) {
    res.status(400).json({ error: String(e?.message ?? e) });
  }
});

// Voice/phone post-call webhook for ElevenLabs/Twilio-style call summaries.
// Do not store raw transcripts by default; store a short summary + optional URLs only when configured upstream.
app.post("/webhook/voice/post-call", async (req, res) => {
  if (!validateToolRequest(req)) return res.status(401).json({ error: "Unauthorized" });
  const normalized = normalizeVoicePostCallPayload(req.body, {
    storeTranscriptUrl: process.env.VOICE_STORE_TRANSCRIPT_URLS === "true",
    storeRecordingUrl: process.env.VOICE_STORE_RECORDING_URLS === "true",
  });
  if (!normalized.outcome) return res.status(400).json({ error: normalized.error, warnings: normalized.warnings });

  const stored = await addCallOutcome(normalized.outcome);

  if (
    stored.inserted &&
    (normalized.outcome.status === "needs_followup" || normalized.outcome.status === "missed" || normalized.outcome.status === "voicemail" || normalized.outcome.status === "failed")
  ) {
    await alertOwner(
      `Phone follow-up needed: ${normalized.outcome.phone} · ${normalized.outcome.status}${normalized.outcome.summary ? ` · ${normalized.outcome.summary}` : ""}`,
    );
  }

  res.json({ ok: true, outcome: stored.outcome, followUpDraft: normalized.followUpDraft, idempotentReplay: !stored.inserted, warnings: normalized.warnings });
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

// Inbound Twilio WhatsApp webhook.
app.post("/webhook/whatsapp", async (req, res) => {
  if (!validateTwilioRequest(req)) return res.status(403).send("Invalid Twilio signature");

  const from = String(req.body.From || "");
  const body = String(req.body.Body || "").trim();
  res.sendStatus(200); // respond fast; the reply goes out via the REST API

  if (!from || !body) return;
  try {
    await addMessage(from, "user", body);
    const history = (await getHistory(from)).slice(-12);
    const messages = [
      { role: "system", content: buildSystemPrompt(cfg) },
      ...history.map((h) => ({ role: h.role, content: h.content })),
    ];
    const reply = await runConversation(messages, toolDefs, makeHandlers(cfg, from));
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

  await alertOwner(msg);
}

cron.schedule("0 20 * * *", dailySummary, { timezone: cfg.timezone });

const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`Front-desk bot listening on :${port} - client: ${cfg.name}`));
