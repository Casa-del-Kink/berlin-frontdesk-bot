---
id: server-side-guardrail-enforcement
status: open
supersedes: none
blocked-by: none
scope-boundary: Server-side validation of LLM replies (prices, hours, services) beyond the shipped log-only price check; NOT prompt engineering (prompt.ts owns that), NOT evals (evals-harness owns scoring)
owner: none
---

# Server-side guardrail enforcement

## Problem
PROJECT.md section 11 commits to "prices/hours/services ONLY from config or
tools" but enforcement is prompt-level plus the PR-B log-only price-token
check. A hallucinated price still reaches the customer; the pilot
compensating controls are the prompt rules, the parallel-run period, and
owner review of transcripts. Michael consciously signed off on this residual
risk for the pilot via the Phase-2 slow-lane ask.

## Acceptance
Escalation path decided (block-and-regenerate vs flag-to-owner vs
append-correction), hours/services checks added beside prices, and the
choice evidenced by eval results rather than guesswork.

## Revisit trigger
Before the second client onboards, before any autonomous-booking upgrade,
or immediately if the pilot logs a single [guardrail] price flag on real
traffic.
