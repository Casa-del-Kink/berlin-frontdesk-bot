// Fail-closed DB check for Render's preDeployCommand.
//
// This is deliberately minimal: connect, SELECT 1, exit. A non-zero exit here fails the Render
// deploy itself, which is the point (see render.yaml comment header) -- a deploy that cannot
// reach its database should never go live. Any full schema/CRUD proof stays in the manual
// `npm run postgres:smoke` tool; this script must not run migrations or write data.
import pg from "pg";

const { Pool } = pg;

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL (or POSTGRES_URL) is not set. Configure it in the Render dashboard env vars.",
    );
  }

  const pool = new Pool({
    connectionString,
    ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: false } : undefined,
  });

  try {
    const result = await pool.query("select 1");
    if (result.rows[0]?.["?column?"] !== 1) {
      throw new Error("unexpected result from SELECT 1");
    }
    console.log("POSTGRES_PREFLIGHT_OK");
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  const message = e instanceof Error ? e.message : String(e);
  console.error(`postgres:preflight failed: ${message}`);
  process.exit(1);
});
