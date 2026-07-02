---
kind: learnings
authority: evidence
updated: 2026-06-29
---

# Learnings — berlin-frontdesk-bot (Tilda)

Append-only raw observations (failures, surprises, environment quirks). One
bullet per observation, newest at the bottom. Graduate durable ones into
`wiki/decisions/` or `PROJECT.md`.

- 2026-06-29 — Repo onboarded to OS scaffolding. Strategy source-of-truth is
  `PROJECT.md`; do not duplicate it here.
- 2026-07-02 — The competitive map in `PROJECT.md` §4 went stale within one
  funding cycle (fonio.ai, $17M Jun 2026, filled the claimed "German + GDPR"
  gap). Competitive claims need a re-run cadence, not a one-time snapshot —
  intel records under `wiki/competitors/` now carry `rerun:` front-matter.
- 2026-07-02 — `calltilda.com` is unregistered (NXDOMAIN, verified via
  nslookup + curl + WebFetch). Any doc or plan assuming that domain exists
  is wrong until it's actually registered.
