# Production data readiness

This repo still defaults to the credential-free JSON store because it is useful for demos, smoke tests, and local battletests. Before the first paid live pilot, move the same seams to Postgres so retries and concurrent workers are safe.

## What is already in code

- `Lead.idempotencyKey` records stable booking retry keys.
- `book_appointment` treats a same customer/service/start retry as an idempotent replay instead of creating a second lead or owner alert.
- Calendar events store the idempotency key in `extendedProperties.private.idempotencyKey` for Google Calendar and in the fake calendar fixture for tests.
- `withBookingLock()` serializes booking critical sections in the current Node process.
- The fake/Google calendar boundary now exposes provider helpers (`findEventByIdempotencyKey`, `findMatchingEvent`, `getBusy`, `createEvent`) instead of embedding provider details in tools.

## Postgres migration contract

For a multi-worker paid pilot, replace the current JSON persistence internals with a Postgres-backed implementation that preserves the exported store API:

- `addMessage(phone, role, content)` with capped per-phone history.
- `addLead(lead)` with a unique constraint on `idempotency_key` when present.
- `leadByIdempotencyKey(idempotencyKey)` and `bookedLead(phone, service, startISO)` for safe retries.
- `addCallOutcome(outcome)` with a unique `call_id` when provider IDs are available.
- `metricsOn(dateISO, tz)`, `exportSubjectData(phone)`, and `deleteSubjectData(phone)`.
- `withBookingLock(key, fn)` backed by a transaction-level lock, e.g. `pg_advisory_xact_lock(hashtext(key))`, or a `booking_locks` table with `SELECT ... FOR UPDATE`.

Suggested tables:

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
  start_at timestamptz,
  estimated_value_cents integer,
  idempotency_key text unique,
  created_at timestamptz not null default now()
);

create table call_outcomes (
  id bigserial primary key,
  call_id text unique,
  phone text not null,
  status text not null,
  summary text,
  transcript_url text,
  recording_url text,
  created_at timestamptz not null default now()
);
```

## Pilot gate

Do not run multiple bot workers against the JSON store. JSON is acceptable for single-process demos only. For a paid pilot, use Postgres or force one process/one worker and accept the operational risk explicitly.
