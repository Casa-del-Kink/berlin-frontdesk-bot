---
id: tilda-production-watch-charter
status: blocked
supersedes: none
blocked-by: render-service-live (fires the day the Render service goes live)
scope-boundary: Cerberus-role observation and Asclepius-role bounded repair of the DEPLOYED Tilda runtime; NOT legal/compliance decisions, NOT provider account changes, NOT billing, NOT this repo's build pipeline
owner: none
---

# Tilda production watch charter (Cerberus observes, Asclepius heals)

## Problem

Tilda is the pantheon's first commercial production product (SME B2B, real
customer traffic planned). Nothing watches the deployed runtime: monitoring
today is poll-only endpoints (/health, /readiness/live-pilot) that nobody
polls, and owner alerts that assume the bot itself is alive to send them.

## Charter (per AGENTS.md 7.8 boundary)

Cerberus role (observe + classify, never mutate):
- Poll /health and /readiness/live-pilot on the live URL on a schedule
  (Hermes scheduled task or external uptime pinger; decide at build time).
- Watch Render deploy/error events (Render API or dashboard notifications).
- Classify: bot-down, readiness regression, owner-alert delivery failure
  (the [owner alert:FAILED] log marker), metrics anomaly (booked=0 across a
  normally-active day), provider errors (OpenRouter/Twilio/Google failures
  in logs).
- Escalate what-needs-you items into the Prometheus Morning Brief.

Asclepius role (diagnose + repair, bounded):
- MAY: redeploy a known-good build, restart the service, fix code/config
  within an authorized Metis contract, re-run smokes to confirm recovery.
- MAY NEVER without human/Metis gate: touch billing, secrets, provider
  settings, compliance flags, branch protection, DNS, or data deletion.

Failure-set learning loop: every incident gets a wiki/learnings.md append
and flows into learn/distill so Tilda's failures train the pantheon.

## Acceptance

First increment live: scheduled health poll with a notify path Michael
actually receives (Telegram via Hermes preferred), plus a one-page incident
runbook. Escalations visible in the Morning Brief.

## Revisit trigger

The day the Render service goes live (Phase 3 of the go-live pass). Also
"who watches /health during the pilot window" appears in the Phase-4
human-only handoff list and resolves into this contract.
