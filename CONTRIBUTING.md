# Contributing to Novella

Pull requests are welcome, including small ones. This file is short on
ceremony and specific about the few things that will get a change sent back.

## Running it

```bash
npm install
npm run dev          # browser build at http://localhost:5173
npm run tauri dev    # the real desktop app (needs Rust + a C toolchain)
```

`npm run dev` is enough for most work — the editor, codex, board, prose
analysis and export all run in a browser tab, backed by IndexedDB instead of
real files. You need `tauri dev` when your change touches the filesystem, the
window, the updater, or anything under `src-tauri/`. See
[Tauri's prerequisites](https://tauri.app/start/prerequisites/) for the Rust
side.

In a dev build a debug handle hangs off `window.__novella` — `state()`,
`probe()`, `analyse()`, and `store` — which is usually a faster way to check
behaviour than clicking. It is stripped from production builds entirely.

## The gate

One command, and it is the same one CI runs on every push and pull request:

```bash
npm run verify
```

That is `tsc --noEmit`, then every test suite in the repo root, then a
production build. All three, green, before a change is done.

**Run it bare, never through a pipe.** `npm run verify | tail` reports
*tail's* exit code, which is how a suite goes green while it is failing.
This has actually happened here.

Two more rules that go with it:

- **Pure logic gets a unit test.** The pattern throughout this codebase is to
  pull the decision-making out of the React component into a plain module —
  `src/ui/formatCommands.ts`, `src/ai/roles.ts`, `src/import/manuscript.ts` —
  and test that module hard. UI is thin; logic is proven. A new suite goes in
  the repo root as `test-yourthing.ts` and gets **added to the `verify`
  script in package.json**. A suite that is not in `verify` is a suite nobody
  runs: this repo once drifted to two suites in `verify` while roughly 870
  assertions sat unwatched.
- **Do not claim a UI was verified if it was not.** If you could not put the
  change on a screen, say so in the PR. Half the value of this project's log
  is that it distinguishes "tested" from "assumed".

## Two hard rules

**Never rewrite `src/core/vault.ts`.** It is the Phase 1 engine: frontmatter
parsing, wiki-link and backlink indexing, the relationship graph, search,
dangling-link detection, and the save round-trip. Everything else in the app
sits on top of it, and every note anyone has ever written with Novella is a
file it agreed to parse. Small, guarded fixes are fine. A rewrite, a
refactor, or a "while I was in there" tidy is not — take the improvement to
`src/state/vaultStore.ts`, which is the reactive shell built precisely so the
engine could stay still.

**Never edit someone else's file in a shared session.** Several agents and
people work this repository in parallel. If your change needs a line in a
file you are not working in, say which line rather than reaching in.

## Comment voice

Comments here explain **constraints and why**, never what the line does. The
reader can see the code; what they cannot see is the bug that made it look
like that.

```ts
// Pre-tick only the confident guesses. An unknown is a question, and
// a pre-ticked question is just a trap that creates junk entries.
```

```ts
// Bad: loop over the candidates and add the confident ones to the set.
```

The first tells the next person why changing it will break something. The
second is the code again, in English. Blocks at the top of a module earn
their length by explaining what the module is *for* and what it deliberately
refuses to do; inline comments should be one or two lines and should exist
because something non-obvious is true.

Same for user-facing text. Errors name the next thing to press. Nothing in
the UI claims a state the app has not actually reached — no progress bar for
work that is not happening, no "Connected" on a key nobody has tested. That
principle is why there is a **"Connected · not tested yet"** label in the
Connections screen: it is uglier than the alternative, and it is true.

## Why the commit log looks like that

Novella is partly built by an autonomous routine. [AUTOPILOT.md](AUTOPILOT.md)
holds its standing instructions: once a day it reads [ROADMAP.md](ROADMAP.md),
takes the topmost unchecked item (or does a research or QA pass instead, on a
cadence), builds it to the gate above, ticks the item, appends a dated log
line, and pushes. That is why commits arrive in daily-ish bursts with prose
subject lines, why ROADMAP.md carries a long dated log at the bottom, and why
RESEARCH.md has three dozen numbered rounds of competitor notes in it. Nothing
about it changes the rules for a human contributor — the routine passes the
same gate you do, and a red suite blocks it too. If you want to know what is
being worked on next, "Next up" in ROADMAP.md is the live answer.

## Opening a pull request

- Branch from `main`. CI runs `npm ci && npm run verify` on the PR.
- Keep the diff to one idea. A formatting sweep hidden inside a bug fix costs
  the reviewer the ability to see the bug fix.
- Say in the description what you verified and how, including what you
  could not.
- Bug reports and feature requests are equally welcome in
  [Issues](https://github.com/imakebrains/Novella.ai/issues).
- **Security problems do not go in a public issue.**
  [SECURITY.md](SECURITY.md) documents the app's posture and is worth reading
  first, but it is honest that the reporting channel is not settled yet —
  GitHub's private vulnerability reporting is not switched on for this
  repository. Until it is, contact the maintainer privately through their
  GitHub profile rather than filing publicly.

## License

By contributing you agree your work is licensed under
[Apache-2.0](LICENSE), like the rest of the project.
