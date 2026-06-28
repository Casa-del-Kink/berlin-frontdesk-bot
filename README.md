# Berlin Front-Desk Bot (demo)

AI front-desk over WhatsApp for appointment-heavy Berlin businesses (salons, beauty, etc.).
Customer writes → the bot replies (German/English, auto-detected), qualifies, reads real free
slots from Google Calendar, books the appointment, and alerts the owner. Daily summary at 20:00.

**Stack:** Node + TypeScript · WhatsApp via Twilio (sandbox) · Claude via OpenRouter · Google Calendar.

## Architecture (one file per piece, swappable)

```
WhatsApp (Twilio)  ──>  src/server.ts  (webhook)
                          │
                          ├─ src/llm.ts      AI loop (OpenRouter) + tool use
                          ├─ src/tools.ts    check_availability / book_appointment / register_lead
                          ├─ src/calendar.ts Google Calendar (freebusy + create event)
                          ├─ src/slots.ts    free-slot computation (pure, tested)
                          ├─ src/store.ts    leads + conversations (JSON)
                          ├─ src/prompt.ts   system prompt built from the YAML
                          └─ src/whatsapp.ts sending (Twilio; swap to 360dialog/Meta here)

clients/salon-demo.yaml  ← one business = one file. Adapt = copy and edit.
```

## Getting started

1. **Dependencies**
   ```
   npm install
   npm run check      # tests the free-slot computation (no credentials needed)
   ```

2. **Environment** — copy `.env.example` to `.env` and fill in:
   - **OpenRouter:** create a key at https://openrouter.ai/keys → `OPENROUTER_API_KEY`.
     If the default model fails, set another one from https://openrouter.ai/models.
   - **Twilio sandbox:** Console → Messaging → Try it out → WhatsApp sandbox.
     Copy SID and Auth Token. From your phone, join the sandbox by sending the
     "join …" code to the number Twilio shows you.
   - **Google Calendar:**
     1. Google Cloud Console → create a project → enable "Google Calendar API".
     2. Create a **Service Account** and a **JSON key**.
     3. Paste the JSON (single line) into `GOOGLE_SA_JSON`.
     4. In Google Calendar create a test calendar, and under "Share with specific
        people" add the **service account email** with "Make changes to events".
     5. Copy the **calendar ID** (calendar settings) into `clients/salon-demo.yaml`
        (`calendarId`).

3. **Run**
   ```
   npm run dev
   ```
   Expose the port to the internet for the Twilio webhook (e.g. `npx localtunnel --port 3000`
   or ngrok), and in the Twilio sandbox set that public URL + `/webhook/whatsapp`
   under "When a message comes in".

4. **Try the demo:** message the Twilio sandbox number over WhatsApp as if you were a
   salon customer. The bot will take you all the way to a booked appointment in the calendar.

## Notes
- `ownerWhatsapp` empty → owner alerts print to the console (DRYRUN).
- Data in `data/state.json`. For production with clinics (health data) → swap Twilio for
  **360dialog** (German BSP, DPA/GDPR) by touching only `whatsapp.ts`.
- Strategy, scoping and all product decisions live in `PROJECT.md`.
