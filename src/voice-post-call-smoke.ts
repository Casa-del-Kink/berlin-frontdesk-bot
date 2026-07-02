import assert from "node:assert";
import { normalizeVoicePostCallPayload } from "./voice-post-call.js";

const fixedNow = new Date("2030-01-01T10:00:00.000Z");

const missing = normalizeVoicePostCallPayload({ phone: "+491700000001", status: "answered" }, { now: fixedNow });
assert.equal(missing.outcome, undefined);
assert.equal(missing.error, "Missing required callId/call_id/conversation_id");

const simple = normalizeVoicePostCallPayload(
  {
    call_id: "call-simple-1",
    caller: "+491****0002",
    status: "needs_followup",
    summary: "Caller wants balayage advice and asked for a callback.",
    customerName: "Mina",
    requestedService: "Balayage",
    preferredTime: "morgen Nachmittag",
    transcriptUrl: "https://provider.example/transcripts/1",
    recordingUrl: "https://provider.example/recordings/1",
  },
  { now: fixedNow },
);
assert.equal(simple.outcome?.callId, "call-simple-1");
assert.equal(simple.outcome?.phone, "+491****0002");
assert.equal(simple.outcome?.status, "needs_followup");
assert.equal(simple.outcome?.summary, "Caller wants balayage advice and asked for a callback.");
assert.equal(simple.outcome?.transcriptUrl, undefined);
assert.equal(simple.outcome?.recordingUrl, undefined);
assert.equal(simple.followUpDraft?.shouldSend, true);
assert.equal(simple.followUpDraft?.reviewRequired, true);
assert.equal(simple.followUpDraft?.text, "Hallo Mina, danke für deinen Anruf wegen Balayage für morgen Nachmittag. Wir melden uns mit einem passenden Vorschlag.");
assert.deepEqual(simple.warnings, [
  "Transcript URL not stored because transcript URL storage is disabled by default.",
  "Recording URL not stored because recording URL storage is disabled by default.",
]);

const nested = normalizeVoicePostCallPayload(
  {
    data: {
      conversation_id: "conv-nested-1",
      caller_id: "+491700000003",
      analysis: {
        call_successful: "success",
        transcript_summary: "Caller asked for opening hours; no action needed.",
      },
      transcript: "Raw transcript should not be stored by this normalizer.",
    },
  },
  { now: fixedNow },
);
assert.equal(nested.outcome?.callId, "conv-nested-1");
assert.equal(nested.outcome?.phone, "+491700000003");
assert.equal(nested.outcome?.status, "answered");
assert.equal(nested.outcome?.summary, "Caller asked for opening hours; no action needed.");
assert.equal(nested.followUpDraft?.shouldSend, false);
assert.equal(nested.warnings.length, 0);

const handoff = normalizeVoicePostCallPayload(
  {
    conversationId: "conv-handoff-1",
    from: "+491700000004",
    data: { analysis: { outcome: "human_handoff_requested", summary: "Customer requested a human consultation." } },
  },
  { now: fixedNow },
);
assert.equal(handoff.outcome?.status, "needs_followup");
assert.equal(handoff.outcome?.summary, "Customer requested a human consultation.");

const booked = normalizeVoicePostCallPayload(
  {
    callId: "call-booked-1",
    phone: "+491****0006",
    status: "booked",
    data: { analysis: { customer_name: "Laura", requested_service: "Damenhaarschnitt", confirmed_time: "Dienstag um 14 Uhr" } },
  },
  { now: fixedNow },
);
assert.equal(booked.followUpDraft?.shouldSend, true);
assert.equal(booked.followUpDraft?.reviewRequired, false);
assert.equal(booked.followUpDraft?.text, "Hallo Laura, dein Termin für Damenhaarschnitt am Dienstag um 14 Uhr ist eingetragen. Falls etwas nicht passt, antworte einfach hier.");

const missingInfo = normalizeVoicePostCallPayload(
  {
    callId: "call-missing-info-1",
    phone: "+491****0007",
    status: "needs_followup",
    follow_up: { customer_name: "Nora", requested_service: "Färben", missing_info: "Welche Haarlänge hast du ungefähr?" },
  },
  { now: fixedNow },
);
assert.equal(missingInfo.followUpDraft?.reason, "missing information follow-up draft");
assert.equal(missingInfo.followUpDraft?.text, "Hallo Nora, danke für deinen Anruf wegen Färben. Damit wir dich passend einplanen können: Welche Haarlänge hast du ungefähr?");

const storedUrls = normalizeVoicePostCallPayload(
  {
    callId: "call-reviewed-storage-1",
    phone: "+491700000005",
    status: "voicemail",
    transcript_url: "https://provider.example/transcripts/reviewed",
    recording_url: "https://provider.example/recordings/reviewed",
  },
  { now: fixedNow, storeTranscriptUrl: true, storeRecordingUrl: true },
);
assert.equal(storedUrls.outcome?.transcriptUrl, "https://provider.example/transcripts/reviewed");
assert.equal(storedUrls.outcome?.recordingUrl, "https://provider.example/recordings/reviewed");
assert.deepEqual(storedUrls.warnings, []);

console.log("VOICE_POST_CALL_NORMALIZER_SMOKE_OK");
