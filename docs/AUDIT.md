# Audit — 2026-08-24

Where Novella actually stands, measured rather than estimated, and what
that says about it next to the apps it means to beat.

Method note: every number below was produced by running something. Where a
finding is inferred from reading code rather than measured, it says so.

---

## What is genuinely strong

**The engine scales, and this had never been checked.** The roadmap sets
"stay FAST as projects grow (measure it)" as a standing guardrail and
nobody had measured it. Benchmarked against the real `Vault` and the real
`analysis/prose`:

| | 30 ch / 75k words | 120 ch / 300k | 400 ch / 1M |
|---|---|---|---|
| Ingest — parse every file, build the index | 12 ms | 15 ms | **48 ms** |
| Link resolution across the whole vault | 1 ms | 2 ms | 7 ms |
| `analyseProse` on the open chapter | 10 ms | 6 ms | 6 ms |
| `findInlineIssues` — runs per keystroke | 3 ms | 3 ms | **3 ms** |

The typing path is **flat** regardless of vault size, which is the number
that actually matters, and a million-word vault opens in under a tenth of
a second. Obsidian, the closest architectural comparison, takes visibly
longer on a vault that size. This is a real advantage and nothing in the
backlog threatens it.

**Lean for the surface area.** 15 runtime dependencies for an app that
does writing, worldbuilding, tasks, a calendar, exports to DOCX/EPUB/PDF,
local and cloud AI, and a plugin system.

**The gate is unusually good for a project this age.** 19 suites, ~2,700
assertions, running on every push since 2026-08-20. Most solo projects at
this stage have none.

---

## What needs work, worst first

### 1. First load is 3.4 MB in a single chunk

Measured: `dist/assets/index-*.js` is **3,404 KB** (about 1.9 MB gzipped)
and there is essentially **no code splitting** — one chunk holds nearly
everything.

Two things are in there that should not be:

- **`docx`** (~5 MB unpacked) is statically imported by
  `src/export/formats.ts`, which `ExportModal.tsx` imports statically.
  Confirmed present in the main chunk by grepping it for
  `wordprocessingml`. It is needed only when someone exports.
- ~~**`@anthropic-ai/sdk`** is in the main chunk~~ — **WRONG, corrected
  2026-08-24.** It is not. The dynamic import splits correctly into its
  own 158 KB chunk; `AnthropicError` appears zero times in a fresh build.
  The grep that "found" it ran against a stale artifact. A reminder to
  rebuild before measuring.
- **The real second half was images.** 1,530 KB of the 3,031 KB chunk —
  half of it — was five backdrop photos imported `?inline` as base64.
  Now emitted as files. Entry chunk: **3,404 KB to 1,536 KB.**

Why it matters competitively: on the desktop build this is a local read
and costs little. On the **hosted web build** — the one at
`imakebrains.github.io/Novella.ai`, and the one a curious writer tries
first — it is 1.9 MB before anything renders. NovelCrafter is web-first
and would win that first impression on load time alone.

Fix: lazy-load `export/formats`, find and cut whatever drags the
Anthropic SDK into the entry graph, and verify with a grep on the built
chunk rather than by assuming the dynamic import worked.

### 2. ~~There is no way to fix a misspelling~~ — FIXED, and it was worse

*The inference below was wrong in mechanism and understated the problem.*
Measured live: CodeMirror sets `spellcheck="false"` on `.cm-content`
itself, so there were **no squiggles at all** — a writing app with no
spellcheck whatsoever, not one whose squiggles could not be corrected.

Fixed 2026-08-24: enabled via `EditorView.contentAttributes`, and the
unconditional `preventDefault` on `contextmenu` is gone so the native
correction menu reaches the writer. The one action that menu replaced —
add this note to a board — moved to the editor header.

Original (wrong) reasoning kept for the record: `.cm-content` is
contenteditable and nothing *in our code* sets `spellcheck="false"`, so
Chromium will underline misspellings. But `EditorPane.tsx` calls
`e.preventDefault()` on `contextmenu` unconditionally.

The comment there says "CodeMirror has no native spellcheck menu to
lose." That assumption is worth testing, because if squiggles do appear,
the writer can see a word is wrong and has no way to fix it in place.

Every competitor has this. Word, Scrivener and Google Docs treat it as
table stakes; ProWritingAid sells it. For an app whose whole subject is
prose, "you can see the error but not correct it" is the single most
embarrassing gap on this list. The fix is small: detect a spelling
context and either fall through to the native menu or merge suggestions
into ours.

### 3. Three files nobody can hold in their head

`InspectorPane.tsx` 1,670 lines · `SettingsModal.tsx` 1,600 ·
`TourOverlay.tsx` 1,205 · `pasteMarkdown.ts` 1,090 · `vaultStore.ts`
1,076 · `calendarEntries.ts` 1,075.

Not urgent while one person holds the whole map, but this is precisely
the barrier that stops a first outside contributor. `TourOverlay.tsx` is
the easiest win — it is 17 clip components in one file with no shared
state between them.

### 4. `app.css` is 12,169 lines in one file

This works *because* one session owns all styling, and that rule is what
kept a dozen parallel agents from colliding. But it is a merge-conflict
magnet and an immediate "no thanks" for a contributor. No comparable app
ships one stylesheet this size.

Worth splitting along the section numbering that already exists in the
file, once the parallel-agent pattern is no longer in daily use.

### 5. Untested modules that carry real risk

Substantial and with no test file naming them:

| Module | Lines | Why it matters |
|---|---|---|
| `plugins/runtime.ts` | 314 | Executes plugin behaviour |
| `useTheme.ts` | 222 | Custom themes, contrast safety |
| `providers/openaiCompatible.ts` | 212 | Every non-Anthropic provider |
| ~~`state/agentRunner.ts`~~ | 154 | **Correction:** a filename match, not a real gap. `agentIsDue` — the scheduling decision — already has 14 assertions in test-units.ts; they import from `agents.ts`, so a search for "agentRunner" missed them. Its `buildAgentContext` is still uncovered. |
| `ui/critiqueExtension.ts` | 168 | Runs on every keystroke |
| `ui/editorBridge.ts` | 130 | Insert-into-manuscript seam |

**Done 2026-08-24 for `plugins/runtime`:** `test-plugins.ts`, 40 checks,
which found two real bugs — `onEnable` called unguarded, and a throw part
way through leaving commands and providers registered while the plugin
never became active. Both fixed.

---

## Feature gaps against the field

Ranked by how often writers actually reach for them.

1. **Inline comments / margin notes.** Scrivener, Word, Google Docs,
   NovelCrafter. This is how writers leave notes for their future selves
   and their editors. Already the top buildable item in the backlog.
2. **Spellcheck** — see above.
3. **Timeline view.** Scrivener, Plottr, Campfire. A chronology surface
   for a book with any time structure at all.
4. **Location map / pinboard.** Campfire, World Anvil. Worldbuilders
   expect it; the codex already holds the data.
5. **Voice-matching from the writer's own prose.** "Style me" derives a
   voice from a sample, which is most of the mechanism — what is missing
   is applying it automatically rather than by selecting a style.

## Not features, but they decide adoption

- **Unsigned installers.** SmartScreen and Gatekeeper both warn. This is
  the largest single drop-off between "downloads it" and "runs it", and
  it costs money to fix (~$200-600/yr Windows, $99/yr Apple).
- **No auto-update.** v0.3.0 is out; nobody on v0.1.0 will ever know.
  Blocked on your decision about signing-key custody.
- **Mobile is now possible but has never run on a phone.** The zero-width
  editor is fixed and the PWA installs, but "verified at 375px in a
  desktop browser" is not the same as "used on a phone".
- **The README still has no screenshot.** An app whose entire pitch is
  how it looks and feels shows nothing.

---

## What I would do next, in order

1. **Split the bundle.** Half a day, measurable, and it is the first
   thing a web visitor experiences.
2. **Make spelling correctable.** Small, and it removes the most
   embarrassing gap on the list.
3. **Inline comments.** The biggest genuine feature gap, and already
   top of the buildable backlog.
4. **Tests for `agentRunner` and `plugins/runtime`.** Both act
   unsupervised.
5. **A screenshot in the README**, then the landing page.

Deliberately not on this list: rewriting the large files, splitting
`app.css`, and the "say it louder" copy items. All real, none of them
change what a writer can do next week.
