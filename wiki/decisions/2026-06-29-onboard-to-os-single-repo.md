---
id: 2026-06-29-onboard-to-os-single-repo
status: current
supersedes: none
date: 2026-06-29
owner: none
scope-boundary: OS topology + naming for this repo; NOT product strategy (that is PROJECT.md)
---

# Onboard berlin-frontdesk-bot as a single-repo OS project

## Decision

Wire the **existing** `Casa-del-Kink/berlin-frontdesk-bot` repo into the OS as
a **single-repo project** (the shape used by Castellan / Lucian /
world-recover): junction at `OS/projects/berlin-frontdesk-bot`, canonical
majestic-quill scaffolding (`AGENTS.md` + `wiki/` + `HANDOFF.md` + `outputs/`)
authored into the repo, and one row in the OS project registry
(`OS/AGENTS.md` §3).

## Why not a new `casa-del-kink` repo

The trigger ask was "set up casa-del-kink as a new project." Investigation
found **no repo named `casa-del-kink`** — only the org `Casa-del-Kink` with
`berlin-frontdesk-bot` (the real, active product) and a throwaway
`demo-repository`. `Casa Del Kink` and `Project Tilda` are **placeholder
names** (a house in-joke; co-founder Roxu is a shibari rigger) that will be
rebranded. Creating a fresh permanent repo around a joke name would just have
to be unwound at rebrand. The product code already exists and is mature, so we
onboard it in place rather than spawning a parallel ops repo.

## Naming caveat & rebrand trigger

`Casa-del-Kink` (org), `Tilda` / `Project Tilda` (product codename), and
`berlin-frontdesk-bot` (repo) are all **placeholders**. **Rebrand trigger:**
when Michael chooses the real brand. At that point rename, in order, **one**
of each: GitHub repo → local junction (`OS/projects/<new>`) → OS registry row
(`OS/AGENTS.md` §3) → this repo's `AGENTS.md` §8 naming caveat. Because we
chose single-repo, a rebrand touches one repo, not two.

## Conventions fixed by this decision

- **Junction name = repo name** (`berlin-frontdesk-bot`), not the placeholder
  brand — durable across a future brand change.
- **`PROJECT.md` stays the product strategy source-of-truth**; `wiki/` carries
  OS-flavoured decisions/learnings/runbooks only — no duplication.
- Scaffolding shipped via branch + PR (repo is co-owned with Roxu).

## Status of generated projections

`HANDOFF.md`, `wiki/index.md`, `CLAUDE.md` are **manual-bootstrap stubs**.
`OS_DIGEST.md` is intentionally absent until the first `/sync-os` run from a
project-rooted session, which will regenerate all four.
