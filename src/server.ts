import express from "express";
import cron from "node-cron";
import { DateTime } from "luxon";
import { loadClient } from "./config.js";
import { buildSystemPrompt } from "./prompt.js";
import { runConversation } from "./llm.js";
import { toolDefs, makeHandlers } from "./tools.js";
import { addMessage, getHistory, leadsOn } from "./store.js";
import { sendWhatsapp } from "./whatsapp.js";

const cfg = loadClient();
const app = express();
app.use(express.urlencoded({ extended: false }));

app.get("/", (_req, res) => res.send(`OK - ${cfg.name}`));

// Inbound Twilio WhatsApp webhook.
app.post("/webhook/whatsapp", async (req, res) => {
  const from = String(req.body.From || "");
  const body = String(req.body.Body || "").trim();
  res.sendStatus(200); // respond fast; the reply goes out via the REST API

  if (!from || !body) return;
  try {
    addMessage(from, "user", body);
    const history = getHistory(from).slice(-12);
    const messages = [
      { role: "system", content: buildSystemPrompt(cfg) },
      ...history.map((h) => ({ role: h.role, content: h.content })),
    ];
    const reply = await runConversation(messages, toolDefs, makeHandlers(cfg, from));
    addMessage(from, "assistant", reply);
    await sendWhatsapp(from, reply);
  } catch (e) {
    console.error("Error handling message:", e);
    await sendWhatsapp(from, "Sorry, brief technical hiccup. Please message me again. 🙏");
  }
});

// Daily summary to the owner at 20:00 (business timezone).
function dailySummary() {
  const today = DateTime.now().setZone(cfg.timezone).toISODate()!;
  const leads = leadsOn(today, cfg.timezone);
  const booked = leads.filter((l) => l.status === "booked");
  const followups = leads.filter((l) => l.status === "needs_followup");

  const lines = [
    `📋 Daily summary ${cfg.name} (${DateTime.now().setZone(cfg.timezone).toFormat("dd.LL.")})`,
    `• Inquiries today: ${leads.length}`,
    `• Booked appointments: ${booked.length}`,
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
