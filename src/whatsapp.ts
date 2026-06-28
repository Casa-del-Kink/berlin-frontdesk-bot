import twilio from "twilio";

// Thin layer over the provider. Switching Twilio -> 360dialog/Meta = rewrite only this file.
let cached: ReturnType<typeof twilio> | null = null;
function client() {
  if (!cached) {
    cached = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!);
  }
  return cached;
}

// `to` must be in "whatsapp:+49..." form. Returns true if sent.
export async function sendWhatsapp(to: string, body: string): Promise<boolean> {
  if (!to) return false;
  if (!process.env.TWILIO_ACCOUNT_SID) {
    console.log(`[whatsapp:DRYRUN -> ${to}] ${body}`);
    return false;
  }
  await client().messages.create({ from: process.env.TWILIO_WHATSAPP_FROM!, to, body });
  return true;
}
