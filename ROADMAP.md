# Novella roadmap

The working backlog. The autonomous build routine reads this file, takes the
**topmost unchecked item**, builds it to the gate below, checks it off with a
dated log line, and pushes. Humans edit it freely — reorder, add, strike.

## The gate (every change, no exceptions)

- `npx tsc --noEmit` clean, `npx tsx test-units.ts` green, `npm run verify` green.
- Pure logic gets unit tests in `test-units.ts`.
- UI changes verified in the running app (dev server + `window.__novella`),
  not assumed.
- Never rewrite `src/core/vault.ts` (Phase 1 engine — small guarded fixes only).
- Match the codebase's comment voice: explain constraints, not mechanics.
- Commit to `main` with the Co-Authored-By line; push.
- Release tags are cut ~weekly, only when user-visible features shipped and
  the suite is green: bump `version` in `package.json` + `src-tauri/tauri.conf.json`,
  then `git tag vX.Y.Z && git push origin vX.Y.Z` (CI builds installers).

## The thesis (what "#1" means here)

Research keeps returning the same finding: **writers run 3–4 apps because no
one app does the whole job** — a focus/sprint timer, a notes-and-worldbuilding
tool, a task manager, and a word-count tracker, each solving one piece.
Novella's bet is to be the one app that does all four *and* writes with you,
locally, with no API key and no per-word cost. Every roadmap item should
either collapse one of those four apps into Novella or defend the local-first
advantage. Items that do neither belong at the bottom.

The Notion comparison (round 6) adds three standing guardrails, because they
are exactly why people quit Notion: stay FAST as projects grow (measure it),
keep structure FLAT (nothing buried five layers deep), and keep leaving easy
(plain Markdown, one-click export — lock-in is a churn engine, not a moat).

## Next up

- [x] **Slash commands in the editor** — shipped 2026-07-22.
- [x] **Writing sprints (the fourth app)** — shipped 2026-07-23.
- [x] **Ctrl+K everywhere** — shipped 2026-07-23.
- [x] **Table view for the manuscript** — shipped 2026-07-23.
- [x] **Alt+↑/↓ moves the current paragraph** — shipped 2026-07-23.
- [x] **Note templates** — shipped 2026-07-23: right-click → Save as template (Templates/, `(template)` suffix so links never mis-resolve); + New stamps from it with {{name}}/{{date}}.
- [x] **Drag images onto board cards** — shipped 2026-07-23: drop → downscaled JPEG at `.novella/images/<note-id>.jpg` (travels with the folder), lazy-hydrated on board render, ✕ to remove.
- [x] **Personalization: accent color + prose font/size** — shipped 2026-07-23: Settings → Appearance, on top of any theme, per device; reset button.
- [x] **Quiet first run** — shipped 2026-07-23: first launch opens the editor alone on the seed chapter; Codex/Tools one labeled click away; pane choices remembered.
- [x] **Rename notes in place** — shipped 2026-07-23.
- [x] **Word-level diff inside History's changed paragraphs** — shipped 2026-07-23.
- [x] **Continuity checks, deterministic tier** — shipped 2026-07-23: Continuity inspector tab; provable checks only (early mention via `introduced:`, near-duplicate codex names, dangling links with counts, unordered chapters, unknown POV); click opens the note; 9 unit checks.
- [x] **OS keychain for API keys (desktop)** — shipped 2026-07-23: secret_set/get/delete Tauri commands over the `keyring` crate (Credential Manager / macOS Keychain / Linux keyutils); JS write-through + hydrate-at-register; web stays memory-only; Rust round-trip test passes against the real store; SECURITY.md updated.
- [x] **Export presets per format** — shipped 2026-07-23 (.novella/export.json, restored on open).
- [ ] **Inline comments / margin notes on manuscript text** — research
      round 7 (2026-07-24): Dabble Premium and every beta-reader workflow
      lean on comment markup; we have none, so feedback currently
      round-trips through Google Docs. Attach a note to a text range
      without touching prose, show it in a margin gutter, resolve/reply.
      Collapses one more reason to leave the app — high priority against
      the thesis.
- [ ] **Notion-parity pass, ongoing** — owner: "make this look and function
      exactly like Notion but better." Next concrete gaps: block-style
      hover handles in the editor, inline databases-as-tables on notes,
      synced project sidebar collapse, cover images on note headers.
      One gap per run, verified live.
- [ ] **NovelCrafter-parity pass, ongoing** — codex entry templates per
      type (character sheets with fields), chat-with-your-book mode,
      scene status labels (draft/revised/done) surfaced on cards and
      table. One per run. Research round 8 (2026-07-25): NovelCrafter's
      most-praised planning surface is its Matrix view — a spreadsheet of
      chapters × columns (POV, subplot, summary) with single-click POV
      reassignment. We already have every underlying field (`pov`
      frontmatter, `plot.json` subplot threads in PlotGrid) but display
      them read-only on cards, not as an editable spreadsheet. Verified
      by grep: POV appears in Corkboard.tsx and PlotGrid.tsx as a
      read-only label, never an editable field. Research round 11
      (2026-07-28): NovelCrafter's March 21, 2026 Codex update added two
      small, concrete gaps, verified against our own code — entries can
      now belong to more than one custom category (ours carries a single
      `type` field, checked in `CodexPane.tsx`/`QuickCreate.tsx`), and an
      entry can be marked case-sensitive to stop false-positive text
      matches (e.g. character "Will" vs. the word "will") — our Continuity
      inspector's near-duplicate-name check has no such option. Research
      round 13 (2026-07-30) reinforces the chat-with-your-book half of
      this item: type.ai markets a 200k-token context window specifically
      so the model "sees" the entire manuscript, not just what's manually
      selected. Checked our own `src/ai/context.ts` — by design it sends
      only the referenced codex entries, the tail of the current scene
      (6,000 chars), and other chapters as titles only, never full bodies
      (the token-economy rule from the file's own header comment). Right
      call for a local 8B-class model's context window and speed, but it
      means a true whole-manuscript Q&A mode needs its own retrieval
      design, not just a bigger prompt — scope that when this item is
      picked up. Research round 15 (2026-08-01): Sudowrite shipped its own
      "Chat" and "Feedback" features May 12, 2026 with full context of
      characters/outline/story world, plus the ability to edit existing
      documents and create new ones — both major cloud competitors have
      now converged on chat-with-your-book. That means the feature's mere
      existence stops being a competitive edge once built; the
      differentiator that survives is local/private/no-per-token-cost, not
      "an AI that knows your book," so lead any future copy or design for
      this half of the item with that framing rather than parity alone.
- [ ] **Voice-matching from the writer's own prose, not just style templates**
      — research round 11 (2026-07-28): checked our own Upload style flow
      (`InspectorPane.tsx`) — it imports a .txt/.md file as the literal body
      of a new prompt note, so the writer still has to hand-author a
      template describing the voice they want. A new direct competitor,
      Novel Mage, ships "Writer's Voice": upload samples of the writer's
      own past prose and future generations are matched to it, no
      template-writing required. Distinct from the existing style-menu
      system (round 3) — today's styles are hand-authored, never learned
      from the writer's own words. This is core to the "writes with you"
      half of the thesis, not a worldbuilding nice-to-have, so it ranks
      above the location map/timeline items below.
- [ ] **Recommend a fiction-capable local model instead of silently defaulting
      to a generic one** — research round 12 (2026-07-29): checked our own
      one-click setup — `DEFAULT_MODEL = "llama3.1:8b"` in
      `src/plugins/providers/ollama.ts` is pulled by `SetupPanel.tsx` with no
      alternative offered and no explanation shown anywhere in the flow.
      Sudowrite's entire product differentiator is Muse, a model fine-tuned
      specifically on published fiction rather than general web text, and
      several independent 2026 write-ups on local AI for novelists converge
      on the same point from the other direction: writers who go local
      deliberately seek out community fiction fine-tunes or uncensored
      variants (the Nous-Hermes line, uncensored Llama 3.3 builds) over stock
      instruct models, specifically because generic instruct models moralize,
      refuse, or sanitize dark scenes a novelist may need to write. A
      first-time Novella writer's very first generation runs on the generic
      default with no way to know a better-suited local option exists or
      that a disappointing result is fixable — the worst possible moment for
      the "writes with you, no gatekeeper" half of the thesis to
      underdeliver. Ranks above the reasoning-toggle item below because it
      affects every local-AI writer's first impression, not just Chat/Scene
      Beats users on reasoning-model families. At minimum: surface model
      choice with a one-line note on why (fiction-tuned alternatives exist;
      local models don't apply cloud-style content policies), even if the
      shipped one-click default stays conservative for install-size reasons.
      Research round 13 (2026-07-30) adds a concrete candidate for that
      alternative list: a Local AI Master write-up on local setups for
      novelists names Qwen 2.5 32B as beating Llama 3.1 70B on fiction-
      specific metrics — more literary training data, better character-
      voice consistency, editor-quality line-edit suggestions — worth
      weighing alongside the community fine-tunes already named above
      once this gets built. Research round 15 (2026-08-01) sharpens the
      "no gatekeeper" half with fresh competitive evidence: Sudowrite is now
      actively marketing an "uncensored fiction" positioning (dark romance,
      erotica, dark fantasy) around Muse, contrasted against Claude/ChatGPT
      refusals — but users report Sudowrite's own Claude-routed pipelines
      still inconsistently reintroduce refusals or toned-down output
      depending on phrasing. A genuinely local model with zero vendor-side
      moderation is a structural advantage over that inconsistency, not
      just a "less restrictive" alternative — worth stating plainly once
      this item ships, though which content the shipped default should
      permit by design is a values call for the owner to make deliberately,
      not something to default into silently.
- [ ] **Per-request reasoning toggle for local models** — research round 11
      (2026-07-28): NovelCrafter's Jan 9, 2026 "AI Thinking" release lets a
      writer prefer/avoid reasoning tokens per request, across Scene Beats
      and Chats. Matters more for us than for NovelCrafter's cloud models:
      local reasoning models (the DeepSeek-R1 family via Ollama) emit a
      visible "thinking" preamble before the prose itself — slow and
      distracting for a plain continue-the-paragraph request, useful when
      working out a plot problem in Chat. Grepped `src/ai` for
      "reasoning"/"thinking" — no matches; every request is treated
      identically regardless of model or task.
- [ ] **Location map / pinboard for codex locations** — research round 7:
      Campfire's headline feature (maps + timelines linked to the
      manuscript) is what fantasy/sci-fi reviewers rate it 4/5 for. Pin
      codex location entries onto an uploaded map image; reuses the
      card-image upload path already shipped for board cards. Worldbuilding
      counterpart to the existing Relationship web.
- [ ] **Timeline view for story chronology** — research round 10
      (2026-07-27): Campfire's Timeline module plots events, scenes and
      character appearances on one or more horizontal timelines, explicitly
      pitched at dual-timeline and multi-POV books where story-internal
      order and manuscript order diverge; its Arcs module links the same
      events to per-character development arcs. Verified we have nothing
      like it — grepped the codebase and the only "timeline" hits are an
      agent example prompt and unrelated seed text, no feature. This is
      the chronology counterpart to the location-map item above (both
      Campfire headline features, both unbuilt) and doubles as a stronger
      Continuity inspector: today's "unordered chapters" check only knows
      manuscript order, not in-world date order for flashback-heavy or
      multi-POV books. Lower priority than the map since it's a bigger
      surface (needs an in-world date field on scenes), but the same
      genre-fiction audience wants both.
- [ ] **Say the four-app bundle louder, not just "local AI, no subscription"**
      — research round 11 (2026-07-28): three new products (LocalProse,
      Novel Mage, Noveling) now market themselves in nearly the same words
      Novella does — local AI, zero cloud, no subscription. That half of
      the differentiation is no longer unique to us. Checked all three:
      none fold in task management or a sprint/focus timer — the "one app
      instead of four" half of the thesis is untouched competitive ground.
      First-run and marketing copy should lead with the bundle (writing +
      worldbuilding + tasks + sprints, one local app) rather than the
      local-AI half alone, since that half now has three named competitors
      saying the same sentence. Placed above the copy items below because
      it defends the thesis itself, not just a supporting fact for it.
      Research round 14 (2026-07-31) adds three more entrants making the
      same pitch: Novel Mage now ships a $99 one-time lifetime license
      (fully local, BYOK or Ollama, manuscript never touches a server) —
      closer to Novella's own no-subscription positioning than round 11
      first found it; Storyloft launched May 2026 as a manuscript-aware AI
      co-writer marketed specifically on a no-training privacy pledge; and
      Scribeist relaunched in 2026 pitching "write without switching tools"
      across Novel/Blog/General workspaces. None of the three fold in task
      management or a sprint timer — the fourth-app gap stays open — but
      the crowd making the local-AI/no-subscription/unify-everything pitch
      keeps growing, reinforcing rather than changing the round-11 priority.
      Research round 15 (2026-08-01) finds the sharpest direct hit on this
      thesis yet: Scribeist V2 now ships a dedicated Novel workspace
      (character tracking, timeline visualization, worldbuilding docs)
      alongside a General notes workspace with context-aware AI per
      workspace, explicitly marketed as "write without switching tools" —
      closer to Novella's actual "one app instead of four" pitch than any
      prior entrant. Its AI still routes through OpenRouter/BYOK, cloud and
      metered, not local and free, which stays the clean counter-argument.
      A fresh "best productivity apps for writers" roundup independently
      recommends a *five*-tool stack this round (word tracker + Todoist +
      Forest + Obsidian + Hemingway), not the four the thesis names — sharper
      evidence the fragmentation problem is worsening, not resolving, and a
      fresher stat to lead marketing copy with than "3-4 apps."
- [ ] **Say the AI-quality advantage louder against Dabble specifically** —
      research round 15 (2026-08-01): multiple 2026 reviews (Reedsy,
      WriteABookAI, Knowara) confirm Dabble ships zero generative AI — its
      $29/mo Premium tier (or $699 lifetime) only bundles a
      ProWritingAid-powered grammar/style checker and a text-to-speech
      novelty, not a writing partner. A named, paying competitor charging
      real money for the whole job has nothing at all on the "writes with
      you" half of the thesis — a sharper, more quotable proof point than
      any feature-gap comparison, and needs no caveat about other tools
      catching up. Cheap copy win: state plainly, in comparison copy, that
      Novella writes with you locally for a one-time cost while a Premium
      Dabble subscription still doesn't write with you at all.
- [ ] **Speak directly to the sprint/goal-tracking audience NaNoWriMo left
      homeless** — research round 14 (2026-07-31): with no central org
      since NaNoWriMo's 2025 shutdown, this July's "Camp NaNoWriMo" saw
      writers stitching together separate trackers (Pacemaker, Trackbear,
      4theWords) plus a volunteer-run "NaNoWriMo 2.0" revival site and
      Discord servers (Writers Hangout) just for word-count accountability
      — no single tool has won this niche. We already ship the exact
      feature this audience wants: the sprint timer and daily-goal/streak
      system (shipped 2026-07-23). The gap is entirely in naming — nothing
      in first-run copy or marketing calls out NaNoWriMo, Camp NaNoWriMo, or
      sprint-and-goal writers as an audience Novella already serves. Cheap,
      no-code opportunity, filed right next to the four-app-bundle item
      above since it's a sharper, named version of the same "the fourth app
      is real and unclaimed" pitch, not a general comparison point. Research
      round 15 (2026-08-01) confirms the niche is still splintering rather
      than consolidating a year on: World Anvil's "NovelEmber," ProWritingAid's
      "Novel November," Reedsy's Novel Sprint, and a Discord-based "Order of
      the Written Word" running three parallel November challenges have all
      launched alongside the previously-logged Pacemaker/Trackbear/4theWords/
      NaNoWriMo-2.0 fragmentation — no successor has won the audience, which
      is exactly the opening naming ourselves into it would close.
- [ ] **Say the no-outage / can't-lose-your-work advantage louder** —
      research round 13 (2026-07-30): Sudowrite had an app-wide outage
      April 22–23, 2026 that cost some users unsaved work, and shipped a
      since-fixed Android bug that could unexpectedly clear Story Bible
      entry fields; Trustpilot and community complaints call the app
      "clunky and full of bugs" as recently as July 24, with Sudowrite
      itself replying it's "shipping fixes steadily." A cloud-service
      outage structurally cannot happen to Novella — the vault is plain
      files on the writer's own disk, already backed by autosave
      (`src/state/autosave.ts`) and crash recovery (`RecoveryBanner.tsx`)
      — but checked `FirstRunWizard.tsx` and confirmed its only reliability-
      adjacent line is "free, private, nothing leaves the machine," never
      naming outages or lost work at all. More visceral than the training-
      privacy survey below (real reported data loss, not sentiment), so
      ranked above it; still below the four-app-bundle item since it's a
      copy-only win, not a thesis-defining gap. Research round 14
      (2026-07-31) adds two more data points beyond Sudowrite's outage: a
      fresh Dabble Trustpilot review reports a large portion of a user's
      book deleted with no support response for over a day (no phone
      support); and Campfire's Update 40 changelog period saw app-store
      reviews describe the editor resetting mid-sentence and the cursor
      jumping unpredictably while syncing online. Three unrelated cloud
      writing tools, three different flavors of the same structural risk —
      a local vault removes the failure mode entirely, not just this
      quarter's instance of it. Caveat worth carrying forward: Sudowrite's
      own July 28 changelog response plus a same-month "faster loading"
      update show they're actively triaging reliability, so this window
      isn't unlimited — say it while the evidence is fresh, not as a
      permanent advantage. Research round 15 (2026-08-01) confirms neither
      caveat closed the case: Campfire's mid-sentence editor-reset/cursor-
      jump bug is still reported in its current mobile release (v1.3.2,
      July 3 2026), a multi-cycle unresolved defect rather than a one-off;
      and Dabble itself acknowledged (its own Facebook page) a "more
      widespread issue" that backlogged support tickets, on top of the
      already-logged large-book-deletion report — suggesting Dabble's
      support-response gap is structural, not a single incident. Three
      cloud tools, three separate reliability windows, none closed yet.
- [ ] **Say the no-training/privacy advantage louder** — research round 9
      (2026-07-26): a 2026 Authorlytica survey puts numbers on author
      anxiety about AI training for the first time — 96% want consent
      required before their work trains a model, and 52% say they'll
      refuse a tool outright over training-data concerns. NovelCrafter's
      BYOK model only pushes that question to the API provider's terms;
      Sudowrite's manuscript-training policy isn't clearly public. A local
      Ollama model never transmits the manuscript anywhere, so the
      question doesn't apply to Novella at all — but first-run copy
      (`FirstRunWizard.tsx`) says "private" and "nothing leaves the
      machine" without ever saying the word a worried author is actually
      searching for: training. Cheap, truthful copy add to the AI-setup
      step and SECURITY.md; placed above the export/performance copy items
      below because the evidence behind it is a stated reason authors
      *refuse* a tool, not just a comparison point. Research round 14
      (2026-07-31) adds a sharper, dated hook than the survey stat: the
      Bartz v. Anthropic author-copyright settlement received final court
      approval July 20, 2026 ($1.5B, only ~350 authors opting out of
      roughly a million works), and the same week major publishers
      (Hachette, Cengage, Elsevier, Scott Turow, S.C.R.I.B.E.) filed a fresh
      suit against Google over book-training data. Real money and named
      lawsuits, not survey sentiment — a local Ollama model sidesteps the
      question by construction, since a manuscript that never leaves the
      machine can never become a training-data lawsuit's evidence. Lead
      copy with this instead of the 2026 Authorlytica numbers alone; it's
      the more recognizable, more current hook. Research round 15
      (2026-08-01) sharpens the message further rather than just adding
      volume: the Bartz final-approval reasoning itself, plus a parallel
      partial dismissal in the Meta/Kadrey case, both turn on courts
      treating *training* on copyrighted books as fair use — only the
      piracy/illegal-acquisition of source copies was actionable. That
      closes off "AI training is illegal" as a durable marketing angle for
      anyone, Novella included, and confirms the "trained legally" framing
      was already the weaker half of this item's case. The sharper, more
      durable wedge is consent and architecture, not legality: Novella
      doesn't train on a manuscript at all, and can't, by construction —
      a claim courts calling training "fair use" doesn't touch. The EU AI
      Act's Article 53 training-data-disclosure duty also becomes
      enforceable August 2, 2026 (fines up to €15M/3% of global turnover
      for GPAI providers who don't publish what they trained on) — a
      concrete, dated regulatory hook for EU-facing copy: Novella has
      nothing to disclose, because nothing leaves the device.
- [ ] **Say the export advantage louder** — research round 7: Sudowrite
      reviews specifically dock it for shipping no PDF/EPUB/DOCX export;
      Novella already ships all three plus one-click backup
      (`src/export/formats.ts`) and the export modal / first-run copy
      doesn't say so. Cheap copy win, low priority.
- [ ] **Say the performance/battery advantage louder** — research round 8:
      2026 Dabble reviews call it out by name as a CPU hog that "ran a
      user's laptop battery down really quickly," a direct cost of being a
      browser-tab app. Novella is a native Tauri process with a local
      vault, not a browser tab — first-run/marketing copy doesn't currently
      make this contrast. Cheap copy win, low priority, pairs with the
      export-advantage item above.
- [ ] **Say the no-credit-limits advantage louder** — research round 10
      (2026-07-27): 2026 Sudowrite reviews' top complaint is no longer
      price alone ($29–59/month) but that credits "run out faster than
      expected," especially on the Muse model — a writer can hit a wall
      mid-scene. NovelCrafter's BYOK sidesteps Sudowrite's specific meter
      but still bills per-token through the provider. A local Ollama model
      has no credit system at all — generate as much as the machine can
      compute, forever, for free. Distinct pain point from the existing
      no-API-key/no-training copy items (this one is about mid-project
      throttling anxiety, not setup cost or privacy) and just as cheap to
      say. Low priority, groups with the other copy items above. Research
      round 14 (2026-07-31) adds a sharper edge: fresh Sudowrite complaints
      report being charged after repeatedly trying to pause a subscription
      (one review: "We updated your subscription for you!" after a cancel
      attempt), and Sudowrite's own feedback board carries an open,
      acknowledged item about billing/membership-status mismatches costing
      users days of paid access. Distinct from the credit-throttling pain
      this item already tracks — this is subscription-mechanics friction
      itself, the thing that structurally can't happen to a one-time-install
      local app with no billing relationship at all.
- [ ] **Fix the Claude Fable 5 blurb in the optional Anthropic provider** —
      research round 10 (2026-07-27): July 2026 coverage confirms Fable 5
      is Anthropic's purpose-built creative-writing model, topping
      benchmarks specifically for prose voice, subtext and character work
      — exactly what a writer picking a model in a writing app cares
      about. Checked `src/ai/models.ts`: our own catalog blurb reads "Most
      capable, most expensive. For the hardest work," which undersells it
      as a generic flagship rather than the creative specialist it
      actually is. One-line, no-risk copy fix (this is the optional
      cloud-AI path, not the local-first default, so it doesn't touch the
      thesis — just don't undersell a real model advantage to writers who
      do opt in).
- [ ] **Scope offline grammar/spelling checking** — research round 7,
      flagged not committed: Dabble Premium (ProWritingAid) and type.ai
      both lean on live grammar checking; our Critique tab covers style
      habits (adverbs/passive/echoes) but not spelling/grammar mechanics.
      First check whether the editor surface already gets the webview's
      native spellcheck for free before building anything — a bundled
      offline grammar engine is a real size/scope tradeoff against the
      lightweight-installer promise.
- [ ] **Silent auto-update** — generate a Tauri updater keypair, add the
      pubkey + endpoint to `tauri.conf.json`, wire `tauri-plugin-updater`,
      and have CI attach `latest.json`. Needs a decision from the owner
      about key custody — ASK, do not generate silently.
- [x] **PLAN: sync/accounts backend** — plan written 2026-07-23 as PLAN-sync.md (zero-knowledge design, three hosting options, phased; blocked on the three NEEDS OWNER decisions listed there — nothing scheduled until answered).
- [x] **Board card virtualization** — shipped 2026-07-23 (the memoization half): per-note words/tasks/synopsis cached by body identity (cardDerived) across corkboard, stats, table. True windowing deferred until real projects pass ~300 chapters.
- [x] **Stats view needs a scroll affordance** — shipped 2026-07-23: edge fades driven by a reusable useScrollEdges hook.
- [x] **The codex pane doesn't group at scale** — shipped 2026-07-23: codex types sort alphabetically with letter headers past 20 entries; manuscript keeps book order (also fixed: it previously showed file-load order); folds persist.
- [x] **No way to delete a note from the UI** — shipped 2026-07-23: right-click → Delete note anywhere; undo toast; trash copy in `.novella/trash/`; board membership cleaned and restored.
- [x] **Agents can't be reordered or run as a group** — shipped 2026-07-23: Run all now (sequential) + hover ↑↓ reorder, order persisted.

## Research cadence

Roughly every third run (or when "Next up" runs thin), spend the run on
research instead of code: fresh reviews and feature news for NovelCrafter,
Sudowrite, Dabble, Scrivener, Campfire, Notion-for-writers. Add findings as
new checklist items with a one-line source note — do not build on the same
run. RESEARCH.md holds the long-form findings.

## Adding to this list

Don't wait for a research run. **Any time a run notices something — a bug, a
rough edge, a feature a competitor just shipped, or simply a good idea —
append it to "Next up" in the same run**, with one line on why it matters.
Ideas are cheap to record and expensive to lose. Two rules keep the list
honest: put it in priority order against the thesis above rather than at the
end by default, and if a run *builds* something it thought of itself, say so
plainly in the log line.

Every third run or so, also spend five minutes using the app like a writer
would — a real stress project, the odd edge case — and file what's rough.
The 2026-07-23 pass below found a shipped feature that broke at realistic
scale; nothing but use would have caught it.

## Shipped (autopilot log)

- 2026-08-01 — Research round 15 (autopilot; no code). Note on cadence: this
  run fired from a schedule dedicated to research, separately from
  AUTOPILOT.md's build-loop cadence rule (added 2026-07-31, after round 14,
  capping that loop's own research fallback at "at most one run in three,
  never twice in a row" because eight straight research-only runs had grown
  the backlog with no code shipped). Flagging here so the owner can confirm
  this schedule's frequency still matches intent now that the build loop's
  cap exists — this round did find substantial new material, so it wasn't
  wasted, but the cadence question is the owner's to settle, not mine.
  Dispatched four parallel research passes (NovelCrafter/Sudowrite;
  Dabble/Scrivener/Campfire; type.ai/Obsidian/Notion plus new-entrant scan;
  broader industry/legal sentiment) looking for angles rounds 1-14 hadn't
  covered. Found and added the strongest new item this round: multiple 2026
  reviews (Reedsy, WriteABookAI, Knowara) confirm Dabble ships zero
  generative AI at all — its $29/mo Premium tier (or $699 lifetime) only
  bundles a ProWritingAid grammar checker and a text-to-speech novelty — the
  sharpest, most quotable "writes with you" proof point found yet against a
  named, paying competitor. Folded seven more findings into existing items
  rather than duplicating: Scribeist V2's new Novel workspace (character
  tracking, timeline, worldbuilding) explicitly pitches "write without
  switching tools," the closest direct hit yet on the four-app-bundle
  thesis, still cloud/BYOK not local; a fresh "best productivity apps"
  roundup now recommends a five-tool stack, not four, sharper evidence for
  the same item; Sudowrite shipped its own Chat/Feedback manuscript-context
  features May 12 2026, converging with NovelCrafter on chat-with-your-book
  and shifting that item's differentiator to local/private/free rather than
  the feature's existence; the Bartz v. Anthropic final-approval reasoning
  and a parallel Meta/Kadrey partial dismissal both treat AI training itself
  as fair use (only piracy of source copies was actionable), sharpening the
  no-training item's message from "trained legally" to "doesn't train at
  all, by construction," alongside a new EU AI Act Article 53 disclosure
  duty enforceable August 2, 2026 as a dated regulatory hook; Campfire's
  mid-sentence editor-reset bug persists into its current release and
  Dabble itself acknowledged a backlogged-support "widespread issue," both
  feeding the no-outage item; more NaNoWriMo-successor events (NovelEmber,
  Novel November, Reedsy Novel Sprint, Order of the Written Word) confirm
  that niche is still fragmenting a year on; and Sudowrite's new
  "uncensored fiction" marketing push, contrasted against its own
  inconsistent content-refusal reports, sharpens the local-model item's
  "no gatekeeper" case while flagging the actual content policy as a values
  decision for the owner, not something to default into. Landscape notes
  (no action, full detail in RESEARCH.md Round 15): NovelCrafter's pricing
  is a 4-tier ladder ($4/$8/$14/$20), not just "$4/$8" as previously logged;
  Scrivener's Mac/Windows version gap widened further (Mac 3.5.2 vs. Windows
  frozen at 3.1.6) and Literature & Latte's next-gen app is confirmed still
  in closed beta with no AI angle after ~3 years; both NovelCrafter and
  Sudowrite have a nearly-empty review-platform (G2/Trustpilot/Capterra)
  footprint, a GTM opening that needs no product change; several
  frequently-repeated author-survey stats could not be traced to a primary
  source this round and were deliberately not cited. Full notes and sources
  in RESEARCH.md Round 15.

- 2026-07-31 — Research round 14 (autopilot; no code). Rather than re-sweep
  the usual named competitors a sixth-plus time, dispatched three parallel
  research passes and looked specifically for angles rounds 7-13 hadn't
  covered. Found and added the strongest new item this round: NaNoWriMo's
  sprint/goal-tracking niche remains unclaimed since its 2025 shutdown —
  this July's "Camp NaNoWriMo" saw writers stitching together Pacemaker,
  Trackbear, 4theWords, a volunteer "NaNoWriMo 2.0" revival site, and
  Discord servers just for word-count accountability. We already ship the
  exact feature this audience wants (sprint timer + daily-goal/streak,
  shipped 2026-07-23) but never name the audience in copy — a cheap,
  no-code opportunity ranked with the four-app-bundle item. Folded four
  more findings into existing items rather than duplicating: Novel Mage's
  new $99 lifetime-license local build, Storyloft (manuscript-aware AI +
  no-training pledge, launched May 2026), and a relaunched Scribeist
  ("write without switching tools") all feed the four-app-bundle item as
  three more entrants making a similar pitch, none folding in task
  management or sprints; a fresh Dabble Trustpilot data-loss report and a
  Campfire Update 40-era editor-reset/cursor-jump complaint feed the
  no-outage item alongside Sudowrite's, with a carried-forward caveat that
  Sudowrite is actively triaging reliability so the window isn't
  unlimited; the Bartz v. Anthropic $1.5B author-copyright settlement's
  July 20 final court approval, plus a fresh publisher suit against Google
  over book-training data, feed the no-training/privacy item with a far
  more current, dollar-figure hook than the standing 2026 Authorlytica
  survey stat; and fresh Sudowrite subscription-billing/pause complaints
  feed the no-credit-limits item as a distinct subscription-mechanics pain
  point. Landscape notes (no action): Scrivener reconfirmed at zero AI
  features with concrete current version numbers (Mac 3.5.0 vs. Windows
  3.1.6) and Literature & Latte's long-teased next-gen app still has no
  public release or AI angle as of mid-2026; Sudowrite shipped new model
  access (GPT-5.6 suite, Claude Sonnet 4.6) and faster load times,
  confirming its AI-quality and app-stability stories are separate axes
  moving independently; a "Dabble acquired by Headout" claim surfaced in
  search summaries was checked and is false (Headout is an unrelated
  travel-booking company) — disregarded rather than repeated; nothing new
  surfaced for type.ai, Obsidian-for-writers, or Notion templates beyond
  what prior rounds already found. Full notes and sources in RESEARCH.md
  Round 14.

- 2026-07-30 — Research round 13 (autopilot; no code). Swept the usual
  named competitors again looking for angles rounds 7-12 hadn't covered.
  Found and added the strongest item this round: Sudowrite's biggest 2026
  story has quietly shifted from prose quality to reliability — an
  app-wide outage April 22-23 cost some users unsaved work, a since-fixed
  Android bug could unexpectedly clear Story Bible fields, and Trustpilot/
  community complaints call the app "clunky and full of bugs" as recently
  as July 24, with Sudowrite replying it's "shipping fixes steadily."
  Checked our own `FirstRunWizard.tsx` first: it says "private, nothing
  leaves the machine" but never names outages or lost work, the specific
  fear these incidents speak to, even though a cloud outage structurally
  can't happen to a local vault already backed by autosave and crash
  recovery. Ranked above the training-privacy copy item since these are
  reported incidents, not survey sentiment. Folded two more findings into
  existing items rather than adding new bullets: a Local AI Master piece
  naming Qwen 2.5 32B as beating Llama 3.1 70B on fiction metrics (feeds
  the round-12 local-model-recommendation item), and type.ai's 200k-token
  whole-manuscript context, which reinforces rather than adds to the
  existing chat-with-your-book gap in the NovelCrafter-parity item after
  confirming our own `context.ts` token-economy design is deliberate, not
  an oversight. Landscape notes (no action): NovelCrafter's pricing has
  dropped to $4/$8 tiers, materially cheaper than the $14+ figure earlier
  rounds cited — the BYOK-meters-through-the-provider point survives but
  future rounds should cite current pricing; Sudowrite's Muse model was
  quietly upgraded at no extra cost, a reminder that its AI quality and
  its app stability are separate axes; Scrivener (4.2/5), Dabble (2.5/5),
  Campfire (18 modules, still a-la-carte), Obsidian (still a multi-plugin
  assembly) and Notion (growing template ecosystem) all reconfirmed with
  no new angle. Full notes and sources in RESEARCH.md Round 13.

- 2026-07-29 — Research round 12 (autopilot; no code). Swept NovelCrafter,
  Sudowrite, Dabble, Scrivener, Campfire, type.ai, Obsidian-for-writers and
  Notion writing templates again, plus a fresh angle: how novelists actually
  choose *which* local model to run, not just whether to run one locally at
  all. Found and added the strongest item this round: checked our own
  one-click Ollama setup (`src/plugins/providers/ollama.ts`,
  `SetupPanel.tsx`) and confirmed it silently pulls a generic instruct model
  (`llama3.1:8b`) with no alternative offered and no explanation — while
  Sudowrite's whole differentiator is a model fine-tuned specifically on
  published fiction, and multiple independent 2026 sources on local AI for
  novelists confirm writers who go local deliberately seek out fiction
  fine-tunes or uncensored community variants over stock instruct models
  because generic models moralize or sanitize dark scenes. Ranked above the
  existing reasoning-toggle item since it affects every local-AI writer's
  very first generation, not just reasoning-model users. Landscape notes (no
  action): NovelCrafter's freshest complaint (April 2026 review) is that its
  AI "couldn't see the manuscript" without the writer manually selecting
  context — checked our own `ai/context.ts`/`InspectorPane.tsx` and confirmed
  Novella already auto-builds scene context with a visible token estimate,
  an existing advantage worth saying louder eventually but not a new item;
  Sudowrite's blog/ToS now explicitly states it never trains on user
  manuscripts, which updates (softens, doesn't erase) round 9's "not clearly
  public" finding — a policy promise, not the architectural guarantee a
  fully local model gives by construction; Obsidian's novelist setup now
  needs a further plugin (StoryLine, added to the official directory
  February 2026) on top of Longform and Novel Word Count, reconfirming that
  assembling Obsidian into a novel tool takes 4-5 separate plugins where
  Novella ships it native; independent "best productivity apps for writers"
  roundups (not the usual named competitors) still recommend the fragmented
  toolkit by default — Todoist for tasks, Forest for focus timers, Obsidian
  for notes, Hemingway for editing — fresh independent evidence for the
  core thesis rather than a repeat of prior findings; Scrivener's price
  complaints and stale Windows version, Campfire's a-la-carte pricing, and
  Dabble/type.ai's 2.5-4/5 range are all reconfirmed with no new angle.
  Full notes and sources in RESEARCH.md Round 12.

- 2026-07-28 — Research round 11 (autopilot; no code). Widened the usual
  named-competitor sweep (NovelCrafter, Sudowrite, Dabble, Scrivener,
  Campfire, type.ai, Obsidian, Notion) with a direct search on our own
  positioning phrase — "local-first, no-subscription AI novel writing" —
  and found three products now using nearly the same language: LocalProse
  (local model + phone-to-desktop LAN sync with zero cloud, even a
  Dropbox-style folder), Novel Mage (Codex, story planner, and a
  prose-sample voice-matching feature we don't have), and Noveling
  (free editor forever, prepaid AI credits instead of a subscription).
  None of the three fold in task management or a sprint timer, so filed
  the strongest item this round as a copy priority: lead marketing with
  the four-app bundle, since "local AI, no subscription" alone is no
  longer unique to us. Also added two buildable AI-quality gaps found by
  checking our own code against the news: Novel Mage's voice-matching
  (we only support hand-authored style templates, verified in
  `InspectorPane.tsx`) and NovelCrafter's Jan 2026 reasoning-toggle
  release (we treat every model identically, verified by grepping
  `src/ai` for "reasoning"/"thinking" — no matches). Folded two smaller,
  concrete findings into the existing NovelCrafter-parity item rather
  than adding new bullets: March 2026 Codex updates for multi-category
  entries and case-sensitive name tracking, both verified absent from
  our own codex code. Landscape notes (no action): Sudowrite's prose-
  accuracy complaints continue for a second round, reinforcing the
  Continuity inspector's deterministic-only design; Scrivener's Windows
  version remains years behind its Mac version (real Tauri
  cross-platform advantage, but narrow enough to note rather than add
  as a fifth copy item); Dabble reviewers still flag no image support,
  confirming a Novella advantage already shipped; Campfire reviews
  report the app getting glitchy as character data accumulates, second-
  hand evidence for the standing "stay FAST" guardrail. Full notes and
  sources in RESEARCH.md Round 11.

- 2026-07-27 — Research round 10 (autopilot; no code). Swept NovelCrafter,
  Sudowrite, Scrivener, Dabble, Campfire, type.ai, Obsidian-for-writers and
  Notion novel templates again, one day after round 9, looking for angles
  the last three rounds hadn't covered rather than re-confirming known
  ground. Found and added three items: a Timeline view for story
  chronology (Campfire's Timeline + Arcs modules plot events and character
  development across one or more timelines for dual-timeline/multi-POV
  books — verified by grep that we have nothing like it, only an agent
  example prompt and unrelated seed text mention the word "timeline"); a
  fourth copy item, no-credit-limits (2026 Sudowrite reviews' loudest new
  complaint is credits running out mid-scene on the Muse model, not price
  — a local Ollama model has no meter at all, a distinct pain point from
  the existing no-API-key/no-training copy items); and a one-line
  self-inflicted bug: checked our own optional Anthropic provider
  (`src/ai/models.ts`) against July 2026 coverage of Claude Fable 5 as
  Anthropic's dedicated creative-writing model, and found our catalog
  blurb undersells it as a generic "most expensive" flagship instead of
  naming the prose/subtext/character strength that's the actual reason a
  writer would pick it. Landscape notes (no action): NovelCrafter's Chat-
  with-your-book and Codex templates are real and confirm the existing
  NovelCrafter-parity item rather than adding a new one; BetaReader.io and
  BetaBooks are dedicated paid products for exactly the inline-comment gap
  already top of "Next up," which is strong outside evidence the existing
  priority is right, not a reason to add a duplicate item; Scrivener's
  Dropbox-sync complaints are unchanged for a second round (reinforces
  PLAN-sync.md, nothing new to add); Dabble confirmed at 2.5/5 for a
  second round; Campfire's per-module pricing confirmed for a second
  round; a 2025 Author Guild survey puts AI adoption among published
  fiction writers at 45%, mostly for brainstorming — context, not a gap.
  Full notes and sources in RESEARCH.md Round 10.

- 2026-07-26 — Research round 9 (autopilot; no code). Went wider than
  tool-by-tool feature lists this round: author sentiment and industry
  privacy surveys. Found and added the strongest copy item yet: a 2026
  Authorlytica survey measures what earlier rounds only had anecdotally —
  96% of authors want consent before their work trains an AI, 52% say
  they'll refuse a tool outright over training-data concerns. Checked
  NovelCrafter (BYOK just pushes the question to the provider's terms) and
  Sudowrite (training policy not clearly public) before writing this up —
  neither can say what Novella can by construction: a local model never
  transmits the manuscript, so the question doesn't apply. Checked our own
  first-run copy first too: it already says "private" and "nothing leaves
  the machine" but never the specific word — "training" — an anxious
  author is searching for. Filed above the export/performance copy items
  since this one is a stated reason authors walk away, not just a
  comparison point. Landscape notes (no action): Sudowrite's AI-generated
  manuscript review is itself reported unreliable ("missed major plot
  points"), which retroactively validates Novella's deterministic-only
  Continuity inspector design; NovelCrafter's BYOK friction is confirmed
  for a fourth straight round (no need to re-check next time unless the
  product changes); Dabble's rating has drifted to 2.5/5 over the same
  export gap already tracked; new entrants (Scribeist, ShyEditor, Novel
  Factory, NovelistAI) noted for awareness with no concrete gap found yet.
  Full notes and sources in RESEARCH.md Round 9.

- 2026-07-25 — Research round 8 (autopilot; no code). Swept fresh 2026
  reviews for NovelCrafter, Sudowrite, Dabble, Scrivener, Campfire,
  type.ai, Obsidian-for-writers, and Notion writing templates, one day
  after round 7 — deliberately looked for angles round 7 hadn't covered
  rather than re-confirming the same ground. Found and added: NovelCrafter's
  Matrix planning view (spreadsheet of chapters × POV/subplot/summary,
  single-click POV reassignment) as a concrete NovelCrafter-parity gap —
  verified live in the codebase first that our POV field is read-only
  everywhere it appears; a performance/battery copy item (2026 Dabble
  reviews call it a CPU/battery hog as a browser-tab app, which Novella
  structurally isn't). Landscape notes (no action): subscription-stacking
  complaints (Scrivener + NovelCrafter + ProWritingAid) directly confirm
  the thesis; NaNoWriMo's 2025 nonprofit shutdown (AI-stance controversy +
  falling participation) leaves a community of sprint/goal writers looking
  for a home; Campfire prices per-module (a la carte add-ons) which is the
  opposite of Novella's flat local install; Sudowrite's new Muse model is
  reviewed as "the first that's actually felt useful for drafting" but the
  tool still ships no PDF/EPUB/DOCX/cover/audiobook and rates 3/5 for it.
  Full notes and sources in RESEARCH.md Round 8.

- 2026-07-24 — Research round 7 (autopilot; no code — "Next up" had thinned
  to 2 buildable items, the documented trigger for a research run). Swept
  NovelCrafter, Sudowrite, Dabble, Scrivener, Campfire, type.ai,
  Obsidian-for-writers and Notion novel templates. Confirmed a real
  strength worth surfacing in copy: Sudowrite reviews dock it for shipping
  no PDF/EPUB/DOCX export, and we already ship all three plus backup.
  Added three new build items (inline comments/margin notes — highest
  priority, closes a real gap; location map/pinboard, Campfire's headline
  feature; export-advantage copy) plus one flagged-not-committed item
  (offline grammar/spelling — needs a scoping pass before it's real work).
  Full notes in RESEARCH.md Round 7.

- 2026-07-23 — Owner feedback round 4 (session). The writing-style menu
  is exactly the promised set — default + Extensive novel + Paragraph
  mode + Email writer + anything the writer creates (the nine old task
  prompts no longer seed and are filtered from the menu; existing notes
  stay in vaults). PDF export added as a print-ready window ("Save as
  PDF" — engine-quality pagination, no PDF library shipped). The
  Appearance controls are themed instead of native-white. Standing
  Notion/NovelCrafter parity items added above for the autopilot.

- 2026-07-23 — Owner feedback round 3 (session). FIXED THE REPORTED BUG:
  "Delete board does nothing" — confirm() dialogs are suppressed in some
  webviews, so every confirm() in the app is gone (boards and agents
  delete instantly with an Undo toast; clear-history and delete-thread
  are two-click armed buttons). BUILT: writing styles in the Assistant
  (Extensive novel / Paragraph mode / Email writer seeds, + New style,
  Upload style, and an always-on "what should this be about" line wired
  through a new {{guidance}} variable); board picker is a dropdown and
  Web/Stats left the layout switch; the Tools pane is one dropdown with
  per-tool descriptions; the music dock is draggable by its header,
  minimizable to a mini bar, with an accent header; Appearance grew
  line spacing, page width and corner style; a 4-step "Let's get
  started" wizard for new users (name → theme → honest local-AI check →
  first project); presets renamed The Big Book / A World to Keep /
  Small but Mighty / Blank Page. All verified live; 241 checks green.

- 2026-07-23 — Playtest pass (session; owner asked for a game-tester
  sweep: "make sure everything visible has a purpose"). The critique
  chips (Sticky/Adverbs/Passive/Echoes) now carry live counts, plain-
  language tooltips explaining each habit, and the Critique tab
  cross-references them; highlight round-trip verified on planted prose
  ("slowly"/"softly" marked, cleared on toggle). A DOM audit walked all
  15 surfaces + 7 settings tabs + modals for unlabeled controls — six
  found (plugin setting fields, export checkbox), all labeled. FOUND
  STALE: the "session only" chip on secret fields predated the OS
  keychain — now says "in OS keychain" on desktop, with honest hovers
  for both builds. Custom-board empty state now points at the dashed
  tile that exists instead of the old header button. Titlebar save
  status, "in memory" badge and the editor's file path all explain
  themselves on hover. 241 checks green.

- 2026-07-23 — Owner feedback round 2 (session). "Beats" is gone from the
  UI: the panel is **Scene plan**, lines are steps ("Write this step",
  "Suggest next steps", card chip "3-step plan"); files and APIs keep the
  `beats` key so nothing breaks. The corkboard grid now ends in two
  dashed ghost tiles — **+ New chapter** (or **+ Add cards** on a custom
  board) and **+ New board**, which names itself inline, switches to the
  fresh board and opens the add-cards picker so it's never a dead end.
  Settings grew a **Shortcuts** tab: every binding with a plain-language
  description (Everywhere / While writing / On the board) — a reference,
  honestly labeled as not-yet-remappable. All verified live; 241 checks.

- 2026-07-23 — Roadmap burn-down, phase 3 (session): the list is now
  clear except Silent auto-update, which stays open on purpose — it
  needs the owner's key-custody decision (see its ASK note). BUILT:
  card art (drop an image on a corkboard card; .novella/images/,
  lazy-hydrated, removable), the Continuity inspector tab (deterministic
  tier — early mentions via `introduced:`, near-duplicate names,
  dangling links with counts, unordered chapters, unknown POV; 9 unit
  checks), codex letter grouping at scale + persistent folds (and fixed
  the manuscript group showing file-load order instead of book order),
  PLAN-sync.md (zero-knowledge sync design, three NEEDS OWNER decisions),
  and the OS keychain: three Rust commands over `keyring`, JS
  write-through + hydrate-at-register, web unchanged; the Rust
  round-trip test passes against the real Windows Credential Manager.
  SECURITY.md updated to match (secrets: memory + OS credential store,
  never localStorage). 241 unit checks green.

- 2026-07-23 — Roadmap burn-down, phase 2 (session) + owner feedback pass.
  OWNER FEEDBACK ("still don't see the +; symbols aren't obvious"):
  the + is now a labeled "+ New" pill; the codex header speaks words
  ("+ New", "Import", "Export"); titlebar toggles labeled Codex/Tools/
  Focus; Rename… added to every note's right-click menu (opens the note
  with its title selected). BUILT from the list: note templates, export
  presets, agents run-all + reorder, stats edge fades (useScrollEdges),
  per-note derived-value cache (cardDerived), personalization (accent/
  prose font/size on top of any theme, per device, with reset), quiet
  first run (editor alone; pane choices persisted). SWEPT: every board
  layout, inspector tab, settings page, and modal open/close with zero
  fresh console errors. 232 checks green throughout.

- 2026-07-23 — Roadmap burn-down, phase 1 (session; release deferred until
  the list is done, per the owner). BUILT: Alt+↑/↓ paragraph moves
  (src/core/paragraphs.ts), rename-in-place in the editor header (blur
  reads the field, not state — a same-tick blur used to drop the rename),
  word-level diff inside History rewrite rows, the Ctrl+K palette
  (commands + every note, tiered matching in src/ui/palette.ts), the
  Table board layout (sortable words/tasks/tags, empties pinned last),
  and note deletion with an 8s undo toast + `.novella/trash/` copy —
  right-click → Delete note works from codex, boards and table, and
  restores board membership on undo. FOUND & FIXED: the web/memory
  storage adapters ingested dotfolder .md files on load, so trashed
  notes would have resurrected as vault notes on reload (Tauri already
  skipped them); one leftover "Story Bible" tooltip. All checks live in
  the browser on the real module instances; 232 unit checks green.

- 2026-07-23 — Security/editorial pass (session). AUDITED: no injection
  surfaces, no eval, secrets verified memory-only, every fetch target
  enumerated; findings written into SECURITY.md as a data-safety section.
  BUILT: one-click full-project backup (.zip of everything incl. .novella)
  as a fourth export card, with listFiles() on all three storage backends.
  FOUND & FIXED a real data-loss bug: the four .novella config stores
  (boards/plot/agents/music) could persist their empty post-reset cache
  over the disk file if mutated before the async load settled — this had
  already eaten two of the owner's boards. All four stores now load-before-
  persist and merge in-flight edits; regression scenario verified live.

- 2026-07-22 — Relationship web + Stats board layouts (session build).
- 2026-07-23 — Screenshot-feedback pass: fixed the inspector tab overflow
  that made Music unclickable (pane head now grows), tab manager always
  reachable with show/hide states, Write/Board centred to the pixel in a
  three-zone titlebar, left pane header is the project's own name with
  import/export beside it, "Story Bible" retired for plain codex copy,
  right-click menu on every note and card (open / add to board / export
  Markdown / promote to Manuscript), custom boards gained "+ Add cards"
  picker. Notion research round 6 filed.
- 2026-07-23 — Research round 5 + QA pass. Found and fixed: the web collapsed
  at realistic scale (44 entries → 25% of labels overlapping). Replaced the
  single ring with a canvas that grows with the cast, clipped labels, and made
  the test share the renderer's arc budget so the two can't drift apart again.
  Five QA findings and three research-driven features added above.
- 2026-07-22 — Slash commands in the editor: `/` on a blank line opens a
  menu (task, scene break, heading, beat, link to entry, new character).
  Plain-text ones use CodeMirror's autocomplete `apply`; "link" reopens the
  existing `[[` completion so the writer keeps typing; "beat" and "new
  character" reach into the vault store. Found and fixed one bug of my own
  along the way: the first "beat" implementation called `setBeats` with a
  blank entry, which the store silently strips — switched it to a small
  `editorBridge` hand-off (like the existing insert-into-editor bridge) that
  opens the Beats panel and focuses its draft input instead. 193 unit checks
  (6 new, in `slashCommands.ts` — the pure trigger regex and command list),
  `npm run verify` green, all six commands exercised live in the dev server.
- 2026-07-23 — Writing sprints, the fourth app: pick 15/25/45 min in the
  Goals tab, a countdown ticks down against `manuscriptWordCount()` (the
  same sampler the daily goal already uses, so the two numbers never
  disagree), and the net words written during the sprint show live. Stopping
  early logs the sprint as incomplete; running out logs it complete and
  plays a synthesized two-tone chime (Web Audio API — no bundled asset, no
  Tauri config change). A sprint missed while the app was closed settles up
  the moment the Goals tab remounts rather than drifting. New
  `src/state/sprints.ts` (pure `remainingSeconds`/`formatClock` + a
  localStorage-backed store, same `useSyncExternalStore` shape as
  `sessions.ts`) and `src/ui/{SprintTimer,chime}.ts`. 201 unit checks (8 new),
  `npm run verify` green, exercised live: started a sprint, typed into the
  chapter and watched the live count track it, stopped one early (logged
  "stopped early"), and seeded a near-expired sprint through localStorage to
  confirm the auto-finish + chime path fires cleanly on reload.
