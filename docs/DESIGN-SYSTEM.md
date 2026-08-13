# NOVELLA DESIGN SYSTEM — the premium pass

Synthesized from external research (Craft/iA/Ulysses/Bear/Type.ai; Linear/Raycast/Things/Arc;
premium-vs-cheap tells) and four internal audits (tokens, surfaces, interactions, typography).
This is the single source of truth for the polish pass. Evidence citations are
`app.css:NNN` = `src/ui/app.css`, `theme.css:NNN` = `src/ui/theme.css` unless another file is named.

**How to ship this:** app.css is an append-only override stack (base + cozy:974 + comfy:3844 +
round-7:5808 + round-8:5952) and that stack is *why* surfaces drift — components built between
passes inherit only the layers that existed then. This pass works differently: bug fixes and
dedupes edit the original rule in place; all NEW primitives land in ONE final block
(`/* === system pass (round 9) === */`) at the end of app.css; the dead pre-premium duplicate
blocks (app.css:76-79, 187-193, 454-464, 696-700) get deleted, not overridden again.

---

## 1. PRINCIPLES

1. **The page advances, the chrome recedes.** The editor is always the cleanest, quietest surface; chrome is grayscale-of-theme; the accent appears only on interactive, selected, or semantic elements.
2. **One recipe per role.** Every role — menu, input, chip, card-row, section header, status dot — has exactly one implementation; the `.ap-section` pattern (app.css:5867-5953) is the only dialect.
3. **Light comes from above.** Depth is a surface ladder plus hairlines plus layered, theme-tinted shadow stacks from a single light source — never one dark blob, never a full-contrast border.
4. **Motion teaches, never decorates.** Only `--motion-*`/`--ease-*` tokens; entrances ease out, exits are equal or faster, hot paths (palette rows, typing) are instant, and `.cm-editor` content never animates.
5. **Numbers sit still, words breathe.** Anything that ticks is set in a UI face with tabular figures; prose and titles get the serif; nothing reflows, jitters, or changes width while working.

---

## 2. TOKENS — theme.css changes

### 2a. REPLACE the shadow base sets (theme.css:60-66)

Same token names, so every existing `var(--shadow-sm/--shadow/--shadow-lg)` upgrades for free.
Three levels: **1 = resting cards/chips · 2 = popovers/menus/toasts/docked chrome · 3 = modals/palette.**
Dark stacks carry a 1px inset top highlight (the Linear/Raycast "machined edge"); light stacks
stay warm-tinted (`rgb(90 70 50)`), never pure black — the Things rule.

```css
  /* Shadow sets, shared by theme brightness. Layered: offsets roughly
     double per layer, alpha stays low. Dark = ambient depth + top bevel;
     light = warm ink, doubled offsets, hairline ring. */
  --shadow-dark-sm:
    0 1px 2px rgb(0 0 0 / 0.35),
    0 2px 8px rgb(0 0 0 / 0.22);
  --shadow-dark:
    inset 0 1px 0 rgb(255 255 255 / 0.04),
    0 2px 4px rgb(0 0 0 / 0.3),
    0 8px 24px rgb(0 0 0 / 0.35);
  --shadow-dark-lg:
    inset 0 1px 0 rgb(255 255 255 / 0.05),
    0 4px 12px rgb(0 0 0 / 0.35),
    0 16px 48px rgb(0 0 0 / 0.4),
    0 32px 80px rgb(0 0 0 / 0.28);
  --shadow-light-sm:
    0 1px 2px rgb(90 70 50 / 0.08),
    0 2px 6px rgb(90 70 50 / 0.06);
  --shadow-light:
    0 2px 4px rgb(90 70 50 / 0.08),
    0 6px 16px rgb(90 70 50 / 0.09),
    0 12px 32px rgb(90 70 50 / 0.07);
  --shadow-light-lg:
    0 4px 8px rgb(90 70 50 / 0.08),
    0 12px 32px rgb(90 70 50 / 0.11),
    0 24px 64px rgb(90 70 50 / 0.14);
```

**Elevation law:** menus/popovers/toasts/music-dock use `--shadow` (fixes the level-2 split at
app.css:2028/2078 vs 3025/3404/4162/4876); modals AND the command palette use `--shadow-lg`
(fixes palette/undo-toast lag at app.css:777/730 vs modal at 3878). No bespoke shadows.

### 2b. ADD to the `:root` block (after theme.css:58)

All derive from theme tokens, so no per-theme edits are needed — they re-resolve under every
theme and under accent personalization.

```css
  /* ---- system pass additions ---- */

  /* radius: xs legitimizes the 2-3px micro tier (diff marks, badge-warn,
     tiny chips). Nested-radius law: inner = outer - 2px, always. */
  --radius-xs: 3px;

  /* spacing: the 2px micro unit (~74 hardcoded 2/3px gaps today). */
  --space-05: 2px;

  /* type: 10px micro tier (16 hardcoded sites) + the 1.75rem board/banner
     hero size (app.css:1556, 1867). */
  --text-2xs: 0.625rem;
  --text-2xl: 1.75rem;

  /* leading: collapse the 12-value line-height spread. */
  --leading-tight: 1.25;  /* headings, clamped titles */
  --leading-ui: 1.5;      /* chrome, hints, labels — also set on body */
  --leading-prose: 1.75;  /* editor default; user override via --prose-leading */

  /* tracking: ONE overline value (currently 0.04/0.05/0.06/0.08/0.1em). */
  --tracking-caps: 0.06em;

  /* borders: the soft border for floating/overlay chrome — full-contrast
     --border-strong is for interactive edges only. */
  --border-soft: color-mix(in srgb, var(--border-strong) 60%, transparent);

  /* focus: the one ring, everywhere (matches .search:focus, app.css:1061). */
  --focus-ring: 0 0 0 3px var(--accent-soft);

  /* glow: the one accent-glow recipe (from .tool-picker-btn, app.css:5829).
     For semantic glows, substitute --success/--danger for --accent. */
  --glow-accent: 0 4px 18px color-mix(in srgb, var(--accent) 28%, transparent);

  /* scrims: modal backdrop tinted by the theme (flat black over vellum/linen
     parchment reads harsh — audit 1.3); photo overlays stay true black
     because cover art is arbitrary. */
  --scrim: color-mix(in srgb, var(--bg-app) 22%, rgb(0 0 0 / 0.5));
  --scrim-image: rgb(0 0 0 / 0.55);
  --fg-on-image: #fff;
```

### 2c. Token sweeps in app.css (find/replace, no design decisions left)

| Today | Becomes | Sites |
|---|---|---|
| `var(--bg-primary)` | `var(--bg-raised)` | app.css:4361 (BUG — undefined token) |
| `140ms`, `0.12s`, `0.15s`, `0.16s`, `120ms ease` | `var(--motion-quick) var(--ease-enter)` (color-only: `var(--ease-color)`) | ~43 literals: app.css:292, 925, 937, 1002-2409 range, 2480, 2855, 3847, 3850, 4966, 4975 |
| `0.2s`, `0.25s` | `var(--motion-standard) var(--ease-enter)` | app.css:1942, 2780(0.4s→`--motion-slow`), 2899, 3730, 5195 |
| `font-size: 10px` (and 9-13px literals) | `var(--text-2xs)` / nearest token | 16+ sites: app.css:60, 290, 896, 1265, 1367, 1467, 1512, 1778, 2262, 2266, 2280, 2318, 2800, 3293, 4129, 4715, 4894, 5002, 5010, 5336, 5350 |
| `border-radius: 2px/3px` | `var(--radius-xs)` | app.css:63, 2567, 2851, 5193, 5263, 5438, 5443, 5601 |
| `border-radius: 5px` (checkboxes) | `calc(var(--radius-sm) - 2px)` | app.css:3208, 3289 |
| nested-radius calcs | `calc(var(--radius-md) - 2px)` / `(--radius-sm) - 2px` | app.css:3339 (currently −3px), 4556, 4764 |
| `rgb(0 0 0 / 0.5)` backdrop | `var(--scrim)` | app.css:673 |
| `rgb(0 0 0 / 0.55/.75)` + `#fff` photo overlays | `var(--scrim-image)` / `var(--fg-on-image)` | app.css:1470-1476, 1549, 1558-1559, 2176-2177 |
| theme-blind literals | `color-mix(in srgb, var(--fg-primary) 12%, transparent)` (per .thread-dot:4818) | app.css:1573 (white ring — wrong on vellum/linen), 1609 (gray border) |
| gap/padding `2px`/`3px` | `var(--space-05)` (3px rounds to 2 or 4) | ~74 sites (audit cat. 4.1) |
| `padding: 6px 16px` | `var(--space-2) var(--space-4)` | app.css:3338 (main view-switch) |

---

## 3. SURFACE PUNCH LIST — ranked by first-time-user exposure

### P0 · Broken glass — fix before any styling ships
1. `--bg-primary` undefined → sprint presets render transparent in all 5 themes (app.css:4361).
2. `.banner-btn` class collision: app.css:3733 (music-dock ghost) clobbers app.css:1465 (photo-overlay scrim button) — rename the dock one `.dock-btn`; cover-art buttons get their dark wash back.
3. Invisible control: agent-detail enable toggle renders nothing — `<label class="switch">` missing its `<span class="switch-track"/>` (AgentsPanel.tsx:311-317; `.switch input` is opacity:0 at app.css:910-917).
4. `.settings-section-label` has zero CSS anywhere; 7 uses render unstyled, including a browser-default serif `<h2>` (SettingsModal.tsx:166; AgentsPanel.tsx:260, 263, 356, 361; BoardStats.tsx:127; MusicTab.tsx:74). Define once as the overline style (§4.10).
5. Dead goal classes: `.goal-today` and `.session-goal-line` undefined; the goal line also sets `bottom` on a static div so it can never render (GoalMeter.tsx:66, 110). Implement or delete.
6. `.board-head` defined twice with conflicting alignment (app.css:1857 vs 2909) — merge into one.

### 1 · First-run shell: editor empty state + banners
*The literal first screen: "No note open" plus a persistence banner is many users' entire first impression.*
1. Rebuild the global `.empty-state` (app.css:432-443) per §4.5 — dimmed serif glyph, one line, quiet CTA, `rise-in` entrance. First application: "No note open." (EditorPane.tsx:341-350) becomes "Start writing — or press Ctrl+K." with a real button.
2. Apply the same component to TableView.tsx:90-93, BoardStats.tsx:70-73, Corkboard.tsx:229-248, CodexPane.tsx:183-185, `.pg-no-threads` (app.css:3075-3084).
3. Banners (App.tsx:344-365, RecoveryBanner.tsx:38-56; app.css:22-41, 1805-1819): `bg-raised`, `--border-soft`, `--radius-sm`, `--shadow-sm`, an icon slot, and `surface-in` entrance; `.banner-action` (app.css:37-41) becomes a quiet bordered button, not an underlined text link.
4. Titlebar micro-chrome onto tokens: `.badge-warn` 3px/10px literals (app.css:57-64) → `--radius-xs`/`--text-2xs`; `.save-status` (app.css:1793-1803) gets the numeric voice (§4.7).

### 2 · The "AI is writing" moment
*The hero interaction of an AI writing app currently has zero designed loading language (audit: no spinner/skeleton/shimmer anywhere).*
1. Streaming caret on `.generated` (app.css:637-651) and Beats placeholder (BeatsPanel.tsx:216 — a literal "…" string) per §4.6. Never inside `.cm-editor`.
2. Busy buttons stop reflowing: "Writing…"/"Working…"/"Running…" label swaps (InspectorPane.tsx:485, ExportModal.tsx:229, AgentsPanel.tsx:155, 337) get `min-width` locked and the 14px spinner (§4.6).
3. "Checking for Ollama…" (InspectorPane.tsx:520) becomes spinner + hint, reusing the existing `.agent-state-dot.busy` pulse vocabulary (app.css:4600-4608, its duration `1s` → tokens).
4. `.select` in the Assistant tab (app.css:614-629) gets `appearance: none` + themed chevron so the native control stops leaking through all 5 themes.

### 3 · Command palette
*Flagship Ctrl+K surface, visually the oldest modal interior (app.css:762-846; CommandPalette.tsx:100-143).*
1. Kind column uses the `--type-*` colors that already exist per theme (theme.css:100-107) instead of a bare glyph (app.css:817-835).
2. `.picked` state: `--accent-soft` fill + `--radius-sm` (app.css:813-815), matching menu-item selection everywhere else.
3. Surface promotion: `--shadow-lg` + `--border-soft` (from `--shadow` + `--border-strong` at app.css:775).
4. Footer hint (app.css:841-846): `--text-2xs`, `--fg-muted`, overline tracking.
5. Frequency rule holds: entrance stays `rise-in` at `--motion-quick`; row hover/selection moves get NO transition (instant), per research — hot paths cost zero time.

### 4 · Settings → Profile (the default tab)
*One click from the `.ap-section` showcase; maximum old/new whiplash (SettingsModal.tsx:54, 104-174).*
1. Migrate to `.ap-section`/`.ap-title`/`.ap-sub` structure; retire the `.setting`/`.hint` Field rows (app.css:953-966) on this tab.
2. All text inputs become `.field-input` (§4.4).
3. Section label at SettingsModal.tsx:166 resolved by P0-4.

### 5 · Export modal (the payoff moment)
*Finishing work is emotional; the surface is entirely pre-premium (ExportModal.tsx:132-238; app.css:1373-1404).*
1. "Format" uppercase `.settings-cat` (ExportModal.tsx:185) → `.ap-title` section headers.
2. Radio list (app.css:186-201, 1339-1356): native dot themed at minimum via `accent-color: var(--accent)`; selected row gets `--accent-soft` fill + soft border.
3. `.export-summary` (app.css:1388-1397) becomes a proper card: `bg-raised`, `--border`, `--radius-md`, `--shadow-sm`, tabular numerals for counts.
4. Busy state (ExportModal.tsx:229) uses the §4.6 spinner + locked width.

### 6 · Board family: entrances, Table view, music dock
*Every modal/menu animates but all five board layouts and the dock hard-cut in — the inconsistency itself reads cheap (App.tsx:367-413).*
1. Add `animation: surface-in var(--motion-standard) var(--ease-enter)` to `.corkboard` (app.css:1849/3859) and `.music-dock` (app.css:3626); `.tucked` (app.css:3642-3650) gets `transition: opacity var(--motion-quick) var(--ease-enter)` instead of a jump.
2. Merge the two competing `.board-card` hover rules (app.css:1900-1904 vs 3846-3853) into one: `--shadow`, translateY(-2px), tokens; restore border-color/opacity in the transition list.
3. Table view (app.css:5029-5117): serif `--text-sm` header via the shared title voice, `th` underline softened `--border-strong`→`--border` (app.css:5047), row padding `--space-2`/`--space-3`, `td.num` tabular (§4.7).
4. One chapter-title voice across layouts (typography F7): serif 600 `--text-sm` for `.card-title` (app.css:2228), `.table-title` (5093), `.pg-chapter-title` (3120), `.stats-col-title` (5221).
5. Board hero sizes onto `--text-2xl` (app.css:1556, 1867).

### 7 · Settings → Connections ("is my AI working")
*The anxiety surface (SettingsModal.tsx:474-747; app.css:3884-3956).*
1. `.connection-card` (app.css:3891-3907) gets hover: border→`--border-strong`, `bg-hover`, `--motion-quick` — currently the only card family with none.
2. Section headers (SettingsModal.tsx:567, 636, 641, 672) → `.ap-title`.
3. Key/endpoint fields → `.field-input` with the focus ring — these hold API keys; focus certainty matters most here.
4. Probe/model results (SettingsModal.tsx:723-737) → status chips using `--success`/`--danger` + `--accent-soft`-pattern fills; keep the one good glow (`connection-dot`, app.css:3917-3920) but re-express via the `--glow-accent` recipe with `--success`.

### 8 · Settings → Agents
*Densest old-era surface (AgentsPanel.tsx; app.css:3959-4110, 4571-4749).*
1. P0-3 (invisible switch) and P0-4 (labels) land here first.
2. `.agent-form` inputs/selects/textarea (app.css:4056-4108) → `.field-input`; selects get `appearance: none`.
3. `.agent-meta-key` overline (app.css:4713-4714) onto `--tracking-caps`; meta grid spacing onto tokens.
4. Row/template hover unified with the §4.4 card-row recipe (app.css:3985, 4577).

### 9 · Inspector tab family
*Shared home of small cuts and orphan empties.*
1. `.pg-thread-pop` is missing from the menu-entrance list — it snaps in while every sibling rises (add to app.css:5770-5776).
2. History revision expand (HistoryPanel.tsx:89-107; app.css:2534-2540): animate with `grid-template-rows: 0fr→1fr` + opacity at `--motion-standard`; ClearHistory's armed state (HistoryPanel.tsx:125-161) gets a visible `--danger` border pulse.
3. Tasks/Continuity/History/Assistant empties → §4.5 component (TasksPanel.tsx:52-62, ContinuityPanel.tsx:30-45, HistoryPanel.tsx:34-51, InspectorPane.tsx:70, 157, 370).
4. Right-pane header voice unified: `.sprint-title` caps-sans (app.css:4343-4351) joins the serif pane-header pattern of `.inspect-title` (app.css:1102-1110); `.group-head` (app.css:1066-1071) converts too — the left pane currently speaks the pre-premium dialect.

### 10 · Primitive consolidation sweeps (cross-surface)
*The mechanism fix: one recipe per role (audit cat. 5).*
1. Six dropdown surfaces → `.menu-pop` (§4.4): app.css:2018, 2068, 3017, 3395, 4154, 4869. Five item styles → `.menu-item`: app.css:799, 2082, 3053, 4169, 4901. Standard: `--radius-md`, `--shadow`, `--border-soft`, z-index 40.
2. Eleven bespoke text inputs → `.field-input`: app.css:2642, 3160, 3411, 3808, 4062, 4093, 4511, 4791, 4842, 4930, 5615.
3. Four segmented controls → one geometry (`bg-raised`, 2px pad, `--radius-md`, inner `calc(var(--radius-md) - 2px)`): app.css:1823, 3325, 4544, 4750.
4. Merge duplicate primitives: checkbox (app.css:3201/3284), stat tile (1206/2817), swatch (3037/5638/5890 — keep the `.ap-swatch` springy version), status dots (audit 5.10 — one `.dot` with size/ring/glow modifiers).
5. Row-card normalization (10+ variants, audit 5.6): `bg-raised`, `--border`, `--radius-md`, hover → `--border-strong` + `bg-hover`.
6. Chip normalization (6 variants, audit 5.4) onto the `.ap-tool-chip` recipe (app.css:5938-5953).

---

## 4. DETAILS PASS — global fixes

All new CSS below goes in the single `system pass (round 9)` block.

### 4.1 Focus rings
The designed ring exists on exactly ~2 of ~25 focusable styles; every button shows the Chromium UA
default, and several inputs kill the outline with no replacement (accessibility bug).

```css
/* One ring. Buttons and rows get the offset outline; fields get the
   soft ring via .field-input. Never inside the editor. */
:where(button, [role="button"], a, summary, [tabindex]):focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-radius: var(--radius-xs); /* only where the element has none */
}
:focus:not(:focus-visible) { outline: none; }
.cm-content:focus-visible, .cm-editor :focus-visible { outline: none; }
```
Delete the bare `outline: none` declarations with no replacement at app.css:3173-3175, 4802-4804,
4853-4855, 4941-4943; every field adopting `.field-input` (§4.4) gets `--focus-ring` instead.

### 4.2 Buttons come alive
`.btn-primary` — the app's main CTA — currently has no hover (app.css:566-582) and NOTHING in the
app has a pressed state.

```css
.btn-primary {
  transition: filter var(--motion-quick) var(--ease-color),
    transform var(--motion-quick) var(--ease-enter),
    box-shadow var(--motion-quick) var(--ease-enter);
}
.btn-primary:hover { filter: brightness(1.08); box-shadow: var(--shadow-sm); }
/* The universal press — cheap to add, universally felt. */
:where(.btn-primary, .btn-ghost, .save-btn, .icon-btn, .tool-picker-btn,
  .quick-create-btn, .banner-action, .ap-tool-chip, .view-switch button,
  .tasks-mode-btn, .board-pick, .sprint-preset, .cal-day, .intro-primary):active {
  transform: scale(0.97);
}
```
Hover on colored elements is `brightness()`, never a second color token (Linear rule).
Hover on neutral rows stays `bg-hover` — one rung up the existing ladder.

### 4.3 Scrollbars
Keep `scrollbar-width: thin` (theme.css:340-343); add the pill thumb with invisible hit-padding:

```css
::-webkit-scrollbar { width: 10px; height: 10px; }
::-webkit-scrollbar-track, ::-webkit-scrollbar-corner { background: transparent; }
::-webkit-scrollbar-thumb {
  background: var(--border-strong);
  background-clip: content-box;
  border: 3px solid transparent;
  border-radius: 999px;
}
::-webkit-scrollbar-thumb:hover { background-color: var(--fg-muted); }
```

### 4.4 Shared primitives (referenced throughout §3)

```css
/* THE menu surface + item. */
.menu-pop {
  position: absolute; z-index: 40; min-width: 180px;
  padding: var(--space-1);
  background: var(--bg-raised);
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow);
}
.menu-item {
  display: flex; width: 100%; align-items: center; gap: var(--space-2);
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-sm);
  font-size: var(--text-sm); text-align: left;
}
.menu-item:hover { background: var(--bg-hover); }
.menu-item.danger { color: var(--danger); }

/* THE text field. One background (bg-editor: "you write here"), one ring. */
.field-input {
  padding: var(--space-1) var(--space-2);
  background: var(--bg-editor);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  caret-color: var(--accent);
  transition: border-color var(--motion-quick) var(--ease-color),
    box-shadow var(--motion-quick) var(--ease-color);
}
.field-input:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: var(--focus-ring);
}
```

### 4.5 Empty states
Quiet, not illustrated-mascot: dimmed serif glyph, one line, one quiet action (research: Bear/Ulysses
model; copywriting in the app is already strong — keep the words, upgrade the container).

```css
.empty-state {
  display: grid; place-items: center; gap: var(--space-2);
  padding: var(--space-6) var(--space-4);
  text-align: center; color: var(--fg-muted);
  animation: rise-in var(--motion-standard) var(--ease-enter);
}
.empty-glyph {
  font-family: var(--font-display);
  font-size: var(--text-2xl);
  opacity: 0.35;
}
.empty-line { font-size: var(--text-sm); max-width: 36ch; line-height: var(--leading-ui); }
.empty-cta {
  margin-top: var(--space-1);
  padding: var(--space-1) var(--space-3);
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  color: var(--fg-secondary);
  font-size: var(--text-sm);
  transition: border-color var(--motion-quick) var(--ease-color),
    color var(--motion-quick) var(--ease-color);
}
.empty-cta:hover { border-color: var(--accent); color: var(--fg-primary); }
```

### 4.6 Loading language
No dependencies: one spinner, one streaming caret, one law (busy controls never change width).

```css
.spinner {
  width: 14px; height: 14px; border-radius: 50%;
  border: 2px solid var(--accent-soft);
  border-top-color: var(--accent);
  animation: spin 800ms linear infinite;
}
@keyframes spin { to { rotate: 1turn; } }

/* AI streaming affordance — .generated and beats ONLY, never .cm-editor. */
.stream-caret::after {
  content: ""; display: inline-block;
  width: 2px; height: 1em; margin-left: 2px;
  background: var(--accent); vertical-align: text-bottom;
  animation: caret-blink 1s steps(1) infinite;
}
@keyframes caret-blink { 50% { opacity: 0; } }

@media (prefers-reduced-motion: reduce) {
  .spinner { animation-duration: 1.2s; } /* slow, not seizure-frozen mid-arc */
  .stream-caret::after { animation: none; opacity: 1; }
}
```

### 4.7 Tabular numerals — the numeric voice
Iowan/Palatino has no `tnum` table, so `tabular-nums` on `--font-display` silently does nothing
(app.css:1212-1218, 2193-2198) and serif live numbers jitter. Law: **anything that ticks is
`--font-ui` (or `--font-mono`) + tabular figures; the serif is for words.**

```css
.tnum { font-variant-numeric: tabular-nums lining-nums; }
```
Apply `--font-ui` 600 + `.tnum` to: `.cal-clock-time` (app.css:4202-4206), `.goals-today`
(4486-4490), `.session-stat-value` (2823-2827), `.critique-count` (2288-2292),
`.chapter-table td.num` (5081-5085), `.stat-value` (1212), `.card-index` (2193),
`.save-status` word counts (1793). Word count consolidates to two voices only: `--font-ui` xs
tabular in chrome, `--font-mono` in data tables — retiring the five current stylings (audit F5).

### 4.8 Selection + caret
`::selection` already passes (theme.css:336-338). Complete it:

```css
.cm-content, input, textarea { caret-color: var(--accent); }
```

### 4.9 Tooltips
127 native `title=` attributes leak the OS-default tooltip through all 5 themes. CSS-only primitive:

```css
[data-tip] { position: relative; }
[data-tip]::after {
  content: attr(data-tip);
  position: absolute; bottom: calc(100% + 6px); left: 50%;
  translate: -50% 0;
  padding: var(--space-05) var(--space-2);
  background: var(--bg-raised);
  color: var(--fg-primary);
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-sm);
  font-size: var(--text-xs); line-height: var(--leading-ui);
  white-space: nowrap;
  opacity: 0; pointer-events: none;
  transition: opacity var(--motion-quick) var(--ease-enter);
  transition-delay: 400ms; /* delay in, not out */
  z-index: 60;
}
[data-tip]:hover::after, [data-tip]:focus-visible::after { opacity: 1; transition-delay: 400ms; }
[data-tip]:not(:hover):not(:focus-visible)::after { transition-delay: 0ms; }
```
Migration: swap `title=` → `data-tip` on high-frequency chrome first (App.tsx ×14,
InspectorPane.tsx ×15, Corkboard.tsx ×12, CritiquePanel.tsx ×10). The long instructional copy
currently riding in `title=` (NoteMenu.tsx:99, 115, 133, 205; InspectorPane.tsx:476, 504) moves
into visible hint text or gets shortened — tooltips are ≤ one line.

### 4.10 Typography normalization (from the typography audit's unified scale)
| Level | Spec | Applies to |
|---|---|---|
| Hero | display 600, `--text-2xl`, −0.01em | board/banner titles (app.css:1556, 1867) |
| Surface title | display 600, `--text-xl`, −0.01em | already correct: editor-title 1092, modal-head 2444 |
| Section header | display 600, `--text-lg`, −0.01em (= `.ap-title`) | migrate `.settings-cat` uses (851-858), `.import-section h3` (2618) |
| Pane header | display 600, `--text-sm`, +0.02em | `.pane-title` 1033, `.inspect-title` 1102, `.beats-title` 2348, `.group-head` 1066, `.sprint-title` 4343 |
| Overline | `--font-ui` 600, `--text-xs`, uppercase, `--tracking-caps` | `.settings-section-label` (P0-4), remaining caps labels: 855, 1070, 2833, 2966, 4349, 4714, 4897, 5339; delete stray tracking at 2342, 3463 |
| Body / secondary / caption / micro | `--text-base` / `--text-sm` / `--text-xs` / `--text-2xs` | the §2c font-size sweep |

Plus: `body { line-height: var(--leading-ui); }` (currently browser-default ~1.2); weight 700
outliers → 600 (app.css:2796, 3462, 3841, 4279, 4788); delete superseded pre-premium blocks
(app.css:76-79, 187-193, 454-464, 696-700).

### 4.11 Border softening
Floating/overlay chrome moves from `--border-strong` to `--border-soft`: modal 683, palette 775,
undo-toast 728, the six menus (via `.menu-pop`), music-dock 3633, quick-create 3371/3402,
view-switch 3327. Small form controls (switch-track 923, kbd 3520, intro-field 5618) move to
`--border`. The 2px dashed ghost-card (2127) matches the 1px dashed `.ap-swatch-custom` (5911).
`--border-strong` remains for interactive/hover edges and drag targets only.

---

## 5. OUT OF SCOPE — research ideas that fight Novella's DNA

1. **New fonts.** No iA Quattro, Bear Sans, Inter, or any shipped webfont. The Iowan Old Style/Palatino stack IS the identity; measured type values from research inform sizing only.
2. **Editor dimming/typewriter/focus modes and any animated treatment inside CodeMirror.** `.cm-editor` content must never animate (the exclusion at app.css:5800-5806 is law; typing latency is the product). Paragraph-opacity focus modes, animated AI-text tinting, markdown syntax-hiding, WYSIWYG hybrids — all rejected for this pass.
3. **Light/dark binary, LCH-generated palettes, theme marketplaces.** Novella has five hand-tuned worlds, not a settings matrix. All work happens through the existing token names so every theme inherits it; no theme gets special-cased CSS.
4. **Chrome auto-hide on typing (iA) and card-zoom spatial transitions (Craft).** The persistent three-pane workspace is Novella's model, and the motion budget is capped at `--motion-slow` with `--motion-intro` reserved for the welcome flow. No springs libraries, no per-item list staggers outside the intro, no scroll-linked effects.
5. **Glassmorphism and texture as default.** Frosted glass exists only in `:root.has-backdrop` mode (app.css:5987-6001) where the writer chose an image; no paper-texture PNGs, no new asset or JS dependencies of any kind. Every fix in this spec is CSS + existing markup (plus the small `data-tip`/class swaps named above).
