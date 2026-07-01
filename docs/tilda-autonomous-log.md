# Tilda autonomous build log

## 2026-06-29T14:09:02Z

- Branch: `hermes/voice-first-compliance-correction`
- HEAD before: `cb7305669a3fedac86634c3eb278d30e066e33b1`
- HEAD after: this local commit (see `git rev-parse HEAD` after commit)
- Chunk selected: deterministic credential-free voice-agent HTTP smoke for the real server tool endpoints.
- Files changed:
  - `src/voice-agent-tool-smoke.ts`
  - `package.json`
  - `docs/elevenlabs-voice-agent-setup.md`
  - `docs/demo-script-hair-salon.md`
  - `docs/tilda-priority-plan.md`
  - `docs/tilda-autonomous-log.md`
- Commands run:
  - `npm run voice:smoke` -> `VOICE_AGENT_TOOL_SMOKE_OK`
  - `npm run typecheck` -> pass
  - `npm run style:guard` -> `STYLE_GUARD_OK`
  - `npm run server:battletest` -> `SERVER_BATTLETEST_OK`
  - `npm run check` -> pass
  - `npm run first-test:smoke` -> `FIRST_TEST_SMOKE_OK`
- Blocker: no new live credentials were used. Live Supabase Postgres remains blocked on database URL or password and DB reachability. Live provider setup remains blocked on chosen voice and telephony provider access.
- Next chunk: tighten owner-alert assertions for voice booking and follow-up paths, or add a small HTTP smoke that validates missing bearer auth on each voice tool endpoint.

## 2026-06-29T14:53:30Z

- Branch: `hermes/voice-first-compliance-correction`
- HEAD before: `abc226c37a4029bd29ebcf2ff75b4baab1d9a301`
- HEAD after: this local commit (see `git rev-parse HEAD` after commit)
- Chunk selected: tighten voice owner-alert assertions for booking, lead follow-up, and post-call follow-up paths.
- Files changed:
  - `src/voice-agent-tool-smoke.ts`
  - `docs/tilda-priority-plan.md`
  - `docs/tilda-autonomous-log.md`
- Commands run:
  - `npm run voice:smoke` -> `VOICE_AGENT_TOOL_SMOKE_OK`
  - `npm run typecheck` -> pass
  - `npm run style:guard` -> `STYLE_GUARD_OK`
  - `npm run server:battletest` -> `SERVER_BATTLETEST_OK`
  - `npm run check` -> pass
  - `npm run first-test:smoke` -> `FIRST_TEST_SMOKE_OK`
  - `supabase_admin_smoke` through `michael_gateway` -> `SUPABASE_ADMIN_SMOKE_OK`
  - `npm run supabase:postgres:smoke` -> `POSTGRES_STORE_SMOKE_OK`
  - `npm run supabase:admin:smoke` -> failed because local shell lacks `SUPABASE_URL`/`SUPABASE_SECRET_KEY`; gateway admin smoke is the working configured admin path for this Hermes profile.
- Verification added:
  - Booking owner alert emitted exactly once.
  - Lead follow-up owner alert emitted exactly once and not duplicated on provider retry.
  - Post-call follow-up owner alert emitted exactly once and not duplicated on provider retry.
  - Post-call follow-up retry stores one call outcome.
- Blocker: no new live voice/telephony credentials used. Live telephony remains dependent on selected provider access and configuration. Local-shell Supabase REST smoke env is not configured, but gateway admin smoke passes.
- Next chunk: add explicit unauthorized-request coverage for each voice-facing endpoint, or build the full fake-provider hair-salon demo runner.

## 2026-06-29T15:01:41Z

- Branch: `hermes/voice-first-compliance-correction`
- HEAD before: `9a5861fd95c82e13203a800b3cb90879aa5b5037`
- HEAD after: this local commit (see `git rev-parse HEAD` after commit)
- Chunk selected: add explicit bearer-auth rejection coverage to the credential-free voice-agent HTTP smoke.
- Files changed:
  - `src/voice-agent-tool-smoke.ts`
  - `docs/tilda-priority-plan.md`
  - `docs/tilda-autonomous-log.md`
- Commands run:
  - `npm run voice:smoke` -> `VOICE_AGENT_TOOL_SMOKE_OK`
  - `npm run typecheck` -> pass
  - `npm run style:guard` -> `STYLE_GUARD_OK`
  - `npm run check` -> pass
  - `npm run server:battletest` -> `SERVER_BATTLETEST_OK`
  - `npm run first-test:smoke` -> `FIRST_TEST_SMOKE_OK`
- Verification added:
  - Missing bearer auth returns `401` for `check_availability`, `book_appointment`, `register_lead`, and voice post-call webhook.
  - Wrong bearer auth returns `401` for the metrics endpoint.
  - The existing successful voice flow still books, registers follow-up, records post-call outcomes, validates idempotency, and counts phone metrics.
- Blocker: no new live voice/telephony credentials used. Live telephony remains dependent on selected provider access and configuration.
- Next chunk: build the full fake-provider hair-salon demo runner or add credential-safe live-provider demo command documentation.

## 2026-06-29T15:20:14Z

- Branch: `hermes/voice-first-compliance-correction`
- HEAD before: `3800380`
- HEAD after: this local commit (see `git rev-parse HEAD` after commit)
- Chunk selected: full fake-provider Berlin hair-salon demo runner, not another tiny assertion-only increment.
- Files changed:
  - `src/fake-provider-demo.ts`
  - `package.json`
  - `scripts/check-style-guard.py`
  - `docs/demo-script-hair-salon.md`
  - `docs/tilda-priority-plan.md`
  - `docs/tilda-autonomous-log.md`
- Commands run:
  - `npm run demo:fake` -> `DEMO_FAKE_HAIR_SALON_OK`
- Verification added:
  - Real Express server starts with fake calendar and local JSON store.
  - Phone booking path checks availability, books Laura Schneider, verifies owner alert once, and proves booked revenue.
  - Phone colour follow-up registers Mina Hoffmann, verifies retry idempotency, and verifies owner alert once.
  - Voice post-call follow-up stores a call summary for privacy export.
  - WhatsApp continuation checks availability and creates a WhatsApp follow-up lead.
  - Metrics prove 3 inquiries, 1 booking, 2 follow-ups, €45 booked value, €162 pipeline value, and phone plus WhatsApp channel attribution.
  - Privacy export proves demo booking and follow-up records are retrievable.
- Blocker: no live voice or telephony credentials used; this is the full no-credential founder demo path.
- Next chunk: add credential-safe live demo command documentation or visible-proof mode for the dev Google Calendar smoke.

## 2026-06-29T15:45:19Z

- Branch: `hermes/voice-first-compliance-correction`
- HEAD before: `56ddd0c`
- HEAD after: this local commit (see `git rev-parse HEAD` after commit)
- Chunk selected: do items 1 and 2 from the last queue: live-provider demo docs plus visible-proof Google Calendar mode, and deployment readiness pack.
- Files changed:
  - `src/google-calendar-smoke.ts`
  - `src/deployment-preflight.ts`
  - `package.json`
  - `scripts/check-style-guard.py`
  - `docs/live-provider-demo.md`
  - `docs/deployment-readiness.md`
  - `docs/dev-google-calendar-setup.md`
  - `docs/demo-script-hair-salon.md`
  - `docs/tilda-priority-plan.md`
  - `docs/tilda-autonomous-log.md`
- Commands run:
  - `npm run typecheck` -> pass
  - `npm run style:guard` -> `STYLE_GUARD_OK`
  - `ALLOW_DEPLOYMENT_BLOCKERS=true npm run deployment:preflight` -> `DEPLOYMENT_PREFLIGHT_REVIEW_ONLY`
  - default `npm run deployment:preflight` -> `DEPLOYMENT_PREFLIGHT_BLOCKED` and non-zero exit as expected
  - simulated complete env `npm run deployment:preflight` -> `DEPLOYMENT_PREFLIGHT_OK`
  - `npm run demo:fake` -> `DEMO_FAKE_HAIR_SALON_OK`
  - `npm run voice:smoke` -> `VOICE_AGENT_TOOL_SMOKE_OK`
  - `npm run server:battletest` -> `SERVER_BATTLETEST_OK`
  - `npm run first-test:smoke` -> `FIRST_TEST_SMOKE_OK`
  - `git diff --check` -> pass
- Verification added:
  - `google-calendar:smoke` supports `KEEP_SMOKE_EVENT=true` visible proof and reports kept event IDs/links.
  - `docs/live-provider-demo.md` gives credential-safe cleanup and visible-proof commands for Google calendar and live booking smoke.
  - `docs/deployment-readiness.md` covers env, secrets, health/readiness, webhook signature validation, fake-provider boundary, PII/logging, monitoring, rollback, and go/no-go.
  - `npm run deployment:preflight` fails on unresolved live blockers unless review-only mode is explicitly set.
- Blocker: no live telephony/voice provider credentials were used. Live-provider commands are documented and gated but not executed against paid provider traffic.
- Next chunk: use real credentials only when approved to run live calendar or telephony smoke, otherwise continue with deployment hardening.

## 2026-06-29T16:02:14Z

- Branch: `hermes/voice-first-compliance-correction`
- HEAD before: `bc4a4a5`
- HEAD after: this local commit (see `git rev-parse HEAD` after commit)
- Chunk selected: add an owner-alert destination readiness gate so live pilots do not silently rely on console-only alerts.
- Files changed:
  - `src/config.ts`
  - `docs/deployment-readiness.md`
  - `README.md`
  - `docs/tilda-priority-plan.md`
  - `docs/tilda-autonomous-log.md`
- Commands run:
  - `npm run typecheck` -> pass
  - `npm run style:guard` -> `STYLE_GUARD_OK`
  - `ALLOW_DEPLOYMENT_BLOCKERS=true npm run deployment:preflight` -> `DEPLOYMENT_PREFLIGHT_REVIEW_ONLY`
  - default `npm run deployment:preflight` -> `DEPLOYMENT_PREFLIGHT_BLOCKED` and non-zero exit as expected
  - simulated complete env with `OWNER_ALERT_LOG_ONLY_ACCEPTED=true` -> `DEPLOYMENT_PREFLIGHT_OK`
  - `npm run server:battletest` -> `SERVER_BATTLETEST_OK`
  - `npm run demo:fake` -> `DEMO_FAKE_HAIR_SALON_OK`
  - `npm run check` -> pass
  - `git diff --check` -> pass
- Verification added:
  - `/readiness/live-pilot` now includes `owner alert destination` as a blocker when `ownerWhatsapp` is empty.
  - Internal hosted demos can deliberately allow log-only alerts with `OWNER_ALERT_LOG_ONLY_ACCEPTED=true`.
  - Deployment docs now distinguish internal demo log-only alerts from a real client pilot owner alert destination.
- Blocker: real owner WhatsApp routing is still not configured in `clients/salon-demo.yaml`; this is acceptable for fake/local demos but remains a live-pilot blocker unless explicitly accepted for an internal hosted demo.
- Next chunk: add a small operator alert routing doc/checklist for Twilio sandbox versus live WhatsApp owner delivery, or run live provider smoke only if approved credentials are available.

## 2026-06-29T16:57:42Z hourly build loop

- Branch: `hermes/voice-first-compliance-correction`
- HEAD before: `f776059`
- HEAD after: this local commit (see `git rev-parse HEAD` after commit)
- Chunk selected: align deployment readiness gates across CLI preflight, protected readiness endpoint, strict startup, and a no-credential deployment smoke.
- Files changed:
  - `.env.example`
  - `docs/deployment-readiness.md`
  - `docs/tilda-autonomous-log.md`
  - `docs/tilda-priority-plan.md`
  - `package.json`
  - `scripts/check-style-guard.py`
  - `src/deployment-preflight.ts`
  - `src/deployment-smoke.ts`
  - `src/readiness.ts`
  - `src/server-battletest.ts`
  - `src/server.ts`
- Commands run:
  - `npm run typecheck` -> pass
  - `npm run style:guard` -> `STYLE_GUARD_OK`
  - `ALLOW_DEPLOYMENT_BLOCKERS=true npm run deployment:preflight` -> `DEPLOYMENT_PREFLIGHT_REVIEW_ONLY`
  - `npm run deployment:smoke` -> `DEPLOYMENT_SMOKE_OK`
  - `npm run server:battletest` -> `SERVER_BATTLETEST_OK`
  - `npm run demo:fake` -> `DEMO_FAKE_HAIR_SALON_OK`
  - `npm run check` -> pass
  - `git diff --check` -> pass
- Pass/fail markers:
  - Shared readiness model now drives `npm run deployment:preflight`, `/readiness/live-pilot`, and `REQUIRE_LIVE_PILOT_READINESS=true` startup refusal.
  - `/readiness/live-pilot` remains bearer-protected and returns `checks`, `blockers`, and `warnings`.
  - `npm run deployment:smoke` starts the real server with fake fixtures, verifies health/readiness/metrics, and proves strict startup blocks unsafe env.
- Blocker: live deployment still needs real voice/telephony credentials, real owner alert routing, production webhook URL, and live secrets. No hosted deploy, live Twilio/voice smoke, or live Google Calendar event was attempted.
- Next chunk: add operator-facing failure triage and live-demo checklist automation for the hosted-demo handoff.

## 2026-06-30T21:05:38Z hourly build loop

- Branch: `main`
- HEAD before: `511b6d1`
- HEAD after: this local commit (see `git rev-parse HEAD` after commit)
- Chunk selected: operator readiness bundle plus tracked secret scan, so scheduled/operator handoffs stop relying on scraped console output and can prove no obvious secret markers are tracked.
- Files changed:
  - `.env.example`
  - `.gitignore`
  - `docs/deployment-readiness.md`
  - `docs/supabase-postgres-setup.md`
  - `docs/tilda-priority-plan.md`
  - `docs/tilda-autonomous-log.md`
  - `package.json`
  - `scripts/check-secrets.py`
  - `src/operator-readiness-bundle.ts`
  - `src/operator-readiness-bundle-smoke.ts`
  - `wiki/runbooks/run.md`
- Commands run:
  - `npm run typecheck` -> pass
  - `npm run style:guard` -> `STYLE_GUARD_OK`
  - `npm run secrets:scan` -> `SECRETS_SCAN_OK`
  - `npm run operator:readiness:bundle:smoke` -> `OPERATOR_READINESS_BUNDLE_SMOKE_OK`
  - `npm run deployment:preflight:smoke` -> `DEPLOYMENT_PREFLIGHT_JSON_SMOKE_OK`
  - `npm run deployment:smoke` -> `DEPLOYMENT_SMOKE_OK`
  - `npm run server:battletest` -> `SERVER_BATTLETEST_OK`
  - `npm run demo:fake` -> `DEMO_FAKE_HAIR_SALON_OK`
  - `npm run check` -> pass
  - `npm run first-test:smoke` -> `FIRST_TEST_SMOKE_OK`
  - `git diff --check` -> pass
- Verification added:
  - `npm run operator:readiness:bundle` writes a report-only owner-grouped handoff under ignored `tmp/tilda-ops-snapshot/` and supports JSON mode.
  - `npm run operator:readiness:bundle:smoke` verifies fail-closed mode, review-only mode, owner grouping, and bearer-token redaction.
  - `npm run secrets:scan` scans tracked text files for obvious committed secret markers and caught/remediated concrete Postgres URL templates.
- Blocker: live provider checks were not run. Google Calendar, Supabase/Postgres, WhatsApp, and voice-provider live smokes still require configured credentials plus explicit safe approval.
- Next chunk: add hosted-env examples for the chosen deployment target or founder standup automation.

## 2026-06-30T22:00:32Z hourly build loop

- Branch: `main`
- HEAD before: `a04217e`
- HEAD after: this local commit (see `git rev-parse HEAD` after commit)
- Chunk selected: voice post-call follow-up draft seam, so ElevenLabs/Twilio call outcomes can return reviewed WhatsApp drafts from typed fields without storing or sending raw transcripts.
- Files changed:
  - `src/voice-post-call.ts`
  - `src/server.ts`
  - `src/voice-post-call-smoke.ts`
  - `src/voice-agent-tool-smoke.ts`
  - `docs/voice-phone-readiness.md`
  - `docs/tilda-autonomous-log.md`
- Commands run:
  - `npm run voice:post-call:smoke` -> `VOICE_POST_CALL_NORMALIZER_SMOKE_OK`
  - `npm run typecheck` -> pass
  - `npm run style:guard` -> `STYLE_GUARD_OK`
  - `npm run voice:smoke` -> `VOICE_AGENT_TOOL_SMOKE_OK`
  - `npm run secrets:scan` -> `SECRETS_SCAN_OK`
  - `git diff --check` -> pass
  - `npm run server:battletest` -> `SERVER_BATTLETEST_OK`
  - `npm run check` -> pass
- Verification added:
  - Post-call normalizer now returns `followUpDraft` for booked, follow-up, missed/voicemail/failed, and answered cases.
  - Drafts are built from typed fields such as `customerName`, `requestedService`, `preferredTime`, `confirmedTime`, and `missingInfo`.
  - Server post-call response exposes the draft but does not auto-send it.
  - Voice HTTP smoke asserts booking and follow-up drafts through the real Express endpoint.
- Blocker: no live voice/telephony or WhatsApp provider checks were run. Sending post-call drafts remains intentionally separate from this safe no-credential seam.
- Next chunk: add an explicit reviewed-send endpoint or operator packet for post-call follow-up drafts, gated by bearer auth and opt-in policy.

## 2026-07-01T00:00:33Z hourly build loop

- Branch: `main`
- HEAD before: `632db8b`
- HEAD after: this local commit (see `git rev-parse HEAD` after commit)
- Chunk selected: reviewed post-call WhatsApp follow-up send gate, so voice-call drafts can move through an operator-reviewed, opt-in checked path without accidental provider traffic.
- Files changed:
  - `.env.example`
  - `src/server.ts`
  - `src/server-battletest.ts`
  - `docs/voice-phone-readiness.md`
  - `docs/tilda-autonomous-log.md`
- Commands run:
  - `npm run typecheck` -> pass
  - `npm run server:battletest` -> `SERVER_BATTLETEST_OK`
  - `npm run style:guard` -> `STYLE_GUARD_OK`
  - `npm run secrets:scan` -> `SECRETS_SCAN_OK`
  - `npm run voice:post-call:smoke` -> `VOICE_POST_CALL_NORMALIZER_SMOKE_OK`
  - `npm run voice:smoke` -> `VOICE_AGENT_TOOL_SMOKE_OK`
  - `npm run check` -> pass
  - `npm run first-test:smoke` -> `FIRST_TEST_SMOKE_OK`
  - `npm run demo:fake` -> `DEMO_FAKE_HAIR_SALON_OK`
  - `git diff --check` -> pass
- Verification added:
  - New `POST /operator/follow-up/send` endpoint is bearer-protected.
  - Dry-run preview is the default and does not touch Twilio/WhatsApp.
  - Operator review and opt-in confirmation are required.
  - Non-dry-run sends fail closed with `409` unless `ENABLE_REVIEWED_FOLLOWUP_SEND=true` is deliberately configured.
  - Live sends, when enabled later, use the existing WhatsApp provider seam and write the sent assistant message into conversation history for privacy export/delete.
- Blocker: no live WhatsApp, voice, Google Calendar, or Supabase/Postgres checks were run in this loop. Live follow-up sending remains intentionally disabled until provider setup, opt-in policy, and operator process are approved.
- Next chunk: add a no-credential operator packet that ties post-call drafts, reviewed-send dry-runs, privacy export, owner alert checks, and deployment readiness into one founder demo command.

## 2026-07-01T03:00:33Z hourly build loop

- Branch: `main`
- HEAD before: `179abbe`
- HEAD after: this local commit (see `git rev-parse HEAD` after commit)
- Chunk selected: no-credential operator demo packet tying voice post-call drafts, reviewed-send dry-runs, privacy export, owner alert checks, readiness, and metrics into one founder-proof command.
- Files changed:
  - `src/operator-demo-packet.ts`
  - `package.json`
  - `docs/deployment-readiness.md`
  - `wiki/runbooks/run.md`
  - `docs/tilda-autonomous-log.md`
- Commands run:
  - `npm run operator:demo:packet` -> `OPERATOR_DEMO_PACKET_OK`
  - `OPERATOR_DEMO_PACKET_JSON=true npm run operator:demo:packet` -> JSON marker `OPERATOR_DEMO_PACKET_OK`
- Verification added:
  - Real Express server starts with fake calendar and local JSON state.
  - Protected readiness rejects missing bearer auth and exposes live blockers in authorized review mode.
  - Owner alert test runs in accepted log-only internal demo mode.
  - Voice post-call typed fields produce a reviewed WhatsApp follow-up draft.
  - Reviewed follow-up dry-run validates operator review and opt-in without provider sends.
  - Non-dry-run follow-up sending fails closed with `409` until explicit provider approval env is set.
  - Privacy export retrieves the stored call outcome.
  - Phone follow-up lead capture appears in protected metrics.
  - Machine-readable packet mode reports `noLiveProviderCalls: true` and live commands that still require approval.
- Blocker: no live Google Calendar, Supabase/Postgres, WhatsApp, or voice-provider checks were run. The packet is intentionally no-credential and writes only an ignored local handoff under `tmp/tilda-ops-snapshot/`.
- Next chunk: add hosted deployment target examples or run live provider smokes only if approved credentials are configured and the fixture cleanup/visible-proof scope is explicit.

## 2026-07-01T04:00:34Z hourly build loop

- Branch: `main`
- HEAD before: `237cf3b`
- HEAD after: this local commit (see `git rev-parse HEAD` after commit)
- Chunk selected: harden the no-credential operator demo packet for provider retry safety, so a repeated voice post-call webhook proves idempotent replay instead of duplicate call outcomes.
- Files changed:
  - `src/operator-demo-packet.ts`
  - `docs/tilda-autonomous-log.md`
- Commands run:
  - `npm run operator:demo:packet` -> `OPERATOR_DEMO_PACKET_OK`, `steps: 11`, `voiceRetryIdempotent: true`, `exportedCallOutcomes: 1`
  - `OPERATOR_DEMO_PACKET_JSON=true npm run operator:demo:packet` -> JSON marker `OPERATOR_DEMO_PACKET_OK`, `noLiveProviderCalls: true`
  - `npm run typecheck` -> pass
  - `npm run style:guard` -> `STYLE_GUARD_OK`
  - `npm run secrets:scan` -> `SECRETS_SCAN_OK`
  - `git diff --check` -> pass
- Verification added:
  - The packet now posts the same voice `callId` twice.
  - First insert must report `idempotentReplay: false`.
  - Provider retry must report `idempotentReplay: true`.
  - Privacy export must still contain exactly one call outcome after retry.
- Blocker: live Google Calendar, Supabase/Postgres, WhatsApp, and voice-provider smokes were not run in this no-credential loop.
- Next chunk: add a hosted-demo provider-proof manifest that maps each live credential/env prerequisite to a safe smoke command and expected marker, without printing secrets.

## 2026-07-01T05:00:34Z hourly build loop

- Branch: `main`
- HEAD before: `d7551ce`
- HEAD after: this local commit (see `git rev-parse HEAD` after commit)
- Chunk selected: hosted-demo provider-proof manifest that maps every live credential/provider prerequisite to safe commands, expected markers, cleanup proof, and approval boundaries without printing secrets.
- Files changed:
  - `src/provider-proof-manifest.ts`
  - `src/provider-proof-manifest-smoke.ts`
  - `package.json`
  - `wiki/runbooks/run.md`
  - `docs/tilda-autonomous-log.md`
- Commands run:
  - `npm run provider:proof:manifest` -> `PROVIDER_PROOF_MANIFEST_OK`, 10 proof items, 8 approval-required checks, 2 provider-traffic checks
  - `npm run provider:proof:manifest:smoke` -> `PROVIDER_PROOF_MANIFEST_SMOKE_OK`
  - `npm run typecheck` -> pass
  - `npm run style:guard` -> `STYLE_GUARD_OK`
  - `npm run secrets:scan` -> `SECRETS_SCAN_OK`
  - `git diff --check` -> pass
- Verification added:
  - Manifest is report-only and writes an ignored operator handoff under `tmp/tilda-ops-snapshot/`.
  - Live proof items cover Google Calendar read/full booking, Supabase Postgres, Supabase admin REST, Twilio webhook signature, reviewed WhatsApp follow-up sending, ElevenLabs voice contract, owner alert route, LLM provider, and deployment preflight.
  - Every item records owner, required env names only, command, expected marker, side-effect class, approval requirement, cleanup proof, and blocker if missing.
  - Smoke injects secret sentinels and asserts the manifest does not print them.
- Blocker: live Google Calendar, Supabase/Postgres, WhatsApp, voice-provider, and LLM smokes were not run. This loop deliberately produced the no-secret proof map before any approved live-provider checks.
- Next chunk: add a hosted env handoff checklist for Hetzner/Render/Fly-style deployment targets, or run specific live provider smokes only when approved credentials and fixture cleanup scope are configured.

## 2026-07-01T12:00:34Z hourly build loop

- Branch: `spike/calcom-provider`
- HEAD before: `96436da`
- HEAD after: this local commit (see `git rev-parse HEAD` after commit)
- Chunk selected: hosted-demo deployment target handoff, so Michael/Roxu can pick Hetzner VPS, Render, or Fly with a no-secret checklist before routing provider webhooks.
- Files changed:
  - `src/hosting-handoff.ts`
  - `src/hosting-handoff-smoke.ts`
  - `package.json`
  - `docs/deployment-readiness.md`
  - `wiki/runbooks/run.md`
  - `docs/tilda-autonomous-log.md`
- Commands run:
  - `npm run hosting:handoff:smoke` -> `HOSTING_HANDOFF_SMOKE_OK`
  - `npm run typecheck` -> pass
  - `npm run deployment:handoff:smoke` -> `DEPLOYMENT_HANDOFF_SMOKE_OK`
  - `npm run style:guard` -> `STYLE_GUARD_OK`
  - `npm run secrets:scan` -> `SECRETS_SCAN_OK`
  - `git diff --check` -> pass
  - `npm run deployment:smoke` -> `DEPLOYMENT_SMOKE_OK`
  - `npm run provider:proof:manifest:smoke` -> `PROVIDER_PROOF_MANIFEST_SMOKE_OK`
  - `npm run pilot:go-no-go:smoke` -> `PILOT_GO_NO_GO_SMOKE_OK`
- Verification added:
  - New `npm run hosting:handoff` writes `tmp/tilda-ops-snapshot/hosting-handoff.md` and supports JSON mode.
  - Default target is Hetzner VPS, with Render as acceptable and Fly as later.
  - Each target includes host URL, core env, local smoke, hosted preflight, provider-routing hold, and rollback checklist items.
  - Smoke verifies target selection, all three target options, hosted-preflight checklist coverage, and no secret sentinel leakage.
- Blocker: no deploy, live provider routing, Google Calendar, Supabase/Postgres, WhatsApp, voice-provider, or LLM checks were run. This was deliberately a no-credential hosting handoff artifact.
- Next chunk: add hosted health/readiness curl smoke instructions for the eventual public URL, or run approved live provider smokes only once credentials and fixture cleanup scope are configured.

## 2026-07-01T13:00:35Z hourly build loop

- Branch: `spike/calcom-provider`
- HEAD before: `08d80af`
- HEAD after: this local commit (see `git rev-parse HEAD` after commit)
- Chunk selected: Twilio live-pilot credential hardening, splitting outbound REST API keys from the Auth Token used for webhook validation.
- Files changed:
  - `.env.example`
  - `docs/deployment-readiness.md`
  - `docs/live-provider-demo.md`
  - `docs/tilda-autonomous-log.md`
  - `package.json`
  - `scripts/check-secrets.py`
  - `src/config.ts`
  - `src/deployment-handoff.ts`
  - `src/deployment-handoff-smoke.ts`
  - `src/deployment-preflight-smoke.ts`
  - `src/hosting-handoff.ts`
  - `src/hosting-handoff-smoke.ts`
  - `src/twilio-credential-smoke.ts`
  - `src/whatsapp.ts`
  - `wiki/research/2026-07-01-host-secret-command-matrix.md`
  - `wiki/runbooks/run.md`
- Commands run:
  - `npm run twilio:credentials:smoke` -> `TWILIO_CREDENTIAL_SMOKE_OK`
  - `npm run typecheck` -> pass
  - `npm run deployment:preflight:smoke` -> `DEPLOYMENT_PREFLIGHT_JSON_SMOKE_OK`
  - `npm run deployment:handoff:smoke` -> `DEPLOYMENT_HANDOFF_SMOKE_OK`
  - `npm run hosting:handoff:smoke` -> `HOSTING_HANDOFF_SMOKE_OK`
  - `npm run style:guard` -> `STYLE_GUARD_OK`
  - `npm run secrets:scan` -> `SECRETS_SCAN_OK`
  - `npm run deployment:smoke` -> `DEPLOYMENT_SMOKE_OK`
  - `npm run check` -> pass
  - `npm run first-test:smoke` -> `FIRST_TEST_SMOKE_OK`
  - `git diff --check` -> pass
- Verification added:
  - `sendWhatsapp` now prefers `TWILIO_API_KEY_SID`/`TWILIO_API_KEY_SECRET` for outbound REST, while keeping `TWILIO_AUTH_TOKEN` as a sandbox fallback and webhook-validation secret.
  - `/readiness/live-pilot`, deployment handoff, hosting handoff, env templates, and host-secret matrix now require/document the API-key split before live WhatsApp sending.
  - A no-live-call Twilio credential smoke proves `dryrun`, `auth-token-fallback`, `api-key`, and `incomplete` modes.
- Blocker: no live WhatsApp, Twilio, Google Calendar, Supabase/Postgres, voice-provider, LLM, deploy, push, or PR action was run in this no-credential loop.
- Next chunk: add hosted health/readiness curl smoke instructions and script for a future public URL, keeping provider routing blocked until the public endpoint, bearer auth, Twilio signatures, and readiness JSON pass.
