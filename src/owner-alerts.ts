import type { Client } from "./config.js";
import { sendWhatsapp } from "./whatsapp.js";

export interface OwnerAlertResult {
  attempted: boolean;
  sent: boolean;
  error?: string;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Owner alerts are operationally important, but they must not turn a completed booking,
 * captured lead, or provider callback into a failed customer-facing tool response.
 */
export async function alertOwner(cfg: Pick<Client, "ownerWhatsapp">, message: string): Promise<OwnerAlertResult> {
  if (!cfg.ownerWhatsapp) {
    console.log(`[owner alert:DRYRUN] ${message}`);
    return { attempted: false, sent: false };
  }

  try {
    const sent = await sendWhatsapp(cfg.ownerWhatsapp, message);
    if (!sent) console.log(`[owner alert:DRYRUN] ${message}`);
    return { attempted: true, sent };
  } catch (error) {
    const reason = errorMessage(error);
    console.error(`[owner alert:FAILED] ${reason}`);
    console.error(`[owner alert:UNSENT] ${message}`);
    return { attempted: true, sent: false, error: reason };
  }
}
