---
id: twilio-credential-split
status: open
supersedes: none
blocked-by: none
scope-boundary: Adopting the spike's TWILIO_API_KEY_SID/TWILIO_API_KEY_SECRET split (signature validation via auth token, outbound sends via scoped API key); NOT WhatsApp sender/BSP migration (PROJECT.md section 5 owns that)
owner: none
---

# Twilio credential split (least-privilege API keys)

## Problem
Main uses TWILIO_AUTH_TOKEN for both webhook signature validation and
outbound REST sends. The spike branch implemented a split: auth token only
for signature validation, a scoped API key pair for sends. Least-privilege
improvement deferred from the go-live pass to keep the owner's credential
checklist short for the pilot.

## Acceptance
whatsapp.ts prefers TWILIO_API_KEY_SID/SECRET for sends when present,
falls back to auth token; readiness gate updated; .env.example documented;
spike's src/whatsapp.ts diff is the reference implementation.

## Revisit trigger
Before the second client, or at the first Twilio credential rotation.
