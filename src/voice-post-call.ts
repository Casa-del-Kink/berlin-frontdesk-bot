import type { CallOutcome } from "./store.js";

const ALLOWED_STATUSES: CallOutcome["status"][] = ["booked", "needs_followup", "answered", "missed", "voicemail", "failed"];

export interface NormalizeVoicePostCallOptions {
  now?: Date;
  storeTranscriptUrl?: boolean;
  storeRecordingUrl?: boolean;
}

export interface NormalizeVoicePostCallResult {
  outcome?: CallOutcome;
  warnings: string[];
  error?: string;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function firstString(payload: Record<string, unknown>, paths: string[][]): string | undefined {
  for (const path of paths) {
    let cursor: unknown = payload;
    for (const key of path) {
      if (!isObject(cursor)) {
        cursor = undefined;
        break;
      }
      cursor = cursor[key];
    }
    if (typeof cursor === "string" && cursor.trim()) return cursor.trim();
    if (typeof cursor === "number" && Number.isFinite(cursor)) return String(cursor);
  }
  return undefined;
}

function normalizeStatus(value: unknown, payload: Record<string, unknown>): CallOutcome["status"] {
  const direct = String(value || "").trim().toLowerCase();
  if (ALLOWED_STATUSES.includes(direct as CallOutcome["status"])) return direct as CallOutcome["status"];

  const outcome = firstString(payload, [
    ["outcome"],
    ["result"],
    ["analysis", "outcome"],
    ["data", "analysis", "outcome"],
    ["data", "analysis", "call_outcome"],
  ])?.toLowerCase();
  if (outcome?.includes("book")) return "booked";
  if (outcome?.includes("follow") || outcome?.includes("handoff") || outcome?.includes("human")) return "needs_followup";
  if (outcome?.includes("voice")) return "voicemail";
  if (outcome?.includes("miss")) return "missed";
  if (outcome?.includes("fail")) return "failed";

  const callSuccessful = firstString(payload, [
    ["callSuccessful"],
    ["call_successful"],
    ["data", "analysis", "call_successful"],
    ["analysis", "call_successful"],
  ])?.toLowerCase();
  if (callSuccessful === "true" || callSuccessful === "success" || callSuccessful === "successful") return "answered";
  if (callSuccessful === "false" || callSuccessful === "failure" || callSuccessful === "failed") return "failed";

  return "answered";
}

export function normalizeVoicePostCallPayload(body: unknown, options: NormalizeVoicePostCallOptions = {}): NormalizeVoicePostCallResult {
  if (!isObject(body)) return { warnings: [], error: "Invalid JSON body" };

  const callId = firstString(body, [
    ["callId"],
    ["call_id"],
    ["conversationId"],
    ["conversation_id"],
    ["externalCallId"],
    ["external_call_id"],
    ["data", "call_id"],
    ["data", "conversation_id"],
    ["data", "metadata", "call_id"],
  ]);
  const phone = firstString(body, [
    ["phone"],
    ["caller"],
    ["caller_id"],
    ["from"],
    ["data", "phone"],
    ["data", "caller"],
    ["data", "caller_id"],
    ["data", "from"],
    ["data", "metadata", "phone"],
  ]);

  if (!callId) return { warnings: [], error: "Missing required callId/call_id/conversation_id" };
  if (!phone) return { warnings: [], error: "Missing required phone/caller/from" };

  const warnings: string[] = [];
  const rawSummary = firstString(body, [
    ["summary"],
    ["call_summary"],
    ["data", "summary"],
    ["data", "call_summary"],
    ["analysis", "summary"],
    ["analysis", "transcript_summary"],
    ["data", "analysis", "summary"],
    ["data", "analysis", "transcript_summary"],
  ]);
  if (!rawSummary && firstString(body, [["transcript"], ["data", "transcript"]])) {
    warnings.push("Raw transcript ignored; send a short summary or enable a reviewed summarization step upstream.");
  }

  const transcriptUrl = firstString(body, [["transcriptUrl"], ["transcript_url"], ["data", "transcript_url"]]);
  const recordingUrl = firstString(body, [["recordingUrl"], ["recording_url"], ["data", "recording_url"], ["data", "audio_url"]]);
  if (transcriptUrl && !options.storeTranscriptUrl) warnings.push("Transcript URL not stored because transcript URL storage is disabled by default.");
  if (recordingUrl && !options.storeRecordingUrl) warnings.push("Recording URL not stored because recording URL storage is disabled by default.");

  const statusValue = firstString(body, [["status"], ["call_status"], ["data", "status"], ["data", "call_status"]]);
  return {
    warnings,
    outcome: {
      callId,
      phone,
      status: normalizeStatus(statusValue, body),
      summary: rawSummary ? rawSummary.slice(0, 1000) : undefined,
      transcriptUrl: options.storeTranscriptUrl ? transcriptUrl : undefined,
      recordingUrl: options.storeRecordingUrl ? recordingUrl : undefined,
      createdAt: (options.now ?? new Date()).toISOString(),
    },
  };
}
