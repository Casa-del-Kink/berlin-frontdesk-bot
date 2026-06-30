import { spawn } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { DateTime } from "luxon";
import { setTimeout as sleep } from "node:timers/promises";

const PORT = Number(process.env.DEMO_FAKE_PORT || 4323);
const BASE = `http://127.0.0.1:${PORT}`;
const TOKEN = "fake-provider-demo-token";
const STATE_FILE = "data/fake-provider-demo-state.json";
const CALENDAR_FILE = "data/fake-provider-demo-calendar.json";
const require = createRequire(import.meta.url);
const TSX_CLI = require.resolve("tsx/cli");

type JsonResponse = { res: Response; body: any };
type TranscriptLine = { speaker: string; text: string };

function removeIfExists(path: string) {
  if (existsSync(path)) rmSync(path);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function countOccurrences(haystack: string, needle: string) {
  return haystack.split(needle).length - 1;
}

function transcriptLine(speaker: string, text: string): TranscriptLine {
  return { speaker, text };
}

function printTranscript(title: string, lines: TranscriptLine[]) {
  console.log(`\n${title}`);
  for (const line of lines) console.log(`${line.speaker}: ${line.text}`);
}

function authJson(body?: unknown): RequestInit {
  return {
    method: "POST",
    headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  };
}

async function json(path: string, init: RequestInit = {}): Promise<JsonResponse> {
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

async function waitForHealth() {
  const deadline = Date.now() + 15_000;
  let lastError = "not attempted";
  while (Date.now() < deadline) {
    try {
      const { res, body } = await json("/health");
      if (res.ok && body?.ok && body?.storeBackend === "json") return body;
      lastError = `${res.status} ${JSON.stringify(body)}`;
    } catch (e: any) {
      lastError = String(e?.message ?? e);
    }
    await sleep(250);
  }
  throw new Error(`server did not become healthy: ${lastError}`);
}

async function waitForOutput(getOutput: () => string, needle: string) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (getOutput().includes(needle)) return;
    await sleep(100);
  }
  throw new Error(`timed out waiting for server output: ${needle}`);
}

function formatSlot(iso: string) {
  return DateTime.fromISO(iso).setZone("Europe/Berlin").setLocale("de").toFormat("cccc dd.LL. HH:mm");
}

async function main() {
  removeIfExists(STATE_FILE);
  removeIfExists(CALENDAR_FILE);

  const child = spawn(process.execPath, [TSX_CLI, "src/server.ts"], {
    env: {
      ...process.env,
      PORT: String(PORT),
      USE_FAKE_CALENDAR: "true",
      FAKE_CALENDAR_FILE: CALENDAR_FILE,
      STATE_FILE,
      SERVER_TOOL_TOKEN: TOKEN,
      SKIP_TWILIO_SIGNATURE_VALIDATION: "false",
      DATA_RETENTION_DAYS: "30",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += String(chunk);
  });
  child.stderr.on("data", (chunk) => {
    stderr += String(chunk);
  });

  try {
    const health = await waitForHealth();
    assert(health.client === "Glanz & Schnitt Berlin", `unexpected demo client: ${JSON.stringify(health)}`);

    const from = DateTime.now().setZone("Europe/Berlin").plus({ days: 1 }).toISODate();
    let out = await json("/tools/check_availability", authJson({ phone: "+491****5101", args: { service: "Damenhaarschnitt", from, days: 4 } }));
    assert(out.res.ok, `demo availability failed: ${out.res.status} ${JSON.stringify(out.body)}`);
    const haircutSlots = out.body?.slots ?? [];
    assert(haircutSlots.length >= 2, `demo should have two haircut slots: ${JSON.stringify(out.body)}`);
    const selectedSlot = haircutSlots[0].iso;

    const bookingTranscript = [
      transcriptLine("Tilda", "Hallo, hier ist Tilda von Glanz & Schnitt Berlin. Ich bin die KI-Rezeption. Wie kann ich dir helfen?"),
      transcriptLine("Customer", "Hi, ich brauche einen Termin für einen Damenhaarschnitt."),
      transcriptLine("Tilda", "Gern. Ich schaue nach den nächsten freien Terminen."),
      transcriptLine("Tool", `check_availability returned ${formatSlot(haircutSlots[0].iso)} and ${formatSlot(haircutSlots[1].iso)}`),
      transcriptLine("Customer", "Der erste Termin passt. Ich heiße Laura Schneider."),
    ];

    out = await json(
      "/tools/book_appointment",
      authJson({ phone: "+491****5101", args: { name: "Laura Schneider", service: "Damenhaarschnitt", start: selectedSlot, channel: "phone" } }),
    );
    assert(out.res.ok, `demo booking failed: ${out.res.status} ${JSON.stringify(out.body)}`);
    assert(out.body?.ok === true && out.body?.channel === "phone", `demo booking should succeed as phone: ${JSON.stringify(out.body)}`);
    assert(out.body?.estimatedValueCents === 4500, `demo booking value mismatch: ${JSON.stringify(out.body)}`);
    await waitForOutput(() => stdout, "New booking: Laura Schneider - Damenhaarschnitt");
    assert(countOccurrences(stdout, "New booking: Laura Schneider - Damenhaarschnitt") === 1, `booking alert should fire once: ${stdout}`);
    bookingTranscript.push(transcriptLine("Tilda", `Perfekt, Laura. Ich habe dich ${formatSlot(selectedSlot)} für den Damenhaarschnitt eingetragen.`));
    printTranscript("PHONE BOOKING DEMO", bookingTranscript);

    out = await json(
      "/tools/register_lead",
      authJson({
        phone: "+491****5102",
        args: {
          name: "Mina Hoffmann",
          service: "Färben & Strähnen",
          notes: "Kundin ist unsicher zwischen Färben und Strähnen und möchte Rückruf.",
          channel: "phone",
          idempotencyKey: "fake-demo-colour-followup-1",
        },
      }),
    );
    assert(out.res.ok, `demo follow-up failed: ${out.res.status} ${JSON.stringify(out.body)}`);
    assert(out.body?.ok === true && out.body?.channel === "phone", `demo follow-up should be phone: ${JSON.stringify(out.body)}`);
    await waitForOutput(() => stdout, "Follow-up needed: Mina Hoffmann");
    assert(countOccurrences(stdout, "Follow-up needed: Mina Hoffmann") === 1, `follow-up alert should fire once: ${stdout}`);

    out = await json(
      "/tools/register_lead",
      authJson({
        phone: "+491****5102",
        args: {
          name: "Mina Hoffmann",
          service: "Färben & Strähnen",
          notes: "Provider retry for same colour callback.",
          channel: "phone",
          idempotencyKey: "fake-demo-colour-followup-1",
        },
      }),
    );
    assert(out.res.ok && out.body?.idempotentReplay === true, `demo follow-up retry should be idempotent: ${out.res.status} ${JSON.stringify(out.body)}`);
    assert(countOccurrences(stdout, "Follow-up needed: Mina Hoffmann") === 1, `follow-up retry should not duplicate owner alert: ${stdout}`);
    printTranscript("PHONE FOLLOW-UP DEMO", [
      transcriptLine("Customer", "Ich bin nicht sicher, ob ich färben oder Strähnen brauche."),
      transcriptLine("Tilda", "Kein Problem. Ich gebe das ans Team weiter. Wie heißt du und unter welcher Nummer erreicht man dich am besten?"),
      transcriptLine("Tool", "register_lead stored one colour callback and ignored the provider retry"),
      transcriptLine("Tilda", "Danke, ich gebe es direkt weiter. Das Team meldet sich zur Abstimmung bei dir."),
    ]);

    out = await json("/webhook/voice/post-call", authJson({ callId: "fake-demo-call-1", phone: "+491****5102", status: "needs_followup", summary: "Caller asked for colour advice and wants a human callback." }));
    assert(out.res.ok && out.body?.outcome?.status === "needs_followup", `demo post-call follow-up failed: ${out.res.status} ${JSON.stringify(out.body)}`);

    out = await json("/tools/check_availability", authJson({ phone: "whatsapp:+491****5103", args: { service: "Herrenhaarschnitt", from, days: 4 } }));
    assert(out.res.ok, `demo WhatsApp availability failed: ${out.res.status} ${JSON.stringify(out.body)}`);
    const mensSlots = out.body?.slots ?? [];
    assert(mensSlots.length >= 2, `WhatsApp continuation should have slots: ${JSON.stringify(out.body)}`);
    out = await json(
      "/tools/register_lead",
      authJson({
        phone: "whatsapp:+491****5103",
        args: {
          name: "Jonas Becker",
          service: "Herrenhaarschnitt",
          notes: "WhatsApp customer asked for available haircut times and wants the team to confirm the best slot.",
          channel: "whatsapp",
          idempotencyKey: "fake-demo-whatsapp-haircut-1",
        },
      }),
    );
    assert(out.res.ok && out.body?.ok === true && out.body?.channel === "whatsapp", `demo WhatsApp lead failed: ${out.res.status} ${JSON.stringify(out.body)}`);
    printTranscript("WHATSAPP CONTINUATION DEMO", [
      transcriptLine("Customer WhatsApp", "Hi, habt ihr morgen was für Herrenhaarschnitt frei?"),
      transcriptLine("Tilda", "Hallo, hier ist Tilda von Glanz & Schnitt Berlin. Ich schaue gern."),
      transcriptLine("Tool", `check_availability returned ${formatSlot(mensSlots[0].iso)} and ${formatSlot(mensSlots[1].iso)}`),
      transcriptLine("Tilda", "Morgen wären zwei Zeiten frei. Was passt dir besser? Ich kann das auch ans Team geben."),
      transcriptLine("Tool", "register_lead stored one WhatsApp follow-up for the owner"),
    ]);

    out = await json("/metrics/today", { headers: { authorization: `Bearer ${TOKEN}` } });
    assert(out.res.ok, `demo metrics failed: ${out.res.status} ${JSON.stringify(out.body)}`);
    assert(out.body?.booked === 1, `demo should have one booked appointment: ${JSON.stringify(out.body)}`);
    assert(out.body?.followups === 2, `demo should have two follow-up leads: ${JSON.stringify(out.body)}`);
    assert(out.body?.estimatedBookedRevenueCents === 4500, `booked revenue proof missing: ${JSON.stringify(out.body)}`);
    assert(out.body?.estimatedPipelineRevenueCents === 16200, `pipeline revenue proof missing: ${JSON.stringify(out.body)}`);
    assert(out.body?.byChannel?.phone === 2, `phone channel proof missing: ${JSON.stringify(out.body)}`);
    assert(out.body?.byChannel?.whatsapp === 1, `WhatsApp channel proof missing: ${JSON.stringify(out.body)}`);

    const bookingExport = await json("/privacy/export", authJson({ phone: "+491****5101" }));
    assert(bookingExport.res.ok && bookingExport.body?.leads?.length === 1, `booking privacy export should include booking lead: ${bookingExport.res.status} ${JSON.stringify(bookingExport.body)}`);
    const followUpExport = await json("/privacy/export", authJson({ phone: "+491****5102" }));
    assert(
      followUpExport.res.ok && followUpExport.body?.leads?.length === 1 && followUpExport.body?.callOutcomes?.length === 1,
      `follow-up privacy export should include lead and call summary: ${followUpExport.res.status} ${JSON.stringify(followUpExport.body)}`,
    );

    console.log("\nDEMO SUMMARY");
    console.log(
      JSON.stringify(
        {
          client: health.client,
          calendarProvider: "fake",
          storeBackend: health.storeBackend,
          booking: { name: "Laura Schneider", service: "Damenhaarschnitt", when: formatSlot(selectedSlot), estimatedValueCents: 4500 },
          followUp: { name: "Mina Hoffmann", service: "Färben & Strähnen", estimatedValueCents: 8900 },
          whatsAppFollowUp: { name: "Jonas Becker", service: "Herrenhaarschnitt", estimatedValueCents: 2800 },
          metrics: out.body,
          proof: ["booking owner alert once", "follow-up owner alert once", "provider retry idempotent", "privacy export includes demo records"],
        },
        null,
        2,
      ),
    );
    console.log("DEMO_FAKE_HAIR_SALON_OK");
  } finally {
    child.kill("SIGTERM");
    await sleep(250);
    if (!child.killed) child.kill("SIGKILL");
    if (stderr.trim()) console.error(stderr.trim());
    if (process.env.DEMO_FAKE_VERBOSE === "true" && stdout.trim()) console.log(stdout.trim());
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
