---
id: 2026-07-01-subprocessor-review-triggers
status: current
source-role: decision
supersedes: none
date: 2026-07-01
owner: none
scope-boundary: WHEN a full subprocessor-by-subprocessor legal/vendor compliance review must happen; NOT the review itself (that's a legal engagement, not something Claude/Codex performs) and NOT general GDPR/DPA scoping (see PROJECT.md §5, §10)
---

# Subprocessor-by-subprocessor review: triggers, not just a future TODO

## Decision

During backend-hosting planning (see the Render hosting decision, same date),
the Codex adversarial review flagged that "Render Frankfurt + DPA" was being
treated as if it were dental-grade GDPR/§203 StGB compliance — it isn't.
Region + a platform-level DPA covers the *hosting* layer only; a real go/no-go
for health-adjacent data needs a review of every subprocessor in the chain
(hosting, Twilio, OpenRouter, ElevenLabs, Supabase, log storage, and whatever
gets added later), not just the one that happens to host the container.

Rather than leave "do this before dental" as a vague future research task,
this record enumerates the concrete triggers now, so the review fires when
one of them actually happens instead of being rediscovered from scratch.

## Why this needs to be explicit (not just "before dental launches")

"Before the dental vertical launches" sounds like one clear moment but isn't:
account-ownership changes, new vendors, and health-adjacent beauty services
(injectables, dermatology-adjacent treatments) can each independently create
the same exposure before any formal "we're doing dental now" decision is
made. A single vague trigger gets missed; a checklist of concrete ones is
harder to walk past unnoticed.

## Triggers (any ONE of these fires the review)

**Code-enforced (fires automatically, no human memory required):**

1. **Any client YAML sets `dataSensitivity: health`.** `src/config.ts`'s
   `validateLivePilotReadiness` now hard-**blocks** (not just warns) on a new
   `subprocessor-by-subprocessor review for health-adjacent data` gate unless
   `COMPLIANCE_SUBPROCESSOR_REVIEW_COMPLETE=true` is explicitly set —
   separate from, and stricter than, the existing general
   `COMPLIANCE_DPA_REVIEWED` warning-level flag. `deployment:preflight` and
   `REQUIRE_LIVE_PILOT_READINESS=true` startup will refuse to go live for
   that client until the flag is set. This is the one trigger that can't be
   silently skipped once a dental (or any health-adjacent) client config
   exists.

**Process-level (need a human — Michael, Roxu, or whoever's driving that
phase — to notice; not mechanically gate-able from this codebase):**

2. **Before signing the German BSP contract** (360dialog / chatarmin /
   hellomateo — `PROJECT.md` §5) for the dental WhatsApp channel. Signing that
   contract is itself a concrete, calendar-able event — treat "review not
   done yet" as a blocker on signing, not just on go-live.
3. **Before any outreach or scoping work on `PROJECT.md` §8 phase F5**
   (Dental) begins — i.e. before the first dental prospect conversation, not
   after a client is ready to sign.
4. **Any time a subprocessor in the stack changes** — new hosting platform
   (see the hosting decision's own reconsideration triggers), new LLM
   provider, new voice provider, new DB/BaaS, or a change to which OpenRouter
   model is used. The subprocessor list is the actual unit of review; any
   change to it invalidates a prior review's completeness, even for the
   beauty vertical's lighter general DPA review.
5. **If account ownership changes for a client** — `PROJECT.md` §10 already
   flags reconsidering WABA ownership (client-owned vs Michael-owned) as the
   dental exception. Changing who is the data controller changes the whole
   subprocessor/DPA analysis and requires re-review, independent of trigger 1.
6. **A "beauty" client's services turn out to be health-adjacent** —
   injectables, dermatology-adjacent, or other medical-grade treatments can
   blur the beauty/health line `PROJECT.md` §5 draws. Setting
   `dataSensitivity` per client YAML at onboarding is a deliberate forcing
   function: someone has to actively choose "standard" for a given client
   rather than the code assuming beauty is always safe by category label
   alone. When onboarding any client, ask explicitly whether this applies —
   don't default to assuming it doesn't.

## What "the review" actually covers, once triggered

Not prescribed here (this is a legal/vendor engagement, not a code task) —
but per `PROJECT.md` §5 and §10, it must cover: hosting platform, Twilio,
OpenRouter, ElevenLabs, Supabase, and log storage, each individually, for:
DPA/AVV in place, EU data residency (not just "an EU region exists"), data
retention alignment with the client's privacy notice, and — specifically for
health data — whether §203 StGB exposure means the WABA/account should be
client-owned rather than operator-owned for that client (the dental exception
in `PROJECT.md` §10).

## Supersedes / related

- Builds on the Render hosting decision (2026-07-01) and its Codex Review
  Evidence Finding 4.
- `PROJECT.md` §5 (GDPR/WhatsApp in Germany), §8 (F5 Dental phase), §10
  (billing model & account ownership, dental exception).
