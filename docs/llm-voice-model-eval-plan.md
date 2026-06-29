# Tilda LLM and voice model evaluation plan

Last checked: 2026-06-29

## Recommendation

Use a two-track evaluation:

1. **WhatsApp/text production candidate:** Gemini 2.5 Flash first, GPT-5.4 mini as the quality/reference candidate, Gemini 2.5 Flash-Lite as the cheap candidate.
2. **Voice production candidate:** start with a modular phone stack: STT + low-latency text LLM + ElevenLabs or Cartesia TTS. Compare it against one native realtime stack before choosing.

Do not pick only on token price. Pick the cheapest stack that passes booking correctness, German receptionist quality, latency, and compliance gates.

## Price notes from public pricing pages

Sources checked:

- OpenAI API pricing: https://platform.openai.com/docs/pricing
- Google Gemini API pricing: https://ai.google.dev/gemini-api/docs/pricing
- Deepgram pricing: https://deepgram.com/pricing
- Vapi pricing: https://www.vapi.ai/pricing
- Retell pricing: https://www.retellai.com/pricing
- Cartesia pricing: https://cartesia.ai/pricing

### Text / WhatsApp candidates

| Candidate | Public price signal | Tilda use |
|---|---:|---|
| Gemini 2.5 Flash-Lite | $0.10 / 1M text input, $0.40 / 1M output | cheapest serious candidate; test quality carefully |
| Gemini 2.5 Flash | $0.30 / 1M input, $2.50 / 1M output | best first value candidate for German + tools |
| GPT-5.4 nano | $0.20 / 1M input, $1.25 / 1M output | cheap OpenAI fallback/classifier candidate |
| GPT-5.4 mini | $0.75 / 1M input, $4.50 / 1M output | stronger quality/reference candidate |
| GPT-5.5 | $5.00 / 1M input, $30.00 / 1M output | too expensive for default front-desk use; reserve for eval reference only |

### Voice / realtime candidates

| Candidate | Public price signal | Tilda use |
|---|---:|---|
| Gemini 2.5 Flash Native Audio Live API | $0.50 / 1M text input, $3.00 / 1M audio/video input, $2.00 / 1M text output, $12.00 / 1M audio output | native realtime benchmark; promising value, but preview/rate-limit caveats |
| OpenAI gpt-realtime-2 | $32 / 1M audio input, $64 / 1M audio output; text $4 / $24 | high-quality realtime benchmark; likely too expensive as default unless quality/latency wins decisively |
| Deepgram Flux / Nova STT | roughly $0.0048-$0.0078 / min public snippets depending model/tier | strong modular STT candidate, especially for German/noisy calls |
| Vapi orchestration | $0.05 / min platform, model costs passed through/BYOK | fast pilot orchestration; adds platform margin |
| Retell | public page shows GPT Realtime mini $0.07/min and GPT Realtime around $0.345/min; voice infra/TTS add-ons listed | quick demo path, but verify exact total per-call economics |
| Cartesia voice agents/TTS | public FAQ mentions voice agents around $0.06/min and TTS/STT credits | strong low-latency TTS/voice candidate to compare with ElevenLabs |

## Working hypothesis

### Best value for WhatsApp/text

Start with **Gemini 2.5 Flash** as the default candidate.

Why:

- Very low token cost compared with OpenAI mid/high tier.
- Good multilingual capability.
- Supports function/tool calling.
- Large context if needed for salon config and conversation state.

Keep **GPT-5.4 mini** as the quality/reference model. Use it when Gemini fails style/tool evals, not as default from day one.

Use **Gemini 2.5 Flash-Lite** or **GPT-5.4 nano** for cheap helper tasks:

- intent classification
- slot extraction
- lead-field cleanup
- summarization
- routing to human handoff

### Best value for voice

Start with a **modular stack** for the first pilot:

```text
Twilio Voice or equivalent telephony
-> streaming STT, likely Deepgram Flux/Nova or provider equivalent
-> Gemini 2.5 Flash or GPT-5.4 mini for dialogue/tool decisions
-> ElevenLabs or Cartesia TTS
-> Tilda backend tools for availability, booking, leads, summaries
```

Reason:

- More controllable costs than native realtime audio tokens.
- Easy to swap STT/TTS independently.
- Better observability for GDPR summaries, tool traces, and booking correctness.
- ElevenLabs remains the first wow-layer candidate for German naturalness.

Benchmark against one native realtime option:

- **Gemini 2.5 Flash Native Audio Live API** for lower-cost native voice.
- **OpenAI gpt-realtime-2** as a high-quality reference, likely too expensive for default.

## Hard gates before selection

Eliminate a model/stack if any hard gate fails:

- 100% no hallucinated confirmed bookings.
- 100% no booking before availability/tool success.
- 100% GDPR access/delete request routes safely.
- 100% truthful AI/digital-assistant disclosure when asked and at configured opening.
- >= 95% correct tool-call sequence on booking/change/cancel scenarios.
- >= 4.2 / 5 average German human receptionist rating.
- Voice response-start p95 <= 1.8s for live calls.
- Critical voice entity error rate <= 3% for name, date, time, service, phone.
- No customer-facing em dash or generic AI-assistant wording.

## Evaluation set

Run 30 fixed scenarios per candidate.

### A. Text quality, 8 scenarios

1. Simple German haircut booking.
2. Existing customer asks for color + cut.
3. Balayage price question with unknown price.
4. Opening-hours question.
5. Cancellation request.
6. Angry complaint.
7. Bridal/large-service lead capture.
8. German style/slop test.

### B. Tool-call reliability, 8 scenarios

1. Availability before booking.
2. Slot unavailable -> offer alternatives only.
3. Reschedule existing booking.
4. Ambiguous customer identity -> ask before destructive action.
5. Multi-service duration.
6. Lead instead of booking.
7. Calendar conflict race on create.
8. Calendar/tool timeout -> human fallback.

### C. Voice, 8 scenarios

1. Clean simple booking.
2. Background noise.
3. Berliner/colloquial phrasing.
4. Caller interrupts assistant.
5. Name and phone capture.
6. Ambiguous cancellation.
7. Complaint call.
8. Long call from FAQ to booking.

### D. Safety/compliance, 4 scenarios

1. “Am I speaking to a real person?”
2. GDPR data access request.
3. GDPR deletion request.
4. Medical-ish scalp reaction boundary.

### E. Cost/latency, 2 load runs

1. 100 WhatsApp/text conversations.
2. 50 simulated 2-5 minute voice calls.

## Scoring rubric

100 points:

- 20 German receptionist quality
- 25 booking/tool correctness
- 20 voice experience
- 10 latency
- 10 cost efficiency
- 10 safety/GDPR/compliance
- 5 observability/maintainability

Selection rule:

- All hard gates pass.
- Overall score >= 82.
- Booking/tool correctness >= 22/25.
- Pick the cheapest stack that meets the above.

## Cost reporting formula

Track:

```text
cost_per_resolved_conversation = LLM input + LLM output + STT + TTS + telephony + orchestration + retries/tool overhead
cost_per_successful_booking = total_eval_cost / correct_successful_bookings
```

Initial target ceilings:

- WhatsApp FAQ <= EUR 0.03
- WhatsApp booking <= EUR 0.08
- 2-minute voice FAQ <= EUR 0.20
- 3-5 minute voice booking <= EUR 0.75
- cost per successful booking <= EUR 1.00 preferred

## Immediate eval implementation tasks

1. Add scenario JSON fixtures under `evals/scenarios/`.
2. Add a model adapter interface for OpenRouter/Gemini/OpenAI direct.
3. Add deterministic tool mocks for calendar/store.
4. Add JSON trace output per scenario.
5. Add cost calculator by provider/model.
6. Run text/tool evals first; only top 2-3 stacks proceed to paid voice evals.
