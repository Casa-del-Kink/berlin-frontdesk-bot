# Tilda public-website readiness gate

Status: implementation note for the new readiness blocker. No real operator values were inserted. No deployment, provider submission, push, CI, or outreach was performed.

## Change

Live readiness now blocks if the public landing page still has operator/contact placeholders.

New blocker checks:

| Check | Fails when | Required fix |
|---|---|---|
| public website operator footer | any operator footer value still contains `PLACEHOLDER` | set `TILDA_OPERATOR_LEGAL_NAME`, `TILDA_PUBLIC_CONTACT_EMAIL`, `TILDA_PRIVACY_EMAIL` |
| public contact email | contact email has no `@` | set a valid public contact email |
| privacy contact email | privacy email has no `@` | set a valid privacy/admin email |

## Why this matters

The Twilio website requirement is not only a domain. The public page must not look like a placeholder. This gate prevents `/readiness/live-pilot` from returning ready while the website footer is still fake.

## Required env values

```bash
TILDA_OPERATOR_LEGAL_NAME=<Roxu real legal/freelancer business name>
TILDA_PUBLIC_CONTACT_EMAIL=<public website contact email>
TILDA_PRIVACY_EMAIL=<privacy/admin email>
TILDA_FOOTER_NOTE=<optional public footer note>
```

## Verification command

```bash
npm run deployment:smoke
```

The smoke now confirms that unsafe/local readiness includes all three website footer blockers.

## Hosted go/no-go

Before submitting the website in Twilio:

```bash
HOSTED_LANDING_BASE_URL=https://meettilda.com npm run landing:contract:smoke
HOSTED_SMOKE_BASE_URL=https://meettilda.com SERVER_TOOL_TOKEN=<token> npm run hosted:smoke:contract
```

Expected before all live env is complete:

```text
/readiness/live-pilot returns HTTP 409 with explicit blockers
```

Expected only after all required live values are set:

```text
/readiness/live-pilot returns HTTP 200 and ok=true
```

## Human note

Do not put a fake company name in these fields. The operator/legal footer should match Roxu's real legal/freelancer business identity unless a separate entity is created later.
