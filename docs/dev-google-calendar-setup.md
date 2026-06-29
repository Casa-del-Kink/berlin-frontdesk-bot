# Dev Google Calendar setup

Purpose: run Tilda booking tests without touching Michael's personal calendar.

## Environment split

Dev and pre-launch:

- separate Gmail account
- separate calendar named `Tilda`
- service account shared into that calendar

Production and launch:

- Google Workspace under the future brand/domain
- brand-owned calendars and admin ownership
- no dependency on a personal Gmail account

## Current dev calendar

Use this calendar for the salon demo config:

```text
ec639255e6fd2473e4ea2e1af60b996dab2f5df5fa5422047fff337ccc523938@group.calendar.google.com
```

It is configured in:

```text
clients/salon-demo.yaml
```

## Required Google setup

1. Enable Google Calendar API in the Google Cloud project.
2. Create a service account for the bot.
3. Create a service account JSON key.
4. Share the `Tilda` calendar with the service account email.
5. Grant permission: make changes to events.
6. Put the JSON in the runtime environment as one line:

```bash
GOOGLE_SA_JSON='{"type":"service_account",...}'
```

Do not commit the JSON key.

## Runtime config

Use:

```bash
CLIENT_CONFIG_PATH=clients/salon-demo.yaml
USE_FAKE_CALENDAR=false
GOOGLE_SA_JSON='...'
```

The client config must point at the Tilda calendar ID:

```yaml
calendarId: "ec639255e6fd2473e4ea2e1af60b996dab2f5df5fa5422047fff337ccc523938@group.calendar.google.com"
```

## Safety rules

- Do not use Michael's main calendar for dev booking tests.
- Do not commit credentials.
- Keep fake calendar tests as default for CI and no-credential local checks.
- Real Google tests should use clearly named test events and clean up after themselves.

## Current blocker

The calendar ID is known and configured.

Still needed before a live Google smoke test:

- service account email
- `GOOGLE_SA_JSON` in the runtime environment
- confirmation that the Tilda calendar is shared with that service account

## Target smoke command

Once credentials are available:

```bash
USE_FAKE_CALENDAR=false CLIENT_CONFIG_PATH=clients/salon-demo.yaml GOOGLE_SA_JSON='...' npm run google-calendar:smoke
```

If the smoke script does not exist yet, implement it before running the live calendar test.
