---
id: 2026-07-01-render-hosting-frankfurt-standard
status: current
supersedes: none
blocked-by: none
scope-boundary: hosting platform choice for the pilot backend; NOT domain/DNS (see domain research doc) and NOT compliance sign-off
owner: none
---

# Hosting: Render, Frankfurt region, Standard plan

## Decision

Host the pilot backend on Render: Docker runtime (using the existing
`Dockerfile`), Frankfurt region, Standard plan, blueprint-as-code in
`render.yaml`.

## Why Render over Hetzner

`PROJECT.md` §8's stack line previously said "hosting Hetzner." For a
two-person team, a bare Hetzner VPS means owning HTTPS certificate renewal,
deploy scripting, process supervision, and OS patching directly. Render gives
managed HTTPS, managed deploys (blueprint-driven, git-connected), and
effectively zero ops burden for the equivalent workload. That trade is worth
it at this team size and stage; Hetzner can be reconsidered later if cost or
control requirements change.

Region: Frankfurt, for EU data residency as part of the GDPR posture (see
`PROJECT.md` §5, §10).

Plan: Standard, not the free tier. Free-tier services on Render cold-start
after idle, which is unacceptable for a service whose whole value proposition
is a fast reply to a customer message. Standard also includes `render ssh`
shell access, which is the target-runtime proof point for
`npm run postgres:smoke` (a local `docker run` cannot prove Render's own
network path to the database).

## Why this record exists

`wiki/decisions/2026-07-01-subprocessor-review-triggers.md` cites "the
Render hosting decision, same date" as prior context, but that record was
never actually written -- it was referenced before it existed. This record
back-fills that gap. The hosting decision itself was made 2026-07-01 during
backend-hosting planning; this record is authored 2026-07-02.

## Reconsideration triggers

Hosting is itself a subprocessor. Any change to the hosting platform re-fires
the subprocessor review per trigger 4 in
`wiki/decisions/2026-07-01-subprocessor-review-triggers.md`. Additional
triggers to revisit this specific choice:

- sustained cold-start or latency problems on Render Standard
- a material Render pricing change
- the dental/health vertical requiring stricter hosting guarantees than
  Render Standard + Frankfurt provides (see the subprocessor review record)

## Cross-references

- `wiki/decisions/2026-07-01-subprocessor-review-triggers.md`
- `wiki/research/2026-07-01-host-secret-command-matrix.md` (spike branch)
- `render.yaml`
