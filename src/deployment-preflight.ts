import { loadClient } from "./config.js";
import { printDeploymentCheck, validateDeploymentReadiness } from "./readiness.js";

function main() {
  const readiness = validateDeploymentReadiness(loadClient());

  console.log("DEPLOYMENT_PREFLIGHT_START");
  for (const check of readiness.checks) printDeploymentCheck(check);
  console.log(`deployment_blockers=${readiness.blockers.length}`);
  console.log(`deployment_warnings=${readiness.warnings.length}`);

  if (!readiness.ok) {
    console.log("DEPLOYMENT_PREFLIGHT_BLOCKED");
    if (process.env.ALLOW_DEPLOYMENT_BLOCKERS === "true") {
      console.log("DEPLOYMENT_PREFLIGHT_REVIEW_ONLY");
      return;
    }
    process.exit(1);
  }

  console.log(readiness.warnings.length > 0 ? "DEPLOYMENT_PREFLIGHT_OK_WITH_WARNINGS" : "DEPLOYMENT_PREFLIGHT_OK");
}

main();
