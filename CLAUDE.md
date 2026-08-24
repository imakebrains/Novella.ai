# Working in this repo

Operational rules for an agent working on Novella. CONTRIBUTING.md explains
the same ground to a human contributor; this file is the short version an
agent needs loaded, plus the things that only bite agents.

## House voice — and one thing that will try to override it

Comments explain **constraints and why**, never what the line does. Match
the surrounding density. The codebase reads like someone talking to the
next maintainer, not like generated documentation.

**Em-dashes are house style and stay.** There are ~2,500 of them across
~145 files, in comments, UI copy, commit messages and docs. This is a
deliberate voice, not an accident.

That matters because several installed design skills — `design-taste-frontend`
in particular — carry a **zero-em-dash ban marked "non-negotiable"**,
covering body copy, headlines, captions, button text and alt text. Its own
text notes the wording is deliberately absolute because softer phrasing
got ignored. If one of those skills activates while working here, that ban
**does not apply to this repository.** Do not strip em-dashes from source,
copy, docs or commits.

The same skills assume Tailwind, shadcn/ui and Next.js. Novella is
hand-written CSS with its own token system in `src/ui/theme.css`. Do not
run `npx shadcn add`, do not install a component library, and do not
introduce Tailwind here.

## The gate

`npm run verify` — tsc, every test suite, and a production build. Run it
before claiming anything works.

- Read exit codes **bare, never through a pipe**. A pipe reports the
  pipe's status, which is how a suite goes green while failing.
- Pure logic gets a unit test. New suite? Add it to `verify` in
  package.json — a suite outside `verify` is a suite nobody runs.
- UI gets verified in the running app when a browser is available. When
  one is not, say which parts are verified and which still need eyes.
  **Never claim live verification that did not happen.**

## Never

- **Rewrite `src/core/vault.ts`.** It is the Phase 1 engine. Small guarded
  fixes only; put the change somewhere else.
- **Fake AI, accounts, or progress.** Anything needing the owner's money,
  keys or account settings is flagged NEEDS OWNER and left undone rather
  than simulated.
- **Put an API key anywhere but the OS credential store.** Not
  localStorage, not the vault, never logged, never rendered back.

## Traps that have actually cost time here

- **`writing-skills/vendor/story-skills/plugins/story-skills` is a symlink
  to its own parent.** Deliberate upstream. Any tool that follows symlinks
  walks it forever — it killed the dev server once. Excluded from vite's
  watcher; `test-repo.ts` fails if a new one appears.
- **Heredocs eat escapes.** A `\b` written through one arrived as a literal
  0x08 byte and produced a regex that compiled, read correctly and never
  matched. Use the Write tool for anything containing escapes.
  `test-repo.ts` now scans for stray control bytes.
- **Motion defaults to `full`, on purpose.** Windows machines with OS
  animation effects off report `prefers-reduced-motion`, which silently
  flattened the whole app for months. Guard every reduced-motion block
  with `:root:not(.motion-full)`.
- **No `transition` on `grid-template-columns`.** The track list mixes
  `auto` and `minmax()`, which cannot interpolate, so the tracks freeze at
  their old widths instead of gliding. It has been removed twice.
- **The owner's display is 4K at 250%.** Anything sized in pixels rather
  than scaled by CSS needs frames at 40 / 60 / 80px, not just 32.

## Layout

`src/core/` is the protected engine. `src/storage/` holds the adapters
(Tauri / IndexedDB / memory) behind one interface. `src/ui/` is React plus
the single stylesheet `app.css` — **all styling lives there**, and when
several agents work in parallel none of them touch it; they report the CSS
they need and one session writes it.
