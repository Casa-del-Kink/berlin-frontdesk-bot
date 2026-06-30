export {};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function fetchJson(url: string, init: RequestInit = {}) {
  const res = await fetch(url, init);
  const text = await res.text();
  let body: any = text;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    body = text;
  }
  return { res, body };
}

async function main() {
  const base = process.env.HOSTED_SMOKE_BASE_URL?.replace(/\/$/, "");
  const token = process.env.SERVER_TOOL_TOKEN;

  if (!base) {
    console.log("HOSTED_SMOKE_CONTRACT_SMOKE_OK");
    console.log(
      JSON.stringify(
        {
          hostedChecked: false,
          prereq: "set HOSTED_SMOKE_BASE_URL after deployment",
          tokenCheck: "set SERVER_TOOL_TOKEN to verify authorized readiness",
        },
        null,
        2,
      ),
    );
    return;
  }

  const health = await fetchJson(`${base}/health`);
  assert(health.res.ok, `hosted /health should return 2xx, got ${health.res.status} ${JSON.stringify(health.body)}`);
  assert(health.body?.ok === true, `hosted /health should return ok=true: ${JSON.stringify(health.body)}`);

  const unauth = await fetchJson(`${base}/readiness/live-pilot`);
  assert(unauth.res.status === 401, `readiness without bearer auth should be 401, got ${unauth.res.status}`);

  let authorizedStatus: number | null = null;
  let authorizedOk: boolean | null = null;
  let blockerCount: number | null = null;

  if (token) {
    const auth = await fetchJson(`${base}/readiness/live-pilot`, {
      headers: { authorization: `Bearer ${token}` },
    });
    authorizedStatus = auth.res.status;
    authorizedOk = Boolean(auth.body?.ok);
    blockerCount = Array.isArray(auth.body?.blockers) ? auth.body.blockers.length : null;
    assert(
      auth.res.status === 200 || auth.res.status === 409,
      `authorized readiness should be 200 or 409, got ${auth.res.status} ${JSON.stringify(auth.body)}`,
    );
    assert(typeof auth.body?.ok === "boolean", `authorized readiness should include boolean ok: ${JSON.stringify(auth.body)}`);
  }

  console.log("HOSTED_SMOKE_CONTRACT_SMOKE_OK");
  console.log(
    JSON.stringify(
      {
        hostedChecked: true,
        base,
        healthOk: true,
        unauthReadinessStatus: unauth.res.status,
        authorizedStatus,
        authorizedOk,
        blockerCount,
        tokenCheck: token ? "checked" : "set SERVER_TOOL_TOKEN to verify authorized readiness",
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
