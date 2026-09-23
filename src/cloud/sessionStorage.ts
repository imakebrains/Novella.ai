/* ============================================================
   Where a signed-in session is kept

   supabase-js persists its session as one JSON string under one key.
   That string holds a refresh token, which is a long-lived credential:
   anyone holding it can mint access tokens for the writer's account
   until it is revoked. The house rule (CLAUDE.md) is that credentials
   live in the OS credential store, never in plain browser storage, on
   any platform that has one.

   The catch is size. Windows Credential Manager refuses secrets over
   2,560 bytes, and a session carrying a Google profile (name, avatar
   URL, identities) routinely exceeds that. So the session is SPLIT:
   the refresh token alone goes to the keychain, and the rest — an
   access token that expires within the hour and the public profile —
   stays in ordinary storage. Reassembly happens on read. If the
   keychain half is missing the whole session reads as absent, which
   signs the writer out rather than leaving a half-valid session.

   In a plain browser there is no OS store, and localStorage is what
   supabase-js uses by default; `plainSessionStorage` is that, named.
   ============================================================ */

/** The subset of supabase-js's SupportedStorage this module provides. */
export interface SessionStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export interface SecretStore {
  get(name: string): Promise<string | null>;
  set(name: string, value: string): Promise<void>;
  remove(name: string): Promise<void>;
}

export interface PlainStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const REFRESH_FIELD = "refresh_token";
/** Marks a stored session whose refresh token lives elsewhere. */
const SPLIT_MARK = "__novella_split";

function secretName(key: string): string {
  return `cloud-session:${key}`;
}

/** PURE-ish: all side effects go through the two stores it is given,
    which is what lets test-cloud.ts prove the split with maps. */
export function splitSessionStorage(secrets: SecretStore, plain: PlainStore): SessionStore {
  return {
    async getItem(key) {
      const raw = plain.getItem(key);
      if (raw === null) return null;
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        // Not JSON: one of supabase-js's small plain values (the PKCE
        // verifier). Handed back exactly as stored.
        return raw;
      }
      if (!parsed || typeof parsed !== "object") return raw;
      if (parsed[SPLIT_MARK] !== true) {
        // A whole session sitting in plain storage — written before
        // the split existed, or by something else. Treat it as signed
        // out and wipe it, rather than trust a refresh token found here.
        if (typeof parsed[REFRESH_FIELD] === "string") {
          plain.removeItem(key);
          return null;
        }
        return raw;
      }
      const refresh = await secrets.get(secretName(key));
      if (!refresh) return null;
      const { [SPLIT_MARK]: _mark, ...rest } = parsed;
      return JSON.stringify({ ...rest, [REFRESH_FIELD]: refresh });
    },

    async setItem(key, value) {
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(value) as Record<string, unknown>;
      } catch {
        // supabase-js also stores small non-session values (the PKCE
        // code verifier). They are single-use and short-lived; keep
        // them in plain storage untouched.
        plain.setItem(key, value);
        return;
      }
      if (!parsed || typeof parsed !== "object" || typeof parsed[REFRESH_FIELD] !== "string") {
        plain.setItem(key, value);
        return;
      }
      const { [REFRESH_FIELD]: refresh, ...rest } = parsed;
      // Secret first. A crash between the two writes then leaves the
      // new refresh token beside the old access token, which supabase-js
      // simply refreshes; the other order could leave a plain half
      // pointing at a refresh token the server already rotated away.
      await secrets.set(secretName(key), refresh as string);
      plain.setItem(key, JSON.stringify({ ...rest, [SPLIT_MARK]: true }));
    },

    async removeItem(key) {
      plain.removeItem(key);
      await secrets.remove(secretName(key));
    },
  };
}

/** The browser default, spelled out so both paths share one type. */
export function plainSessionStorage(plain: PlainStore): SessionStore {
  return {
    async getItem(key) {
      return plain.getItem(key);
    },
    async setItem(key, value) {
      plain.setItem(key, value);
    },
    async removeItem(key) {
      plain.removeItem(key);
    },
  };
}
