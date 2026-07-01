import OpenAI from "openai";

type SmokeResult = {
  marker: "LLM_PROVIDER_SMOKE_OK" | "LLM_PROVIDER_SMOKE_BLOCKED";
  ok: boolean;
  generatedAt: string;
  model: string;
  approvedForLiveProviderCall: boolean;
  missingEnv: string[];
  noCustomerData: true;
  promptFixture: string;
  responsePreview?: string;
};

const MODEL = process.env.OPENROUTER_MODEL || "anthropic/claude-haiku-4.5";
const PROMPT_FIXTURE = "German salon fixture: reply with exactly TILDA_LLM_SMOKE_OK and no extra words.";

function has(name: string) {
  return Boolean(process.env[name]?.trim());
}

function assertNoSecretValues(text: string) {
  const patterns = [
    /OPENROUTER_API_KEY\s*=\s*[^\s<*]+/i,
    /sk-or-v1-[A-Za-z0-9_-]{20,}/i,
    /sk-[A-Za-z0-9_-]{20,}/i,
    /[A-Za-z0-9_]*TOKEN[A-Za-z0-9_]*\s*=\s*[^\s<*]+/i,
    /[A-Za-z0-9_]*SECRET[A-Za-z0-9_]*\s*=\s*[^\s<*]+/i,
  ];
  for (const pattern of patterns) {
    if (pattern.test(text)) throw new Error(`LLM smoke output may contain a secret-shaped value: ${pattern}`);
  }
}

function blockedReport(missingEnv: string[]): SmokeResult {
  return {
    marker: "LLM_PROVIDER_SMOKE_BLOCKED",
    ok: false,
    generatedAt: new Date().toISOString(),
    model: MODEL,
    approvedForLiveProviderCall: process.env.LLM_PROVIDER_SMOKE_APPROVED === "true",
    missingEnv,
    noCustomerData: true,
    promptFixture: PROMPT_FIXTURE,
  };
}

async function runLiveSmoke(): Promise<SmokeResult> {
  const client = new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: process.env.OPENROUTER_API_KEY,
    defaultHeaders: { "X-Title": "Tilda LLM Provider Smoke" },
  });

  const response = await client.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: "system",
        content: "You are a provider connectivity smoke test. Do not include personal data. Follow the user instruction exactly.",
      },
      { role: "user", content: PROMPT_FIXTURE },
    ],
    temperature: 0,
    max_tokens: 16,
  });

  const content = response.choices[0]?.message?.content?.trim() ?? "";
  if (content !== "TILDA_LLM_SMOKE_OK") {
    throw new Error(`OpenRouter smoke returned unexpected content marker: ${content || "<empty>"}`);
  }

  return {
    marker: "LLM_PROVIDER_SMOKE_OK",
    ok: true,
    generatedAt: new Date().toISOString(),
    model: MODEL,
    approvedForLiveProviderCall: true,
    missingEnv: [],
    noCustomerData: true,
    promptFixture: PROMPT_FIXTURE,
    responsePreview: content,
  };
}

async function main() {
  const missingEnv = ["OPENROUTER_API_KEY"].filter((name) => !has(name));
  const approved = process.env.LLM_PROVIDER_SMOKE_APPROVED === "true";

  if (missingEnv.length > 0 || !approved) {
    const report = blockedReport(approved ? missingEnv : [...missingEnv, "LLM_PROVIDER_SMOKE_APPROVED=true"]);
    const json = JSON.stringify(report, null, 2);
    assertNoSecretValues(json);
    console.log(report.marker);
    console.log(json);
    process.exit(1);
  }

  const report = await runLiveSmoke();
  const json = JSON.stringify(report, null, 2);
  assertNoSecretValues(json);
  console.log(report.marker);
  console.log(json);
}

main().catch((err) => {
  console.error("LLM_PROVIDER_SMOKE_FAILED");
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
