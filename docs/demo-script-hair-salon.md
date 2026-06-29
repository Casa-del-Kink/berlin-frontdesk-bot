# Hair salon demo script

Purpose: prove the narrow wedge end to end before widening.

Demo business: Glanz & Schnitt Berlin.

Demo calendar: Tilda dev calendar.

## What the demo must prove

1. A customer calls.
2. Tilda answers naturally.
3. Tilda understands the requested service.
4. Tilda checks real or fake availability.
5. Tilda offers concrete appointment times.
6. Tilda gets the customer name.
7. Tilda books the appointment or captures a follow-up.
8. The owner gets an alert.
9. Metrics show booking or pipeline value.
10. WhatsApp can start or continue the same process.

## Phone demo path

### Opening

Tilda:

> Hallo, hier ist Tilda von Glanz & Schnitt Berlin. Ich helfe dir gern mit Terminen und Fragen.

Customer:

> Hi, ich brauche einen Termin für einen Damenhaarschnitt.

Tilda:

> Gern. Soll ich nach dem nächsten freien Termin schauen?

Customer:

> Ja, am liebsten morgen Vormittag.

Tilda action:

```text
check_availability(service="Damenhaarschnitt", from="YYYY-MM-DD", days=3)
```

Tilda:

> Morgen hätte ich 10:00 oder 11:00 frei. Passt einer davon?

Customer:

> 10 Uhr passt.

Tilda:

> Super. Auf welchen Namen darf ich den Termin eintragen?

Customer:

> Laura Schneider.

Tilda action:

```text
book_appointment(name="Laura Schneider", service="Damenhaarschnitt", start="YYYY-MM-DDT10:00:00+02:00", channel="phone")
```

Tilda:

> Perfekt, Laura. Ich habe dich morgen um 10:00 für den Damenhaarschnitt eingetragen.

Owner alert expected:

```text
New booking: Laura Schneider - Damenhaarschnitt on ... Customer: ...
```

## Follow-up path

Customer:

> Ich bin nicht sicher, ob ich färben oder Strähnen brauche.

Tilda:

> Kein Problem. Ich gebe das ans Team weiter. Wie heißt du und unter welcher Nummer erreicht man dich am besten?

Tilda action:

```text
register_lead(name="...", service="Färben & Strähnen", notes="Kundin ist unsicher zwischen Färben und Strähnen und möchte Rückruf.", channel="phone")
```

Tilda:

> Danke, ich gebe es direkt weiter. Das Team meldet sich zur Abstimmung bei dir.

## WhatsApp initiation path

Customer WhatsApp:

> Hi, habt ihr morgen was für Herrenhaarschnitt frei?

Tilda:

> Hallo, hier ist Tilda von Glanz & Schnitt Berlin. Ich schaue gern. Geht es um einen Herrenhaarschnitt?

Tilda action:

```text
check_availability(service="Herrenhaarschnitt", from="YYYY-MM-DD", days=3)
```

Tilda:

> Morgen wäre 10:00 oder 10:30 frei. Was passt dir besser?

## Human handoff path

Customer:

> Ich will mit einem Menschen sprechen.

Tilda:

> Klar. Ich gebe das direkt ans Team weiter. Worum geht es kurz, damit sie sich richtig melden können?

Expected behavior:

- register follow-up lead
- owner alert includes reason
- Tilda does not argue or over-explain

## Style checks

Every spoken or written Tilda line must pass:

- sounds like a human front desk person
- one clear question at a time
- short and practical
- no AI disclaimer tone
- no chatbot wording
- no SMS offer
- no em dash character

## Fake-provider command

Use this when external credentials are missing:

```bash
npm run first-test:smoke
npm run server:battletest
```

## Live-provider command targets

Google Calendar once credentials exist:

```bash
USE_FAKE_CALENDAR=false CLIENT_CONFIG_PATH=clients/salon-demo.yaml GOOGLE_SA_JSON='...' npm run google-calendar:smoke
```

Supabase Postgres once database URL exists:

```bash
PGSSL=true DATABASE_URL='postgresql://...' npm run postgres:smoke
```
