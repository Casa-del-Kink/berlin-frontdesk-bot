import { DateTime } from "luxon";

process.env.STORE_BACKEND = "postgres";
process.env.MAX_HISTORY_PER_PHONE ??= "3";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  if (!process.env.DATABASE_URL && !process.env.POSTGRES_URL) {
    throw new Error("DATABASE_URL or POSTGRES_URL is required for npm run postgres:smoke");
  }

  const {
    addCallOutcome,
    addLead,
    addMessage,
    bookedLead,
    deleteSubjectData,
    exportSubjectData,
    getHistory,
    getStoreBackend,
    leadByIdempotencyKey,
    metricsOn,
    purgeOldData,
    withBookingLock,
  } = await import("./store.js");

  const store = getStoreBackend();
  assert(store.name === "postgres", `expected postgres backend, got ${store.name}`);

  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const phone = `whatsapp:+491postgres-${suffix}`;
  const service = "Damenhaarschnitt";
  const start = DateTime.now().plus({ days: 1 }).set({ hour: 10, minute: 0, second: 0, millisecond: 0 }).toISO()!;
  const today = DateTime.now().setZone("Europe/Berlin").toISODate()!;

  try {
    await addMessage(phone, "user", "Hallo");
    await addMessage(phone, "assistant", "Hallo, ich bin der digitale Assistent.");
    await addMessage(phone, "user", "Ich möchte einen Termin.");
    await addMessage(phone, "assistant", "Gerne.");
    const history = await getHistory(phone);
    assert(history.length === 3, `history cap should keep 3 messages, got ${history.length}`);
    assert(history[0].content === "Hallo, ich bin der digitale Assistent.", `oldest message should have been trimmed: ${JSON.stringify(history)}`);

    const bookingKey = `postgres-booking-${suffix}`;
    const insertedBooking = await addLead({
      phone,
      name: "Postgres Smoke",
      service,
      status: "booked",
      channel: "server_tool",
      startISO: start,
      estimatedValueCents: 4500,
      idempotencyKey: bookingKey,
      createdAt: DateTime.now().toISO()!,
    });
    const replayBooking = await addLead({
      phone,
      name: "Postgres Smoke Duplicate",
      service,
      status: "booked",
      channel: "server_tool",
      startISO: start,
      estimatedValueCents: 4500,
      idempotencyKey: bookingKey,
      createdAt: DateTime.now().toISO()!,
    });
    assert(insertedBooking.inserted === true, "first booking lead should insert");
    assert(replayBooking.inserted === false, "same idempotency key should replay");
    assert((await leadByIdempotencyKey(bookingKey))?.phone === phone, "leadByIdempotencyKey should find inserted booking");
    assert((await bookedLead(phone, service, start))?.idempotencyKey === bookingKey, "bookedLead should find same phone/service/start");

    const callId = `postgres-call-${suffix}`;
    const firstCall = await addCallOutcome({ callId, phone, status: "needs_followup", summary: "Smoke call", createdAt: DateTime.now().toISO()! });
    const replayCall = await addCallOutcome({ callId, phone, status: "failed", summary: "Duplicate", createdAt: DateTime.now().toISO()! });
    assert(firstCall.inserted === true, "first call outcome should insert");
    assert(replayCall.inserted === false, "same callId should replay");
    assert(replayCall.outcome.summary === "Smoke call", "call replay should return original outcome");

    await withBookingLock(`postgres-smoke:${suffix}`, async () => undefined);

    const metrics = await metricsOn(today, "Europe/Berlin");
    assert(metrics.booked >= 1, `metrics should include smoke booking: ${JSON.stringify(metrics)}`);

    const exported = await exportSubjectData(phone);
    assert(exported.conversations.length === 3, `export should include capped conversation history: ${JSON.stringify(exported)}`);
    assert(exported.leads.length === 1, `export should include one idempotent lead: ${JSON.stringify(exported)}`);
    assert(exported.callOutcomes.length === 1, `export should include one idempotent call outcome: ${JSON.stringify(exported)}`);

    const retentionPhone = `${phone}-old`;
    await addLead({ phone: retentionPhone, service, status: "needs_followup", channel: "server_tool", createdAt: "2020-01-01T00:00:00.000Z" });
    await addCallOutcome({ callId: `postgres-old-call-${suffix}`, phone: retentionPhone, status: "voicemail", createdAt: "2020-01-01T00:00:00.000Z" });
    const dryRun = await purgeOldData(30, true);
    assert(dryRun.dryRun === true && dryRun.leadsDeleted >= 1 && dryRun.callOutcomesDeleted >= 1, `retention dry run mismatch: ${JSON.stringify(dryRun)}`);
    const actual = await purgeOldData(30, false);
    assert(actual.dryRun === false && actual.leadsDeleted >= 1 && actual.callOutcomesDeleted >= 1, `retention actual mismatch: ${JSON.stringify(actual)}`);

    const deletion = await deleteSubjectData(phone);
    assert(deletion.conversationsDeleted === 3 && deletion.leadsDeleted === 1 && deletion.callOutcomesDeleted === 1, `subject deletion mismatch: ${JSON.stringify(deletion)}`);

    console.log("POSTGRES_STORE_SMOKE_OK");
  } finally {
    await deleteSubjectData(phone).catch(() => undefined);
    await deleteSubjectData(`${phone}-old`).catch(() => undefined);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
