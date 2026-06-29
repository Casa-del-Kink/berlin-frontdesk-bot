---
kind: handoff
authority: generated-snapshot
generated-by: manual-bootstrap
updated: 2026-06-29
---

# HANDOFF — berlin-frontdesk-bot (Tilda / Casa Del Kink)

> Generated navigation snapshot — NOT closeout truth. Bootstrap stub authored
> during OS onboarding (2026-06-29); will be replaced wholesale by `/sync-os`
> run from a session rooted in this repo. Authored state lives in
> `wiki/decisions/` and `PROJECT.md`.

## What this is

AI front-desk SaaS (WhatsApp + voice) for appointment-heavy Berlin
businesses. Names (`Casa Del Kink`, `Tilda`, `berlin-frontdesk-bot`) are
placeholders pending rebrand.

## Boot order for any agent

1. `AGENTS.md` (doctrine + schema; §8 = project specifics)
2. `wiki/index.md` (catalog)
3. This file
4. `PROJECT.md` — strategy / scoping source-of-truth (read before architecture)
5. Run mechanics → `wiki/runbooks/run.md`

## Current state (2026-06-29)

- Repo onboarded to OS majestic-quill scaffolding (this change). Product code
  pre-dates onboarding and is mature (F0/F1 scaffold per `PROJECT.md` §8).
- No CI configured yet.

## Next actions

- Run `/sync-os` from a project-rooted session to generate real
  `wiki/index.md`, `HANDOFF.md`, `CLAUDE.md`, and `OS_DIGEST.md`.
- Product roadmap → `PROJECT.md` §8 phases (F1.5 "one brain" refactor is
  current priority).
