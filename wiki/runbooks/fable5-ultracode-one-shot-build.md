# Fable 5 + ultracode one-shot build prompt

Purpose: a self-contained prompt Michael can paste as the *first message* of a
fresh Fable 5 session (ultracode on) to autonomously take Tilda from its
current state to a genuinely live, pilot-ready system — once the account
preconditions below are satisfied. Written 2026-07-01, after the backend
hosting decision (Render) and the Codex-DIVERGE-lane doctrine fix.

**This is a prompt to paste, not a task to run from here.** The section
below the divider is the literal text to hand to the new session.

## Precondition checklist (Michael, before launching)

Repo research this session found the state more advanced, and more
inconsistently documented, than a single glance at `PROJECT.md` suggests —
`docs/tilda-priority-plan.md` shows most of F0–F4 already "Done," and the
open `spike/calcom-provider` branch is 76 files / 8,500+ lines (voice
post-call handling, contract smoke tests, hosting/domain/Twilio handoff docs,
*and* Cal.com — not just a Cal.com evaluation). The prompt below makes Fable 5
verify all of this itself rather than trust any single doc, but you still
need to hand it real credentials it cannot generate itself.

**Confirm/retrieve — these likely already exist:**
- **Supabase** — project + `DATABASE_URL` (pooled connection, `PGSSL=true`).
  Per `docs/supabase-postgres-setup.md`, already created and verified
  (`POSTGRES_STORE_SMOKE_OK`).
- **Google Calendar** — dev service account
  `tilda-calendar-bot@tilda-dev-500907.iam.gserviceaccount.com`,
  `GOOGLE_SA_JSON`, and a dev "Tilda" calendar — already created and verified
  live. Decide: go live on this dev calendar, or wait for a real Google
  Workspace calendar under the eventual brand domain (`tilda-priority-plan.md`
  explicitly deferred this)? Tell Fable 5 which.
- **Twilio** — Account SID/Auth Token likely already exist for
  sandbox/dev use. Confirm whether you have (or need) a real approved
  WhatsApp Business sender and a Voice-capable German number for live pilot
  traffic, not just the sandbox.
- **OpenRouter** — API key for the LLM loop.

**Genuinely new, tied to decisions made this session:**
- **Render** — account created, `Casa-del-Kink/berlin-frontdesk-bot` GitHub
  repo connected, Frankfurt region, **Standard plan** (not Starter — see the
  hosting decision record once it's written).
- **ElevenLabs** — account + a Conversational AI agent created, API key. The
  agent's tool-call webhooks get pointed at the Render URL once deployed —
  Fable 5 does that wiring, it just needs the account and key to exist first.
- **Cal.com** — only if you actually want it. **Decide account ownership
  first** (Michael / Roxu / shared company-owned — one of the four
  originally-flagged decisions) before creating the account. If you don't
  decide this before launching Fable 5, tell it to default to Google
  Calendar only (already working) and treat the `spike/calcom-provider`
  branch as "review and extract anything sound, don't force it live."
- **Domain** — confirm the exact domain to wire (`api.calltilda.com` or
  whatever the real one is). Cloudflare DNS is already yours.
- **Operator identity/contact values** — real legal name, public contact
  email, privacy email for the client YAML and
  `docs/compliance-live-pilot-pack.md` — the "env placeholder values" from
  the original four blocking decisions.
- `SERVER_TOOL_TOKEN` — Fable 5 can generate this itself (24+ char random
  secret), no account needed.

Drop all of these into a place Fable 5 can read at the start of the session
(a scratch `.env.local` you paste in, a password manager note you read aloud,
whatever's convenient) — the prompt tells it to ask for exactly what it's
missing rather than guess.

---

## The prompt (paste this as the first message)

```
(ultracode)

Mission: take Tilda (Casa-del-Kink/berlin-frontdesk-bot) from its current
state to a genuinely live, pilot-ready AI front-desk — WhatsApp + voice,
Google Calendar (and optionally Cal.com) booking, deployed on Render,
passing its own go/no-go checklist — using the account credentials I'm
providing below. Work in this repo: C:\Users\micha\projects\berlin-frontdesk-bot
(also reachable at C:\Users\micha\OS\projects\berlin-frontdesk-bot).

## Credentials I'm providing (ask me for anything below marked [MISSING] or
anything else you find you need — do not guess or fabricate a value)

- SUPABASE DATABASE_URL: <paste or MISSING>
- GOOGLE_SA_JSON (service account) + calendar ID: <paste or MISSING>
- TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / WhatsApp sender: <paste or MISSING>
- Twilio Voice number (Germany, if set up): <paste or MISSING>
- OPENROUTER_API_KEY: <paste or MISSING>
- RENDER account: <confirm created, repo connected, or MISSING>
- ELEVENLABS API key + agent ID: <paste or MISSING>
- CAL.COM: <account ownership decision + API key, or "skip — Google
  Calendar only for now">
- Domain to wire (e.g. api.calltilda.com): <fill in>
- Operator legal name / public contact email / privacy email: <fill in>

## Step 0 — Reconcile before building anything (mandatory, do not skip)

Do not trust any single planning document's claims about what's "done."
Verify against the actual repo state:

1. Read in order: AGENTS.md, wiki/index.md, HANDOFF.md, PROJECT.md,
   docs/tilda-priority-plan.md, every file in wiki/decisions/ (pay
   particular attention to the 2026-07-01 hosting decision, the
   2026-07-01 subprocessor-review-triggers decision, and the
   2026-06-29 OS-onboarding decision).
2. PROJECT.md and docs/tilda-priority-plan.md disagree about what phase
   is "current priority" and what's already built — reconcile them
   against actual code/tests, not against each other's prose. Produce
   one current, accurate status map (what's built and verified, what's
   built but unverified, what's not started) before planning any new
   work. If COMPLIANCE_DPA_REVIEWED or COMPLIANCE_SUBPROCESSOR_REVIEW_COMPLETE
   claims appear anywhere as already true, verify that against an actual
   named human review having happened — don't take the flag's presence
   as proof.
3. Review the open branch `spike/calcom-provider` in FULL
   (`git diff main...origin/spike/calcom-provider`) before writing any
   new code. It is far larger than its name suggests — Cal.com provider
   work, voice-agent contract/post-call smoke tests, hosting/domain/
   Twilio handoff docs, and more, per a diff-stat check on 2026-07-01
   (76 files, 8,500+ insertions). Treat rebuilding anything already
   solved there as a recall failure, not a fresh task. Cherry-pick or
   merge what's sound; flag anything you're not confident in rather
   than blindly merging; do not silently drop scope from that branch.
4. Check whether the OS-doctrine fix in PR
   michael-w-pearson/OS#418 (Codex DIVERGE generator lane) has merged.
   If yes, your Metis planning should use the documented Codex generator
   lane for DIVERGE on any FEATURE+/ARCHITECTURE-level work below. If
   not yet merged, follow the manual procedure documented in that PR
   directly (metis-plan and codex-review SKILL.md content) — a single
   Codex adversarial REVIEW pass is not a substitute for DIVERGE.
5. Report the reconciled status map back to me before proceeding to
   Step 1. This is a checkpoint, not a rhetorical pause — wait for my
   go-ahead if anything in the reconciliation surprises you (e.g. more
   or less is done than either of us expected).

## Step 1 — Scope the actual remaining work

Once reconciled, use Metis (this repo follows the SCOPE→DIVERGE→SELECT→
DRAFT→REVIEW→ITERATE lifecycle per AGENTS.md §7.5) to scope what's
genuinely left, likely spanning:

- Finishing/merging whatever in spike/calcom-provider survives review.
- Wiring real ElevenLabs credentials end-to-end: agent → server tool
  webhooks (POST /tools/check_availability, /tools/book_appointment,
  /tools/register_lead) → post-call webhook, tested against the real
  ElevenLabs agent, not just the existing fake-provider voice:smoke.
- Deciding and wiring Google Calendar vs Cal.com per what I told you
  above.
- Deploying to Render per the hosting decision (Frankfurt, Standard
  plan) — a render.yaml, real env vars, DNS cutover for the domain I
  gave you (grey-cloud/DNS-only on Cloudflare unless you've verified
  proxying is safe for signed Twilio webhooks).
- Filling in the real operator identity/contact values I gave you
  everywhere clients/salon-demo.yaml, docs/compliance-live-pilot-pack.md,
  and any other doc currently has placeholders.
- Running the FULL go/no-go checklist in docs/deployment-readiness.md
  against the live deployed instance — not just fake-provider smoke —
  including a signed Twilio webhook replay, a real ElevenLabs tool-call
  round trip with a timeout budget, and a live Postgres smoke from the
  Render runtime itself.
- Anything else the reconciled status map in Step 0 shows is genuinely
  missing for a real pilot-ready system.

Use Workflow with ultracode for the actual execution — structure it as
separate workflow phases (e.g. Reconcile → Plan → Build → Verify → Ship),
staying in the loop between phases rather than one giant uninterrupted
run, per the Workflow tool's own guidance on multi-phase work.

## Hard boundaries — do not cross these without asking me first

- Do not set COMPLIANCE_DPA_REVIEWED=true or
  COMPLIANCE_SUBPROCESSOR_REVIEW_COMPLETE=true yourself. Those represent an
  actual human legal review having happened — you can prepare everything
  those reviews need, but the flag itself is my call.
- Do not decide Cal.com account ownership (Michael / Roxu / shared) — ask.
- Do not point a real Twilio number at production traffic, and do not flip
  REQUIRE_LIVE_PILOT_READINESS=true against real customer data, until the
  full go/no-go checklist passes AND I've explicitly said go.
- Do not sign, accept, or represent as accepted any vendor contract, DPA,
  or terms of service.
- Do not touch branding/naming (Casa Del Kink / Tilda / berlin-frontdesk-bot
  are explicitly placeholder names pending a deliberate rebrand — see
  wiki/decisions/2026-06-29-onboard-to-os-single-repo.md).
- Do not onboard a real dental/health-adjacent client, or set
  dataSensitivity: health on any client config, without the full
  subprocessor-by-subprocessor review this triggers — see
  wiki/decisions/2026-07-01-subprocessor-review-triggers.md for exactly
  what that review needs.
- Do not merge to main autonomously for anything beyond small, obviously
  reversible fixes. Work on a dedicated branch/worktree, commit as you go,
  and open a PR (or a small number of PRs, one per major phase) for me to
  review — mirroring the same discipline this session used. Tell me
  clearly when something's ready to review, don't just keep building.
- If you spend real money (any paid API call, any provider usage beyond
  free tiers) flag it before it happens, not after.

## Definition of done for this pass

- Reconciled, accurate status map delivered and confirmed with me (Step 0).
- Everything in Step 1 that's genuinely achievable with the credentials I
  gave you is built, deployed to Render, and passing the real (not just
  fake-provider) go/no-go checklist.
- A short, explicit list of what's still human-only from here — legal
  sign-off, pricing, actual client contracts, anything else you couldn't
  finish because I didn't give you a credential or a decision — so I know
  exactly what's left, not "mostly done, some details TBD."
- PR(s) open, not merged, waiting on my review.
```
