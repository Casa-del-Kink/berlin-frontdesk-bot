function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value?.trim()) throw new Error(`${name} is required for Supabase admin API client`);
  return value.trim();
}

export function supabaseUrl() {
  return requiredEnv("SUPABASE_URL").replace(/\/$/, "");
}

export function supabaseSecretKey() {
  return requiredEnv("SUPABASE_SECRET_KEY");
}

export function supabaseRestUrl(path: string) {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${supabaseUrl()}/rest/v1${normalized}`;
}

export function supabaseAdminHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    apikey: supabaseSecretKey(),
    ...extra,
  };
}

export async function supabaseAdminFetch(path: string, init: Omit<RequestInit, "headers"> & { headers?: Record<string, string> } = {}) {
  return fetch(supabaseRestUrl(path), {
    ...init,
    headers: supabaseAdminHeaders(init.headers),
  });
}
