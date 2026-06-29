# Supabase Postgres setup

Purpose: make Supabase the primary hosted database for Tilda dev and pilot environments. Neon remains the second option.

## Decision

Use Supabase Postgres first.

Use Neon only if Supabase setup blocks the pilot or a later deployment need makes Neon a better fit.

## What the app needs

Runtime env:

```bash
STORE_BACKEND=postgres
DATABASE_URL='postgresql://...'
PGSSL=true
```

`DATABASE_URL` can be either the direct Supabase Postgres connection string or the Supabase pooler connection string. For this app, the direct connection string is simplest for smoke testing. The pooler is also acceptable if connection limits become relevant.

## Supabase setup steps

1. Create a Supabase project for Tilda dev.
2. Open project settings.
3. Find database connection string.
4. Prefer a throwaway dev database/project for smoke testing.
5. Copy the URI connection string.
6. Keep the password secret.
7. Run the smoke test from the repo.

Command:

```bash
PGSSL=true DATABASE_URL='postgresql://postgres:[password]@[host]:5432/postgres' npm run postgres:smoke
```

Pooler style, if used:

```bash
PGSSL=true DATABASE_URL='postgresql://postgres.[project-ref]:[password]@[region].pooler.supabase.com:6543/postgres' npm run postgres:smoke
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

## Supabase notes

- Set `PGSSL=true` for hosted Supabase.
- Do not commit `DATABASE_URL`.
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

Supabase is selected as primary, but no Supabase database URL is configured in this runtime yet.

Blocked on:

- Tilda dev Supabase project or database URL

Not blocked:

- app code
- Postgres backend implementation
- smoke test command
- schema creation

## Pilot rule

Before live customer traffic, run:

```bash
PGSSL=true DATABASE_URL='...' npm run postgres:smoke
```

Then deploy with:

```bash
STORE_BACKEND=postgres
PGSSL=true
DATABASE_URL='...'
DATA_RETENTION_DAYS=90
```
