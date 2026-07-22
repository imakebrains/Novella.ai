import { useSyncExternalStore } from "react";
import type {
  AIProvider,
  NovellaPlugin,
  PluginContext,
  SettingField,
} from "../core/plugins";
import { store } from "../state/vaultStore";

/* ============================================================
   Plugin host
   Uses the NovellaPlugin / PluginContext / AIProvider contracts
   from core/plugins.ts unchanged. It does NOT use PluginManager,
   for one specific reason: PluginManager holds a single shared
   PluginContext, so every plugin would read and write the same
   flat settings namespace — Claude's "model" and Ollama's "model"
   would collide. This host hands each plugin its own scoped
   context instead. See NOTES at the bottom.
   ============================================================ */

const PREFIX = "novella.plugin";
const ENABLED = "novella.enabledPlugins";

/** Anything that can stream tokens as they arrive. Optional upgrade
    over AIProvider.generate — prose appearing word by word matters. */
export interface StreamingAIProvider extends AIProvider {
  generateStream(
    req: { system: string; prompt: string; maxTokens?: number },
    onChunk: (text: string) => void,
    signal?: AbortSignal,
  ): Promise<string>;
}

export function isStreaming(p: AIProvider): p is StreamingAIProvider {
  return typeof (p as StreamingAIProvider).generateStream === "function";
}

/** Per-plugin settings. Secrets never touch localStorage. */
class ScopedSettings {
  private static secretCache = new Map<string, unknown>();

  constructor(
    private pluginId: string,
    private secretKeys: Set<string>,
  ) {}

  private key(k: string): string {
    return `${PREFIX}.${this.pluginId}.${k}`;
  }

  get<T = string>(key: string): T | undefined {
    // API keys and the like are held in memory for the session only.
    // Writing them to localStorage would put plaintext credentials on
    // disk; the OS keychain path is task #12.
    if (this.secretKeys.has(key)) {
      return ScopedSettings.secretCache.get(this.key(key)) as T | undefined;
    }
    const raw = localStorage.getItem(this.key(key));
    if (raw === null) return undefined;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return raw as unknown as T;
    }
  }

  set(key: string, value: unknown): void {
    if (this.secretKeys.has(key)) {
      ScopedSettings.secretCache.set(this.key(key), value);
      return;
    }
    localStorage.setItem(this.key(key), JSON.stringify(value));
  }
}

export interface Notice {
  id: number;
  message: string;
  at: number;
}

export interface Command {
  id: string;
  label: string;
  run: () => void;
  pluginId: string;
}

export class PluginHost {
  private registry = new Map<string, NovellaPlugin>();
  private active = new Set<string>();
  private providersBySlash = new Map<string, AIProvider>();
  private providerOwner = new Map<string, string>(); // slash -> pluginId
  private commands: Command[] = [];
  private notices: Notice[] = [];
  private noticeSeq = 0;

  private listeners = new Set<() => void>();
  private version = 0;

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  getSnapshot = (): number => this.version;
  private emit(): void {
    this.version++;
    for (const l of this.listeners) l();
  }

  /* ---------- registration ---------- */

  register(plugin: NovellaPlugin): void {
    this.registry.set(plugin.id, plugin);
    if (this.storedEnabled().has(plugin.id)) void this.enable(plugin.id);
    this.emit();
  }

  list(): NovellaPlugin[] {
    return [...this.registry.values()];
  }
  isActive(id: string): boolean {
    return this.active.has(id);
  }

  private storedEnabled(): Set<string> {
    try {
      const raw = localStorage.getItem(ENABLED);
      return new Set(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      return new Set();
    }
  }
  private persistEnabled(): void {
    localStorage.setItem(ENABLED, JSON.stringify([...this.active]));
  }

  private contextFor(plugin: NovellaPlugin): PluginContext {
    const secretKeys = new Set(
      (plugin.settingsSchema ?? [])
        .filter((f: SettingField) => f.secret)
        .map((f) => f.key),
    );
    const settings = new ScopedSettings(plugin.id, secretKeys);

    return {
      vault: store.vault,
      activeNote: () => store.active(),
      settings: {
        get: <T = string>(key: string) => settings.get<T>(key),
        set: (key: string, value: unknown) => settings.set(key, value),
      },
      registerProvider: (p: AIProvider) => {
        this.providersBySlash.set(p.slash, p);
        this.providerOwner.set(p.slash, plugin.id);
        this.emit();
      },
      registerCommand: (cmd) => {
        this.commands.push({ ...cmd, pluginId: plugin.id });
        this.emit();
      },
      notify: (message: string) => {
        this.notices.push({ id: ++this.noticeSeq, message, at: Date.now() });
        this.emit();
      },
    };
  }

  /* ---------- lifecycle ---------- */

  async enable(id: string): Promise<void> {
    const plugin = this.registry.get(id);
    if (!plugin || this.active.has(id)) return;

    if (plugin.firstRunDownload) {
      this.notices.push({
        id: ++this.noticeSeq,
        message: `Fetching ${plugin.firstRunDownload.label} (~${plugin.firstRunDownload.sizeMB} MB)…`,
        at: Date.now(),
      });
      this.emit();
    }

    await plugin.onEnable(this.contextFor(plugin));
    this.active.add(id);
    this.persistEnabled();
    this.emit();
  }

  disable(id: string): void {
    const plugin = this.registry.get(id);
    if (!plugin || !this.active.has(id)) return;
    plugin.onDisable?.();
    this.active.delete(id);

    for (const [slash, owner] of this.providerOwner) {
      if (owner === id) {
        this.providersBySlash.delete(slash);
        this.providerOwner.delete(slash);
      }
    }
    this.commands = this.commands.filter((c) => c.pluginId !== id);

    this.persistEnabled();
    this.emit();
  }

  /* ---------- accessors ---------- */

  providers(): { slash: string; provider: AIProvider; pluginId: string }[] {
    return [...this.providersBySlash.entries()].map(([slash, provider]) => ({
      slash,
      provider,
      pluginId: this.providerOwner.get(slash) ?? "",
    }));
  }

  provider(slash: string): AIProvider | undefined {
    return this.providersBySlash.get(slash);
  }

  allCommands(): Command[] {
    return [...this.commands];
  }

  recentNotices(limit = 3): Notice[] {
    return this.notices.slice(-limit);
  }

  dismissNotice(id: number): void {
    this.notices = this.notices.filter((n) => n.id !== id);
    this.emit();
  }

  /** Settings access for the UI (config forms). */
  settingsFor(pluginId: string): { get(k: string): unknown; set(k: string, v: unknown): void } {
    const plugin = this.registry.get(pluginId);
    const secretKeys = new Set(
      (plugin?.settingsSchema ?? []).filter((f) => f.secret).map((f) => f.key),
    );
    const s = new ScopedSettings(pluginId, secretKeys);
    return { get: (k) => s.get(k), set: (k, v) => s.set(k, v) };
  }
}

export const pluginHost = new PluginHost();

export function usePluginVersion(): number {
  return useSyncExternalStore(
    pluginHost.subscribe,
    pluginHost.getSnapshot,
    pluginHost.getSnapshot,
  );
}

/* ============================================================
   NOTES — divergence from core/plugins.ts, worth revisiting

   PluginManager in core/plugins.ts is constructed with ONE
   PluginContext shared by every plugin. Because plugins capture
   that ctx in closures during onEnable, there is no way to scope
   settings per plugin without changing that file. Two plugins that
   both declare a "model" setting (Claude and Ollama already do)
   would read each other's value.

   The smallest fix to core/plugins.ts would be to change
   PluginManager's constructor to take a factory:
       constructor(private ctxFor: (p: NovellaPlugin) => PluginContext, ...)
   and call this.ctxFor(p) inside enable(). That is a ~3 line change
   and would let this host be deleted in favour of PluginManager.
   Left undone because the handoff says not to rewrite that file.
   ============================================================ */
