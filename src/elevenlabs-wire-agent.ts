import { pathToFileURL } from "node:url";
import { loadClient, type Client } from "./config.js";
import { buildSystemPrompt } from "./prompt.js";

// Idempotent wiring script for the ElevenLabs Conversational AI (Agents platform) voice channel.
// Intended to run WHERE THE ENV LIVES (Render shell or a local shell with env set). Never prints
// secrets. See docs/elevenlabs-voice-agent-setup.md PATH A for the exact run steps, and PATH B
// for the manual console fallback if this script cannot complete against the live API.

const AGENT_NAME = "tilda-frontdesk";
const SECRET_NAME = "tilda-server-tool-token";
const POST_CALL_WEBHOOK_NAME = "tilda-post-call";

interface RequiredEnv {
  apiKey: string;
  publicBaseUrl: string;
  serverToolToken: string;
}

function readRequiredEnv(): RequiredEnv {
  const missing: string[] = [];
  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  const publicBaseUrl = process.env.VOICE_AGENT_PUBLIC_BASE_URL?.trim();
  const serverToolToken = process.env.SERVER_TOOL_TOKEN?.trim();

  if (!apiKey) missing.push("ELEVENLABS_API_KEY");
  if (!publicBaseUrl) missing.push("VOICE_AGENT_PUBLIC_BASE_URL");
  if (!serverToolToken) missing.push("SERVER_TOOL_TOKEN");

  if (missing.length > 0) {
    throw new WireAgentError(`Missing required env: ${missing.join(", ")}`);
  }
  if (!/^https:\/\//.test(publicBaseUrl!)) {
    throw new WireAgentError("VOICE_AGENT_PUBLIC_BASE_URL must be an https:// URL");
  }

  return { apiKey: apiKey!, publicBaseUrl: publicBaseUrl!.replace(/\/$/, ""), serverToolToken: serverToolToken! };
}

class WireAgentError extends Error {}

function apiBase(): string {
  return (process.env.ELEVENLABS_API_BASE_URL || "https://api.elevenlabs.io").replace(/\/$/, "");
}

async function elevenlabsFetch(apiKey: string, path: string, init: RequestInit & { method: string }) {
  const res = await fetch(`${apiBase()}${path}`, {
    ...init,
    headers: {
      "xi-api-key": apiKey,
      "content-type": "application/json",
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let body: any;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    body = text;
  }
  if (!res.ok) {
    const detail = typeof body === "string" ? body : JSON.stringify(body);
    throw new WireAgentError(`ElevenLabs API ${init.method} ${path} failed: ${res.status} ${detail}`);
  }
  return body;
}

async function findExistingSecretId(apiKey: string): Promise<string | undefined> {
  const list = await elevenlabsFetch(apiKey, "/v1/convai/secrets", { method: "GET" });
  const secrets = Array.isArray(list?.secrets) ? list.secrets : [];
  const existing = secrets.find((s: any) => s?.name === SECRET_NAME);
  return existing?.secret_id;
}

async function upsertWorkspaceSecret(apiKey: string, tokenValue: string): Promise<string> {
  const existingId = await findExistingSecretId(apiKey);
  if (existingId) {
    // Secrets are typically immutable by value; reuse by name/id rather than attempting an update.
    return existingId;
  }
  const created = await elevenlabsFetch(apiKey, "/v1/convai/secrets", {
    method: "POST",
    body: JSON.stringify({ name: SECRET_NAME, value: tokenValue }),
  });
  const secretId = created?.secret_id;
  if (!secretId) throw new WireAgentError("ElevenLabs secret creation response missing secret_id");
  return secretId;
}

function toolRequestSchema(url: string, requiredBody: Record<string, unknown>) {
  return {
    url,
    method: "POST",
    request_body_schema: {
      type: "object",
      required: Object.keys(requiredBody),
      properties: Object.fromEntries(Object.keys(requiredBody).map((key) => [key, { type: typeof requiredBody[key] === "object" ? "object" : "string" }])),
    },
  };
}

interface ToolSpec {
  name: string;
  description: string;
  path: string;
  requiredBody: Record<string, unknown>;
}

function toolSpecs(publicBaseUrl: string): ToolSpec[] {
  return [
    {
      name: "check_availability",
      description: "Check real free appointment slots before promising any time to the caller.",
      path: "/tools/check_availability",
      requiredBody: { phone: "string", args: { service: "string", from: "string", days: "number" } },
    },
    {
      name: "book_appointment",
      description: "Book one appointment through the shared backend after the caller confirms a slot and name.",
      path: "/tools/book_appointment",
      requiredBody: { phone: "string", args: { name: "string", service: "string", start: "string", channel: "string" } },
    },
    {
      name: "register_lead",
      description: "Register a human follow-up when the caller cannot or should not be booked automatically.",
      path: "/tools/register_lead",
      requiredBody: { phone: "string", args: { name: "string", service: "string", notes: "string", channel: "string", idempotencyKey: "string" } },
    },
  ].map((tool) => ({ ...tool, url: `${publicBaseUrl}${tool.path}` })) as unknown as ToolSpec[];
}

async function findExistingToolId(apiKey: string, name: string): Promise<string | undefined> {
  const list = await elevenlabsFetch(apiKey, "/v1/convai/tools", { method: "GET" });
  const tools = Array.isArray(list?.tools) ? list.tools : [];
  const existing = tools.find((t: any) => t?.tool_config?.name === name || t?.name === name);
  return existing?.id || existing?.tool_id;
}

async function upsertTool(apiKey: string, spec: ToolSpec, publicBaseUrl: string, secretId: string): Promise<string> {
  const url = `${publicBaseUrl}${spec.path}`;
  const payload = {
    tool_config: {
      type: "webhook",
      name: spec.name,
      description: spec.description,
      api_schema: {
        ...toolRequestSchema(url, spec.requiredBody),
        request_headers: {
          Authorization: { secret_id: secretId },
        },
      },
    },
  };

  const existingId = await findExistingToolId(apiKey, spec.name);
  if (existingId) {
    await elevenlabsFetch(apiKey, `/v1/convai/tools/${existingId}`, { method: "PATCH", body: JSON.stringify(payload) });
    return existingId;
  }
  const created = await elevenlabsFetch(apiKey, "/v1/convai/tools", { method: "POST", body: JSON.stringify(payload) });
  const toolId = created?.id || created?.tool_id;
  if (!toolId) throw new WireAgentError(`ElevenLabs tool creation response missing id for ${spec.name}`);
  return toolId;
}

async function findExistingAgentId(apiKey: string): Promise<string | undefined> {
  const envAgentId = process.env.ELEVENLABS_AGENT_ID?.trim();
  if (envAgentId) return envAgentId;
  const list = await elevenlabsFetch(apiKey, "/v1/convai/agents", { method: "GET" });
  const agents = Array.isArray(list?.agents) ? list.agents : [];
  const existing = agents.find((a: any) => a?.name === AGENT_NAME);
  return existing?.agent_id;
}

function firstMessage(cfg: Client): string {
  return `Hallo, hier ist Tilda von ${cfg.name}. Ich bin die KI-Rezeption und helfe dir gern mit Terminen und Fragen.`;
}

interface UpsertAgentResult {
  agentId: string;
  postCallWebhookCreated: boolean;
}

async function upsertAgent(apiKey: string, prompt: string, toolIds: string[], publicBaseUrl: string, cfg: Client): Promise<UpsertAgentResult> {
  const conversationConfig = {
    agent: {
      prompt: { prompt, tool_ids: toolIds },
      first_message: firstMessage(cfg),
      language: "de",
    },
  };

  const existingId = await findExistingAgentId(apiKey);
  if (existingId) {
    await elevenlabsFetch(apiKey, `/v1/convai/agents/${existingId}`, {
      method: "PATCH",
      body: JSON.stringify({ name: AGENT_NAME, conversation_config: conversationConfig }),
    });
    const postCallWebhookCreated = await configurePostCallWebhook(apiKey, publicBaseUrl);
    return { agentId: existingId, postCallWebhookCreated };
  }

  const created = await elevenlabsFetch(apiKey, "/v1/convai/agents/create", {
    method: "POST",
    body: JSON.stringify({ name: AGENT_NAME, conversation_config: conversationConfig }),
  });
  const agentId = created?.agent_id;
  if (!agentId) throw new WireAgentError("ElevenLabs agent creation response missing agent_id");
  const postCallWebhookCreated = await configurePostCallWebhook(apiKey, publicBaseUrl);
  return { agentId, postCallWebhookCreated };
}

// Post-call delivery is workspace-level, not agent-level: a workspace webhook object is
// registered once (POST /v1/workspace/webhooks), then referenced by id from the workspace
// Conversational AI settings (PATCH /v1/convai/settings, webhooks.post_call_webhook_id). There is
// no inline "post_call_webhook: {url}" field on the agent itself. This is the call most likely to
// drift from the live API; see docs/elevenlabs-voice-agent-setup.md PATH B for the console
// fallback if this step's error output does not match what you see below.
async function findExistingWorkspaceWebhookId(apiKey: string, name: string): Promise<string | undefined> {
  const list = await elevenlabsFetch(apiKey, "/v1/workspace/webhooks", { method: "GET" });
  const webhooks = Array.isArray(list?.webhooks) ? list.webhooks : [];
  const existing = webhooks.find((w: any) => w?.name === name);
  return existing?.webhook_id;
}

interface UpsertWebhookResult {
  webhookId: string;
  created: boolean;
}

async function upsertPostCallWebhook(apiKey: string, publicBaseUrl: string): Promise<UpsertWebhookResult> {
  const existingId = await findExistingWorkspaceWebhookId(apiKey, POST_CALL_WEBHOOK_NAME);
  if (existingId) return { webhookId: existingId, created: false };

  const created = await elevenlabsFetch(apiKey, "/v1/workspace/webhooks", {
    method: "POST",
    body: JSON.stringify({
      settings: {
        auth_type: "hmac",
        name: POST_CALL_WEBHOOK_NAME,
        webhook_url: `${publicBaseUrl}/webhook/voice/post-call`,
      },
    }),
  });
  // The create response includes a webhook_secret (the HMAC signing secret). It is never read
  // into a variable beyond this destructure and never logged or returned: it must be copied by a
  // human from the ElevenLabs dashboard into ELEVENLABS_WEBHOOK_SECRET, not printed by this script.
  const webhookId = created?.webhook_id;
  if (!webhookId) throw new WireAgentError("ElevenLabs workspace webhook creation response missing webhook_id");
  return { webhookId, created: true };
}

async function configurePostCallWebhook(apiKey: string, publicBaseUrl: string): Promise<boolean> {
  const { webhookId, created } = await upsertPostCallWebhook(apiKey, publicBaseUrl);
  await elevenlabsFetch(apiKey, "/v1/convai/settings", {
    method: "PATCH",
    body: JSON.stringify({
      webhooks: {
        post_call_webhook_id: webhookId,
        events: ["transcript"],
      },
    }),
  });
  return created;
}

export interface WireAgentSummary {
  agentId: string;
  toolIds: Record<string, string>;
  postCallWebhookUrl: string;
  postCallWebhookCreated: boolean;
  secretName: string;
}

export async function wireElevenLabsAgent(): Promise<WireAgentSummary> {
  const env = readRequiredEnv();
  const cfg = loadClient();
  const prompt = buildSystemPrompt(cfg);

  const secretId = await upsertWorkspaceSecret(env.apiKey, env.serverToolToken);

  const specs = toolSpecs(env.publicBaseUrl);
  const toolIds: Record<string, string> = {};
  for (const spec of specs) {
    toolIds[spec.name] = await upsertTool(env.apiKey, spec, env.publicBaseUrl, secretId);
  }

  const { agentId, postCallWebhookCreated } = await upsertAgent(env.apiKey, prompt, Object.values(toolIds), env.publicBaseUrl, cfg);

  return {
    agentId,
    toolIds,
    postCallWebhookUrl: `${env.publicBaseUrl}/webhook/voice/post-call`,
    postCallWebhookCreated,
    secretName: SECRET_NAME,
  };
}

function printSummary(summary: WireAgentSummary) {
  console.log("VOICE_WIRE_AGENT_SUMMARY_START");
  console.log(`agent_id=${summary.agentId}`);
  for (const [name, id] of Object.entries(summary.toolIds)) console.log(`tool_id[${name}]=${id}`);
  console.log(`post_call_webhook=${summary.postCallWebhookUrl}`);
  console.log(`secret_name=${summary.secretName}`);
  if (summary.postCallWebhookCreated) {
    console.log(
      "post-call webhook created; copy its HMAC secret from the ElevenLabs dashboard (Webhooks section) into the Render env as ELEVENLABS_WEBHOOK_SECRET, then redeploy",
    );
  }
  console.log("VOICE_WIRE_AGENT_OK");
}

export async function runWireAgentCli() {
  try {
    const summary = await wireElevenLabsAgent();
    printSummary(summary);
  } catch (e: any) {
    console.error("VOICE_WIRE_AGENT_FAILED");
    console.error(String(e?.message ?? e));
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) runWireAgentCli();
