# Berlin Front-Desk Bot — Scoping & Strategy

> Decision base document. Origin: r/AiAutomations post (~€4K/month with an AI receptionist
> for local businesses) + market research (Jun 2026). Read before touching architecture.

## 1. What it is (and what it is NOT)

**It is:** an AI front-desk over **WhatsApp** (German/English) for Berlin businesses whose
flow runs on appointments (beauty/aesthetics, later dental and others). The customer writes →
the bot replies in <1 min, qualifies, **reads free slots and books in the calendar** (or sends
the business's existing booking link for closed systems), captures the lead, alerts the owner,
and at end of day sends **one** summary.

**It is NOT:**
- ❌ a "chatbot" (don't use that word when selling — the owner pictures the annoying popup).
- ❌ a new booking system (businesses already have one; see §3).
- ❌ a multi-tenant SaaS platform from day 1 (one business = one config file).
- ❌ a dashboard (nobody opens it; the owner wants one message a day).

## 2. Positioning (how it's sold)

Lessons from the thread, confirmed by research:
- Sell **one concrete, measurable leak**, not "AI customer service". E.g. *"missed
  message/call recovery for aesthetics studios"*.
- **Live demo > slides.** Have the owner text the number in front of you and see the reply.
- Start with the obvious (missed messages, no-shows). The big vision (tracking, business
  memory) comes *after* a month of it working.
- Market-validated pricing: **€500–1500 setup + €250–600/month**.

## 3. Key decision: integrate, don't replace

Target businesses **already have a booking system**:
- Beauty/hair (Berlin): **Fresha, Treatwell, Shore, Salonized, Salon.life**.
- Dental/medical: **Doctolib** (dominant; dentists are its heaviest users), Jameda, Doctena.

Competing with them on *booking* is a losing battle. The bot is the **conversational layer on
top** of what they already use.

**Chosen booking strategy (revised): GOOGLE CALENDAR as the primary engine.**
- The bot **reads free slots** (freebusy) **and creates the event** directly in Google
  Calendar. Better experience: the bot actually knows what's free and confirms the appointment
  ("I have Tuesday at 2pm"). The current scaffold already does this.
- **Booking link = fallback** for clients on closed systems (Fresha/Doctolib/Treatwell): there
  the bot sends the existing link, qualifies and captures the lead, without creating the event.
- Many small salons use only Google Calendar (or sync their system to it) → Calendar as the
  engine covers the common case and the cold demo.

## 4. Market & differentiation

- The "AI receptionist" space is crowded. The US players ($25–300/mo: Smith.ai, Goodcall,
  Trillet) are voice-first and don't cover DACH. **The reference competitor is fonio.ai**
  (Vienna; $17M seed at $140M valuation, Jun 2026): German-first, GDPR-native (proprietary
  EU stack, Nuremberg hosting), voice-first, **WhatsApp as a €79/mo add-on**, horizontal
  across SMB verticals. Full intel + watch items: `wiki/competitors/2026-07-02-fonio-ai.md`.
- The original gap thesis ("nobody does German + GDPR + local") is **dead** — fonio does.
  The surviving gap: **WhatsApp-first + niche depth (beauty) + done-for-you local service**.
  In Germany WhatsApp is the dominant messaging channel and fonio treats it as a bolt-on,
  not the wedge.
- Pricing implication: fonio Solo + WhatsApp ≈ €178/mo self-serve, no setup fee. Our
  €250–400/mo + setup holds only as a **done-for-you service** (onboarding questionnaire,
  owner edits on request, parallel-run, monthly ROI proof) — never sell Tilda as
  self-serve software, and don't sell the generic "AI receptionist" category (that's
  fonio's to win in DACH). Sell **missed-booking recovery**.
- Don't fight fonio on infrastructure sovereignty (their own EU stack beats our
  Twilio/ElevenLabs/OpenRouter assembly on paper). Neutralize compliance (DPAs,
  EU-residency modes, per-client sub-accounts) and move the conversation to outcomes.
- The bot itself is commoditized; the real differentiator = **local + GDPR-clean + the
  "business memory/context" layer** (the thread's "Claps" idea) with an **audit log** of which
  decision used which context. That's what earns trust after the demo. The `clients/*.yaml` is the seed.
  fonio's documented weaknesses map onto this: integrations immature (calendar via Cal.com
  until Jun 2026), no free trial (we do live demos), no per-business flow control.

## 5. GDPR / WhatsApp in Germany (critical)

- The **standard** WhatsApp app for patient data = potential **criminal offence (§203 StGB)** +
  GDPR fine (up to €10M / 2% of turnover). For health: **WhatsApp Business API via a BSP** with
  a DPA with Meta + **EU/ISO hosting**.
- Hence: **beauty first** (low-sensitivity data, Twilio sandbox fine for the demo); **dental
  phase 2** with a German BSP (**360dialog / chatarmin / hellomateo**), no health data in plaintext.
- **Opt-in/consent** required before messaging.
- Design: sending is isolated in `src/whatsapp.ts` → migrating Twilio → 360dialog = rewrite
  only that file.

## 6. Economics (updated provider model)

See `docs/provider-cost-financial-model.md` for the detailed ElevenLabs/Twilio/OpenRouter model.

Current planning conclusion:

- WhatsApp has excellent margins. Twilio Germany pricing observed Jun 2026: customer-window/free-form messages cost Twilio **$0.005/message**; utility templates outside the customer window cost **$0.060/message** including Meta + Twilio; marketing templates cost **$0.1415/message** and should be avoided in the pilot.
- Phone/voice is also margin-positive if bundled with included minutes and overage. ElevenAgents Creator is the first pilot plan: **$22/mo**, **275 call minutes**, **10 concurrent calls**, additional call minutes shown as **$0.08/min**. Twilio Germany local inbound voice is **$0.010/min** plus **$1.35/mo** for a local number.
- Modelled gross margins: WhatsApp pilot at **€399/mo ≈ 93.9% GM**; full front desk with **300 voice min at €599/mo ≈ 91.4% GM**; voice-heavy **1,000 min at €899/mo ≈ 85.5% GM**.
- The real risk is not provider COGS. It is support time, custom integrations, compliance, and unbounded voice usage. Use fair-use limits, paid setup, and voice overage from day 1.

## 7. Niches (order)

1. **Beauty / aesthetics** (Friseure, Kosmetik-, Nagelstudios) — GDPR-light, owners decide
   fast, obvious pain. Start cold here.
2. **Dental** — phase 2, higher ticket, requires German BSP + DPA.
3. Other appointment-heavy (contractors, real estate, events) via referrals.

## 8. Stack & phases

**Stack:** Node+TS · WhatsApp (Twilio sandbox → 360dialog) · **Voice: ElevenLabs Agents +
Twilio (channel 2)** · LLM Claude via OpenRouter · booking via Google Calendar (link as
fallback) · state in JSON (→ SQLite/Postgres when volume demands) · hosting Hetzner.

**Architecture principle: ONE brain, TWO channels.** Business logic (config + slots + booking
+ leads + store + summary) is exposed as **HTTP endpoints**. Both the WhatsApp bot (OpenRouter
loop) and the ElevenLabs voice agent (server tools/webhooks) consume them equally. Same
`clients/*.yaml`, same store, same daily summary. Adding voice doesn't duplicate logic.

**Phases** (voice is built IN PARALLEL, not deferred → the "one brain" refactor is now higher priority):
- **F0 – WhatsApp demo number** (= sales tool): salon front-desk bot in German/English, receives
  WhatsApp → qualifies → reads slots and creates event in Google Calendar → alerts owner. *(current scaffold)*
- **F1 – Per-business config:** `clients/<business>.yaml`. New business = edit YAML.
- **F1.5 – "One brain" refactor: tools as HTTP endpoints** (prerequisite for voice, now priority).
- **F2 – Voice channel (ElevenLabs), in parallel:** the AI *answers* the call (forwarded to the
  Twilio DE number), qualifies, books/sends appointment, post-call webhook → same store + summary. Premium upsell.
- **F3 – Status tracking + daily summary** (consultation→quote→deposit→appointment).
- **F4 – "Business memory"** + audit log (the moat). With 3-4 clients and copy-paste pain.
- **F5 – Dental** with German BSP + ElevenLabs EU residency/Zero-Retention.

Cross-cutting (from the start, see §11): anti-hallucination guardrails, human handoff,
AI disclosure, multi-language DE/EN, monitoring with alerts, hard spend caps.

## 9. Voice channel (ElevenLabs) — detail

- **Correct model:** the AI **answers** the call (never missed), not "detect a missed call".
  The business forwards its calls to the Twilio/ElevenLabs number.
- **Integration:** ElevenLabs Agents call **server tools (webhooks)** during the call and fire
  **post-call webhooks** on hang-up → reuse the same endpoints as WhatsApp.
- **Economics (≠ WhatsApp):** voice is NOT free. ~$0.08–0.20/min ElevenLabs + ~$0.013–0.026/min
  Twilio + LLM on top → a 3-min call ≈ $0.30–0.70. Justifies a **higher tier / premium add-on**.
- **GDPR:** ElevenLabs offers **EU Data Residency + Zero Retention Mode** → valid for dental (F5).
- **German:** supported, sub-second latency.
- **Extra ops** vs WhatsApp: number, forwarding, hours, fallback/human transfer. That's why
  WhatsApp is the first wedge (free, simple) and voice the next channel/upsell.

## 10. Billing model & accounts

**Reframe:** "the client pays for everything" does NOT mean they hold the accounts. It means
your price covers all costs + margin and they get **one predictable invoice**. Pure BYOK
(client creates all their own accounts) is ruled out: it kills onboarding for non-technical owners.

**Decided (Jun 2026):**
- **Billing model = HYBRID.**
  - **WhatsApp + LLM → bundled** into the flat fee. Real cost is pennies (~€5–20/mo for a
    WhatsApp-only client; inbound messages free + Haiku tokens). Zero risk, you carry it.
  - **Voice → controlled:** included minutes + overage (e.g. "300 min/mo included, then
    €0.XX/min"), or the client's own telephony sub-account. Protects margin (voice ≈ €0.30–0.70/call).
  - **One invoice.** Tiers: *WhatsApp €250–400/mo · +Voice €150–300/mo by volume.* Setup €500–1500.
- **Account ownership = YOU own everything.** Master accounts of yours (OpenRouter, ElevenLabs,
  Twilio/360dialog) with **per-client sub-accounts** to segregate data and attribute usage.
  Easy onboarding, full control.

**Implications (mitigations):**
- **GDPR:** if you own the accounts, you're data controller (or joint-controller) → more
  exposure. Mitigate: DPA with each client positioning you as processor where applicable,
  **per-client segregated sub-accounts**, EU hosting (360dialog EU, ElevenLabs EU residency).
- **⚠️ Dental exception (F5):** health data under YOUR account is risky (§203 StGB). There,
  reconsider: **WABA owned by the client** (client = controller) even if you operate it.
- **Cost risk:** covered by the hybrid model's voice overage/caps.
- **Metering:** the "one brain" backend can already log usage per client (ElevenLabs post-call
  webhook duration, OpenRouter tokens, message counts). **Don't build usage-based billing until
  voice threatens margin** (YAGNI). Start flat.

## 11. Pipeline decisions (Jun 2026)

**Bot behavior**
- **Availability:** Google Calendar = engine (read slots + create event); link = fallback for
  closed systems. (See §3.)
- **Human handoff:** detect intent/keyword or hard case → **alert the owner and pause the bot**
  in that chat until a human steps in.
- **AI transparency (EU AI Act):** the **first message** discloses it's an AI assistant
  ("Hi, I'm the digital assistant of [business]").
- **Languages:** **detect and reply in German or English** automatically.
- **Guardrails:** prices/hours/services ONLY from config or tools, never improvised.

**Legal / tax** *(drafts, not legal advice — validate with a lawyer)*
- **Regime:** freelance **Kleinunternehmer** → invoices **without VAT** (cite §19 UStG) while
  under the threshold. (Real DE 2025 threshold: €25,000 prior year / €100,000 current year;
  on crossing it → charge 19% USt; factor into the bundled pricing.)
- **Contracts:** generate **DPA drafts + consent/AI-transparency text** for end customers,
  ready for legal review. Blocker before the 1st real client.

**Onboarding / context (the moat)**
- **Capture:** **structured questionnaire** filled in with the owner (call/visit): services,
  prices, FAQ, edge cases, tone. Base of the "business context".
- **Updates:** at first **you edit on request** from the owner (part of the service). Evolve to
  a mini-form/panel later (F4).
- **Parallel-run period** alongside their existing process before going live (build trust).

**Operations / finance**
- **Monitoring:** **alerts** (bot down/errors) + **reviewable conversation log** (key in the
  first weeks).
- **Voice:** built **in parallel** with WhatsApp (not deferred) → prioritizes the "one brain" refactor (F1.5).
- **Hard spend caps** on each provider account (OpenRouter/Twilio/ElevenLabs) + **per-client
  rate limit** from day 1, to avoid surprise bills.

**Go-to-market**
- **Demo number + cold visits/DMs to Berlin businesses + first client near-free** for a case
  study. Then the referral machine (as in the thread).
- **Monthly ROI proof** ("we recovered X leads ≈ €Y") to reduce churn.

## 12. Open questions / to validate with the first client

- Real primary channel in these Berlin businesses: WhatsApp or phone? (we bet WhatsApp).
- Which booking systems show up most among the first clients? (defines which links/integrations to prioritize).
- Opt-in: how is it captured cleanly in practice (customer's first message = consent)?

## Sources
- AI receptionist market: answeringagent.com, agentzap.ai (2026 pricing).
- Competitors: fonio.ai deep-dive (pricing, product, funding, weaknesses) —
  `wiki/competitors/2026-07-02-fonio-ai.md` (Jul 2026, re-run quarterly).
- Booking DE: salon.life, fresha.com (Fresha 20% vs Treatwell 35%).
- Doctolib DE: doctolib.de, healthcare.digital.
- GDPR/WhatsApp health: sendapp.live, hellomateo.de, chatarmin.com.
- WhatsApp pricing DE: hello-charles.com, developers.facebook.com.
