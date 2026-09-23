/* ============================================================
   Cloud configuration

   Two values, both PUBLIC by design: the project URL and the
   publishable (anon) key. Supabase's security model assumes the
   browser holds them; what protects a writer's book is row level
   security in the database, not secrecy of this key. Anything that
   IS secret — the service-role key, the Anthropic key, the billing
   webhook secret — lives only in the Supabase function secrets and
   never in this repository or this bundle (docs/CLOUD.md).

   Missing values mean the cloud is simply off: no sign-in button, no
   sync, the app exactly as it was. That is the state of every build
   until the owner creates the project, which is also why nothing
   here may throw at import time.
   ============================================================ */

export interface CloudConfig {
  url: string;
  anonKey: string;
}

/** PURE. Validate raw values from the environment. */
export function parseCloudConfig(url: unknown, anonKey: unknown): CloudConfig | null {
  if (typeof url !== "string" || typeof anonKey !== "string") return null;
  const u = url.trim();
  const k = anonKey.trim();
  if (!u || !k) return null;
  let parsed: URL;
  try {
    parsed = new URL(u);
  } catch {
    return null;
  }
  // A plain-http project URL would send session tokens in the clear.
  // localhost is the one exception: `supabase start` serves http.
  const local = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  if (parsed.protocol !== "https:" && !(local && parsed.protocol === "http:")) return null;
  return { url: parsed.origin, anonKey: k };
}

/** The build's cloud config, or null when the cloud is off. */
export function cloudConfig(): CloudConfig | null {
  const env = (import.meta as { env?: Record<string, unknown> }).env;
  if (!env) return null;
  return parseCloudConfig(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
}

export function cloudEnabled(): boolean {
  return cloudConfig() !== null;
}
