# The phone writing layout — 390px

The spec for the writing screen on a phone, written so it can be applied
to `app.css` in one pass. The CSS in section 4 is the whole change; the
rest says why each rule is there, so nobody "tidies" one away.

Line numbers are `app.css:NNN` as of commit `3c6e92e`. If the file has
moved since, search for the selector — every one cited exists today.

## 1. Target and breakpoints

- **Target:** 390 × 844 logical pixels (a current iPhone; Android phones
  cluster 360–412). Touch, `hover: none`.
- **899px stays the one-column switch.** It is decided in JS
  (`src/ui/useCompact.ts`) because the workspace grid's track list is an
  inline style no stylesheet can override. Nothing here changes it.
- **480px is the phone chrome.** A 700px tablet window has room for the
  desktop editor head and a top toolbar; a phone does not. Two breakpoints
  far apart with different jobs are fine — it is two a hundred pixels
  apart that bites (useCompact.ts says the same about 899 vs 900).
- **The 44px floor is `(max-width: 480px) and (hover: none)`,** not width
  alone. That keeps 9.62's recorded decision (`app.css:11982`): touch
  sizing goes by input, because a narrow window on a mouse machine has
  none of these problems. Width is added only so a touch laptop at full
  width keeps its desktop titlebar; whether the extra selectors below
  should also join 9.62's plain `(hover: none)` block is the owner's call.

Where it goes: **one block appended at the very end of `app.css`**, after
the final `@media (prefers-reduced-motion: reduce)` block (`app.css:12165`),
under a `9.66` banner — 9.63, 9.64 and 9.65 are already taken
(`app.css:12071`, `12100`, `12122`). It adds no transition or animation, so
it needs no reduced-motion guard.

## 2. The DOM the rules act on

`EditorPane.tsx` renders, in this order, inside `<main class="editor">`
(a flex column, `app.css:395`, `position: relative` at `:403`):

1. `header.editor-head` — the title input (`.editor-title.editor-title-input`),
   the mono `.editor-path`, and `.editor-meta` (word count + board button)
2. `.format-bar` (`FormatBar.tsx`, `app.css:11050`)
3. `section.beats` (`BeatsPanel.tsx`, chapters and scenes only, `app.css:2337`)
4. `.editor-surface` — the only scroller (`.cm-scroller`, `app.css:442`)

Two consequences:

- **The title is already sticky.** It sits outside the only scroller, so
  it never scrolls away. No `position: sticky` needed; the work is making
  it small.
- **The toolbar moves with `order`, not JSX.** `order: 10` on `.format-bar`
  puts it after the surface. `EditorPane.tsx` is on the owner's
  heavily-changed list, so not touching it is the point. If a later
  version reorders the children, `order: 10` still puts the bar last,
  which is the intent.

The popovers need one more structural fact: the bar becomes a horizontal
scroller, and **a scroller clips any absolutely positioned child whose
containing block is inside it**. Setting `.fb-anchor { position: static }`
makes `.editor` the containing block instead — outside the scroller — so
the style and link menus open upward as a sheet across the editor.

## 3. The buttons under 44px

Measured in headless Chromium at 390×844, `isMobile` + `hasTouch`
(`hover: none` matched), on the Seed World demo with a chapter open,
before this CSS. `.icon-btn` and `.fb-btn` are **not** on the list: 9.62
(`app.css:12013`) already lifts them on touch, and they measured 44.

| # | Selector | Measured before | Where | Rule it had |
|---|----------|-----------------|-------|-------------|
| 1 | `.brand-vault` | 50 × 25 | titlebar project name (a button: opens Projects) | `app.css:87`, padding `:1008` |
| 2 | `.quick-create-btn` | 33 × 26 | titlebar "+ New" (word hidden ≤899, `app.css:11967`) | `height: 26px`, `app.css:3369` |
| 3 | `.view-switch.main-views button` | 42 × 31, 44 × 31 | titlebar Write / Board | `padding: 6px 16px`, `app.css:3339` |
| 4 | `.beats-head` | 390 × 36 | the scene-plan fold toggle | `padding: var(--space-2) …`, `app.css:2351` |
| 5 | `.beat-action` | ~25 tall (5px padding on text-xs) | Add / Suggest / remove in the open plan | `app.css:2425` |
| 6 | `.fb-pop-item` | 28–35 tall | rows of the paragraph-style menu | `app.css:11186` |

Also lifted in the same rule, because they are on the writing screen's
paths too: `.fb-link-go` (43 × 28 measured, the link popover's button,
`app.css:11251`), `.banner-action` (the storage/recovery banner buttons,
`app.css:6635`) and `.editor-menu-item` (the "add to board" menu,
`app.css:4967`). Neither of the last two was on screen in the probe.

After the CSS, the same probe found **no visible button under 44px** in
the writing layout — folded, with the plan open, and with each popover
open.

## 4. The CSS — append verbatim

```css
/* ============================================================
   9.66 PHONE — the writing layout at 390px

   One column is decided in JS at 899px (useCompact.ts); this block is
   the chrome that only makes sense on a phone. The format bar moves to
   the bottom, where the thumb is and where the keyboard pushes it; the
   title shrinks to one line; the scene plan stops taking half the
   screen. 480, not 899: a 700px tablet window still has room for the
   desktop editor head and a top toolbar. Two breakpoints far apart with
   different jobs are fine — it is two a hundred pixels apart that bites.

   Two pieces live outside this file: index.html's viewport meta
   (viewport-fit=cover, interactive-widget=resizes-content) and
   BeatsPanel's folded default. docs/MOBILE-LAYOUT.md has the why.
   ============================================================ */

@media (max-width: 480px) {
  /* The URL bar collapsing on scroll changes 100vh; dvh follows it.
     Browsers without dvh drop the line and keep .app's height: 100%. */
  .app {
    height: 100dvh;
  }

  /* 44px buttons plus the view switch's own padding and border are taller
     than the 46px basis (app.css:990), so the bar grows to its content
     instead of clipping it. The safe-area insets are zero until
     viewport-fit=cover, and only matter in landscape on a notched phone. */
  .titlebar {
    flex: 0 0 auto;
    min-height: 52px;
    padding-left: max(var(--space-2), env(safe-area-inset-left, 0px));
    padding-right: max(var(--space-2), env(safe-area-inset-right, 0px));
  }

  /* --- the compact title. The head is a flex child of .editor
     (app.css:395) and the only scroller is .editor-surface .cm-scroller
     (app.css:442), so the title is already pinned — no position: sticky.
     It just has to stop costing a sixth of the screen. --- */
  .editor-head {
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-1) var(--space-3);
  }
  .editor-title {
    font-size: var(--text-lg);
    line-height: 1.3;
    text-overflow: ellipsis;
  }
  /* The mono file path is desktop information; on a phone it is a
     second line under every title. */
  .editor-path {
    display: none;
  }
  .editor-meta {
    gap: var(--space-1);
  }

  /* --- the format bar becomes a bottom toolbar. flex `order` moves it
     below .editor-surface without touching EditorPane's JSX (DOM order:
     head, format bar, beats, surface). One scrolling row, not the
     desktop's wrap (app.css:11058): at 390 with 44px controls the wrap
     is two rows, 101px, and two rows plus a keyboard leaves a phone about
     a third of its height for prose. One row is the platform's own
     convention. --- */
  .format-bar {
    order: 10;
    flex-wrap: nowrap;
    overflow-x: auto;
    overscroll-behavior-x: contain;
    scrollbar-width: none;
    /* The height a 44px row makes on touch, held for a narrow mouse window
       too, so the popover offset below is right in both. */
    min-height: 53px;
    padding: var(--space-1) var(--space-2);
    padding-bottom: max(var(--space-1), env(safe-area-inset-bottom, 0px));
    border-bottom: 0;
    border-top: 1px solid var(--border);
  }
  .format-bar::-webkit-scrollbar {
    display: none;
  }
  /* The idle dim (app.css:11071) wakes on :hover, which a phone never
     sends; a half-visible toolbar under the thumb reads as disabled. */
  .format-bar[data-idle="true"] {
    opacity: 1;
  }
  .fb-sep {
    height: 24px;
  }

  /* --- popovers. A scroller clips any absolute child whose containing
     block is inside it, so the style and link menus would open INTO the
     now-scrolling bar and vanish. Unpositioning the anchor hands them to
     .editor (position: relative, app.css:403), outside the scroller, and
     they open upward as a sheet across the editor, just above the bar.
     The offset is the bar's own height: a 44px row, 4px top padding, the
     bottom padding above, and the 1px top border. --- */
  .fb-anchor {
    position: static;
  }
  .fb-pop {
    top: auto;
    left: var(--space-2);
    right: var(--space-2);
    bottom: calc(44px + var(--space-1) + max(var(--space-1), env(safe-area-inset-bottom, 0px)) + 1px + var(--space-1));
    min-width: 0;
    max-height: 50dvh;
    overflow-y: auto;
  }

  /* --- the scene plan: folded by default (BeatsPanel.tsx state, not
     CSS — the body is conditionally rendered), and when open it takes a
     third of the screen, not half (app.css:2339). --- */
  .beats {
    max-height: 34vh;
  }
  .beats-head {
    padding: var(--space-2) var(--space-3);
  }
  .beats-body {
    padding: 0 var(--space-3) var(--space-3);
  }

  /* iOS Safari zooms the page when a field under 16px takes focus and
     does not zoom back out. Both of these are 13px (app.css:2411, 11245). */
  .beat-text,
  .fb-link-input {
    font-size: 1rem;
  }
}

/* The 44px floor for everything 9.62 (app.css:12013) does not reach.
   By input AND width, keeping 9.62's rule (app.css:11982): a narrow
   window on a mouse machine has none of these problems, and a touch
   laptop at full width keeps its desktop titlebar. min-size so nothing
   re-centres; .icon-btn and .fb-btn are already covered by 9.62. */
@media (max-width: 480px) and (hover: none) {
  .brand-vault,
  .quick-create-btn,
  .view-switch.main-views button,
  .beats-head,
  .beat-action,
  .banner-action,
  .editor-menu-item,
  .fb-pop-item,
  .fb-link-go {
    min-width: 44px;
    min-height: 44px;
  }
  /* baseline (app.css:11183) pins the label to the top of a 44px row. */
  .fb-pop-item {
    align-items: center;
  }
}
```

## 5. The two pieces that are not CSS

Both landed with this spec, on `phase2/mobile`:

- **`index.html` viewport meta** gains `viewport-fit=cover,
  interactive-widget=resizes-content`. `viewport-fit=cover` is what makes
  `env(safe-area-inset-*)` non-zero, so the bottom bar can clear the iPhone
  home indicator. `interactive-widget=resizes-content` makes Android Chrome
  shrink the layout viewport when the keyboard opens, so a bar at the
  bottom of the flex column sits above the keys. Browsers that do not know
  either ignore them.
- **`BeatsPanel.tsx` starts folded when `COMPACT_QUERY` matches.** The
  scene plan cannot be collapsed by CSS: `open` is React state and the body
  is conditionally rendered, so `display: none` would leave the caret
  pointing the wrong way and make the first tap do nothing. The `/beat`
  slash command (`setOpen(true)`) and a tap on the head still open it.
  Seen folded in the probe.

## 6. What was verified, and what still needs eyes

Verified in headless Chromium against the dev server, with this CSS
injected by `addStyleTag` (not yet in `app.css`):

- no horizontal page scroll at 390; the titlebar fits (scrollWidth 390) with
  every control at 44px, so no further `.brand-vault` truncation is needed
- the editor head went from 110px to 53px, the prose surface from 551px to
  640px tall, the bar sits at the bottom as one 53px scrolling row
- the style and link popovers open 4px above the bar, full editor width, in
  both touch and a narrow mouse window; the link field renders at 16px
- the scene plan opens to 202px with every control at 44px

Not verifiable here — **needs a real phone:**

- **The keyboard.** Headless Chromium has no on-screen keyboard. Android
  Chrome should put the bar above the keys from the meta tag alone.
  **iOS Safari will not:** it never resizes the layout viewport for the
  keyboard (`interactive-widget` is Chromium-only), so on an iPhone the bar
  sits behind the keyboard until it is dismissed. The fix is a small
  `visualViewport` hook writing a `--kb-inset` custom property on `.editor`
  (a new `src/ui/useKeyboardInset.ts`, mounted in `EditorPane.tsx`) with
  `.format-bar { margin-bottom: var(--kb-inset, 0px) }` and the same amount
  added to the `.fb-pop` offset. `EditorPane.tsx` is on the owner's
  heavily-changed list, so that is a follow-up, not part of this pass.
- **Safe areas.** `env(safe-area-inset-*)` was zero in the probe; the notch
  and home-indicator padding are unseen.
- **`100dvh`** as the URL bar collapses and returns.
- **Real iOS focus-zoom** on the 16px fields.
- **The install prompt** and the maskable icon's crop on a real launcher.
