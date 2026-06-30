# Tilda domain registration and Twilio website handoff

Status: operator handoff for Michael/Roxu. No domain was purchased. No Twilio form was submitted. No outreach was performed.

Scope remains narrow: independent Berlin hair salons and barbers.

## Immediate recommendation

Register this first:

```text
meettilda.com
```

If unavailable at checkout, use this fallback order:

```text
calltilda.com
tildareception.com
tildafrontdesk.com
salontilda.com
```

If budget allows, register both:

```text
meettilda.com
calltilda.com
```

Use `meettilda.com` as the public website and redirect `calltilda.com` to it later.

## Ranked top 10 options

| Rank | Domain | Brand/use | Decision |
|---:|---|---|---|
| 1 | `meettilda.com` | Meet Tilda | best default: warm, human, brandable |
| 2 | `calltilda.com` | Call Tilda | best action/phone CTA, good defensive buy |
| 3 | `tildareception.com` | Tilda Reception | very clear for provider/Twilio review |
| 4 | `tildafrontdesk.com` | Tilda Front Desk | clear B2B wording, slightly longer |
| 5 | `salontilda.com` | Salon Tilda | strongest narrow-wedge fit, less expandable |
| 6 | `tildareceptionist.com` | Tilda Receptionist | explicit, but longer and more robotic |
| 7 | `tildaanswers.com` | Tilda Answers | good outcome wording, less premium |
| 8 | `bookwithtilda.com` | Book with Tilda | booking-specific, less full front desk |
| 9 | `tildacalls.com` | Tilda Calls | phone-specific, not WhatsApp/booking enough |
| 10 | `frontdesktilda.com` | Front Desk Tilda | clear but awkward word order |

## Options to avoid for now

| Domain | Why |
|---|---|
| `trytilda.com` | appeared registered in RDAP check |
| `hellotilda.com` | likely already active/used; less available signal |
| `asktilda.com` | likely already active/used; sounds generic assistant-like |
| `calltilder.com` | internal working name, typo-prone and awkward |
| `tildavoice.com` | too voice-only, while product is phone plus WhatsApp plus booking |
| `.de` or `.eu` variants | not preferred for this stage; Michael preference is `.com` and/or `.ai` |

## Registrar checkout instructions for Roxu

1. Search `meettilda.com` first.
2. If it is normal-price and available, buy it.
3. Enable WHOIS/privacy protection if offered.
4. Do not buy expensive premium listings without checking with Michael.
5. Do not buy random spelling variants unless they are in the fallback list.
6. If `meettilda.com` is unavailable at checkout, move down the fallback list immediately.
7. Send the bought domain back into the group.

## Website content requirements for Twilio

The website does not need to be perfect. It must be credible and consistent:

- [ ] says Tilda/CallTilder is an AI/KI reception/front desk
- [ ] says the current focus is Berlin salons/barbers
- [ ] describes overflow/no-answer use
- [ ] includes clear AI/KI disclosure
- [ ] includes contact email
- [ ] includes privacy/admin email
- [ ] includes operator/legal footer details
- [ ] does not imply medical, legal, or emergency use
- [ ] does not broaden into dog grooming or other verticals

## Twilio form mapping

| Twilio field | Use |
|---|---|
| Legal business name | Roxu's real registered freelancer/business identity, unless Twilio provides a separate brand/trading-name field |
| Business website URL | `https://meettilda.com` once hosted and HTTPS is live |
| Business address | Roxu's registered/acceptable business address details |
| Business email | durable Tilda/admin email if available, otherwise Roxu's business email temporarily |
| Brand/trading name | Tilda or Meet Tilda if Twilio has a separate field |
| Industry | Software/IT/Communications if available; otherwise Professional Services is acceptable |
| Registration number | only if Roxu has an applicable registration number and the field requires it |

Do not submit a fake legal name such as `Tilda Front Desk` if the form asks for legal business name.

## DNS path after registration

If using Render:

```text
meettilda.com      -> Render custom domain target
www.meettilda.com  -> Render custom domain target or CNAME
```

If using Railway:

```text
meettilda.com      -> Railway custom domain target
www.meettilda.com  -> Railway custom domain target or CNAME
```

If landing and API are on different hosts:

```text
https://meettilda.com          public business website for Twilio registration
https://api.meettilda.com      Twilio webhook/API base, optional later
```

Fastest first demo can keep both on one host:

```text
https://meettilda.com/
https://meettilda.com/health
https://meettilda.com/webhook/whatsapp
https://meettilda.com/webhook/voice/post-call
```

## Post-domain smoke commands

After hosting is connected:

```bash
HOSTED_LANDING_BASE_URL=https://meettilda.com npm run landing:contract:smoke
HOSTED_SMOKE_BASE_URL=https://meettilda.com npm run hosted:smoke:contract
```

If API is on a separate host:

```bash
HOSTED_LANDING_BASE_URL=https://meettilda.com npm run landing:contract:smoke
HOSTED_SMOKE_BASE_URL=https://<api-host> npm run hosted:smoke:contract
```

## Go/no-go before Twilio submit

Go:

- [ ] domain loads over HTTPS
- [ ] landing smoke passes against hosted URL
- [ ] operator/contact/privacy footer is real, not placeholder
- [ ] legal business name in Twilio matches Roxu's real operator identity
- [ ] website brand and Twilio account details do not contradict each other

No-go:

- [ ] checkout asks premium pricing unexpectedly
- [ ] public footer still has placeholders
- [ ] website is blank, broken, or not HTTPS
- [ ] Twilio legal name is guessed/fake
- [ ] domain choice broadens the strategy away from salons/barbers

## Chat-ready instruction for Roxu

```text
Buy meettilda.com if it is normal-price and available. If not, use calltilda.com, then tildareception.com, then tildafrontdesk.com, then salontilda.com. Do not buy premium-priced domains without checking. After purchase, send the domain here and we will connect it to the landing page before Twilio submission.
```
