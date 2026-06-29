# Production data readiness

This repo still defaults to the credential-free JSON store because it is useful for demos, smoke tests, and local battletests. For paid live pilots or multiple workers, set `STORE_BACKEND=postgres` and provide `DATABASE_URL` or `POSTGRES_URL` so retries and concurrent workers are safe.

## What is already in code

- `Lead.idempotencyKey` records stable booking retry keys.
- `book_appointment` treats a same customer/service/start retry as an idempotent replay instead of creating a second lead or owner alert.
- Calendar events store the idempotency key in `extendedProperties.private.idempotencyKey` for Google Calendar and in the fake calendar fixture for tests.
- `withBookingLock()` serializes booking critical sections. JSON uses an in-process lock; Postgres uses a transaction-level advisory lock shared across bot workers.
- The fake/Google calendar boundary uses a formal `CalendarProvider` seam (`findEventByIdempotencyKey`, `findMatchingEvent`, `getBusy`, `createEvent`) instead of embedding provider details in tools.
- Persistence uses a formal `StoreBackend` seam with JSON and Postgres implementations. `STORE_BACKEND=postgres` fails fast unless `DATABASE_URL` or `POSTGRES_URL` is set, then creates the required tables/indexes at startup.

## Postgres backend contract

The Postgres-backed `StoreBackend` preserves the exported store API:

- `addMessage(phone, role, content)` with capped per-phone history and `created_at` timestamps for retention.
- `addLead(lead)` with a unique partial index on `idempotency_key` when present. Use it for both confirmed bookings and follow-up leads so server-tool/provider retries do not duplicate operator work.
- `leadByIdempotencyKey(idempotencyKey)` and `bookedLead(phone, service, startISO)` for safe retries.
- `addCallOutcome(outcome)` with primary-key `call_id`, returning an idempotent replay on duplicate provider retries.
- `metricsOn(dateISO, tz)`, `exportSubjectData(phone)`, `deleteSubjectData(phone)`, and `purgeOldData(maxAgeDays, dryRun)`.
- `withBookingLock(key, fn)` backed by transaction-level `pg_advisory_xact_lock(hashtext(key))` so multiple bot workers share booking critical-section locks.

Tables/indexes are created on startup by `src/store.ts`:

```sql
create table conversations (
  id bigserial primary key,
  phone text not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create table leads (
  id bigserial primary key,
  phone text not null,
  name text,
  service text,
  status text not null check (status in ('booked', 'needs_followup')),
  channel text not null default 'unknown',
  notes text,
  start_iso text,
  start_utc timestamptz generated always as (
    case when start_iso is null then null else start_iso::timestamptz end
  ) stored,
  estimated_value_cents integer,
  idempotency_key text,
  created_at timestamptz not null default now()
);

create table call_outcomes (
  call_id text primary key,
  phone text not null,
  status text not null,
  summary text,
  transcript_url text,
  recording_url text,
  created_at timestamptz not null default now()
);

create unique index leads_idempotency_key_uidx on leads (idempotency_key) where idempotency_key is not null;
```

## Smoke test

Run against a throwaway database before enabling Postgres for a pilot:

```bash
DATABASE_URL=postgres://user:***@localhost:5432/berlin_frontdesk_test npm run postgres:smoke
```

Expected result: `POSTGRES_STORE_SMOKE_OK`. The smoke covers schema creation, capped conversation history, lead idempotency, booked-lead lookup, call-outcome idempotency, advisory-lock execution, metrics, export/delete, and retention purge.

## Pilot gate

Do not run multiple bot workers against the JSON store. JSON is acceptable for single-process demos only. For a paid pilot, use Postgres or force one process/one worker and accept the operational risk explicitly.

Before live customer traffic, set a retention policy (`DATA_RETENTION_DAYS`, e.g. 90) and run the protected retention endpoint first with `dryRun: true`, then with `dryRun: false` only after the deletion counts are expected. Legacy JSON messages without timestamps are retained until subject delete or migration because the app cannot prove their age.

Use `GET /readiness/live-pilot` as the operator preflight before connecting real customers. It intentionally returns `409` while blocker gates are unresolved and includes a JSON-store warning until `STORE_BACKEND` is moved away from `json` or a one-worker risk exception is explicitly accepted. For stricter environments, set `REQUIRE_LIVE_PILOT_READINESS=true` so the server refuses to start while blockers remain.
