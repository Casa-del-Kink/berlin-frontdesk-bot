import { hasOperatorPlaceholders, landingOperatorFromEnv, renderLandingPage } from "./landing.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertIncludes(body: string, text: string, label: string) {
  assert(body.includes(text), `missing ${label}: ${text}`);
}

function main() {
  const placeholderOperator = landingOperatorFromEnv({});
  const placeholderPage = renderLandingPage(placeholderOperator);
  assert(hasOperatorPlaceholders(placeholderOperator), "default operator should keep placeholders before Roxu fills values");
  assertIncludes(placeholderPage, "OPERATOR_LEGAL_NAME_PLACEHOLDER", "default legal placeholder");
  assertIncludes(placeholderPage, "OPERATOR_EMAIL_PLACEHOLDER", "default contact placeholder");
  assertIncludes(placeholderPage, "PRIVACY_EMAIL_PLACEHOLDER", "default privacy placeholder");

  const filledOperator = landingOperatorFromEnv({
    TILDA_OPERATOR_LEGAL_NAME: "Roxu Business Test",
    TILDA_PUBLIC_CONTACT_EMAIL: "hello@example.test",
    TILDA_PRIVACY_EMAIL: "privacy@example.test",
    TILDA_FOOTER_NOTE: "Pilot website for Berlin salon reception testing.",
  });
  const filledPage = renderLandingPage(filledOperator);
  assert(!hasOperatorPlaceholders(filledOperator), "filled operator should not have placeholders");
  assertIncludes(filledPage, "Roxu Business Test", "filled legal name");
  assertIncludes(filledPage, "hello@example.test", "filled contact email");
  assertIncludes(filledPage, "privacy@example.test", "filled privacy email");
  assertIncludes(filledPage, "mailto:hello%40example.test", "encoded contact mailto");
  assert(!filledPage.includes("OPERATOR_LEGAL_NAME_PLACEHOLDER"), "filled page should remove legal placeholder");
  assert(!filledPage.includes("OPERATOR_EMAIL_PLACEHOLDER"), "filled page should remove contact placeholder");
  assert(!filledPage.includes("PRIVACY_EMAIL_PLACEHOLDER"), "filled page should remove privacy placeholder");

  const escapedPage = renderLandingPage(
    landingOperatorFromEnv({
      TILDA_OPERATOR_LEGAL_NAME: "<script>alert(1)</script>",
      TILDA_PUBLIC_CONTACT_EMAIL: "ops@example.test",
      TILDA_PRIVACY_EMAIL: "privacy@example.test",
      TILDA_FOOTER_NOTE: "A&B <safe>",
    }),
  );
  assert(!escapedPage.includes("<script>"), "operator legal name should be escaped");
  assertIncludes(escapedPage, "&lt;script&gt;alert(1)&lt;/script&gt;", "escaped legal name");
  assertIncludes(escapedPage, "A&amp;B &lt;safe&gt;", "escaped footer note");

  console.log("LANDING_OPERATOR_SMOKE_OK");
  console.log(
    JSON.stringify(
      {
        defaultPlaceholders: true,
        filledOperatorValues: true,
        htmlEscaping: true,
        envKeys: [
          "TILDA_OPERATOR_LEGAL_NAME",
          "TILDA_PUBLIC_CONTACT_EMAIL",
          "TILDA_PRIVACY_EMAIL",
          "TILDA_FOOTER_NOTE",
        ],
      },
      null,
      2,
    ),
  );
}

main();
