import { createHmac, timingSafeEqual } from "node:crypto";

// Verifies the ElevenLabs post-call webhook signature (elevenlabs-signature header).
//
// Signature format: "t=<unix-seconds>,v0=<hex hmac-sha256 of '<timestamp>.<raw-body>'>". This
// mirrors the widely used Stripe-style webhook signature convention that ElevenLabs' own SDK
// helpers (constructEvent / construct_event) wrap; the ElevenLabs docs reachable via context7
// (/websites/elevenlabs_io) describe verification only through those SDK helpers and do not
// expose the raw header/tolerance values directly, so this is the documented convention
// implemented directly rather than a value copied from a raw-format doc snippet.
//
// Timestamp tolerance: 30 minutes. Not stated in the reachable docs; chosen as a default pending
// doc confirmation (matches the coordinator's directed fallback).
export const WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS = 30 * 60;

export interface VerifySignatureResult {
  ok: boolean;
  reason?: string;
}

function parseSignatureHeader(header: string): { timestamp: string; signature: string } | undefined {
  const parts = header.split(",").map((part) => part.trim());
  let timestamp: string | undefined;
  let signature: string | undefined;
  for (const part of parts) {
    if (part.startsWith("t=")) timestamp = part.slice(2);
    else if (part.startsWith("v0=")) signature = part.slice(3);
  }
  if (!timestamp || !signature) return undefined;
  return { timestamp, signature };
}

export function verifyElevenLabsSignature(rawBody: Buffer | string, signatureHeader: string | undefined, secret: string, now: Date = new Date()): VerifySignatureResult {
  if (!signatureHeader) return { ok: false, reason: "Missing elevenlabs-signature header" };

  const parsed = parseSignatureHeader(signatureHeader);
  if (!parsed) return { ok: false, reason: "Malformed elevenlabs-signature header" };

  const timestampSeconds = Number(parsed.timestamp);
  if (!Number.isFinite(timestampSeconds)) return { ok: false, reason: "Invalid timestamp in elevenlabs-signature header" };

  const nowSeconds = Math.floor(now.getTime() / 1000);
  if (Math.abs(nowSeconds - timestampSeconds) > WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS) {
    return { ok: false, reason: "Timestamp outside tolerance window" };
  }

  const body = typeof rawBody === "string" ? rawBody : rawBody.toString("utf8");
  const signedPayload = `${parsed.timestamp}.${body}`;
  const expected = createHmac("sha256", secret).update(signedPayload, "utf8").digest("hex");

  const expectedBuf = Buffer.from(expected, "utf8");
  const actualBuf = Buffer.from(parsed.signature, "utf8");
  if (expectedBuf.length !== actualBuf.length) return { ok: false, reason: "Signature mismatch" };
  if (!timingSafeEqual(expectedBuf, actualBuf)) return { ok: false, reason: "Signature mismatch" };

  return { ok: true };
}
