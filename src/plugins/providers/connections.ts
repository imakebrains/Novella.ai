import { useSyncExternalStore } from "react";
import { pluginHost, type StreamingAIProvider } from "../runtime";
import { isTauri } from "../../storage";
import {
  connectionHealth,
  kindInfo,
  migrateLegacy,
  newConnectionId,
  normalizeRouting,
  parseConnections,
  routingAfterAdding,
  suggestRouting,
  type Connection,
  type ConnectionDraft,
  type Health,
  type Probe,
  type RoleId,
  type Routing,
} from "../../ai/roles";
import { makeOllamaProvider, listOllamaModels } from "./ollama";
import { makeAnthropicProvider, listClaudeModels } from "./anthropic";
import { makeOpenAICompatibleProvider, listRemoteModels } from "./openaiCompatible";

/* ============================================================
   Connections — the impure half of ai/roles.ts.

   Several accounts at once, each with its own key, model and
   health, plus the wiring that turns one into a live provider.
   It lives beside the providers because that is what it builds;
   every rule it obeys (fallback order, what counts as connected,
   what a bad key looks like) lives in ai/roles.ts where it can be
   tested without a network.

   WHERE THE KEYS ARE — stated plainly because it matters:

     Desktop (Tauri): the OS credential manager, through the same
     secret_set / secret_get / secret_delete commands the plugin
     host uses. Windows Credential Manager, macOS Keychain, Linux
     keyutils. Never in a file Novella writes, never in the vault,
     never in localStorage.

     Browser: memory only, for the life of the tab. There is no
     safe store in a browser, so nothing pretends there is.

   Connection records themselves (name, model, endpoint) are plain
   localStorage — they are not secrets, and losing them to a
   cleared browser store should cost a writer thirty seconds.
   ============================================================ */

const STORE_KEY = "novella.connections";
const ROUTING_KEY = "novella.roleRouting";
const SECRET_PREFIX = "novella.connection";
/* Set once the migration has run. Without it, a writer who deletes
   every connection would find them all back after a restart — an empty
   list and a fresh install look identical otherwise. */
const SEEDED_KEY = "novella.connections.seeded";

/* Three connections predate this file, as plugins. Their ids are kept
   so an upgrade doesn't orphan a key someone already typed, and their
   model settings stay mirrored both ways — the Assistant panel's model
   dropdown writes the plugin setting, and it must keep steering the
   local engine. */
const LEGACY_PLUGIN: Record<string, string> = {
  local: "provider-ollama-streaming",
  claude: "provider-anthropic",
  custom: "provider-openai-compatible",
};

/* ---------------- listeners ---------------- */

let version = 0;
const listeners = new Set<() => void>();

function emit(): void {
  version++;
  for (const l of listeners) l();
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/* ---------------- persistence ---------------- */

function readJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode, quota, a browser being difficult — the session
       still works, it just won't be remembered. */
  }
}

let cache: Connection[] | null = null;
let routingCache: Routing | null = null;

/** What the old plugin world had set up, read once for the migration. */
function legacySetup() {
  const ollama = pluginHost.settingsFor("provider-ollama-streaming");
  const claude = pluginHost.settingsFor("provider-anthropic");
  const custom = pluginHost.settingsFor("provider-openai-compatible");
  const str = (v: unknown): string | undefined =>
    typeof v === "string" && v.trim() ? v : undefined;

  return {
    activeSlash: localStorage.getItem("novella.activeProvider") || "/local",
    ollamaEnabled: pluginHost.isActive("provider-ollama-streaming"),
    ollamaModel: str(ollama.get("model")),
    anthropicEnabled: pluginHost.isActive("provider-anthropic"),
    anthropicModel: str(claude.get("model")),
    anthropicHasKey: Boolean(str(claude.get("apiKey"))),
    customEnabled: pluginHost.isActive("provider-openai-compatible"),
    customBaseUrl: str(custom.get("baseUrl")),
    customModel: str(custom.get("model")),
    customHasKey: Boolean(str(custom.get("apiKey"))),
  };
}

export function connections(): Connection[] {
  if (cache) return cache;

  const stored = parseConnections(readJson(STORE_KEY));
  let seeded = false;
  try {
    seeded = localStorage.getItem(SEEDED_KEY) === "1";
  } catch {
    /* no storage; treat as a first run */
  }

  if (stored.length > 0 || seeded) {
    cache = stored;
    return cache;
  }

  // Nothing saved and never seeded: build it from whatever the writer
  // already had, so upgrading finds their setup intact rather than an
  // empty screen.
  const migrated = migrateLegacy(legacySetup());
  cache = migrated.connections;
  routingCache = migrated.routing;
  writeJson(STORE_KEY, cache);
  writeJson(ROUTING_KEY, routingCache);
  try {
    localStorage.setItem(SEEDED_KEY, "1");
  } catch {
    /* it will simply seed again next time — no harm done */
  }
  return cache;
}

export function routing(): Routing {
  if (!routingCache) {
    const list = connections();
    const stored = normalizeRouting(readJson(ROUTING_KEY), list);
    // A store with connections but no routing (or one emptied by a
    // deletion) still needs every role answered.
    routingCache = Object.keys(stored).length > 0 ? stored : suggestRouting(list);
  }
  return routingCache;
}

function persist(): void {
  writeJson(STORE_KEY, cache ?? []);
  writeJson(ROUTING_KEY, routingCache ?? {});
  emit();
}

/* ---------------- secrets ---------------- */

const secrets = new Map<string, string>();
const probes = new Map<string, Probe>();

function secretName(id: string): string {
  return `${SECRET_PREFIX}.${id}.apiKey`;
}

async function keychain(): Promise<{
  get(name: string): Promise<string | null>;
  set(name: string, value: string): Promise<void>;
}> {
  const { invoke } = await import("@tauri-apps/api/core");
  return {
    async get(name) {
      return ((await invoke("secret_get", { name })) as string | null) ?? null;
    },
    async set(name, value) {
      if (value) await invoke("secret_set", { name, value });
      else await invoke("secret_delete", { name });
    },
  };
}

let hydration: Promise<void> | null = null;

/** Pull saved keys out of the OS credential manager. Desktop only —
    on the web there is nothing to pull, and nothing was ever written. */
export function ready(): Promise<void> {
  hydration ??= (async () => {
    if (!isTauri()) return;
    try {
      const kc = await keychain();
      for (const conn of connections()) {
        if (secrets.has(conn.id)) continue;
        let value = await kc.get(secretName(conn.id));
        // A key typed into the old Plugins tab lives under the plugin's
        // name. Adopt it rather than making someone paste it twice.
        const legacy = LEGACY_PLUGIN[conn.id];
        if (!value && legacy) value = await kc.get(`novella.plugin.${legacy}.apiKey`);
        if (value) secrets.set(conn.id, value);
      }
      emit();
    } catch {
      /* no keychain on this platform — memory-only, as on the web */
    }
  })();
  return hydration;
}

export function hasKey(id: string): boolean {
  return Boolean(secrets.get(id));
}

/** The key itself. Deliberately not exported to the UI: the connect
    flow writes keys and asks whether one exists, and never reads one
    back to put on screen. */
function keyFor(id: string): string {
  return secrets.get(id) ?? "";
}

export function setKey(id: string, key: string): void {
  const trimmed = key.trim();
  if (trimmed) secrets.set(id, trimmed);
  else secrets.delete(id);

  if (isTauri()) {
    void keychain()
      .then((kc) => kc.set(secretName(id), trimmed))
      .catch(() => {
        /* memory still has it for this session */
      });
  }

  // Keep the old plugin path working for anyone whose habits live there.
  const legacy = LEGACY_PLUGIN[id];
  if (legacy && legacy !== "provider-ollama-streaming") {
    pluginHost.settingsFor(legacy).set("apiKey", trimmed);
  }

  // A new key invalidates whatever the last test proved.
  probes.delete(id);
  emit();
}

/* ---------------- reading and writing connections ---------------- */

/** The model actually used. For the three migrated connections the
    plugin setting wins when it has a value, because the Assistant
    panel's model dropdown writes there — two screens, one answer. */
export function modelOf(conn: Connection): string {
  const legacy = LEGACY_PLUGIN[conn.id];
  if (legacy) {
    const fromPlugin = pluginHost.settingsFor(legacy).get("model");
    if (typeof fromPlugin === "string" && fromPlugin.trim()) return fromPlugin;
  }
  return conn.model || kindInfo(conn.kind).defaultModel;
}

export function baseUrlOf(conn: Connection): string {
  return conn.baseUrl?.trim() || kindInfo(conn.kind).defaultBaseUrl;
}

export function probeOf(id: string): Probe {
  const probe = probes.get(id);
  return { hasKey: hasKey(id), reachable: probe?.reachable ?? null, detail: probe?.detail, checkedAt: probe?.checkedAt };
}

export function healthOf(conn: Connection): Health {
  return connectionHealth(conn, probeOf(conn.id));
}

export function addConnection(draft: ConnectionDraft, key?: string): Connection {
  const list = connections();
  const conn: Connection = {
    id: newConnectionId(list.map((c) => c.id), draft.kind),
    kind: draft.kind,
    label: draft.label.trim(),
    model: draft.model.trim(),
    baseUrl: draft.baseUrl.trim() || kindInfo(draft.kind).defaultBaseUrl,
  };
  const before = list;
  cache = [...list, conn];

  // A brand-new connection with nothing routed to it would be a card
  // that does nothing — see routingAfterAdding for what gets revised
  // and what is left alone.
  routingCache = routingAfterAdding(routing(), before, cache);

  if (key !== undefined) setKey(conn.id, key);
  mirrorToPlugin(conn);
  persist();
  return conn;
}

export function updateConnection(id: string, patch: Partial<Omit<Connection, "id" | "kind">>): void {
  const list = connections();
  cache = list.map((c) => (c.id === id ? { ...c, ...patch } : c));
  const updated = cache.find((c) => c.id === id);
  if (updated) mirrorToPlugin(updated);
  // Changing the endpoint or model makes the last test's verdict stale.
  if (patch.baseUrl !== undefined || patch.model !== undefined) probes.delete(id);
  persist();
}

export function removeConnection(id: string): void {
  cache = connections().filter((c) => c.id !== id);
  setKey(id, "");
  secrets.delete(id);
  probes.delete(id);
  // Roles pointing at it fall back to whatever is left, and the store
  // never keeps a dangling id.
  routingCache = normalizeRouting(routing(), cache);
  persist();
}

/** Mirror the fields the old plugin surfaces still read, so nothing a
    writer set in one place quietly disagrees with the other. */
function mirrorToPlugin(conn: Connection): void {
  const legacy = LEGACY_PLUGIN[conn.id];
  if (!legacy) return;
  const settings = pluginHost.settingsFor(legacy);
  if (conn.model) settings.set("model", conn.model);
  if (conn.kind === "openai" && conn.baseUrl) settings.set("baseUrl", conn.baseUrl);
}

export function setRole(role: RoleId, connectionId: string): void {
  const next: Routing = { ...routing() };
  if (connectionId) next[role] = connectionId;
  else delete next[role];
  routingCache = normalizeRouting(next, connections());
  persist();
}

/* ---------------- live checks ---------------- */

export interface TestResult {
  ok: boolean;
  /** What to show: a model count on success, the real error on failure. */
  detail: string;
  models: string[];
}

/** Ask a connection what models it offers. This is the whole of "Test
    connection": a list coming back is proof the address, the key and
    the network all work, and it costs the writer nothing. */
export async function testConnection(conn: Connection): Promise<TestResult> {
  await ready();
  try {
    let models: string[] = [];
    if (conn.kind === "ollama") {
      models = (await listOllamaModels(undefined, baseUrlOf(conn))).map((m) => m.name);
      if (models.length === 0) {
        const result: TestResult = {
          ok: false,
          detail:
            "Ollama is running but has no models pulled yet. Local AI, below, downloads one.",
          models: [],
        };
        probes.set(conn.id, { hasKey: false, reachable: false, detail: result.detail, checkedAt: Date.now() });
        emit();
        return result;
      }
    } else if (conn.kind === "anthropic") {
      models = await listClaudeModels(keyFor(conn.id));
    } else {
      models = await listRemoteModels(baseUrlOf(conn), keyFor(conn.id));
    }

    probes.set(conn.id, { hasKey: hasKey(conn.id), reachable: true, checkedAt: Date.now() });
    emit();
    return {
      ok: true,
      detail: `Connected · ${models.length} model${models.length === 1 ? "" : "s"} available`,
      models,
    };
  } catch (err) {
    const detail = humanTestError(err, conn);
    probes.set(conn.id, { hasKey: hasKey(conn.id), reachable: false, detail, checkedAt: Date.now() });
    emit();
    return { ok: false, detail, models: [] };
  }
}

/* A failed fetch arrives as a bare TypeError saying "Failed to fetch",
   which is true and useless. Everything else is the provider's own
   words, which are usually good — pass those through untouched rather
   than replacing them with something vaguer. */
function humanTestError(err: unknown, conn: Connection): string {
  const raw = err instanceof Error ? err.message : String(err);
  const looksLikeNetwork =
    err instanceof TypeError || /failed to fetch|networkerror|ECONNREFUSED|load failed/i.test(raw);
  if (!looksLikeNetwork) return raw;

  if (conn.kind === "ollama") {
    return "Nothing answered on this machine. Ollama isn't running — start it, or install it from Local AI below.";
  }
  return `Couldn't reach ${baseUrlOf(conn)}. Check the address and your internet connection.`;
}

/** What a real generation just proved. A failure here is better evidence
    than any test button — it happened while someone was working. */
export function noteResult(id: string, ok: boolean, detail?: string): void {
  const before = probes.get(id);
  if (before?.reachable === ok && !detail) return; // nothing new to say
  probes.set(id, { hasKey: hasKey(id), reachable: ok, detail: ok ? undefined : detail, checkedAt: Date.now() });
  emit();
}

/* ---------------- building a provider ---------------- */

/** A live provider for one connection. Built per call rather than
    cached: a key or model changed a second ago must take effect now. */
export function providerForConnection(conn: Connection): StreamingAIProvider {
  const model = modelOf(conn);
  const baseUrl = baseUrlOf(conn);
  const key = keyFor(conn.id);

  if (conn.kind === "ollama") {
    return makeOllamaProvider(() => ({ host: baseUrl, model }), `/${conn.id}`);
  }
  if (conn.kind === "anthropic") {
    return makeAnthropicProvider(() => ({ apiKey: key, model }), `/${conn.id}`);
  }
  return makeOpenAICompatibleProvider(() => ({ baseUrl, apiKey: key, model }), `/${conn.id}`);
}

/* ---------------- React ---------------- */

export function useConnections(): number {
  return useSyncExternalStore(subscribe, () => version, () => version);
}
