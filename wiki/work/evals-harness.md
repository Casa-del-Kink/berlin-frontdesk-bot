---
id: evals-harness
status: blocked
supersedes: none
blocked-by: first-real-pilot-traffic-or-model-swap
scope-boundary: Conversation-quality evaluation harness for the LLM loop; NOT provider smoke tests (deployment readiness owns those), NOT the style guard (exists), NOT model SELECTION strategy (docs/llm-voice-model-eval-plan.md owns the research side)
owner: none
---

# Evals harness for conversation quality

## Problem

Tilda's conversational quality is currently enforced only at the prompt
level (anti-slop rules, guardrails) plus one cheap runtime price check
(findUnconfiguredPrices, log-only). There is no repeatable eval that scores
the actual behavior: booking success rate, DE/EN detection accuracy, style
compliance in generated replies, price/hours fidelity, handoff-trigger
precision. Model swaps via OpenRouter are therefore blind risk. Michael
framed this explicitly during the go-live pass: the pantheon dogfooding a
real product needs evals as part of its own learning loop.

## Constraint

Builds ON the existing docs/llm-voice-model-eval-plan.md (main, commits
9bf1c25/864d2b5), which already scopes model-comparison methodology. Eval
runs cost OpenRouter tokens: flag spend before running large suites (repo
cost discipline).

## Acceptance

- A scripted eval suite (fixture conversations in German and English,
  fake providers) scoring: correct booking completion, no invented
  prices/hours/services, language detection, anti-slop compliance
  (mechanical: em dash, banned phrases), handoffRequested precision on
  explicit human-requests vs normal leads.
- Runnable against any OpenRouter model slug so model swaps get a
  before/after scorecard.
- Results land in wiki/ as dated records; regressions feed learnings.

## Revisit trigger

First week of real pilot traffic (score against real transcript patterns),
or ANY change of OPENROUTER_MODEL, whichever comes first.
