import { twilioRestCredentialMode } from "./whatsapp.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function mode(env: Record<string, string | undefined>) {
  return twilioRestCredentialMode(env as NodeJS.ProcessEnv);
}

function main() {
  assert(mode({}) === "dryrun", "missing Twilio Account SID should stay in dry-run mode");
  assert(
    mode({ TWILIO_ACCOUNT_SID: "AC_test", TWILIO_AUTH_TOKEN: "auth_test" }) === "auth-token-fallback",
    "Account SID plus Auth Token should be backward-compatible sandbox fallback",
  );
  assert(
    mode({ TWILIO_ACCOUNT_SID: "AC_test", TWILIO_API_KEY_SID: "SK_test", TWILIO_API_KEY_SECRET: "secret_test", TWILIO_AUTH_TOKEN: "auth_test" }) === "api-key",
    "API key credentials should be preferred over Auth Token for outbound REST",
  );
  assert(mode({ TWILIO_ACCOUNT_SID: "AC_test" }) === "incomplete", "Account SID without API key or fallback token should be incomplete");
  console.log("TWILIO_CREDENTIAL_SMOKE_OK");
  console.log(JSON.stringify({ modes: ["dryrun", "auth-token-fallback", "api-key", "incomplete"], noLiveProviderCalls: true }, null, 2));
}

main();