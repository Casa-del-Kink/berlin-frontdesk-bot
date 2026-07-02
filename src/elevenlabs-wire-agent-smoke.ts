import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import assert from "node:assert";

// Proves src/elevenlabs-wire-agent.ts against a local mock ElevenLabs HTTP server, without any
// real network call or API key. Run with: npm run voice:wire-agent:smoke

const require = createRequire(import.meta.url);
const TSX_CLI = require.resolve("tsx/cli");
const SERVER_TOOL_TOKEN_SECRET = "wire-agent-smoke-server-tool-token-value";
const API_KEY_SECRET = "wire-agent-smoke-api-key-should-never-print";

interface CapturedRequest {
  method?: string;
  url?: string;
  body?: unknown;
  headers: Record<string, string | string[] | undefined>;
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      if (!body) return resolve(undefined);
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

function writeJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

interface MockState {
  secrets: { secret_id: string; name: string }[];
  tools: { id: string; tool_config: any }[];
  agents: { agent_id: string; name: string; conversation_config: any }[];
  workspaceWebhooks: { webhook_id: string; name: string; webhook_url: string; auth_type: string }[];
  convaiSettings: { webhooks?: { post_call_webhook_id: string; events: string[] } };
}

function freshState(): MockState {
  return { secrets: [], tools: [], agents: [], workspaceWebhooks: [], convaiSettings: {} };
}

async function withMockElevenLabs<T>(fn: (baseUrl: string, captured: CapturedRequest[], state: MockState) => Promise<T>): Promise<T> {
  const captured: CapturedRequest[] = [];
  const state = freshState();
  let secretCounter = 0;
  let toolCounter = 0;
  let agentCounter = 0;
  let webhookCounter = 0;

  const server = createServer(async (req, res) => {
    try {
      const body = (await readBody(req)) as any;
      captured.push({ method: req.method, url: req.url, body, headers: req.headers });

      if (req.method === "GET" && req.url === "/v1/convai/secrets") return writeJson(res, 200, { secrets: state.secrets });
      if (req.method === "POST" && req.url === "/v1/convai/secrets") {
        const secret = { secret_id: `secret_${++secretCounter}`, name: body.name };
        state.secrets.push(secret);
        return writeJson(res, 200, secret);
      }

      if (req.method === "GET" && req.url === "/v1/convai/tools") return writeJson(res, 200, { tools: state.tools });
      if (req.method === "POST" && req.url === "/v1/convai/tools") {
        const tool = { id: `tool_${++toolCounter}`, tool_config: body.tool_config };
        state.tools.push(tool);
        return writeJson(res, 200, tool);
      }
      if (req.method === "PATCH" && req.url?.startsWith("/v1/convai/tools/")) {
        const id = req.url.split("/").pop();
        const tool = state.tools.find((t) => t.id === id);
        if (tool) tool.tool_config = body.tool_config;
        return writeJson(res, 200, tool ?? {});
      }

      if (req.method === "GET" && req.url === "/v1/convai/agents") return writeJson(res, 200, { agents: state.agents });
      if (req.method === "POST" && req.url === "/v1/convai/agents/create") {
        const agent = { agent_id: `agent_${++agentCounter}`, name: body.name, conversation_config: body.conversation_config };
        state.agents.push(agent);
        return writeJson(res, 200, { agent_id: agent.agent_id });
      }
      if (req.method === "PATCH" && req.url?.startsWith("/v1/convai/agents/")) {
        const id = req.url.split("/").pop();
        const agent = state.agents.find((a) => a.agent_id === id);
        if (agent) {
          if (body.name) agent.name = body.name;
          if (body.conversation_config) agent.conversation_config = body.conversation_config;
        }
        return writeJson(res, 200, agent ?? {});
      }

      // Post-call delivery: a workspace webhook object registered once, then referenced by id
      // from workspace Conversational AI settings. Mirrors the documented two-step shape (see
      // elevenlabs-wire-agent.ts configurePostCallWebhook), not an inline agent field.
      if (req.method === "GET" && req.url === "/v1/workspace/webhooks") return writeJson(res, 200, { webhooks: state.workspaceWebhooks });
      if (req.method === "POST" && req.url === "/v1/workspace/webhooks") {
        const webhook = {
          webhook_id: `wh_${++webhookCounter}`,
          name: body.settings?.name,
          webhook_url: body.settings?.webhook_url,
          auth_type: body.settings?.auth_type,
        };
        state.workspaceWebhooks.push(webhook);
        return writeJson(res, 200, { webhook_id: webhook.webhook_id, webhook_secret: `whsec_${webhookCounter}` });
      }

      if (req.method === "PATCH" && req.url === "/v1/convai/settings") {
        if (body.webhooks) state.convaiSettings.webhooks = body.webhooks;
        return writeJson(res, 200, state.convaiSettings);
      }

      writeJson(res, 404, { error: `unexpected ${req.method} ${req.url}` });
    } catch (err) {
      writeJson(res, 500, { error: err instanceof Error ? err.message : String(err) });
    }
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address === "object");
  try {
    return await fn(`http://127.0.0.1:${address.port}`, captured, state);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
}

interface RunResult {
  status: number | null;
  stdout: string;
  stderr: string;
  combined: string;
}

// Uses async spawn (not spawnSync) because the mock ElevenLabs server runs in this same process's
// event loop; a synchronous spawn would block that loop and the child's HTTP requests would hang.
function runWireAgent(mockBaseUrl: string, extraEnv: Record<string, string | undefined> = {}): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [TSX_CLI, "src/elevenlabs-wire-agent.ts"], {
      env: {
        ...process.env,
        CLIENT_FILE: "clients/salon-demo.yaml",
        ELEVENLABS_API_BASE_URL: mockBaseUrl,
        ...extraEnv,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += String(chunk)));
    child.stderr.on("data", (chunk) => (stderr += String(chunk)));

    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`elevenlabs-wire-agent.ts timed out\nstdout: ${stdout}\nstderr: ${stderr}`));
    }, 15_000);

    child.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
    child.on("close", (status) => {
      clearTimeout(timeout);
      resolve({ status, stdout, stderr, combined: `${stdout}${stderr}` });
    });
  });
}

function assertNoSecretLeak(text: string) {
  assert(!text.includes(SERVER_TOOL_TOKEN_SECRET), "wire-agent output must never print the real SERVER_TOOL_TOKEN");
  assert(!text.includes(API_KEY_SECRET), "wire-agent output must never print the real ELEVENLABS_API_KEY");
}

async function main() {
  // 1. Missing-env fail-closed: no env at all. Points at an unroutable base so, if the fail-closed
  // check ever regressed, this would time out loudly rather than silently reaching a real host.
  const missingEnvResult = await runWireAgent("http://127.0.0.1:1", { ELEVENLABS_API_KEY: "", VOICE_AGENT_PUBLIC_BASE_URL: "", SERVER_TOOL_TOKEN: "" });
  assert.notEqual(missingEnvResult.status, 0, "missing env should exit non-zero");
  assert(missingEnvResult.combined.includes("VOICE_WIRE_AGENT_FAILED"), `missing-env run should print failure marker: ${missingEnvResult.combined}`);
  assert(missingEnvResult.combined.includes("ELEVENLABS_API_KEY"), `missing-env failure should name the missing var: ${missingEnvResult.combined}`);
  assert(missingEnvResult.combined.includes("VOICE_AGENT_PUBLIC_BASE_URL"), `missing-env failure should name the missing var: ${missingEnvResult.combined}`);
  assert(missingEnvResult.combined.includes("SERVER_TOOL_TOKEN"), `missing-env failure should name the missing var: ${missingEnvResult.combined}`);

  await withMockElevenLabs(async (baseUrl, captured, state) => {
    // 2. First run: creates secret + agent + 3 tools + post-call config.
    const first = await runWireAgent(baseUrl, {
      ELEVENLABS_API_KEY: API_KEY_SECRET,
      VOICE_AGENT_PUBLIC_BASE_URL: "https://tilda-demo.example.com",
      SERVER_TOOL_TOKEN: SERVER_TOOL_TOKEN_SECRET,
    });
    assert.equal(first.status, 0, `first wire-agent run should succeed: ${first.combined}`);
    assert(first.stdout.includes("VOICE_WIRE_AGENT_OK"), `first run should print success marker: ${first.combined}`);
    assertNoSecretLeak(first.combined);

    assert.equal(state.secrets.length, 1, "exactly one workspace secret should be created");
    assert.equal(state.tools.length, 3, "exactly three tools should be created");
    assert.equal(state.agents.length, 1, "exactly one agent should be created");

    const toolUrls = state.tools.map((t) => t.tool_config.api_schema.url);
    for (const url of toolUrls) assert(url.startsWith("https://tilda-demo.example.com/tools/"), `tool url should point at public base: ${url}`);
    for (const tool of state.tools) {
      assert.deepEqual(tool.tool_config.api_schema.request_headers.Authorization, { secret_id: state.secrets[0].secret_id }, "tool auth should reference the workspace secret, not a raw value");
    }

    const agent = state.agents[0];
    const prompt: string = agent.conversation_config.agent.prompt.prompt;
    assert(prompt.includes("AI DISCLOSURE"), "agent prompt should carry the AI disclosure instruction");
    assert(prompt.includes("Glanz & Schnitt Berlin"), "agent prompt should carry the client's approved disclosure text");
    const emDash = String.fromCharCode(0x2014);
    assert(!prompt.includes(emDash), "agent prompt must not contain an em dash");
    // The base prompt is allowed to state the out-of-scope policy line below; any other
    // mention on this channel would be a real style regression, since the voice agent must
    // never tell a caller that texting is an option.
    for (const line of prompt.split("\n")) {
      if (/\bsms\b/i.test(line)) {
        assert(/sms is out of scope|do not offer sms/i.test(line), `unexpected mention, expected only the "sms is out of scope" policy line: ${line}`);
      }
    }
    const firstMessage: string = agent.conversation_config.agent.first_message;
    assert(firstMessage.includes("Glanz & Schnitt Berlin"), `first_message should use the client config's name, not a hardcoded literal: ${firstMessage}`);

    // Post-call delivery: exactly one workspace webhook registered, then referenced by id from
    // workspace Conversational AI settings (the documented two-step shape, not an inline agent field).
    assert.equal(state.workspaceWebhooks.length, 1, "exactly one workspace webhook should be created");
    assert.equal(state.workspaceWebhooks[0].webhook_url, "https://tilda-demo.example.com/webhook/voice/post-call", "workspace webhook should point at the public base");
    assert.equal(state.workspaceWebhooks[0].auth_type, "hmac", "workspace webhook should use hmac auth");
    assert.equal(state.convaiSettings.webhooks?.post_call_webhook_id, state.workspaceWebhooks[0].webhook_id, "convai settings should reference the workspace webhook by id");
    assert.deepEqual(state.convaiSettings.webhooks?.events, ["transcript"], "convai settings should subscribe to the transcript event");

    // 3. Idempotent re-run: updates instead of duplicating.
    const second = await runWireAgent(baseUrl, {
      ELEVENLABS_API_KEY: API_KEY_SECRET,
      VOICE_AGENT_PUBLIC_BASE_URL: "https://tilda-demo.example.com",
      SERVER_TOOL_TOKEN: SERVER_TOOL_TOKEN_SECRET,
    });
    assert.equal(second.status, 0, `second wire-agent run should succeed: ${second.combined}`);
    assertNoSecretLeak(second.combined);
    assert.equal(state.secrets.length, 1, "re-run should reuse the existing secret, not duplicate it");
    assert.equal(state.tools.length, 3, "re-run should update existing tools, not duplicate them");
    assert.equal(state.agents.length, 1, "re-run should update the existing agent, not duplicate it");
    assert.equal(state.workspaceWebhooks.length, 1, "re-run should reuse the existing workspace webhook, not duplicate it");

    for (const req of captured) {
      if (typeof req.headers?.["xi-api-key"] === "string") {
        assert.notEqual(req.headers["xi-api-key"], undefined);
      }
    }
  });

  console.log("VOICE_WIRE_AGENT_SMOKE_OK");
}

main().catch((err) => {
  console.error("VOICE_WIRE_AGENT_SMOKE_FAILED");
  console.error(err instanceof Error ? (err.stack ?? err.message) : err);
  process.exit(1);
});
