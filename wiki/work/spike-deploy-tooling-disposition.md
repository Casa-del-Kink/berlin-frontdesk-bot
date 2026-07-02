---
id: spike-deploy-tooling-disposition
status: open
supersedes: none
blocked-by: none
scope-boundary: Disposition of the spike branch's deploy/go-no-go tooling ONLY (hosting-handoff, deployment-handoff, pilot-go-no-go, provider-proof-manifest, operator-readiness-bundle, hosted-smoke-contract, operator packets); NOT the Cal.com seam, voice pack, or website (those shipped or have their own contracts)
owner: none
---

# Spike deploy/go-no-go tooling: REWORK verdict and disposition

## Problem

The `spike/calcom-provider` branch (archived as source material after the
2026-07 go-live pass) carries ~1,800 lines of deploy/go-no-go report tooling
that received a REWORK verdict in adversarial review and was deliberately
NOT ported:

- `src/hosting-handoff.ts` hardcodes Hetzner as first-choice, contradicting
  the Render decision (`wiki/decisions/2026-07-01-render-hosting-frankfurt-standard.md`).
- `src/hosted-smoke-contract.ts` prints `HOSTED_SMOKE_CONTRACT_SMOKE_OK` and
  exits 0 when `HOSTED_SMOKE_BASE_URL` is unset: a silent vacuous pass,
  violating the repo's fail-closed discipline. If ever ported, the unset-URL
  branch must print a distinguishable non-OK marker and exit non-zero.
- The spike's `pilot-go-no-go.ts` / `operator-readiness-bundle.ts` /
  `deployment-handoff.ts` maintain three parallel string-keyed owner/next-action
  maps that must stay in lockstep with readiness gate names by hand, and none
  of them know about the health-data compliance gate (spike forked before
  ff9905a).

## Constraint

Main's readiness model (config.ts + readiness.ts + deployment:preflight +
/readiness/live-pilot + strict startup) is the ONE gate system. Any salvage
from this tooling must feed that system, never stand beside it as a second
source of truth.

## Acceptance

A future session either (a) ports individual pieces with the defects above
fixed and gate names derived from the readiness model (not string-copied), or
(b) closes this contract as won't-do once the pilot go/no-go evidence bundle
pattern proves sufficient. Either outcome recorded here.

## Revisit trigger

When operator-facing go/no-go reporting is wanted for a second client
onboarding, or when Michael/Roxu ask for owner-readable readiness packets.
