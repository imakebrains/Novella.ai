/* ============================================================
   Who is signed in to the cloud

   A small store in the shape of src/state/projects.ts, so any
   component can follow the session with useSyncExternalStore.

   This is the ONLY module that creates the Supabase client. That is
   not tidiness: cloudClient() keeps whatever `secrets` its first caller
   passed, and on desktop a first call without the keychain would put
   the whole session — refresh token included — in plain localStorage
   for the rest of the run. So everything else in the app reaches the
   client through appClient() here, and the access token through
   accessToken() / hostedAccess(), never by calling cloudClient() itself.

   Sign-in paths, and why there are two:
   - An emailed code works everywhere, the desktop included,
     because nothing has to come back through a redirect.
   - Google works only in the browser build. The desktop has no
     deep-link plugin (src-tauri has fs, dialog and log only), so a
     Google sign-in opened in the system browser could never hand its
     session back to the app. docs/CLOUD.md lists the plugin as the
     owner's call.
   ============================================================ */

import { useSyncExternalStore } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isTauri } from "../storage/adapter";
import { cloudConfig, cloudEnabled } from "./config";
import { cloudClient } from "./supabaseRemote";
import { keychainSecrets } from "./keychainSecrets";
import { cloudUserFrom, friendlyAuthError, normalizeCode, normalizeEmail, type CloudUser } from "./authCore";
import type { HostedAccess } from "./hostedAi";

export type SessionState =
  | { status: "off"; user: null }
  | { status: "signed-out"; user: null }
  | { status: "signed-in"; user: CloudUser };

const OFF: SessionState = { status: "off", user: null };
const SIGNED_OUT: SessionState = { status: "signed-out", user: null };

let snapshot: SessionState = cloudEnabled() ? SIGNED_OUT : OFF;
const listeners = new Set<() => void>();
let booted: Promise<SupabaseClient | null> | null = null;

function same(a: SessionState, b: SessionState): boolean {
  if (a.status !== b.status) return false;
  if (!a.user || !b.user) return a.user === b.user;
  return a.user.id === b.user.id && a.user.email === b.user.email && a.user.name === b.user.name && a.user.avatarUrl === b.user.avatarUrl;
}

// supabase-js reports the same session on every token refresh; a new
// object each time would re-render every subscriber hourly for nothing.
function publish(next: SessionState): void {
  if (same(snapshot, next)) return;
  snapshot = next;
  for (const l of listeners) l();
}

function stateOf(rawUser: unknown): SessionState {
  const user = cloudUserFrom(rawUser);
  return user ? { status: "signed-in", user } : SIGNED_OUT;
}

/** Start the cloud session, once per window. Called from main.tsx at
    startup rather than when Settings opens: the browser build comes
    back from Google with ?code= in the address, and only a client that
    exists by then exchanges it for a session. */
export function bootCloudAuth(): Promise<SupabaseClient | null> {
  booted ??= (async () => {
    if (!cloudEnabled()) return null;
    const client = await cloudClient(isTauri() ? keychainSecrets() : undefined);
    if (!client) return null;
    // Synchronous on purpose: supabase-js holds a lock while it runs
    // these callbacks, and awaiting another auth call inside one hangs.
    client.auth.onAuthStateChange((_event, session) => publish(stateOf(session?.user)));
    try {
      const { data } = await client.auth.getSession();
      publish(stateOf(data.session?.user));
    } catch {
      // An unreadable keychain half reads as signed out — the same
      // outcome sessionStorage.ts chooses for a missing one.
      publish(SIGNED_OUT);
    }
    // supabase-js strips ?code= after a successful exchange but leaves
    // it after a failed one, and a reload would then retry a code the
    // server has already spent. Only the OAuth return's own parameters
    // go; anything else in the address is somebody else's.
    if (!isTauri() && typeof location !== "undefined") {
      const url = new URL(location.href);
      const returned = OAUTH_RETURN_PARAMS.filter((p) => url.searchParams.has(p));
      if (returned.length > 0) {
        for (const p of returned) url.searchParams.delete(p);
        history.replaceState(history.state, "", url.toString());
      }
    }
    return client;
  })();
  return booted;
}

const OAUTH_RETURN_PARAMS = ["code", "error", "error_code", "error_description"];

/** Must match storageKey in supabaseRemote.ts. The plain half of a
    session sits here on both platforms (sessionStorage.ts). */
const SESSION_KEY = "novella.cloud.session";

/** The startup call (main.tsx). supabase-js is kept out of the entry
    chunk on purpose (supabaseRemote.ts, docs/AUDIT.md item 1), so it
    loads at startup only when there is a session to restore or a
    Google return to finish. Everyone else loads it the first time
    something asks appClient() — opening Settings → Account, say. */
export function bootCloudAuthAtStartup(): void {
  if (!cloudEnabled()) return;
  let stored = false;
  try {
    stored = globalThis.localStorage?.getItem(SESSION_KEY) != null;
  } catch {
    // storage blocked: nothing could have been restored from it anyway
  }
  const returning =
    !isTauri() && typeof location !== "undefined" && OAUTH_RETURN_PARAMS.some((p) => new URL(location.href).searchParams.has(p));
  if (stored || returning) void bootCloudAuth();
}

/** The client, for every other cloud module. See the header for why
    nothing may call cloudClient() directly. */
export function appClient(): Promise<SupabaseClient | null> {
  return bootCloudAuth();
}

/** The current access token, refreshed by supabase-js as needed.
    Handed straight to a request; never stored, logged or shown. */
export async function accessToken(): Promise<string | null> {
  const client = await appClient();
  if (!client) return null;
  const { data } = await client.auth.getSession();
  return data.session?.access_token ?? null;
}

/** What a call to one of our edge functions needs. The same shape the
    Novella AI provider takes, so that connection plugs straight in. */
export async function hostedAccess(): Promise<HostedAccess | null> {
  const config = cloudConfig();
  if (!config) return null;
  const token = await accessToken();
  return token ? { url: config.url, anonKey: config.anonKey, token } : null;
}

export const authStore = {
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
  getSnapshot: (): SessionState => snapshot,
  accessToken,
};

export function useCloudSession(): SessionState {
  return useSyncExternalStore(authStore.subscribe, authStore.getSnapshot, authStore.getSnapshot);
}

/** Google is offered only where its redirect can come home. */
export function googleAvailable(): boolean {
  return cloudEnabled() && !isTauri();
}

/** Run one sign-in step so that whatever goes wrong — an auth error
    returned, a network failure thrown, a keychain write refused while
    saving the new session — reaches the form as one of
    friendlyAuthError's sentences. The form shows err.message as is. */
async function friendly(step: (client: SupabaseClient) => Promise<{ error: unknown }>): Promise<void> {
  let failure: unknown = null;
  try {
    const client = await appClient();
    if (!client) throw new Error("no cloud configured");
    failure = (await step(client)).error;
  } catch (err) {
    failure = err ?? "unknown";
  }
  if (failure) throw new Error(friendlyAuthError(failure));
}

/** Browser only. Leaves the page for Google and comes back to it. */
export async function signInWithGoogle(): Promise<void> {
  if (!googleAvailable()) throw new Error("On the desktop app, sign in with an emailed code.");
  await friendly((client) =>
    client.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: location.origin + location.pathname },
    }),
  );
}

/** Ask for an emailed code. No emailRedirectTo: the email templates
    carry {{ .Token }} (docs/CLOUD.md), so the code is the whole path
    and the desktop never needs a link to come back through. */
export async function signInWithEmailCode(email: string): Promise<void> {
  await friendly((client) =>
    client.auth.signInWithOtp({
      email: normalizeEmail(email),
      options: { shouldCreateUser: true },
    }),
  );
}

/** Trade the code for a session; onAuthStateChange then publishes
    the signed-in state. */
export async function verifyEmailCode(email: string, code: string): Promise<void> {
  await friendly((client) =>
    client.auth.verifyOtp({
      email: normalizeEmail(email),
      token: normalizeCode(code),
      type: "email",
    }),
  );
}

/** Sign out everywhere this session reached. auth-js removes the local
    copy — both halves, the keychain one through
    splitSessionStorage.removeItem — whatever the server says, and
    ignores the 401/403/404 a dead token or a deleted user gets back.
    So this is also the right call after the account is deleted. */
export async function signOut(): Promise<void> {
  try {
    const client = await appClient();
    if (client) await client.auth.signOut();
  } finally {
    publish(cloudEnabled() ? SIGNED_OUT : OFF);
  }
}
