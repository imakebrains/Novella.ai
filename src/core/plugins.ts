import type { Vault, Note } from "./vault";

/* ============================================================
   Novella plugin system  (Obsidian-style)
   Core stays lean. AI providers, grammar, plagiarism, voice
   capture, importers and exporters are all plugins the user
   toggles on in Settings. Each declares the settings it needs
   (like an API key), so the UI renders its config form for free.
   ============================================================ */

export type PluginCategory =
  | "ai" | "grammar" | "plagiarism" | "import" | "capture" | "export";

/** A settings field → rendered as one row in the plugin's config form. */
export interface SettingField {
  key: string;
  label: string;
  kind: "text" | "password" | "toggle" | "select" | "number";
  placeholder?: string;
  options?: string[];          // for "select"
  secret?: boolean;            // stored in the OS keychain, never in plain files
}

export interface AIRequest {
  system: string;
  prompt: string;
  maxTokens?: number;
}

/** Anything that can generate text is an AI provider plugin. */
export interface AIProvider {
  slash: string;                                   // "/claude", "/local"
  generate(req: AIRequest): Promise<string>;
  estimateCost?(req: AIRequest): { tokens: number; usd: number };
}

/** What a plugin is handed when it turns on. */
export interface PluginContext {
  vault: Vault;
  activeNote(): Note | undefined;
  settings: {
    get<T = string>(key: string): T | undefined;
    set(key: string, value: unknown): void;
  };
  registerProvider(p: AIProvider): void;
  registerCommand(cmd: { id: string; label: string; run: () => void }): void;
  notify(message: string): void;
}

export interface NovellaPlugin {
  id: string;
  name: string;
  category: PluginCategory;
  description: string;
  settingsSchema?: SettingField[];
  /** Large assets (models) pulled on first enable — one install, no side downloads. */
  firstRunDownload?: { label: string; sizeMB: number };
  onEnable(ctx: PluginContext): void | Promise<void>;
  onDisable?(): void;
}

/* ---------------- manager ---------------- */

export interface EnabledStore {
  isEnabled(id: string): boolean;
  setEnabled(id: string, on: boolean): void;
}

export class PluginManager {
  private registry = new Map<string, NovellaPlugin>();
  private active = new Set<string>();

  constructor(private ctx: PluginContext, private store: EnabledStore) {}

  register(p: NovellaPlugin) {
    this.registry.set(p.id, p);
    if (this.store.isEnabled(p.id)) void this.enable(p.id);
  }

  list(): NovellaPlugin[] { return [...this.registry.values()]; }
  isActive(id: string): boolean { return this.active.has(id); }

  async enable(id: string) {
    const p = this.registry.get(id);
    if (!p || this.active.has(id)) return;
    if (p.firstRunDownload)
      this.ctx.notify(`Fetching ${p.firstRunDownload.label} (~${p.firstRunDownload.sizeMB} MB)…`);
    await p.onEnable(this.ctx);
    this.active.add(id);
    this.store.setEnabled(id, true);
  }

  disable(id: string) {
    const p = this.registry.get(id);
    if (!p || !this.active.has(id)) return;
    p.onDisable?.();
    this.active.delete(id);
    this.store.setEnabled(id, false);
  }
}

/* ---------------- example plugins ---------------- */

/** Claude via the user's own API key (primary engine). */
export const claudeProvider: NovellaPlugin = {
  id: "provider-claude",
  name: "Claude",
  category: "ai",
  description: "Frontier prose quality via your Anthropic API key.",
  settingsSchema: [
    { key: "apiKey", label: "API key", kind: "password", secret: true },
    { key: "model", label: "Model", kind: "select", options: ["claude-sonnet-4-6", "claude-opus-4-8"] },
  ],
  onEnable(ctx) {
    const key = ctx.settings.get("apiKey");
    ctx.registerProvider({
      slash: "/claude",
      async generate(req) {
        if (!key) { ctx.notify("Add your Claude API key in Settings."); return ""; }
        // real call happens in the desktop runtime; shape shown for clarity
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "content-type": "application/json", "x-api-key": String(key),
            "anthropic-version": "2023-06-01" },
          body: JSON.stringify({
            model: ctx.settings.get("model") || "claude-sonnet-4-6",
            max_tokens: req.maxTokens ?? 1000,
            system: req.system,
            messages: [{ role: "user", content: req.prompt }],
          }),
        });
        const data = await res.json();
        return (data.content || []).filter((b: any) => b.type === "text")
          .map((b: any) => b.text).join("\n").trim();
      },
    });
  },
};

/** Free, unlimited local drafting via Ollama — the fallback. */
export const ollamaProvider: NovellaPlugin = {
  id: "provider-ollama",
  name: "Local model (Ollama)",
  category: "ai",
  description: "Free, unlimited, offline drafting on your own machine.",
  firstRunDownload: { label: "the local writing model", sizeMB: 4200 },
  settingsSchema: [{ key: "model", label: "Model", kind: "text", placeholder: "llama3.1:8b" }],
  onEnable(ctx) {
    ctx.registerProvider({
      slash: "/local",
      async generate(req) {
        const res = await fetch("http://localhost:11434/api/generate", {
          method: "POST",
          body: JSON.stringify({
            model: ctx.settings.get("model") || "llama3.1:8b",
            system: req.system, prompt: req.prompt, stream: false,
          }),
        });
        const data = await res.json();
        return (data.response || "").trim();
      },
    });
  },
};

/** Grammar & style — self-hosted, free. */
export const languageToolGrammar: NovellaPlugin = {
  id: "grammar-languagetool",
  name: "Grammar & style (LanguageTool)",
  category: "grammar",
  description: "Grammar, clarity and style checks. Runs locally, no cost.",
  firstRunDownload: { label: "the grammar engine", sizeMB: 240 },
  onEnable(ctx) {
    ctx.registerCommand({
      id: "grammar.check", label: "Check current chapter",
      run: () => ctx.notify("Checking grammar on “" + (ctx.activeNote()?.title ?? "—") + "”"),
    });
  },
};

/** Voice notes — modeled on YellFlow's local faster-whisper approach. */
export const voiceNotesCapture: NovellaPlugin = {
  id: "capture-voice",
  name: "Voice notes",
  category: "capture",
  description: "Speak an idea; it's transcribed on-device and saved to your Notes.",
  firstRunDownload: { label: "the speech model", sizeMB: 480 },
  settingsSchema: [
    { key: "model", label: "Whisper model", kind: "select", options: ["base", "small", "medium"] },
  ],
  onEnable(ctx) {
    ctx.registerCommand({
      id: "voice.capture", label: "Start voice note",
      run: () => ctx.notify("Listening… (on-device transcription, nothing leaves your computer)"),
    });
  },
};

export const BUILTIN_PLUGINS: NovellaPlugin[] = [
  claudeProvider, ollamaProvider, languageToolGrammar, voiceNotesCapture,
];
