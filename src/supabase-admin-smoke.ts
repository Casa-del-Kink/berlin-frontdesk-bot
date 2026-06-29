type SupabaseError = {
  code?: string;
  message?: string;
};

function isMissingTable(error: SupabaseError) {
  return error.code === "PGRST205" || error.message?.includes("Could not find the table") || error.message?.includes("does not exist");
}

async function main() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for npm run supabase:admin:smoke");
  }

  const { supabaseAdmin } = await import("./supabase-admin.js");
  const { data, error, count } = await supabaseAdmin.from("leads").select("id", { count: "exact", head: true });

  if (error) {
    // A missing table means the service role key reached Supabase successfully, but the app's
    // direct Postgres migration smoke has not created the schema yet. Treat that as admin auth OK
    // and print a schema warning instead of failing the API credential check.
    if (isMissingTable(error)) {
      console.log("SUPABASE_ADMIN_SMOKE_OK_SCHEMA_PENDING");
      console.log(`schema_warning=${error.code ?? "unknown"} ${error.message}`);
      return;
    }
    throw new Error(`Supabase admin query failed: ${error.code ?? "unknown"} ${error.message}`);
  }

  console.log("SUPABASE_ADMIN_SMOKE_OK");
  console.log(`leads_table_head=${JSON.stringify(data)}`);
  console.log(`leads_table_count=${count ?? "unknown"}`);
}

main().catch((err) => {
  console.error("SUPABASE_ADMIN_SMOKE_FAILED");
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
