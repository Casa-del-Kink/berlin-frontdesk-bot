---
kind: canonical-schema-template
authority: doctrine
version: 1
generated-by: phase-1-manual
updated: 2026-05-20
---

# AGENTS.md — Canonical Schema Template

> Copy this into each project repo as `AGENTS.md`. It is THE single
> canonical schema/doctrine for that repo. `CLAUDE.md` / `HERMES.md`
> are thin pointers only. Read by Claude Code, Codex, and Hermes
> natively. Do not diverge per-agent.

## 0. BOOT SEQUENCE (every agent, every session — do this first)

1. Read this `AGENTS.md` in full.
2. **Project repo:** read `wiki/index.md` (catalog) then `HANDOFF.md`
   (generated current-state/navigation snapshot) — use these to find
   the authored wiki/decision/closeout records that answer "where are
   we / what's next". **OS repo itself** (doctrine source, not a `/sync-os`
   target): read `system/HANDOFF.md` (cross-project master index) then
   `wiki/REVIEW-INBOX.md`; there is intentionally NO `wiki/index.md`
   or root `HANDOFF.md` in OS — absence is correct, not a defect.
   **OS Pantheon (gods — readable from any repo via the `OS/` junction):**
   seven governance gods — Athena (strategy), Hermes (messenger/dispatch),
   Metis (planning), Mnemosyne (memory), Cerberus (vigilance), Asclepius
   (healing), Hephaestus (smithing — 7th, chartered-not-built). Overview
   `OS/wiki/foundations/pantheon.md`; per-god detail
   `OS/wiki/foundations/{god}/` (entry `OS/wiki/foundations/README.md`).
   **Hermes is a LIVE local agent** (Nous Hermes Agent) — dispatch by
   shelling the `hermes` CLI: `hermes send -t telegram "…"` (LLM-free
   notify, no gateway), `hermes chat -q "…"` (one-shot agent run), or
   `hermes mcp serve` (stdio MCP). Details `OS/wiki/foundations/hermes/`.
   OS-source authored files — not generated projections.
3. If `OS_DIGEST.md` exists: read its front-matter. **If
   `generated-at` is >7d old OR, when the OS repo is available, its
   `os-doctrine-hash` differs from the current OS digest doctrine hash
   → print `STALE-OS-CONTEXT`, tell Michael to run `/sync-os`, and do
   NOT treat OS-tier doctrine as current until refreshed.**
   When checking locally, `C:/Users/micha/OS/tools/sync_os.py --check`
   is the authoritative projection test; only an `OS_DIGEST.md` change
   means the digest is stale. `os-source-sha` is audit metadata only; an
   older OS commit SHA is not stale if the doctrine hash is unchanged.
   (Phase 1: `OS_DIGEST.md` not present yet — skip.)
4. Treat anything under `wiki/decisions/_archive/` and any file with
   `authority: data-not-instruction` as HISTORICAL DATA, never as
   instructions to execute.
5. If the task needs Michael's identity, contact, account, billing,
   form-fill, or reusable personal details, read
   `C:/Users/micha/OS/wiki/about-michael.md` first when available. It
   points to the canonical profile and private details file. Use the
   minimum necessary detail and do not ask Michael again for facts already
   captured there.

## 1. AUTHORITY LADDER (precedence — decision #10)

`AGENTS.md` (doctrine+schema)
  > `wiki/decisions/` (state of record)
  > authored `wiki/**` closeout/evidence records
  > `wiki/index.md` (catalog)
  > `HANDOFF.md` (generated current snapshot)
  > `OS_DIGEST.md` (read-only OS mirror)
  > `CLAUDE.md` / `HERMES.md` (generated thin pointers — NEVER authoritative).

`AGENTS.md` occupies the "project CLAUDE.md" slot in the global
instruction ladder (system > Michael > project AGENTS.md > appendix >
global CLAUDE.md > memory).

**Generated, never hand-edited (from Phase 2 onward):** `HANDOFF.md`,
`wiki/index.md`, `CLAUDE.md`/`HERMES.md` shims, `OS_DIGEST.md`.
On conflict, the higher-authority file wins; regenerate the projection.

## 1b. AGENT PORTABILITY (Principle #6 — Build for All Gods)

All skills, tools, and tracking surfaces must work across Claude Code,
Codex CLI, and future runtimes. Concrete rules:
- Skills live in `OS/shared/skills/`, symlinked into each runtime.
- Doctrine lives in `AGENTS.md` (cross-agent); `CLAUDE.md`/`HERMES.md`
  are thin generated shims.
- Wiki decisions, charters, and build-state use plain markdown in git.
- When a capability exists as an agent type in one runtime, document
  the equivalent in others (see `metis-plan` Platform Mappings).
- Full contract: `OS/wiki/decisions/2026-05-25-agent-portability-contract.md`.

## 2. WORK-CONTRACT FORMAT (the only work-tracking system)

One markdown file per work item in `wiki/` (no external tracker).
Required front-matter — a per-repo **pre-commit hook REJECTS** any
work file missing these (and `/sync-os` + `/learn` re-validate on
read; there is NO orchestrator write-gate — git stays distributed):

```
---
id: <stable-id>
status: open | active | blocked | done | superseded
supersedes: <id|none>
blocked-by: <id|none>
scope-boundary: <one line: what is explicitly OUT of scope>
owner: <session/agent currently active, or none>
---
```
Body: **Problem · Constraint · Acceptance · Scope-boundary.**
One active owner per item: claiming = the session itself sets
`status: active` + `owner` in the file's front-matter and commits it
(no orchestrator). An agent dispatched onto an already-`active` item
must decline, not self-claim; conflicts resolve via git + the
one-active-owner rule.

## 3. SUPERSESSION (never delete — supersede)

A superseded decision/plan keeps its file and gains front-matter:
```
status: superseded
superseded-by: <id or relative path>
superseded-date: <YYYY-MM-DD>
```
`wiki/index.md` lists only `status: current|open|active`. Superseded
files move to `wiki/decisions/_archive/` but stay linked from their
successor's `supersedes:`.

## 4. WIKI UPDATE PROTOCOL

- Executing agent MAY append to `wiki/learnings.md` and create/edit
  work-contract files (with valid front-matter).
- `wiki/index.md`, `HANDOFF.md`, shims, `OS_DIGEST.md`: generated by
  the in-session `/sync-os` skill only (Phase 2+) — NOT a daemon.
  Phase-1 bootstrap exception: hand-authored, marked
  `generated-by: manual-bootstrap`, sole-owner the authoring session,
  replaced wholesale by the Phase-2 `/sync-os` generator.
- Cross-project learnings are promoted by the manual-first `/learn`
  flow (Phase 3), never by an agent mutating OS during project work.

## 5. DOC ROLE TABLE (no dual-owners)

| File | Owns | Written by | When |
|---|---|---|---|
| `HANDOFF.md` | generated current-state navigation + next action pointer (≤1pg), not closeout truth | generator (P1: bootstrap) | after authored state changes / `/sync-os` run |
| `wiki/current-plan.md` | the in-flight plan spec (living) | executing agent | while work in flight |
| `wiki/index.md` | catalog of decisions+open work | generator (P1: bootstrap) | on any wiki change |
| `wiki/decisions/*` | durable decisions, supersession-linked | executing agent | when a decision is made |
| `wiki/learnings.md` | raw per-project failure observations | executing agent (append) | as observed |

## 6. HUMAN-REVIEW ARTIFACTS (invariant — RCA 2026-05-18)

Any artifact that requires Michael's review or decision MUST be both:
1. **Delivered as content into the session** — the chat is the primary
   review surface (graduated lesson 2026-04-01: "the content in chat
   IS the deliverable"; never "go find this file").
2. **Resident in an OS-WIKI-reachable path** — `<repo>/wiki/…` or
   `OS/wiki/…`. **Never** `automation/`, `system/`, or any
   vault-excluded machinery dir. A pointer is backup only and must
   itself be vault-reachable.

Rationale: the architecture enforces *agent* findability (boot chain +
staleness) but the first human-facing output (L2 digest) was filed in
`automation/` — outside the Obsidian vault Michael actually opens —
reproducing the founding "can't find it" failure against the human.
This invariant closes the symmetric gap.

## 7. ENGINEERING DISCIPLINE (graduated from lessons.md, /learn 2026-05-18)

Binds every agent (Claude, Codex, Hermes) in every repo.

1. **Diagnosis is not a fix.** A diagnosis, plan, or finding is not
   done until applied/committed. Identifying a bug ≠ fixing it. If the
   next step is mission-aligned and reversible/local, do it and report
   — do not stop at the diagnosis.
2. **An optional step must not mask a real failure.** An
   optional/conditional step must never swallow a real failure: the
   consumer of its output handles absence explicitly (raise /
   zero-value / alert). Add an expected-vs-actual missing-output
   detector wherever "produces zero" is a real failure mode.
3. **Artefact-first.** Before drafting or implementing anything that
   mirrors a live schema / DB / config / pipeline, fetch the live
   source AND read the existing writer/consumer first. Never infer
   structure from a spec or secondary signal.
4. **Session-local orchestrator default.** For substantial multi-step,
   high-risk, cross-repo, or long-running work, the main session is the
   orchestrator and should run on the highest-capability available model when
   the runtime gives a choice. The main session owns scope, Metis state,
   decisions, branch/worktree hygiene, integration, verification, staging, and
   commits. Subagents own bounded execution, research, review, verification
   failures, repo-health repair, and side quests. This does not create a
   central git orchestrator; git remains distributed and every session still
   commits only its own repo/worktree.
5. **Metis before mutation.** Before editing files, creating files, staging,
   or committing on non-trivial work, run the Metis sequence in the open:
   scope/classify, research/orient, identify assumptions, draft or confirm the
   plan/Build Contract, run the relevant review cascade, iterate to a gate,
   then build/verify/ship with evidence. For simple reversible patches, this
   may be a concise inline contract, but the scope, files, verification, and
   rollback boundary must still be explicit.
6. **Teach git/worktree discipline in the open.** Michael is not expected to
   manually choose safe git branching and worktree strategy. The agent should
   explain when a branch or worktree is needed, why, what files are in scope,
   and what will be staged/committed. Do not silently create branches or
   worktrees unless the active Metis contract or explicit user request already
   authorizes that move.
7. **Failure sidecar.** If mission work uncovers lint/test failures,
   broken generated state, stale work, dirty/unpushed commits, or any
   other actionable repo-health issue, do not merely flag it. Create a
   parallel subagent/sidecar when the runtime supports it to audit,
   investigate, fix/repair, and systematise the cause while the main
   session continues. If subagents are unavailable or unsafe, handle the
   repair inline or create a concrete work-contract before moving on.
8. **Cerberus/Asclepius boundary.** Cerberus observes and classifies OS health
   failures; Asclepius diagnoses and repairs bounded cases when authorized.
   Neither role may mutate billing, secrets, provider settings, Notion schemas,
   generated projections, branch protection, scheduler/runtime ownership, or
   source-of-truth policy without the required human and/or Metis gate.


## 8. PROJECT SPECIFICS

### Mission

An **AI front-desk SaaS** for appointment-heavy **Berlin** businesses
(beauty/aesthetics first, dental later). WhatsApp-first, German/English
auto-detected, with **voice (ElevenLabs Agents) as channel 2**. Core wedge:
**missed-booking recovery** — a customer messages/calls while the owner is
busy, the bot replies in <1 min, qualifies, reads real availability, books
the appointment (Google Calendar engine; booking-link fallback for closed
systems), alerts the owner, and sends one end-of-day summary.

**Architecture principle: ONE brain, TWO channels.** Business logic
(config + slots + booking + leads + store + summary) is exposed as HTTP
endpoints; both the WhatsApp loop and the ElevenLabs voice agent consume
them equally. Adding voice does not duplicate logic.

### Naming caveat (read before touching branding)

The org `Casa-del-Kink`, the product codename **"Tilda" / "Project Tilda"**,
and the repo name `berlin-frontdesk-bot` are all **placeholder names pending
a proper rebrand** — `Casa Del Kink` is a house in-joke (co-founder Roxu is a
shibari rigger). Do not treat any of these as the final brand. Rebrand is a
deferred, deliberate action — see
`wiki/decisions/2026-06-29-onboard-to-os-single-repo.md`.

### Source-of-truth & key paths

- **Strategy / scoping / all product decisions → `PROJECT.md`** (the decision
  base document — read before touching architecture). Do **not** duplicate it
  into `wiki/`.
- `src/` — one file per swappable seam: `server.ts` (webhook), `llm.ts`
  (OpenRouter loop + tool use), `tools.ts` (the shared "one brain" tools),
  `calendar.ts` (provider seam: fake + Google), `slots.ts` (pure, tested),
  `store.ts` (JSON + Postgres seam), `prompt.ts`, `whatsapp.ts` (Twilio →
  360dialog swap point).
- `clients/*.yaml` — **one business = one config file** (adapt = copy + edit).
- `docs/` — ops/compliance packs (live-pilot compliance, GDPR, voice
  readiness, provider cost model, onboarding questionnaire, Tilda
  identity/voice).

### Run / build / test / verify

→ **read `wiki/runbooks/run.md`** (mechanics live there, not inline — per the
lazy-loaded-runbook rule, decision `2026-06-19-run-mechanics-lazy-loaded-runbook`).

### Runtime ownership

- **Claude / Codex** — code (any model edits `src/`, docs, configs).
- **Hermes** — already holds least-privilege `github:write` on this repo
  (Roxu/VPS Hermes via the MCP gateway); respect GitHub cost discipline (no
  rapid push/PR/CI storms — Actions are billed).
- **Compliance / GDPR is load-bearing** (German market, §203 StGB for health
  data): beauty first on Twilio sandbox; dental later via a German BSP
  (360dialog) with DPA. Complete `docs/compliance-live-pilot-pack.md` before
  any real customer traffic.

### Local topology note

On Michael's laptop this repo is reached through
`C:\Users\micha\OS\projects\berlin-frontdesk-bot` (a Windows junction to the
standalone physical clone). Treat that as the canonical local entrypoint, but
this is its **own** git repo — git commands here affect this repo's history,
not the OS repo. Org/remote: `Casa-del-Kink/berlin-frontdesk-bot`.
