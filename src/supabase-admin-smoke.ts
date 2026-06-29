type SupabaseErrorPayload = {
  code?: string;
  message?: string;
  hint?: string;
  details?: string;
};

function isMissingTable(error: SupabaseErrorPayload) {
  return error.code === "PGRST205" || error.message?.includes("Could not find the table") || error.message?.includes("does not exist");
}

async function parseBody(res: Response) {
  const text = await res.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

async function main() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) {
    throw new Error("SUPABASE_URL and SUPABASE_SECRET_KEY are required for npm run supabase:admin:smoke");
  }

  const { supabaseAdminFetch } = await import("./supabase-admin.js");
  const res = await supabaseAdminFetch("/leads?select=id&limit=0", {
    method: "GET",
    headers: { prefer: "count=exact" },
  });
  const body = (await parseBody(res)) as SupabaseErrorPayload | undefined;

  if (!res.ok) {
    if (body && isMissingTable(body)) {
      console.log("SUPABASE_ADMIN_SMOKE_OK_SCHEMA_PENDING");
      console.log(`schema_warning=${body.code ?? "unknown"} ${body.message}`);
      return;
    }
    throw new Error(`Supabase admin REST query failed: ${res.status} ${body?.code ?? "unknown"} ${body?.message ?? res.statusText}`);
  }

  console.log("SUPABASE_ADMIN_SMOKE_OK");
  console.log(`leads_table_count=${res.headers.get("content-range") ?? "unknown"}`);
}

main().catch((err) => {
  console.error("SUPABASE_ADMIN_SMOKE_FAILED");
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
