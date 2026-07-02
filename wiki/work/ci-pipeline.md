---
id: ci-pipeline
status: open
supersedes: none
blocked-by: none
scope-boundary: CI enforcement of the existing verification battery + secret scanning; NOT new test content (suites exist), NOT deployment automation (render.yaml owns deploys, autoDeployTrigger deliberately off)
owner: none
---

# CI pipeline: make the battery self-enforcing

## Problem

No CI exists on any branch. Every gate in this repo (typecheck, battletest,
style guard, smokes, secret scan) runs only when a human or agent remembers
to run it. The go-live pass proved the failure mode twice: main carried a
style-guard violation (em dashes committed in ff9905a without running the
guard) and a battletest that had silently stopped exercising two of its own
assertions. GitHub Actions cost discipline applies (Actions are billed on
this org; no rapid CI storms per AGENTS.md 8).

## Constraint

Keep it minimal and cheap: one workflow, push/PR-triggered on main and pr/*
branches, running the credential-free battery only (no live smokes, no
secrets in CI). Secret scanning: prefer gitleaks (standard, maintained)
over porting the spike's bespoke check-secrets.py, whose pattern list
misses Cal.com/Twilio/AWS/JWT-shaped keys.

## Acceptance

- Workflow runs: npm ci, typecheck, check, first-test:smoke,
  server:battletest, voice:smoke, demo:fake, style guard, deployment:smoke,
  gitleaks scan.
- Red workflow blocks PR merge (branch protection on main once Roxu/Michael
  enable it: flag as the one human console step).
- Documented in wiki/runbooks/run.md.

## Revisit trigger

Before a second contributor works the repo in parallel, or before the
second client onboards, whichever comes first.
