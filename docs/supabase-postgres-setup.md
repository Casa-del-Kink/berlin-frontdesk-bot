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

`DATABASE_URL` can be either the direct Supabase Postgres connection string or the Supabase pooler connection string.

For the Hermes/VPS runtime, use the Supabase transaction pooler:

```text
host: aws-1-eu-central-1.pooler.supabase.com
port: 6543
database: postgres
user: postgres.dicxsxmdyjleigelwaya
```

The pooler is the preferred verified path for Hermes because direct DB reachability can fail from the VPS runtime.

## Smoke command

Preferred helper:

```bash
SUPABASE_DB_PASSWORD='***' npm run supabase:postgres:smoke
```

Equivalent direct command:

```bash
PGSSL=true DATABASE_URL='postgresql://postgres:***@db.dicxsxmdyjleigelwaya.supabase.co:5432/postgres' npm run postgres:smoke
```

Pooler style:

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

## Network status

The direct database host is:

```text
db.dicxsxmdyjleigelwaya.supabase.co
```

Direct DB connectivity can fail from some runtimes because of host/network reachability. For Hermes/VPS, use the transaction pooler instead:

```text
aws-1-eu-central-1.pooler.supabase.com:6543
```

The hosted app smoke has passed through the pooler with `PGSSL=true`.

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

## Current status

- Supabase REST admin smoke passed through the gateway with `SUPABASE_ADMIN_SMOKE_OK`.
- Hosted Postgres app smoke passed with `POSTGRES_STORE_SMOKE_OK`.
- Supabase CLI linking remains optional and separate from app readiness. It still requires CLI auth if needed later.
- Keep all database URLs, passwords, secret keys, and access tokens out of git and chat logs.

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
