import OpenAI from "openai";

let cachedClient: OpenAI | null = null;

function getOpenRouterClient(): OpenAI {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("Missing OPENROUTER_API_KEY. Set it in .env before handling AI conversations.");
  }

  cachedClient ??= new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey,
    defaultHeaders: { "X-Title": "Berlin Front-Desk Bot" },
  });
  return cachedClient;
}

const MODEL = process.env.OPENROUTER_MODEL || "anthropic/claude-haiku-4.5";

// Conversation loop with tool use. Returns the final text for the customer.
export async function runConversation(
  messages: any[],
  tools: any[],
  handlers: Record<string, (args: any) => Promise<unknown>>,
  maxSteps = 5,
): Promise<string> {
  const msgs = [...messages];
  const client = getOpenRouterClient();

  for (let i = 0; i < maxSteps; i++) {
    const res = await client.chat.completions.create({
      model: MODEL,
      messages: msgs,
      tools,
      tool_choice: "auto",
    });
    const m = res.choices[0].message;
    msgs.push(m as any);

    if (!m.tool_calls || m.tool_calls.length === 0) {
      return m.content ?? "";
    }

    for (const tc of m.tool_calls) {
      const fn = (tc as any).function;
      let result: unknown;
      try {
        const args = JSON.parse(fn.arguments || "{}");
        const handler = handlers[fn.name];
        result = handler ? await handler(args) : { error: `Unknown tool: ${fn.name}` };
      } catch (e: any) {
        result = { error: String(e?.message ?? e) };
      }
      msgs.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(result) });
    }
  }

  return "Sorry, something went wrong just now. Please try again.";
}
