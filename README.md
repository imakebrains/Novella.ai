# Novella.ai

A local-first writing environment with the full capability set of NovelCrafter — codex, chapter-by-chapter drafting, AI writing partner, grammar, voice notes — as a single desktop app you own. Your whole book lives as plain Markdown files on your disk.

## The one-install rule

Inspired by YellFlow: **you install one thing.** No "now go download this other program."

What that means in practice, from a clean Windows machine:

1. Run `Novella_x64-setup.exe`. WebView2 is fetched automatically if the machine doesn't have it.
2. Open Novella. It works immediately — the seed world, editor, codex, and all the writing analysis need nothing else.
3. When you want the AI, Settings → Local AI shows a two-step checklist with buttons. Novella installs the engine (via winget, which verifies the installer hash) and downloads the model with a progress bar. No terminal, no visiting a download page.

Sizes are stated before anything is fetched, and **nothing downloads on its own** — a ~5 GB model is not a decision to make on someone's behalf. After that first download it runs offline forever.

If winget isn't available, the app says so plainly and points at ollama.com rather than silently downloading an executable from the internet.

## The writing brain

Your vault is a folder of Markdown files with a small structured header (frontmatter). That's the entire database — portable, offline, future-proof.

- `[[wiki-links]]` connect anything to anything
- backlinks surface every place a character or location appears — automatically, including references inside frontmatter fields like a scene's POV
- a relationship graph maps your whole world
- links resolve by name *or* alias
- dangling-link detection flags names you've referenced but not yet written

## Status

**Phase 1 — the core engine — is built and tested.**

- `src/core/vault.ts` — the file-based data layer: frontmatter parsing, wiki-link and backlink indexing (prose + frontmatter), relationship graph, search, dangling-link detection, round-trip save. Verified by `test.ts`.
- `src/core/plugins.ts` — the Obsidian-style plugin system: one interface for AI providers, grammar, plagiarism, import, voice capture, and export, with per-plugin settings and first-run downloads. Ships with Claude, Ollama (local/free), LanguageTool, and a YellFlow-style voice-notes plugin. Compiles clean under `--strict`.

**Phase 2 — the app — is running.**

- `src/state/vaultStore.ts` — a reactive shell over the Vault engine. Adds change notification, the active note, and persistence. The engine itself is untouched.
- `src/storage/` — storage adapters. Tauri (real folders on disk) on desktop, memory in a plain browser. Same interface, so the UI never branches.
- `src/ui/` — the three panes: **Codex** (typed, searchable, with an "Unwritten" section that creates missing notes in one click), **manuscript editor** (CodeMirror 6 with `[[link]]` autocomplete over titles *and* aliases), and **Inspector** (backlinks with mention counts, outgoing references, frontmatter).
- Light and dark themes, both first-class. Ctrl+S saves every dirty note.

## Running it

```bash
npm install
npm run dev          # web build at http://localhost:5173
npm run tauri dev    # desktop app (needs Rust + MSVC build tools)
npm run test:engine  # the Phase 1 vault smoke test
npm run typecheck
```

The web build keeps everything in memory and says so in a banner. The desktop build reads and writes a real folder.

### Filesystem permissions

The desktop app ships with **no** filesystem scope. When you pick a vault folder, the frontend calls the `allow_vault` command, which widens the scope to that one directory for the session. A folder you never opened stays unreadable.

**Phase 3 — the AI partner — works end to end.**

- `src/ai/context.ts` — scene context assembly. Only the codex entries a scene actually references are sent, so a 200-entry world costs the same as a 5-entry one. Wiki-link syntax is stripped, and only the tail of long chapters is included.
- `src/plugins/runtime.ts` — the plugin host, built on the `NovellaPlugin` / `PluginContext` / `AIProvider` contracts from `core/plugins.ts`. Each plugin gets its own settings namespace; secrets are held in memory only, never written to disk.
- `src/plugins/providers/ollama.ts` — streaming local generation with real error surfacing.
- `src/ui/SettingsModal.tsx` — Settings → Plugins. Every control is generated from the plugin's own `settingsSchema`.

Generated prose streams into a review panel and only touches the manuscript when you accept it.

**Phase 4 — the writing tools.**

- `src/analysis/prose.ts` — ProWritingAid-style checks, all local and instant: readability, sentence rhythm, sticky sentences (glue index), echoes, adverbs, passive voice, overused words, dialogue ratio. Available as a **Critique** panel and as **inline markers** in the manuscript with hover explanations.
- `src/ui/BeatsPanel.tsx` — scene beats. Sketch what has to happen one line at a time, then draft each into prose. Beats live in frontmatter, so they round-trip to disk and a `[[character]]` named in a beat appears in that character's backlinks.
- `src/ai/prompts.ts` — the prompt library. Prompts are ordinary vault notes with `type: prompt`, so they're portable Markdown you can edit like anything else. Variables: `{{scene}}`, `{{beat}}`, `{{codex}}`, `{{prose}}`, `{{selection}}`.
- `src/ui/Corkboard.tsx` — every chapter as a draggable card. Order is a frontmatter number, never a filename, so reordering can't break `[[links]]`.
- `src/ui/Resizer.tsx` — draggable pane dividers, persisted, with keyboard and double-click-to-reset.

The AI is told the point of view explicitly, derived from the scene's `pov:` frontmatter plus detected person and tense. Asking a model to "match the POV" is not enough — it drifts into first person within a paragraph.

### Development

```bash
npm run verify   # typecheck + engine test + production build, in one
npm run dev      # port 5173, strict — fails loudly if it's taken
```

The dev port is `strictPort`, deliberately. Vite's default is to slide to
5174 when 5173 is busy, which silently makes every "open the app"
instruction wrong and hides the fact that a stale server is still running.
If it refuses to start, something is already on the port — kill that first.

In dev builds a debug surface hangs off `window.__novella`:

```js
__novella.state()    // notes by type, active note, dirty count, theme,
                     // providers, drafts, pending recovery, dangling links
__novella.probe()    // local AI setup: engine on PATH, winget, API, models
__novella.analyse()  // prose report for the open note
__novella.store      // the vault store itself
```

It is stripped entirely from production — the module sits behind
`import.meta.env.DEV`, so `window.__novella` does not exist in a shipped
build (verified by grepping the bundle).

### Dev self-test

```bash
VITE_DEV_VAULT=/path/to/a/vault npm run tauri dev
```

Opens that folder instead of the seed world and runs a disk round-trip check — read, frontmatter backlinks, save, re-read — logging results to the terminal via the Rust `debug_log` command. Dev builds only.

## Next

- Anthropic / OpenAI API key providers — deliberately on the backlog, and they need OS keychain storage first
- Scene-beat drafting, prompt library, outline/corkboard, version history
- The ecosystem plugins (LanguageTool, plagiarism, Gutenberg import, voice notes, exporters)

See `Novella-Blueprint.md` for the full architecture and NovelCrafter feature-parity map.
