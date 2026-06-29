import { rmSync } from "node:fs";
import { DateTime } from "luxon";

process.env.USE_FAKE_CALENDAR ??= "true";
process.env.STATE_FILE ??= "data/first-test-state.json";
process.env.FAKE_CALENDAR_FILE ??= "data/first-test-calendar.json";

for (const file of [process.env.STATE_FILE, process.env.FAKE_CALENDAR_FILE]) {
  if (file) rmSync(file, { force: true });
}

type Loaded = typeof import("./config.js");

type Client = ReturnType<Loaded["loadClient"]>;

function nextOpenSlot(cfg: Client, serviceName: string, findService: Loaded["findService"]) {
  const service = findService(cfg, serviceName) ?? cfg.services[0];
  let cursor = DateTime.now().setZone(cfg.timezone).plus({ days: 1 }).startOf("day");

  for (let i = 0; i < 14; i++) {
    if (cfg.hours.days.includes(cursor.weekday)) {
      const [hour, minute] = cfg.hours.open.split(":").map(Number);
      return {
        service,
        start: cursor.set({ hour, minute, second: 0, millisecond: 0 }),
      };
    }
    cursor = cursor.plus({ days: 1 });
  }

  throw new Error("No open day found in the next 14 days");
}

async function main() {
  // Import after env setup so fake-calendar/state files are honored by modules with top-level config.
  const { loadClient, findService } = await import("./config.js");
  const { runTool } = await import("./tools.js");
  const { addCallOutcome, addLead, addMessage, deleteSubjectData, exportSubjectData, metricsOn } = await import("./store.js");

  const cfg = loadClient();
  const phone = "whatsapp:+491****1111";
  const serviceName = cfg.services[0].name;
  const { service, start } = nextOpenSlot(cfg, serviceName, findService);

  console.log(`First-test smoke for ${cfg.name}`);
  console.log(`Mode: fake calendar (${process.env.FAKE_CALENDAR_FILE})`);
  console.log(`Service: ${service.name}`);
  console.log(`Candidate start: ${start.toISO()}`);

  const availabilityBefore = await runTool(cfg, phone, "check_availability", {
    service: service.name,
    from: start.toISODate(),
    days: 3,
  });
  console.log("availability_before=", JSON.stringify(availabilityBefore));

  const booking = await runTool(cfg, phone, "book_appointment", {
    name: "Test Kundin",
    service: service.name,
    start: start.toISO(),
    channel: "phone",
  });
  console.log("booking=", JSON.stringify(booking));

  const idempotentReplay = await runTool(cfg, phone, "book_appointment", {
    name: "Test Kundin",
    service: service.name,
    start: start.toISO(),
    channel: "phone",
  });
  console.log("idempotent_replay=", JSON.stringify(idempotentReplay));

  const doubleBooking = await runTool(cfg, "whatsapp:+491****3333", "book_appointment", {
    name: "Double Booking Test",
    service: service.name,
    start: start.toISO(),
    channel: "phone",
  });
  console.log("double_booking_guard=", JSON.stringify(doubleBooking));

  const lead = await runTool(cfg, phone, "register_lead", {
    name: "Follow Up Test",
    service: service.name,
    notes: "Customer wants a callback about pricing.",
    channel: "whatsapp",
  });
  console.log("lead=", JSON.stringify(lead));

  const availabilityAfter = await runTool(cfg, phone, "check_availability", {
    service: service.name,
    from: start.toISODate(),
    days: 3,
  });
  console.log("availability_after=", JSON.stringify(availabilityAfter));

  const today = DateTime.now().setZone(cfg.timezone).toISODate()!;
  const metrics = metricsOn(today, cfg.timezone);
  console.log("metrics_today=", JSON.stringify(metrics));

  const privacyPhone = "whatsapp:+491****2222";
  addMessage(privacyPhone, "user", "Bitte exportiere meine Daten.");
  addMessage(privacyPhone, "assistant", "Ich gebe das an das Team weiter.");
  addLead({
    phone: privacyPhone,
    name: "Privacy Test",
    service: service.name,
    status: "needs_followup",
    notes: "Data subject request test fixture.",
    channel: "whatsapp",
    estimatedValueCents: 0,
    createdAt: "2020-01-01T10:00:00.000+01:00",
  });
  addCallOutcome({
    callId: "privacy-call-test",
    phone: privacyPhone,
    status: "voicemail",
    summary: "Caller asked for data deletion.",
    createdAt: "2020-01-01T10:05:00.000+01:00",
  });
  const exported = exportSubjectData(privacyPhone);
  console.log("privacy_export=", JSON.stringify(exported));
  const deleted = deleteSubjectData(privacyPhone);
  const afterDelete = exportSubjectData(privacyPhone);
  console.log("privacy_delete=", JSON.stringify(deleted));

  if (!(booking as any).ok) throw new Error("Expected booking to succeed");
  if (!(idempotentReplay as any).ok || !(idempotentReplay as any).idempotentReplay) {
    throw new Error("Expected same booking retry to return an idempotent replay");
  }
  if (!(doubleBooking as any).error) throw new Error("Expected double-booking guard to reject the second booking");
  if (!(lead as any).ok) throw new Error("Expected lead registration to succeed");
  if (metrics.booked !== 1 || metrics.followups !== 1) throw new Error("Expected metrics to count one booking and one follow-up");
  if (metrics.estimatedBookedRevenueCents <= 0) throw new Error("Expected booked revenue estimate to be present");
  if (metrics.byChannel.phone !== 1 || metrics.byChannel.whatsapp !== 1) throw new Error("Expected channel metrics for phone and WhatsApp");
  if (exported.conversations.length !== 2 || exported.leads.length !== 1 || exported.callOutcomes.length !== 1) {
    throw new Error("Expected privacy export to include conversation, lead, and call outcome data");
  }
  if (deleted.conversationsDeleted !== 2 || deleted.leadsDeleted !== 1 || deleted.callOutcomesDeleted !== 1) {
    throw new Error("Expected privacy delete to remove conversation, lead, and call outcome data");
  }
  if (afterDelete.conversations.length !== 0 || afterDelete.leads.length !== 0 || afterDelete.callOutcomes.length !== 0) {
    throw new Error("Expected no subject data after privacy delete");
  }

  const bookedIso = start.toISO();
  const afterSlots = (availabilityAfter as any).slots ?? [];
  if (afterSlots.some((slot: { iso: string }) => slot.iso === bookedIso)) {
    throw new Error("Expected booked slot to be absent from availability after booking");
  }

  console.log("FIRST_TEST_SMOKE_OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
