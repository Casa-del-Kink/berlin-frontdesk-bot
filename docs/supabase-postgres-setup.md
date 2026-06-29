# Supabase Postgres setup

Purpose: make Supabase the primary hosted database for Tilda dev and pilot environments. Neon remains the second option.

## Decision

Use Supabase Postgres first.

Use Neon only if Supabase setup blocks the pilot or a later deployment need makes Neon a better fit.

## Project

Supabase project ref:

```text
dicxsxmdyjleigelwaya
```

Direct database host:

```text
db.dicxsxmdyjleigelwaya.supabase.co
```

Direct connection template:

```text
postgresql://postgres:[YOUR-PASSWORD]@db.dicxsxmdyjleigelwaya.supabase.co:5432/postgres
```

Keep the actual password out of git and chat logs when possible.

## What the app needs

Runtime env:

```bash
STORE_BACKEND=postgres
DATABASE_URL='postgresql://postgres:***@db.dicxsxmdyjleigelwaya.supabase.co:5432/postgres'
PGSSL=true
```

`DATABASE_URL` can be either the direct Supabase Postgres connection string or the Supabase pooler connection string. For this app, the direct connection string is simplest for smoke testing. The pooler is also acceptable if connection limits become relevant.

## Smoke command

Preferred helper:

```bash
SUPABASE_DB_PASSWORD='***' npm run supabase:postgres:smoke
```

Equivalent direct command:

```bash
PGSSL=true DATABASE_URL='postgresql://postgres:***@db.dicxsxmdyjleigelwaya.supabase.co:5432/postgres' npm run postgres:smoke
```

Pooler style, if used later:

```bash
PGSSL=true DATABASE_URL='postgresql://postgres.[project-ref]:***@[region].pooler.supabase.com:6543/postgres' npm run postgres:smoke
```

## What the smoke test verifies

`npm run postgres:smoke` verifies:

- schema creation
- capped conversation history
- lead idempotency
- booked-lead lookup
- call-outcome idempotency
- advisory booking lock
- metrics
- privacy export
- privacy delete
- retention dry run
- retention purge

Expected result:

```text
POSTGRES_STORE_SMOKE_OK
```

## Tables created by the app

The app creates these tables if missing:

```text
conversations
leads
call_outcomes
```

Do not manually create tables unless debugging. The app owns its minimal schema for this pilot.

## Supabase admin REST API client

For server-only Supabase API access, use the admin REST helper:

```ts
import { supabaseAdminFetch } from "./supabase-admin.js";
```

It uses Supabase's current secret-key model for backend/admin tasks:

- env: `SUPABASE_SECRET_KEY=***`
- request header: `apikey: <SUPABASE_SECRET_KEY>`
- no `Authorization: Bearer ***` header for the secret key

Runtime env:

```bash
SUPABASE_URL=https://dicxsxmdyjleigelwaya.supabase.co
SUPABASE_SECRET_KEY='***'
```

Smoke command:

```bash
SUPABASE_URL='https://dicxsxmdyjleigelwaya.supabase.co' SUPABASE_SECRET_KEY='***' npm run supabase:admin:smoke
```

The smoke calls:

```text
GET /rest/v1/leads?select=id&limit=0
apikey: <SUPABASE_SECRET_KEY>
Prefer: count=exact
```

This checks that the secret key can query Supabase through the REST API. If the `leads` table does not exist yet, it reports `SUPABASE_ADMIN_SMOKE_OK_SCHEMA_PENDING`, because API auth worked but the direct Postgres migration smoke has not created the app schema yet.

It does not replace the direct Postgres smoke below, which still verifies the app's Postgres backend, migrations, advisory locks, retention, and idempotency.

## Supabase CLI status

`supabase init` has been run in the repo and created:

```text
supabase/config.toml
supabase/.gitignore
```

`supabase link --project-ref dicxsxmdyjleigelwaya` is still blocked in this non-TTY runtime until Supabase CLI auth exists. Use either:

```bash
SUPABASE_ACCESS_TOKEN='***'
```

or:

```bash
npx supabase@latest login --token '***'
```

Then run:

```bash
npx supabase@latest link --project-ref dicxsxmdyjleigelwaya
```

GitHub may already be linked in the Supabase dashboard, but that does not authenticate this local CLI runtime.

## Network status from this runtime

DNS resolves for:

```text
db.dicxsxmdyjleigelwaya.supabase.co
```

A TCP connection attempt to port `5432` failed from this runtime with:

```text
OSError=[Errno 101] Network is unreachable
```

That means the hosted smoke may also require this runtime to have outbound IPv6/DB network access or use a Supabase pooler/connection option reachable from here.

## Supabase notes

- Set `PGSSL=true` for hosted Supabase.
- Do not commit `DATABASE_URL`, database passwords, or Supabase access tokens.
- Use a dev project before live pilot data.
- Use Supabase dashboard only for inspection, not manual production edits.
- Rotate the database password if it is ever pasted into a public channel.
- For pilot launch, store `DATABASE_URL` in the deployment secret store.

## Neon fallback

Use the same app configuration with Neon:

```bash
STORE_BACKEND=postgres
PGSSL=true
DATABASE_URL='postgresql://...neon...'
```

Run the same smoke test and expect the same result.

## Current blockers

- Supabase access token for CLI linking in this runtime.
- Actual Supabase database password or `DATABASE_URL` for hosted Postgres smoke.
- Possible outbound DB network reachability from this runtime to `db.dicxsxmdyjleigelwaya.supabase.co:5432`.

## Pilot rule

Before live customer traffic, run:

```bash
SUPABASE_DB_PASSWORD='***' npm run supabase:postgres:smoke
```

Then deploy with:

```bash
STORE_BACKEND=postgres
PGSSL=true
DATABASE_URL='...'
DATA_RETENTION_DAYS=90
```
