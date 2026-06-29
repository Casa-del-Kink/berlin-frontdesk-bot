# Tilda priority plan

Status: draft for critique by agentic software development workflow.

Owner context: Michael is unavailable for active steering today. The plan should let an implementation agent choose the next high-value product task without drifting into CRM, prospecting, or broad GTM work.

## Product definition

Tilda is a virtual front desk for owner-operated small businesses.

The first wedge is independent Berlin hair salons.

The pilot product must feel complete end to end for that wedge before widening.

Core promise:

```text
Someone calls, Tilda answers, understands the request, and lands the booking or gets as close as possible. A customer can also start or continue the process by WhatsApp. SMS is out of scope.
```

## Non-negotiables

1. Phone answering is pilot scope.
2. WhatsApp is pilot scope.
3. SMS is not pilot scope.
4. Tilda must sound like a good human front desk person.
5. No AI bot vibe.
6. No generic assistant phrasing.
7. No em dash character in customer-facing copy, prompts, voice scripts, or brand files.
8. Start narrow with hair salons and make the flow smooth, robust, and demo-sellable before expanding.
9. Use Supabase Postgres as primary hosted database option. Neon is second option.
10. Do not clutter Michael's personal Google Calendar. Use a separate dev Gmail calendar until Google Workspace exists under the future brand/domain.

## Current repo state

Merged to `main` in PR 1:

- live pilot readiness gate
- idempotent follow-up registration
- calendar provider seam
- store backend seam
- German live-pilot compliance pack
- real Postgres backend

Local branch with unpushed correction work:

```text
hermes/voice-first-compliance-correction
```

Local commit currently includes:

```text
efab2a2 Correct voice-first pilot compliance framing
```

This branch adds or updates:

- `docs/tilda-identity.md`
- `docs/tilda-voice-style.md`
- `docs/compliance-live-pilot-pack.md`
- `docs/voice-phone-readiness.md`
- `src/prompt.ts`
- `clients/salon-demo.yaml`

This plan file should be included with that correction branch or a follow-up branch.

## Priority order

### P0 - Keep the product definition locked

Goal: prevent implementation drift.

Tasks:

- Keep phone-first virtual front desk language in product docs.
- Keep WhatsApp as an initiate or continue channel, not the whole product.
- Keep SMS out of scope.
- Keep Tilda identity and anti-slop rules close to runtime prompts and voice-agent setup docs.
- Add a lightweight automated style guard if practical.

Acceptance criteria:

- Customer-facing docs and prompts say phone plus WhatsApp, not WhatsApp-only.
- No customer-facing artifact mentions SMS as an offered channel.
- No customer-facing artifact uses the em dash character.
- Prompt files contain explicit anti-AI-slop rules.

Suggested verification:

```bash
python3 scripts/check-style-guard.py
npm run typecheck
npm run check
npm run first-test:smoke
```

If `scripts/check-style-guard.py` does not exist yet, build it.

### P1 - Dev calendar isolation

Goal: test real Google Calendar booking without touching Michael's main calendar.

Decision:

Use a separate dev Gmail account and a calendar called `Tilda` until launch. Production later moves to Google Workspace under the future brand/domain.

Tasks:

- Create a clear doc for dev calendar setup.
- Support a `CLIENT_CONFIG_PATH` pointing to a dev Tilda calendar config.
- Add a Google Calendar smoke script that can safely create and clean up one test booking in the Tilda calendar.
- Keep fake calendar tests as default for CI and local no-credential checks.

Blocked on:

- dev Gmail account exists
- Tilda calendar ID
- service account JSON in `GOOGLE_SA_JSON`
- calendar shared with service account with event edit permissions

Acceptance criteria:

- Real Google Calendar smoke can run against only the Tilda test calendar.
- Test creates a recognizable event and then deletes it or marks cleanup clearly.
- No test writes to Michael's main calendar.
- Failure message clearly names missing env or calendar sharing issue.

Suggested command:

```bash
GOOGLE_SA_JSON='...' CLIENT_CONFIG_PATH=clients/salon-demo.yaml npm run google-calendar:smoke
```

### P2 - Supabase Postgres verification

Goal: verify the merged Postgres backend on a real hosted Postgres database.

Decision:

Use Supabase first. Neon is backup.

Tasks:

- Create a test Supabase project or database.
- Use a throwaway test database or schema.
- Run `npm run postgres:smoke` with TLS if required.
- Document Supabase connection settings and pitfalls.
- Keep credentials out of git.

Blocked on:

- Supabase test database URL

Acceptance criteria:

- `npm run postgres:smoke` passes against Supabase.
- The smoke test verifies schema creation, capped conversation history, idempotency, advisory booking lock, metrics, export/delete, and retention purge.
- Docs state that production database is Supabase Postgres, with Neon as second option.

Suggested command:

```bash
PGSSL=true DATABASE_URL='postgresql://...' npm run postgres:smoke
```

### P3 - Voice provider path for first demo

Goal: make phone answering demo-ready, not theoretical.

Likely first path:

```text
Telephony provider forwards or routes the call to a voice AI agent. The voice AI agent calls Tilda server tools for availability, booking, and lead capture. After the call, it sends a post-call summary webhook.
```

Primary candidate:

- ElevenLabs for voice AI

Alternatives to keep visible:

- Retell
- Vapi
- Bland
- OpenAI Realtime
- Twilio-native voice flows

Telephony options:

- Twilio Voice
- Sipgate
- Telnyx
- Vonage
- Plivo

Tasks:

- Pick the first provider path for implementation.
- Create provider-specific setup doc for the selected path.
- Map voice-agent tools to existing endpoints:
  - `POST /tools/check_availability`
  - `POST /tools/book_appointment`
  - `POST /tools/register_lead`
  - `POST /webhook/voice/post-call`
- Add a deterministic voice-tool smoke test that simulates provider calls over HTTP.
- Add one realistic German call script for demo testing.
- Confirm owner alert behavior after booked and needs-followup outcomes.

Acceptance criteria:

- A voice agent can check slots, book, register follow-up, and post call summary through the same backend as WhatsApp.
- A simulated call path is tested without provider credentials.
- Provider-specific live setup steps are documented separately from generic architecture.
- Call transcript or recording storage is off by default unless explicitly enabled and reviewed.

### P4 - End-to-end demo loop

Goal: make one narrow hair-salon demo smooth enough to sell.

Demo scenario:

1. Customer calls.
2. Tilda answers naturally.
3. Customer asks for a haircut appointment.
4. Tilda checks availability.
5. Tilda offers 2 concrete slots.
6. Customer picks one.
7. Tilda asks for name.
8. Tilda books calendar event.
9. Owner receives alert.
10. Metrics show recovered booking value.
11. Customer can also continue or initiate by WhatsApp.
12. Human handoff works when requested.

Tasks:

- Create `docs/demo-script-hair-salon.md`.
- Create or update one demo client YAML that is realistic for Berlin hair salons.
- Add scripts or commands to run the full fake-provider demo locally.
- Add commands for live-provider demo once credentials exist.
- Ensure all demo copy follows `docs/tilda-voice-style.md`.

Acceptance criteria:

- A reviewer can run the fake-provider demo without external credentials.
- A reviewer can see exactly what credentials are needed for the live demo.
- Demo output proves booking, follow-up, owner alert, and metrics.
- The customer-facing language is short, human, and free of AI slop.

### P5 - Compliance pack completion for actual MVP

Goal: make the legal review pack match the real pilot, not a WhatsApp-only prototype.

Tasks:

- Keep telephony, voice AI, WhatsApp, LLM, hosting, database, calendar, logging, and ops tools separated in the vendor register.
- Add Supabase as primary database vendor once selected.
- Add the chosen voice and telephony vendors once selected.
- Add summary-only default for phone calls unless recording or transcript storage is explicitly approved.
- Keep AI disclosure human-sounding and legally reviewable.
- Add retention decisions once Michael and Roxu choose them.

Decisions still needed:

- contracting party
- privacy contact
- retention period
- voice AI provider
- telephony provider
- call recording policy
- transcript policy
- AVV/DPA review path

Acceptance criteria:

- Compliance docs explicitly cover phone answering from day one.
- Vendor register matches the actual demo and pilot stack.
- No doc implies voice is phase 2.
- No doc implies SMS is in scope.

### P6 - Deployment readiness

Goal: prepare for a stable hosted demo and first pilot.

Tasks:

- Pick hosting target.
- Add deployment env checklist.
- Add health and readiness checks to deployment doc.
- Confirm webhook base URL and Twilio signature validation behavior.
- Confirm secrets storage approach.
- Confirm logs avoid unnecessary PII.
- Add basic monitoring plan.

Acceptance criteria:

- A fresh deploy has a clear env checklist.
- Readiness endpoint reports blockers before live traffic.
- Fake providers are disabled for live booking.
- Postgres backend is used for live pilot.
- Webhook signature validation is enabled for live Twilio webhooks.

## Recommended next implementation batch

If no new credentials are available, implement these in order:

1. Add style guard script and package script.
2. Add `docs/tilda-priority-plan.md` to git.
3. Add `docs/dev-google-calendar-setup.md`.
4. Add `docs/demo-script-hair-salon.md`.
5. Add `google-calendar:smoke` script skeleton that fails clearly when credentials are missing.
6. Add deterministic voice HTTP smoke test if not already covered by server battletest.

If Supabase URL is available, run P2 before adding more docs.

If Google Calendar credentials are available, run P1 before adding more docs.

If voice provider access is available, run P3 before adding more docs.

## Critique questions for agentic development workflow

Ask the reviewing agent to critique this plan against these questions:

1. Does this keep phone answering as first-class MVP scope?
2. Does this avoid drifting into CRM, prospecting, or broad GTM work?
3. Are the blockers real infrastructure blockers rather than missing instructions?
4. Are the acceptance criteria testable by commands or artifacts?
5. Are there missing tests around voice tool retries, idempotency, and owner alerts?
6. Does any customer-facing text still sound like AI slop?
7. Does any customer-facing text include em dash or SMS references?
8. Is the Google Calendar test isolated from Michael's personal calendar?
9. Is Supabase treated as primary and Neon as backup?
10. Is the narrow Berlin hair salon wedge preserved?

## Done means

This planning pass is done when:

- this file is committed to git
- style and smoke checks pass
- the next implementation batch is clear without needing Michael to actively steer
