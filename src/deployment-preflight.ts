import { loadClient } from "./config.js";
import { printDeploymentCheck, validateDeploymentReadiness } from "./readiness.js";

function marker(readiness: ReturnType<typeof validateDeploymentReadiness>) {
  if (!readiness.ok) return process.env.ALLOW_DEPLOYMENT_BLOCKERS === "true" ? "DEPLOYMENT_PREFLIGHT_REVIEW_ONLY" : "DEPLOYMENT_PREFLIGHT_BLOCKED";
  return readiness.warnings.length > 0 ? "DEPLOYMENT_PREFLIGHT_OK_WITH_WARNINGS" : "DEPLOYMENT_PREFLIGHT_OK";
}

function main() {
  const readiness = validateDeploymentReadiness(loadClient());
  const report = {
    marker: marker(readiness),
    ok: readiness.ok,
    generatedAt: readiness.generatedAt,
    blockerCount: readiness.blockers.length,
    warningCount: readiness.warnings.length,
    checks: readiness.checks,
    blockers: readiness.blockers,
    warnings: readiness.warnings,
  };

  if (process.env.DEPLOYMENT_PREFLIGHT_JSON === "true") {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log("DEPLOYMENT_PREFLIGHT_START");
    for (const check of readiness.checks) printDeploymentCheck(check);
    console.log(`deployment_blockers=${readiness.blockers.length}`);
    console.log(`deployment_warnings=${readiness.warnings.length}`);

    if (!readiness.ok) {
      console.log("DEPLOYMENT_PREFLIGHT_BLOCKED");
      if (process.env.ALLOW_DEPLOYMENT_BLOCKERS === "true") console.log("DEPLOYMENT_PREFLIGHT_REVIEW_ONLY");
    } else {
      console.log(report.marker);
    }
  }

  if (!readiness.ok && process.env.ALLOW_DEPLOYMENT_BLOCKERS !== "true") process.exit(1);
}

main();
