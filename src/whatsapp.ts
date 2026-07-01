import twilio from "twilio";

// Thin layer over the provider. Switching Twilio -> 360dialog/Meta = rewrite only this file.
let cached: ReturnType<typeof twilio> | null = null;

export type TwilioRestCredentialMode = "dryrun" | "api-key" | "auth-token-fallback" | "incomplete";

export function twilioRestCredentialMode(env: NodeJS.ProcessEnv = process.env): TwilioRestCredentialMode {
  if (!env.TWILIO_ACCOUNT_SID) return "dryrun";
  if (env.TWILIO_API_KEY_SID && env.TWILIO_API_KEY_SECRET) return "api-key";
  if (env.TWILIO_AUTH_TOKEN) return "auth-token-fallback";
  return "incomplete";
}

function client() {
  if (!cached) {
    const accountSid = process.env.TWILIO_ACCOUNT_SID!;
    const apiKeySid = process.env.TWILIO_API_KEY_SID;
    const apiKeySecret = process.env.TWILIO_API_KEY_SECRET;
    if (apiKeySid && apiKeySecret) {
      cached = twilio(apiKeySid, apiKeySecret, { accountSid });
    } else {
      // Backward-compatible local/sandbox fallback. Live deployments should use
      // API key credentials for outbound REST and keep TWILIO_AUTH_TOKEN only
      // for webhook signature validation.
      cached = twilio(accountSid, process.env.TWILIO_AUTH_TOKEN!);
    }
  }
  return cached;
}

// `to` must be in "whatsapp:+49..." form. Returns true if sent.
export async function sendWhatsapp(to: string, body: string): Promise<boolean> {
  if (!to) return false;
  if (process.env.FORCE_WHATSAPP_SEND_FAILURE === "true") throw new Error("FORCE_WHATSAPP_SEND_FAILURE is set");
  if (!process.env.TWILIO_ACCOUNT_SID) {
    console.log(`[whatsapp:DRYRUN -> ${to}] ${body}`);
    return false;
  }
  const mode = twilioRestCredentialMode();
  if (mode === "auth-token-fallback") {
    console.warn("[whatsapp] TWILIO_API_KEY_SID/TWILIO_API_KEY_SECRET missing; falling back to Auth Token for REST. Use API keys before live sending.");
  }
  if (mode === "incomplete") throw new Error("Twilio REST credentials incomplete: set TWILIO_API_KEY_SID/TWILIO_API_KEY_SECRET for outbound sends, or TWILIO_AUTH_TOKEN for local sandbox fallback.");
  await client().messages.create({ from: process.env.TWILIO_WHATSAPP_FROM!, to, body });
  return true;
}
