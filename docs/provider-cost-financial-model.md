# Tilda provider spec and financial model

Last checked: 2026-06-29

This model prices the first Berlin hair-salon pilot stack for WhatsApp + phone-first front desk. Currency conversion is modelled at **$1 = EUR 0.93** for planning only. Provider prices exclude taxes unless provider pages say otherwise.

## Executive decision

For the screenshot flow, choose **ElevenAgents**, not ElevenCreative.

- **ElevenCreative** is for content creation: text-to-speech, voice changer, dubbing, studio, music, etc.
- **ElevenAgents** is the right platform for Tilda: deploy and monitor conversational agents, tools, integrations, conversations, phone numbers, outbound.

Recommended first setup:

1. **ElevenLabs: ElevenAgents Creator** for first internal/pilot tests.
2. **Twilio: Programmable Messaging + WhatsApp Business API** for WhatsApp.
3. **Twilio: Programmable Voice** for a German local phone number, forwarding, and inbound calls.
4. **OpenRouter** for LLM routing in WhatsApp and backend tool decisions.
5. Existing **Google Calendar + Supabase/Postgres** stay as product infrastructure.

## ElevenLabs spec

### Account/platform

Create/use one company ElevenLabs account and select **ElevenAgents**.

Use company-owned master account first. Later split into per-client workspaces/sub-accounts if available/needed for data segregation and metering.

### Product/features needed

| Feature | Needed? | Why |
|---|---:|---|
| Agents | Yes | Real conversational phone receptionist |
| Tools/server tools/webhooks | Yes | Call Tilda backend for availability, booking, lead capture, handoff |
| Post-call webhook/conversation logs | Yes | Store call summary, outcome, duration, usage, follow-up |
| Knowledge Base | Yes, light use | Salon FAQ/services/prices, but source of truth should remain client YAML/backend |
| Conversations | Yes | QA and pilot review |
| Phone numbers / integrations | Yes | Connect phone channel. Prefer Twilio number/telephony so WhatsApp + voice stay under Twilio control |
| Outbound | Later | Reminder/callback campaigns only after consent/compliance |
| Professional voice clone | No for pilot | Use stock/high-quality German voice first |
| Enterprise zero retention / EU residency | Later / dental blocker | Required before sensitive verticals such as dental/medical |

### Plan choice

ElevenAgents public pricing observed:

| Plan | Monthly price | Included call minutes | Concurrent calls | Tilda fit |
|---|---:|---:|---:|---|
| Free | $0 | 15 | 4 | only quick exploration |
| Starter | $6 | 75 | 6 | tiny internal tests |
| **Creator** | **$22** first month $11 | **275** | **10** | first real pilot/default |
| Pro | $99 | 1,238 | 20 | if voice usage grows past ~275 min/client or multiple salons share account |
| Scale | $299 | 3,738 | 30 | small portfolio |
| Business | $990 | 12,375 | 40 | larger portfolio |

Additional call minutes are shown as **$0.08/min**. The pricing calculator showed **Gemini 2.5 Flash $0.0012/min**, with estimated costs covering ElevenAgents platform voice and LLM models; telephony is billed separately.

### ElevenAPI rates useful for modular alternative

ElevenLabs API pricing page states:

- Text to Speech: **$0.10 / 1,000 characters** for Multilingual v2/v3, or **$0.05 / 1,000 characters** for Flash/Turbo.
- Speech to Text: **$0.22/hour** for Scribe or **$0.39/hour** for Scribe realtime.
- Entity detection: **$0.07/hour**.
- Keyterm prompting: **$0.05/hour**.

Use these if we build a modular STT + LLM + TTS pipeline instead of full ElevenAgents.

## Twilio spec

### Products needed

| Twilio product | Needed? | Use |
|---|---:|---|
| Programmable Messaging | Yes | WhatsApp webhook/send API |
| WhatsApp Business API sender | Yes | Dedicated Tilda/salon WhatsApp number after sandbox |
| Messaging Service | Yes | Cleaner sender/webhook routing, scaling, opt-outs |
| Content Templates | Yes | Business-initiated utility templates: reminders, confirmations, reactivation |
| Programmable Voice | Yes | German local number, inbound call webhooks, forwarding/transfer |
| TwiML webhooks | Yes | Connect calls to ElevenLabs/Tilda voice path |
| Media Streams | Maybe | Only if we build custom STT/LLM/TTS instead of ElevenAgents telephony integration |
| Call recording | Off initially | GDPR/consent risk. Store summaries unless explicitly approved |
| Conversations/Flex/Studio/Verify/SendGrid/Segment | No | Unneeded for first pilot; avoid product sprawl |

### Twilio WhatsApp Germany prices observed

Twilio page states WhatsApp pricing is Twilio per-message fee + Meta template fee.

For Germany option data:

| WhatsApp message type | Meta fee | Twilio fee | Total |
|---|---:|---:|---:|
| Customer service/free-form window | $0.0000 | $0.0050 | **$0.0050/message** |
| Utility template outside window | $0.0550 | $0.0050 | **$0.0600/message** |
| Authentication template | $0.0550 | $0.0050 | **$0.0600/message** |
| Marketing template | $0.1365 | $0.0050 | **$0.1415/message** |

Notes:

- Customer service window lasts 24h after customer-initiated message.
- During that window, Meta does not charge utility templates/free-form messages, but Twilio still charges its per-message fee.
- Avoid marketing templates for the first pilot.

### Twilio Voice Germany prices observed

Programmable Voice Germany page:

| Item | Price |
|---|---:|
| Local outbound calls | $0.0283/min |
| Local inbound calls | $0.0100/min |
| Mobile outbound calls | $0.0420/min |
| Mobile inbound calls | $0.0100/min |
| Browser/app or SIP interface | $0.0040/min each direction |
| German local number | $1.35/mo |
| German mobile number | $30.00/mo |
| Call recording | $0.0025/min recording + $0.0005/min/month storage |

Use **German local number** for pilot. Avoid mobile number unless WhatsApp sender/Meta setup requires it.

## OpenRouter spec

Needed:

- One company OpenRouter API key.
- Spend cap enabled.
- Default model for WhatsApp/tool decisions: start bake-off with Gemini 2.5 Flash, GPT-5.4 mini as quality reference, Flash-Lite/nano as cheap helper.
- Log model, prompt tokens, completion tokens, cost, latency per conversation.

Do not expose OpenRouter to the browser/client.

## Unit economics assumptions

Planning assumptions:

| Assumption | Value |
|---|---:|
| FX | $1 = EUR 0.93 |
| WhatsApp conversations/month/client | 300 |
| WhatsApp messages/conversation | 8 total |
| Utility templates/month | 40 |
| Text LLM/conversation | 3k input + 800 output tokens on Gemini 2.5 Flash |
| Hosting/Supabase/ops allocation | EUR 10/month/client |
| Voice transfer minutes | 10% of inbound voice minutes, local outbound rate |
| VAT | Excluded from revenue/cost model |

LLM text cost uses Gemini 2.5 Flash public price from the separate LLM eval doc: $0.30 / 1M input, $2.50 / 1M output.

## Monthly gross margin scenarios

| Package | Suggested price | Included usage | Est. provider/infra COGS | Gross profit | Gross margin |
|---|---:|---|---:|---:|---:|
| WhatsApp pilot | EUR 399/mo | 300 WhatsApp convos, 40 utility templates | **EUR 24.20** | **EUR 374.80** | **93.9%** |
| Full front desk | EUR 599/mo | WhatsApp + 300 voice minutes | **EUR 51.69** | **EUR 547.31** | **91.4%** |
| Voice-heavy full front desk | EUR 899/mo | WhatsApp + 1,000 voice minutes | **EUR 130.57** | **EUR 768.43** | **85.5%** |

### WhatsApp pilot COGS breakdown

| Component | Cost |
|---|---:|
| Twilio WA message fee: 2,400 messages x $0.005 | $12.00 |
| 40 utility templates x $0.060 | $2.40 |
| Gemini 2.5 Flash text LLM | $0.87 |
| Subtotal converted to EUR | EUR 14.20 |
| Hosting/infra allocation | EUR 10.00 |
| **Total** | **EUR 24.20** |

### Full front desk 300 voice minute COGS breakdown

Includes WhatsApp pilot COGS plus:

| Component | Cost |
|---|---:|
| ElevenAgents Creator | $22.00 |
| Extra 25 min x $0.08 | $2.00 |
| Gemini in ElevenAgents: 300 x $0.0012 | $0.36 |
| Twilio local number | $1.35 |
| Twilio inbound voice: 300 x $0.010 | $3.00 |
| Transfer allowance: 30 min x $0.0283 | $0.85 |
| Voice subtotal converted to EUR | EUR 27.49 |
| Plus WhatsApp pilot COGS | EUR 24.20 |
| **Total** | **EUR 51.69** |

### Full front desk 1,000 voice minute COGS breakdown

Includes WhatsApp pilot COGS plus:

| Component | Cost |
|---|---:|
| ElevenAgents Pro | $99.00 |
| Gemini in ElevenAgents: 1,000 x $0.0012 | $1.20 |
| Twilio local number | $1.35 |
| Twilio inbound voice: 1,000 x $0.010 | $10.00 |
| Transfer allowance: 100 min x $0.0283 | $2.83 |
| Voice subtotal converted to EUR | EUR 106.37 |
| Plus WhatsApp pilot COGS | EUR 24.20 |
| **Total** | **EUR 130.57** |

## Marginal usage economics

| Usage | Marginal cost |
|---|---:|
| Additional customer-window WhatsApp message | $0.005 = about EUR 0.0047 |
| Additional German utility template | $0.060 = about EUR 0.0558 |
| Additional German marketing template | $0.1415 = about EUR 0.1316 |
| Additional voice inbound minute after included ElevenAgents minutes | about **EUR 0.0848/min** before rare transfers |
| Additional local transfer/outbound minute | $0.0283 = about EUR 0.0263 |

## Pricing recommendation

For first paid pilots:

1. **Setup:** EUR 750-1,500 depending on customisation.
2. **WhatsApp-only pilot:** EUR 399/mo.
3. **Full front desk with phone + WhatsApp:** EUR 599/mo including 300 voice minutes.
4. **Voice-heavy:** EUR 899/mo including 1,000 voice minutes.
5. **Overage:** charge **EUR 0.20-0.30 per additional voice minute** after included minutes.

At EUR 0.25/min overage and marginal voice cost about EUR 0.085/min, overage gross margin is about 66% before support time.

## Gross margin conclusion

WhatsApp has excellent margins. Voice also has strong margins if included minutes and overage are controlled.

The real margin risk is not provider cost. It is:

- manual onboarding/support time
- custom salon rules
- compliance/legal review
- debugging provider webhooks
- unbounded voice usage
- clients expecting bespoke integrations inside the flat fee

Therefore the offer should include fair-use limits, explicit setup scope, and paid custom work boundaries.

## Sources

- ElevenAgents pricing: https://elevenlabs.io/pricing/agents
- ElevenAPI pricing: https://elevenlabs.io/pricing/api
- Twilio WhatsApp pricing: https://www.twilio.com/en-us/whatsapp/pricing
- Twilio Voice Germany pricing: https://www.twilio.com/en-us/voice/pricing/de
- LLM price comparison: `docs/llm-voice-model-eval-plan.md`
