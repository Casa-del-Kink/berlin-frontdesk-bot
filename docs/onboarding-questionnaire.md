# Client onboarding questionnaire

Use this with the owner before creating `clients/<business>.yaml`.

## Business basics
- Business name:
- Address:
- Timezone:
- Primary language(s):
- Owner WhatsApp for alerts:
- Existing booking link/system, if any:

## Opening hours
- Open days:
- Open/close times:
- Holidays / exceptions:

## Services
For each service:
- Name:
- Duration:
- Price / price range:
- Preparation notes:
- Who should *not* book this service:

## FAQ
- Location / parking:
- Payment methods:
- Cancellation policy:
- Late arrival policy:
- Accessibility:
- Anything customers often ask:

## Handoff rules
When should the AI stop and alert a human?
- Complaints:
- Refunds:
- Medical/sensitive questions:
- VIP customers:
- Keywords:

## Tone
- Formal/informal:
- Emojis yes/no:
- Example of a good reply in the owner’s style:
- Phrases to avoid:

## Consent / transparency text
Draft text customers should see if they ask about privacy or AI usage:

> 

## Go-live checklist
- [ ] Calendar shared with service account
- [ ] Test booking created successfully
- [ ] Owner joined WhatsApp sandbox or production sender approved
- [ ] Twilio webhook set to `/webhook/whatsapp`
- [ ] `TWILIO_WEBHOOK_BASE_URL` set for signature validation
- [ ] Owner reviewed FAQ/services/prices
- [ ] Parallel-run period agreed
