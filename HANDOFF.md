# Novella.ai — Handoff for Claude Code

Paste this into a new Claude Code session to continue the project. It carries the full context: the vision, the decisions already locked, what's already built and tested, and exactly what to do next.

---

## What we're building

**Novella.ai** — a local-first desktop (and web) writing app with the **full capability set of NovelCrafter**, built as an independent app (its own code, name, and design — a feature-equivalent tool, not a copy of anyone's code or branding). It's for writing novels, novellas, and books chapter by chapter, with an AI writing partner that knows the author's world.

Three principles drive every decision:
- **Local-first** — the whole book lives as plain Markdown files on disk. Works offline. Portable. Outlives the app.
- **Model-agnostic** — the AI is a plugin. Claude or ChatGPT via the user's own API key is the primary engine; a free local model (Ollama) is the optional fallback.
- **Extensible** — an Obsidian-style plugin system. Grammar, plagiarism, voice notes, imports, exporters are all toggles in Settings.

## Decisions already locked (do not re-litigate)

- The user builds nothing by hand — Claude codes and creates it.
- Runs both as a desktop app and a web build from **one codebase** (Tauri shell + React).
- AI is **mostly paid API models** (user's own key), with free local Ollama available when wanted. It does **not** have to be free — so token economy matters (see below), but frontier quality is the default.
- Slash-command model switching: `/claude`, `/chatgpt`, `/local`. Honest reality: connecting Claude/ChatGPT means the user pastes a **developer API key** (pay-per-use); there is no way to ride a consumer subscription login, and we won't fake one.
- The "database" is an **Obsidian-style vault**: a folder of Markdown files with YAML frontmatter. Wiki-links, backlinks, and a relationship graph are the writing brain.
- **Plugin system**, Obsidian-style — enable capabilities in user Settings.
- **One-install rule** (learned from the user's friend Evan's app "YellFlow," a local faster-whisper voice-to-notes tool): the user installs ONE thing. No "go download other software." Heavy assets (local AI model, grammar engine, speech model) auto-download once in the background with a progress bar, then run offline. The voice-notes plugin follows YellFlow's local faster-whisper approach.

## What's already built and TESTED (bring these files in)

Phase 1 core is done and verified. The repo folder `novella/` contains:

- `src/core/vault.ts` — the writing-brain engine. Frontmatter parsing (via `gray-matter`), `[[wiki-link]]` extraction, backlink indexing from **both prose and frontmatter fields** (e.g. a scene's POV), relationship graph, alias-aware link resolution, full-text search, dangling-link detection, and round-trip save. **Ran clean against a seed world; compiles under `--strict`.**
- `src/core/plugins.ts` — the plugin system. One `NovellaPlugin` interface for AI/grammar/plagiarism/import/capture/export, a `PluginManager`, per-plugin `settingsSchema` (renders config forms), and `firstRunDownload` metadata for the one-install rule. Ships example plugins: Claude, Ollama, LanguageTool, YellFlow-style voice notes. Compiles under `--strict`.
- `test.ts` — the smoke test proving the engine works (`npx tsx test.ts`).
- `README.md` — project overview and status.
- `Novella-Blueprint.md` — full architecture + the complete NovelCrafter feature-parity checklist. **Read this for the feature scope.**

**Build directly on top of `vault.ts` and `plugins.ts` — do not rewrite them.**

## Tech stack

- Shell: **Tauri** (Rust core, tiny installer, native file access) → one codebase → Windows/Mac desktop + web build.
- UI: **React + TypeScript**.
- Data: **Markdown + YAML frontmatter** files (source of truth) + **SQLite** as a disposable, always-rebuildable search/link index.
- Editor: a Markdown-aware rich editor (CodeMirror or TipTap) with `[[wiki-link]]` autocomplete.
- AI: provider plugins → Anthropic / OpenAI APIs, or local Ollama at `http://localhost:11434`.
- Grammar: LanguageTool (self-hosted, free).

## Token economy (bake in from the start)

Since it mostly uses paid models: send only codex entries referenced in the current scene (not the whole bible); summarize earlier chapters and cache the summaries; use prompt caching for stable context; show a live token/cost estimate before big generations; one-click fallback to the free local model.

## Immediate next steps (in priority order)

1. Scaffold the real project: Vite + React + TypeScript, then add the Tauri shell. Wire in the existing `vault.ts` / `plugins.ts`.
2. Build the Tauri file-access layer so the vault reads/writes a real folder on disk.
3. Build the core UI: three panes — **Codex** (left), **manuscript editor** (center), **AI assistant** (right) — wired live to the vault engine. Chapter-by-chapter editing, live word counts, `[[link]]` autocomplete, backlink panel.
4. Settings → Plugins screen (enable/disable, per-plugin config forms from `settingsSchema`).
5. Wire the Claude provider plugin to real generation with codex-aware context + token economy.

Then Phase 3 (scene-beat drafting, prompt library, outline/corkboard, version history) and Phase 4 (ecosystem plugins, packaging).

## Confirm with the user before scaffolding

- **OS:** Windows or Mac?
- **Dev prerequisites:** is Node.js installed? Is Rust installed? (Rust is needed only to *build* Tauri; end users installing the finished app need nothing. Offer step-by-step setup if missing.)
- **First-run default:** open a blank vault, or load the seed world so it works immediately? (Recommended: seed world.)
- **First UI to build:** codex + editor, or the plugin/settings screen? (Recommended: codex + editor first, so the user is writing within minutes.)

## The user's working style

Ambitious, collaborative, wants it user-friendly and genuinely usable — not a toy. Prefers honest tradeoffs over hype. Has "other fun ideas" to add once the NovelCrafter-parity core is working — ask about these once Phase 1 UI is running.
