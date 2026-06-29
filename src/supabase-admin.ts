import { createClient } from "@supabase/supabase-js";

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value?.trim()) throw new Error(`${name} is required for Supabase admin client`);
  return value;
}

const supabaseUrl = requiredEnv("SUPABASE_URL");
const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");

// Server-only Supabase client. Never expose the service role key to browsers,
// client-side bundles, public logs, or customer-visible tooling.
export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
