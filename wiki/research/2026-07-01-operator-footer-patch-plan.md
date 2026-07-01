# Tilda landing operator footer patch plan

Status: patch-ready operator/footer plan. No real operator values were inserted. No public deployment, provider submission, push, CI, or outreach was performed.

Scope remains narrow: independent Berlin hair salons and barbers.

## What changed in code

The landing page no longer hardcodes operator placeholders directly in the HTML. It now renders the footer from environment-driven values with safe defaults:

```text
TILDA_OPERATOR_LEGAL_NAME
TILDA_PUBLIC_CONTACT_EMAIL
TILDA_PRIVACY_EMAIL
TILDA_FOOTER_NOTE
```

If those env vars are missing, the page still shows explicit placeholders so it cannot silently look final.

## Why this matters

Before this change, Roxu's legal/contact values would require a code patch. Now the host can receive the real values as runtime configuration. That makes the public Twilio website update mechanical once Roxu provides the values.

## Values Roxu still needs to provide

```text
TILDA_OPERATOR_LEGAL_NAME=<Roxu real legal/freelancer business name>
TILDA_PUBLIC_CONTACT_EMAIL=<public website contact email>
TILDA_PRIVACY_EMAIL=<privacy/admin email>
TILDA_FOOTER_NOTE=<short public footer note, optional>
```

Recommended footer note:

```text
Tilda is a pilot AI reception service for Berlin salons. Calls are handled with clear AI disclosure and summary-only data handling by default.
```

## Host secret/UI entries

Add these to Render/Railway/Fly env vars before making the domain public:

| Env var | Example placeholder | Required before Twilio website use |
|---|---|---|
| `TILDA_OPERATOR_LEGAL_NAME` | Roxu legal/freelancer business name | yes |
| `TILDA_PUBLIC_CONTACT_EMAIL` | hello@meettilda.com or business email | yes |
| `TILDA_PRIVACY_EMAIL` | privacy@meettilda.com or business email | yes |
| `TILDA_FOOTER_NOTE` | pilot AI reception footer note | recommended |

## Validation commands

Local config validation:

```bash
npm run landing:operator:smoke
```

Local full landing contract:

```bash
npm run landing:contract:smoke
npm run landing:smoke
```

Hosted checks after deployment:

```bash
HOSTED_LANDING_BASE_URL=https://meettilda.com npm run landing:contract:smoke
HOSTED_SMOKE_BASE_URL=https://meettilda.com npm run hosted:smoke:contract
```

## Manual public go/no-go

Go when the rendered footer contains real values:

```text
Operator: <real operator/legal name>
Contact: <real public contact email>
Privacy: <real privacy/admin email>
```

No-go if the live page still contains:

```text
OPERATOR_LEGAL_NAME_PLACEHOLDER
OPERATOR_EMAIL_PLACEHOLDER
PRIVACY_EMAIL_PLACEHOLDER
```

## Twilio form alignment

The legal business name in Twilio should match the public operator/legal name unless Twilio has a separate brand/trading-name field.

Use:

```text
Brand/trading name: Tilda or Meet Tilda
Legal business name: Roxu's real legal/freelancer business identity
Website URL: https://meettilda.com
```

## Implementation notes

- HTML escaping is covered by `npm run landing:operator:smoke`.
- Placeholder defaults remain intentional for local/dev safety.
- The contact button uses the configured public contact email when it contains `@`.
- No secrets or private addresses are committed.
- The landing contract still enforces Berlin salon/barber scope and blocks dog grooming, massage, and beauty/nails broadening.

## Patch application after Roxu provides values

No code patch should be necessary. Add the real values to the chosen host environment and redeploy/restart.

If static export is ever needed later, use the same values to generate static HTML and rerun:

```bash
npm run landing:operator:smoke
npm run landing:contract:smoke
```
