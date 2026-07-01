import { renderLandingPage } from "./landing.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function fetchLanding(baseUrl: string) {
  const res = await fetch(baseUrl.replace(/\/$/, "/"));
  const body = await res.text();
  return { res, body };
}

function assertLandingContract(body: string, source: string) {
  assert(body.includes("CallTilder is the AI reception"), `${source}: missing CallTilder AI reception positioning`);
  assert(body.includes("independent Berlin salons and barbers"), `${source}: missing narrow salon/barber scope`);
  assert(body.includes("Ich bin die KI-Rezeption"), `${source}: missing German AI disclosure`);
  assert(body.includes("Short summaries only by default"), `${source}: missing summary-only data posture`);
  assert(body.includes("Human handoff"), `${source}: missing human handoff section`);
  assert(body.includes("Operator:"), `${source}: missing operator footer`);
  assert(body.includes("Contact:"), `${source}: missing contact footer`);
  assert(body.includes("Privacy:"), `${source}: missing privacy footer`);
  assert(!body.toLowerCase().includes("dog grooming"), `${source}: must not broaden to dog grooming`);
  assert(!body.toLowerCase().includes("massage"), `${source}: must not broaden to massage`);
  assert(!body.toLowerCase().includes("beauty/nails"), `${source}: must not broaden to beauty/nails`);
}

async function main() {
  const local = renderLandingPage();
  assertLandingContract(local, "local render");

  const hostedBase = process.env.HOSTED_LANDING_BASE_URL;
  let hostedChecked = false;
  let hostedStatus: number | null = null;

  if (hostedBase) {
    const { res, body } = await fetchLanding(hostedBase);
    hostedStatus = res.status;
    assert(res.ok, `hosted landing should return 2xx, got ${res.status}`);
    assert(res.headers.get("content-type")?.includes("text/html"), `hosted landing should be HTML: ${res.headers.get("content-type")}`);
    assertLandingContract(body, hostedBase);
    hostedChecked = true;
  }

  console.log("LANDING_CONTRACT_SMOKE_OK");
  console.log(
    JSON.stringify(
      {
        localRender: true,
        hostedChecked,
        hostedStatus,
        hostedPrereq: hostedChecked ? "checked" : "set HOSTED_LANDING_BASE_URL after deployment",
        requiredScope: "Berlin salons/barbers",
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
