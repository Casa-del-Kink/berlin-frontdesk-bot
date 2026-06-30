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
