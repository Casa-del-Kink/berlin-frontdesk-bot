# Tilda host secret and deployment command matrix

Status: host-neutral deployment prep for Michael/Roxu. No deployment was performed. No secrets are included. No provider submission, push, CI, or outreach was performed.

Scope remains narrow: independent Berlin hair salons and barbers only.

## Decision this unblocks

Once `meettilda.com` or the fallback domain is registered, the remaining deploy work should be mechanical:

1. choose a host
2. paste secrets into that host
3. deploy the repo
4. point DNS
5. run the smoke commands
6. use the hosted URL in Twilio registration

This matrix assumes the app is deployed as a Node service using:

```bash
npm ci
npm run typecheck
npm start
```

## Recommended host order

| Rank | Host | Why | Use if |
|---:|---|---|---|
| 1 | Render Web Service | simplest long-running Node web service, straightforward env UI | fastest reliable demo host is desired |
| 2 | Railway Service | fast setup, good env handling, Postgres options | Michael/Roxu already prefer Railway |
| 3 | Fly.io App | strong production path, more CLI friction | we need more control later |
| 4 | Vercel | good for static/frontends, less ideal for this Express webhook server | only if we split landing page from API |

Recommendation: use **Render** unless Michael already has a preferred company host.

## Required production environment variables

Values must be entered in the hosting provider UI or CLI. Do not commit them.

| Variable | Required for | Owner | Notes |
|---|---|---|---|
| `NODE_ENV=production` | safe runtime posture | engineering | required before live pilot |
| `PORT` | host runtime | host | usually injected automatically |
| `CLIENT_FILE=clients/salon-demo.yaml` | first hosted demo | engineering | replace with real pilot config later |
| `SERVER_TOOL_TOKEN` | protected tool/readiness endpoints | engineering | long random value, at least 24 chars |
| `DATA_RETENTION_DAYS=30` | compliance posture | Michael/Roxu | adjust only after approval |
| `STORE_BACKEND=postgres` | live lead/session store | engineering | required for live pilot |
| `DATABASE_URL` or `POSTGRES_URL` | Postgres store | Michael/Hermes | Supabase primary, Neon fallback |
| `PGSSL=true` | hosted Postgres | engineering | usually required for Supabase/Neon |
| `USE_FAKE_CALENDAR=false` | real availability | engineering | fake calendar is CI/local only |
| `GOOGLE_SA_JSON` | Google Calendar provider | Michael/Hermes | service-account JSON string |
| `OPENROUTER_API_KEY` | LLM loop | Michael/Hermes | provider key, never in docs |
| `TWILIO_ACCOUNT_SID` | WhatsApp/phone provider | Roxu/Michael | from Twilio console |
| `TWILIO_AUTH_TOKEN` | WhatsApp/phone provider | Roxu/Michael | from Twilio console |
| `TWILIO_WHATSAPP_FROM` | WhatsApp sender | Roxu/Michael | sandbox first if not approved |
| `TWILIO_WEBHOOK_BASE_URL=https://<host>` | webhook/public URL | engineering | must match hosted URL/domain |
| `OWNER_ALERT_MODE` | owner summaries | Michael/Roxu | choose Telegram/email/log route |
| `OWNER_ALERT_DESTINATION` | owner summaries | Michael/Roxu | exact destination, not public |
| `OWNER_ALERT_TESTED_AT` | readiness proof | engineering | set only after real alert smoke passes |

## Values still needed from Roxu

These are not technical secrets but are required before public provider review:

```text
Operator/legal name:
Public contact email:
Privacy/admin email:
Business address or acceptable footer wording:
Chosen domain:
Twilio account country/legal identity used:
```

## Host-neutral `.env.production.template`

Copy this into the host secret manager. Replace placeholders there, not in git.

```bash
NODE_ENV=production
CLIENT_FILE=clients/salon-demo.yaml
SERVER_TOOL_TOKEN=<generate-long-random-token>
DATA_RETENTION_DAYS=30

STORE_BACKEND=postgres
DATABASE_URL=<postgres-url>
PGSSL=true

USE_FAKE_CALENDAR=false
GOOGLE_SA_JSON=<service-account-json-string>

OPENROUTER_API_KEY=<openrouter-key>

TWILIO_ACCOUNT_SID=<twilio-account-sid>
TWILIO_AUTH_TOKEN=<twilio-auth-token>
TWILIO_WHATSAPP_FROM=<twilio-whatsapp-from>
TWILIO_WEBHOOK_BASE_URL=https://<public-host-or-domain>

OWNER_ALERT_MODE=<telegram-or-email-or-log>
OWNER_ALERT_DESTINATION=<owner-alert-destination>
OWNER_ALERT_TESTED_AT=<set-after-successful-alert-test>
```

## Render command matrix

Create a Web Service from the GitHub repo.

| Setting | Value |
|---|---|
| Runtime | Node |
| Build command | `npm ci && npm run typecheck` |
| Start command | `npm start` |
| Health check path | `/health` |
| Environment | paste variables from template |

After deploy:

```bash
HOSTED_LANDING_BASE_URL=https://<render-service>.onrender.com npm run landing:contract:smoke
HOSTED_SMOKE_BASE_URL=https://<render-service>.onrender.com npm run hosted:smoke:contract
```

If the app exposes readiness with auth, check readiness manually with the bearer token:

```bash
curl -sS -H "Authorization: Bearer $SERVER_TOOL_TOKEN" \
  https://<render-service>.onrender.com/readiness/live-pilot
```

Expected before final provider credentials:

```text
HTTP 409 with explicit blockers
```

Expected after all live secrets and owner alert test:

```text
HTTP 200 and ok=true
```

## Railway command matrix

Create a Railway service from the GitHub repo.

| Setting | Value |
|---|---|
| Build command | `npm ci && npm run typecheck` |
| Start command | `npm start` |
| Public networking | enabled |
| Environment | paste variables from template |

After deploy:

```bash
HOSTED_LANDING_BASE_URL=https://<railway-host> npm run landing:contract:smoke
HOSTED_SMOKE_BASE_URL=https://<railway-host> npm run hosted:smoke:contract
```

Readiness check:

```bash
curl -sS -H "Authorization: Bearer $SERVER_TOOL_TOKEN" \
  https://<railway-host>/readiness/live-pilot
```

## Fly.io command matrix

Use only if we choose Fly deliberately.

```bash
fly launch --name tilda-frontdesk --no-deploy
fly secrets set NODE_ENV=production CLIENT_FILE=clients/salon-demo.yaml DATA_RETENTION_DAYS=30
fly secrets set SERVER_TOOL_TOKEN=<generate-long-random-token>
fly secrets set STORE_BACKEND=postgres DATABASE_URL=<postgres-url> PGSSL=true
fly secrets set USE_FAKE_CALENDAR=false GOOGLE_SA_JSON=<service-account-json-string>
fly secrets set OPENROUTER_API_KEY=<openrouter-key>
fly secrets set TWILIO_ACCOUNT_SID=<twilio-account-sid> TWILIO_AUTH_TOKEN=<twilio-auth-token>
fly secrets set TWILIO_WHATSAPP_FROM=<twilio-whatsapp-from> TWILIO_WEBHOOK_BASE_URL=https://<fly-host>
fly deploy
```

Then:

```bash
HOSTED_LANDING_BASE_URL=https://<fly-host> npm run landing:contract:smoke
HOSTED_SMOKE_BASE_URL=https://<fly-host> npm run hosted:smoke:contract
```

## DNS checklist after domain purchase

For `meettilda.com` or fallback domain:

- [ ] set root/apex domain to host target using provider instructions
- [ ] set `www` CNAME to host target
- [ ] confirm HTTPS certificate is active
- [ ] open `https://meettilda.com`
- [ ] run landing contract smoke against final URL
- [ ] set `TWILIO_WEBHOOK_BASE_URL=https://meettilda.com` only if API and landing share the domain
- [ ] otherwise use the API host URL for Twilio webhooks and `https://meettilda.com` as the business website URL

## Twilio webhook paths

Use these only after Twilio account and hosted app exist.

| Twilio purpose | URL pattern |
|---|---|
| WhatsApp inbound webhook | `https://<api-host>/webhook/whatsapp` |
| voice post-call callback | `https://<api-host>/webhook/voice/post-call` |
| public business website | `https://meettilda.com` or chosen final domain |

## Verification commands before Twilio registration

Run locally after deploy values are known:

```bash
npm run typecheck
npm run style:guard
npm run secrets:scan
HOSTED_LANDING_BASE_URL=https://<public-host-or-domain> npm run landing:contract:smoke
HOSTED_SMOKE_BASE_URL=https://<api-host> npm run hosted:smoke:contract
```

Run live readiness with auth:

```bash
curl -sS -H "Authorization: Bearer $SERVER_TOOL_TOKEN" \
  https://<api-host>/readiness/live-pilot
```

## Go/no-go for using the website in Twilio

Go when:

- [ ] domain loads over HTTPS
- [ ] landing page says what Tilda does
- [ ] page remains Berlin salon/barber scoped
- [ ] AI/KI reception disclosure is present
- [ ] footer has real operator/contact/privacy values
- [ ] no secret values are visible
- [ ] hosted landing contract passes

No-go when:

- [ ] operator placeholders are still public
- [ ] HTTPS is broken
- [ ] page broadens beyond the narrow wedge
- [ ] website and Twilio legal identity conflict
- [ ] readiness returns `ok=true` without real provider credentials and alert test, which would indicate a broken readiness gate

## Immediate next action

If no host is chosen, choose Render for the first public demo. If the domain is bought first, point it to the Render service once available. If Roxu provides operator details first, update the landing footer before connecting the domain publicly.
