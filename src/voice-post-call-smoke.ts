import assert from "node:assert";
import { normalizeVoicePostCallPayload } from "./voice-post-call.js";

const fixedNow = new Date("2030-01-01T10:00:00.000Z");

const missing = normalizeVoicePostCallPayload({ phone: "+491700000001", status: "answered" }, { now: fixedNow });
assert.equal(missing.outcome, undefined);
assert.equal(missing.error, "Missing required callId/call_id/conversation_id");

const simple = normalizeVoicePostCallPayload(
  {
    call_id: "call-simple-1",
    caller: "+491700000002",
    status: "needs_followup",
    summary: "Caller wants balayage advice and asked for a callback.",
    transcriptUrl: "https://provider.example/transcripts/1",
    recordingUrl: "https://provider.example/recordings/1",
  },
  { now: fixedNow },
);
assert.equal(simple.outcome?.callId, "call-simple-1");
assert.equal(simple.outcome?.phone, "+491700000002");
assert.equal(simple.outcome?.status, "needs_followup");
assert.equal(simple.outcome?.summary, "Caller wants balayage advice and asked for a callback.");
assert.equal(simple.outcome?.transcriptUrl, undefined);
assert.equal(simple.outcome?.recordingUrl, undefined);
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
