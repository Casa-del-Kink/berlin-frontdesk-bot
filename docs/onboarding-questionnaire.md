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
Draft text customers should see in the first message, and if they ask about privacy or AI usage:

- AI disclosure text, German:
- AI disclosure text, English:
- Short privacy/data-use text, German:
- Short privacy/data-use text, English:
- Privacy contact email/URL for export/delete requests:
- Agreed data retention period:
- Phone recording/transcription allowed? If yes, exact opt-in wording:

See `docs/compliance-live-pilot-pack.md` for draft German/English wording and the AVV/DPA/subprocessor checklist.

## Go-live checklist
- [ ] Calendar shared with service account
- [ ] Test booking created successfully
- [ ] Owner joined WhatsApp sandbox or production sender approved
- [ ] Twilio webhook set to `/webhook/whatsapp`
- [ ] `TWILIO_WEBHOOK_BASE_URL` set for signature validation
- [ ] Owner reviewed FAQ/services/prices
- [ ] AI disclosure text approved
- [ ] Privacy contact configured
- [ ] Retention period agreed and set
- [ ] AVV/DPA/subprocessor review completed or explicitly blocked before live traffic
- [ ] Parallel-run period agreed
