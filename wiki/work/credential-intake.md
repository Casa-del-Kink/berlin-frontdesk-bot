---
id: credential-intake
status: active
supersedes: none
blocked-by: none
scope-boundary: Live tracker of the Phase-2 owner checklist state (presence/absence only); NEVER contains secret values, tokens, keys, or connection strings; secrets live only in provider consoles and the Render env tab
owner: go-live session (2026-07-02)
---

# Credential intake tracker (Phase 2 of the go-live pass)

Each item flips as Michael completes it. Presence confirmations only.

## Stage 2a (accounts)

| Item | State | Notes |
|---|---|---|
| Render account + workspace | DONE 2026-07-02 | Google OAuth signup; workspace "Michael's workspace" |
| Render <-> GitHub connect | DONE 2026-07-02 | Render app installed on Casa-del-Kink org, least-privilege: berlin-frontdesk-bot only |
| Render 2FA | IN PROGRESS 2026-07-02 | Michael setting up authenticator |
| ElevenLabs account (Eleven Agents platform, Creator tier) + API key | PENDING | Key goes into Render env tab at Stage 2b, never chat |
| Cloudflare: calltilda.com registered + zone present | PENDING | Domain name inferred from voice input; confirm spelling |
| Twilio console access confirmed | PENDING | Sandbox sufficient for demo |
| Operator legal name / public contact email / privacy email | PENDING | Non-secret; arrives via chat |

## Stage 2b (env paste, after Render service exists)

| Item | State |
|---|---|
| DATABASE_URL (Supabase pooler) in Render env | PENDING |
| GOOGLE_SA_JSON in Render env | PENDING |
| TWILIO_ACCOUNT_SID / AUTH_TOKEN / WHATSAPP_FROM in Render env | PENDING |
| OPENROUTER_API_KEY in Render env | PENDING |
| ELEVENLABS_API_KEY in Render env | PENDING |
| OPERATOR_TOKEN set (recommended distinct from SERVER_TOOL_TOKEN) | PENDING |
| DATA_RETENTION_DAYS decided + set (compliance decision) | PENDING |
| OWNER_ALERT_LOG_ONLY_ACCEPTED consciously set for internal demo phase | PENDING |
| TWILIO_WEBHOOK_BASE_URL after DNS | PENDING |
| Cloudflare CNAME records (DNS-only/grey-cloud) | PENDING |
| SERVER_TOOL_TOKEN read from Render env into ElevenLabs agent tool config | PENDING |

## Slow lane (blocks final go only)

| Item | State |
|---|---|
| Recording/transcript/retention policy sign-offs | PENDING |
| Guardrail residual-risk sign-off (prompt-only price/hours enforcement for pilot) | PENDING |
| AVV/DPA vendor register completion | PENDING (human-only, legal) |
| WhatsApp sender sandbox -> production decision | PENDING (sandbox blocks real un-joined customers) |

## Cal.com activation checklist (only if/when Michael activates the dormant seam)

| Item | State |
|---|---|
| Account ownership decision (Michael / Roxu / shared) | PENDING (Michael-only) |
| CALCOM_API_KEY + complete event-type selector in Render env | PENDING |
| CALCOM_FALLBACK_ATTENDEE_EMAIL_DOMAIN set to a real owned domain (defaults to non-routable example.test; verify flagged MEDIUM: attendee-confirmation emails dead until set; consider WARNING-severity preflight gate) | PENDING |
| One approved live smoke (CALCOM_SMOKE_APPROVED=true npm run calcom:smoke) + CALCOM_SMOKE_TESTED_AT recorded | PENDING |
