import type { CallOutcome } from "./store.js";

const ALLOWED_STATUSES: CallOutcome["status"][] = ["booked", "needs_followup", "answered", "missed", "voicemail", "failed"];

export interface NormalizeVoicePostCallOptions {
  now?: Date;
  storeTranscriptUrl?: boolean;
  storeRecordingUrl?: boolean;
}

export interface VoiceFollowUpDraft {
  shouldSend: boolean;
  status: CallOutcome["status"];
  channel: "whatsapp";
  phone: string;
  customerName?: string;
  requestedService?: string;
  preferredTime?: string;
  confirmedTime?: string;
  missingInfo?: string;
  text?: string;
  reviewRequired: boolean;
  reason: string;
}

export interface NormalizeVoicePostCallResult {
  outcome?: CallOutcome;
  followUpDraft?: VoiceFollowUpDraft;
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

function pickFollowUpField(body: Record<string, unknown>, field: string, snake: string) {
  return firstString(body, [
    [field],
    [snake],
    ["followUp", field],
    ["follow_up", snake],
    ["data", field],
    ["data", snake],
    ["data", "followUp", field],
    ["data", "follow_up", snake],
    ["data", "analysis", field],
    ["data", "analysis", snake],
    ["analysis", field],
    ["analysis", snake],
  ]);
}

function compact(parts: (string | undefined)[]) {
  return parts.filter((part) => part?.trim()).join(" ");
}

function buildVoiceFollowUpDraft(body: Record<string, unknown>, outcome: CallOutcome): VoiceFollowUpDraft {
  const customerName = pickFollowUpField(body, "customerName", "customer_name");
  const requestedService = pickFollowUpField(body, "requestedService", "requested_service") || pickFollowUpField(body, "service", "service");
  const preferredTime = pickFollowUpField(body, "preferredTime", "preferred_time");
  const confirmedTime = pickFollowUpField(body, "confirmedTime", "confirmed_time");
  const missingInfo = pickFollowUpField(body, "missingInfo", "missing_info");
  const hello = customerName ? `Hallo ${customerName},` : "Hallo,";

  if (outcome.status === "booked") {
    const appointment = compact([requestedService ? `für ${requestedService}` : undefined, confirmedTime ? `am ${confirmedTime}` : undefined]);
    return {
      shouldSend: true,
      status: outcome.status,
      channel: "whatsapp",
      phone: outcome.phone,
      customerName,
      requestedService,
      preferredTime,
      confirmedTime,
      missingInfo,
      text: `${hello} dein Termin${appointment ? ` ${appointment}` : ""} ist eingetragen. Falls etwas nicht passt, antworte einfach hier.`,
      reviewRequired: false,
      reason: "booked appointment confirmation draft",
    };
  }

  if (outcome.status === "needs_followup") {
    const request = compact([requestedService ? `wegen ${requestedService}` : undefined, preferredTime ? `für ${preferredTime}` : undefined]);
    return {
      shouldSend: true,
      status: outcome.status,
      channel: "whatsapp",
      phone: outcome.phone,
      customerName,
      requestedService,
      preferredTime,
      confirmedTime,
      missingInfo,
      text: missingInfo
        ? `${hello} danke für deinen Anruf${request ? ` ${request}` : ""}. Damit wir dich passend einplanen können: ${missingInfo}`
        : `${hello} danke für deinen Anruf${request ? ` ${request}` : ""}. Wir melden uns mit einem passenden Vorschlag.`,
      reviewRequired: true,
      reason: missingInfo ? "missing information follow-up draft" : "owner follow-up request draft",
    };
  }

  if (outcome.status === "missed" || outcome.status === "voicemail" || outcome.status === "failed") {
    return {
      shouldSend: true,
      status: outcome.status,
      channel: "whatsapp",
      phone: outcome.phone,
      customerName,
      requestedService,
      preferredTime,
      confirmedTime,
      missingInfo,
      text: `${hello} wir haben deinen Anruf gesehen. Worum geht es, und wann passt es dir?`,
      reviewRequired: true,
      reason: "missed or failed call follow-up draft",
    };
  }

  return {
    shouldSend: false,
    status: outcome.status,
    channel: "whatsapp",
    phone: outcome.phone,
    customerName,
    requestedService,
    preferredTime,
    confirmedTime,
    missingInfo,
    reviewRequired: true,
    reason: "answered call did not require an automatic follow-up draft",
  };
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
  const outcome: CallOutcome = {
    callId,
    phone,
    status: normalizeStatus(statusValue, body),
    summary: rawSummary ? rawSummary.slice(0, 1000) : undefined,
    transcriptUrl: options.storeTranscriptUrl ? transcriptUrl : undefined,
    recordingUrl: options.storeRecordingUrl ? recordingUrl : undefined,
    createdAt: (options.now ?? new Date()).toISOString(),
  };

  return {
    warnings,
    outcome,
    followUpDraft: buildVoiceFollowUpDraft(body, outcome),
  };
}
