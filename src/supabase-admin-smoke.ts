async function main() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for npm run supabase:admin:smoke");
  }

  const { supabaseAdmin } = await import("./supabase-admin.js");
  const { data, error } = await supabaseAdmin.from("leads").select("id", { count: "exact", head: true });

  if (error) {
    // PGRST205 means the table is missing. That is still useful signal: auth worked,
    // but Postgres schema has not been created by the app's pg migration path yet.
    throw new Error(`Supabase admin query failed: ${error.code ?? "unknown"} ${error.message}`);
  }

  console.log("SUPABASE_ADMIN_SMOKE_OK");
  console.log(`leads_table_head=${JSON.stringify(data)}`);
}

main().catch((err) => {
  console.error("SUPABASE_ADMIN_SMOKE_FAILED");
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
