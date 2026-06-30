export function renderLandingPage() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>CallTilder | AI reception for Berlin salons</title>
  <style>
    :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #fffaf5; color: #221915; }
    body { margin: 0; }
    main { max-width: 1060px; margin: 0 auto; padding: 36px 20px 28px; }
    .badge { display: inline-flex; gap: 8px; align-items: center; border: 1px solid #e8d2c5; border-radius: 999px; padding: 8px 12px; background: #fff; color: #6d4638; font-size: 14px; }
    h1 { max-width: 850px; font-size: clamp(38px, 7vw, 78px); line-height: 0.95; letter-spacing: -0.06em; margin: 26px 0 18px; }
    .lead { max-width: 740px; font-size: clamp(19px, 3vw, 26px); line-height: 1.35; color: #5b463f; margin: 0 0 26px; }
    .card { background: #ffffff; border: 1px solid #ead8ce; border-radius: 28px; padding: 24px; box-shadow: 0 20px 60px rgba(78, 45, 28, 0.08); }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 14px; margin: 28px 0; }
    .grid .card { border-radius: 22px; box-shadow: none; }
    h2 { font-size: 28px; letter-spacing: -0.03em; margin: 0 0 12px; }
    h3 { margin: 0 0 8px; font-size: 18px; }
    p { line-height: 1.55; }
    ul { padding-left: 20px; line-height: 1.65; }
    .cta { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 24px; }
    .button { border-radius: 999px; padding: 13px 18px; text-decoration: none; font-weight: 700; }
    .primary { background: #221915; color: #fff; }
    .secondary { color: #221915; border: 1px solid #d9b9a8; background: #fff; }
    .notice { background: #fff2e9; border: 1px solid #efd2c1; border-radius: 20px; padding: 16px; color: #604337; }
    footer { border-top: 1px solid #ead8ce; margin-top: 38px; padding-top: 20px; color: #6f5b53; font-size: 14px; }
    code { background: #fff2e9; padding: 2px 5px; border-radius: 6px; }
  </style>
</head>
<body>
  <main>
    <span class="badge">Berlin salon pilot · phone and WhatsApp front desk</span>
    <h1>Never miss a salon booking because the phone rang at the wrong time.</h1>
    <p class="lead">CallTilder is the AI reception for independent Berlin salons and barbers. Tilda answers overflow or missed calls, captures appointment and callback requests, and sends the team a short summary.</p>

    <section class="card">
      <h2>Warm front desk help when your team is with a client</h2>
      <p>Tilda is built for small salon teams that cannot always pick up the phone during cuts, color, treatments, or cleanup. The first pilot is intentionally narrow: overflow and no-answer only, with a Tilda-owned number and clear handoff rules.</p>
      <div class="cta">
        <a class="button primary" href="mailto:OPERATOR_EMAIL_PLACEHOLDER">Ask about a Berlin salon pilot</a>
        <a class="button secondary" href="/health">View service health</a>
      </div>
    </section>

    <section class="grid" aria-label="Pilot scope">
      <div class="card">
        <h3>What Tilda captures</h3>
        <p>Appointment requests, callback requests, opening-hour questions, location questions, and basic salon service questions.</p>
      </div>
      <div class="card">
        <h3>What Tilda does not decide</h3>
        <p>No medical, legal, privacy, pricing-exception, refund, or technical hair/color decisions. Those go to the salon team.</p>
      </div>
      <div class="card">
        <h3>Data default</h3>
        <p>Short summaries only by default. Raw recordings and full transcripts are off unless explicitly approved and disclosed.</p>
      </div>
    </section>

    <section class="notice">
      <h2>AI disclosure</h2>
      <p>German call opening: <strong>Hallo, hier ist Tilda von [Salon]. Ich bin die KI-Rezeption. Wie kann ich dir helfen?</strong></p>
      <p>English meaning: <strong>Hi, this is Tilda from [Salon]. I’m the AI reception. How can I help you?</strong></p>
    </section>

    <section class="grid" aria-label="Pilot rules">
      <div class="card">
        <h3>Salon number stays yours</h3>
        <p>CallTilder does not take over the salon's existing public number. The first pilot uses a Tilda-owned overflow number.</p>
      </div>
      <div class="card">
        <h3>Human handoff</h3>
        <p>Complaints, uncertainty, sensitive requests, data questions, and special decisions are routed to a human.</p>
      </div>
      <div class="card">
        <h3>Berlin first</h3>
        <p>The pilot is focused on independent Berlin hair salons and barbers before any wider vertical expansion.</p>
      </div>
    </section>

    <footer>
      <p><strong>Operator:</strong> OPERATOR_LEGAL_NAME_PLACEHOLDER · <strong>Contact:</strong> OPERATOR_EMAIL_PLACEHOLDER · <strong>Privacy:</strong> PRIVACY_EMAIL_PLACEHOLDER</p>
      <p>CallTilder / Tilda is in pilot preparation. Replace all operator placeholders before provider submission or public launch.</p>
    </footer>
  </main>
</body>
</html>`;
}
