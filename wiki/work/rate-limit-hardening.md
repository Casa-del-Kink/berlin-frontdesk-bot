---
id: rate-limit-hardening
status: blocked
supersedes: none
blocked-by: render-xff-verification (Phase-3 live deploy provides the evidence)
scope-boundary: Hardening the PR-E rate limiter (keying, memory bounds, cross-instance limits); NOT CORS (shipped with exact-match tests), NOT auth (bearer seams shipped)
owner: none
---

# Rate limiter hardening

## Problem
The limiter shipped with PR-E keys on req.ip with trust proxy pinned to 1
hop, replacing the spike's spoofable XFF-first-entry keying. Remaining
questions: Render's actual edge XFF behavior (verify from live headers in
Phase 3), unbounded bucket Map growth under key churn, and per-instance
limits if the service ever scales past one instance.

## Acceptance
Live-verified keying against Render's edge; bucket eviction bound; explicit
decision on express-rate-limit vs the bespoke bucket (prior-art review:
prefer the standard middleware unless a concrete reason not to).

## Revisit trigger
Phase-3 deploy evidence lands (XFF headers observed), or second client.
