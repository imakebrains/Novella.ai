---
name: conversational-authority
description: >
  The suite's house prose register — a sharp, trustworthy person telling you the
  story directly — plus the machinery every register needs: the five-axis voice
  fingerprint, first-page friction rules, seeding voice-anchor.md from a writer's
  own prose instead, and the axis-by-axis drift check run at revision. Use when
  the user says "set the register", "voice check", "does this sound like the
  book", "fix the voice drift", "what's our voice", or at day-one voice setup
  and the revision voice-drift audit.
---

# Conversational Authority — the register and its upkeep

## 1. What a register is

A register is the book's narrative voice made enforceable: not "the vibe" but a
short list of commitments a drafting session can be checked against. Every
register — this house one or a custom anchor — is recorded in
`voice-anchor.md` as a **fingerprint on five axes**:

1. **Sentence rhythm** — typical length, variance, where the stress falls.
   ("Medium sentences, one short one per paragraph doing the real work.")
2. **Interiority depth** — how close the camera sits to the POV mind, and the
   default rung on the psychic-distance scale (Gardner's ladder; Emma Darwin's
   treatment is the useful field guide). Name the home rung AND the excursion
   range.
3. **Metaphor domains** — 2–4 image wells the book draws from (weather, debt,
   machinery, scripture). Everything else is a guest, used once.
4. **Lexical tics** — signature words, permitted slang, contraction policy,
   swearing policy, sentence-fragment policy.
5. **"What this narrator never does"** — the negative space. This axis catches
   more drift than the other four combined. Write at least five nevers.

One register per book. POV characters may bend axes 2–4; axis 5 holds for all.

## 2. The conversational-authority register

Prose that sounds like a sharp, trustworthy person telling you the story
directly. Plain diction carrying real weight. The authority comes from
precision and nerve, not from formality.

**Do:**

- Contractions, always, in narration and dialogue alike. "Did not" is a
  costume.
- Direct statements. "She was wrong" — not "it seemed possible she might have
  been mistaken." The narrator has an opinion and stands behind it.
- Concrete nouns and strong verbs before any adjective is allowed in.
- One plain register-break per scene, max: a single elevated or technical word
  lands hard *because* the surround is plain.
- Free indirect style for interiority — the character's own words bleeding
  into narration, no "she thought" scaffolding. Slide the psychic distance in
  and out deliberately; home position is close-middle.
- Short sentence to close a beat. Rhythm is the authority.
- Address the reader's likely objection by anticipating it in the prose, never
  by hedging.

**Never:**

- Throat-clearing openers: "The thing was," "It should be noted," "In many
  ways," "There was something about." Delete; start where the sentence starts.
- Hedges: seemed, somewhat, rather, quite, almost, a bit, perhaps — unless a
  character's uncertainty is the point, on the page, right then.
- Abstractions that haven't earned their place. "Grief" may appear only after
  the reader has watched grief do something.
- Filter verbs (saw, felt, noticed, realized, watched) between reader and
  event. Give the event.
- Stacked qualifiers, passive evasions ("mistakes were made" — unless irony),
  or the essayist's "one might argue."
- Whimsy, cuteness, or winking at the reader. Conversational is not chummy.
- Three long sentences in a row. Somebody's asleep by the third.

The test: read the paragraph aloud as if telling a friend something that
matters. Any phrase you'd be embarrassed to say to their face gets cut.

## 3. First-page friction rules

The first page is checked (at novel-finish, and any time the opening is
touched) against this priority order — **voice, want, and instability before
geography and backstory**:

1. **Voice** in sentence one. The register audible before anything is
   explained.
2. **Want** by the first half-page: someone on the page wants something and is
   not getting it.
3. **Instability**: something is already moving or already wrong. Not calm
   before the storm — the first drops of the storm.
4. Only THEN geography, weather, era, and backstory — and only what the
   current friction requires. A first page that opens with setting is a first
   page that trusts the reader to wait. They won't.

Fail any of the first three and the fix is structural, not line-level: find
the page where voice/want/instability actually start and consider opening
there.

## 4. Custom register — seeding voice-anchor.md from the writer's prose

When the writer doesn't want the house register:

1. Ask for 2–3 passages of their strongest prose, ~300 words each — published
   or not, any genre.
2. Extract the fingerprint yourself, axis by axis, from the samples. Quote a
   sample phrase as evidence beside each axis entry.
3. Draft the "never does" list from what's *absent* across all samples;
   confirm each item with the writer — absence in 900 words can be accident.
4. Paste the strongest 2–3 paragraphs verbatim at the top of
   `voice-anchor.md` as touchstones. Fingerprint below, one section per axis.
5. Read the anchor in full before every drafting session (novel-scene already
   loads it). The anchor is canon: amend it deliberately, in the session log,
   never silently.

The house register can also serve as scaffolding — adopt it, then override
individual axes with the writer's own values as their voice asserts itself.

## 5. The drift check (revision, audit #6)

Voice drift is gradual, invisible at drafting speed, and glaring to a reader.
Procedure:

1. **Sample**, don't read everything: first page of the act, one mid-act
   scene, the act's climax scene, plus any scene drafted after a long gap in
   the session log (gaps are where drift enters).
2. **Compare axis by axis** against `voice-anchor.md`. For each sample × axis:
   pass / drift / broken, with one quoted line as evidence.
3. Rhythm check is mechanical: eyeball sentence lengths in a paragraph from
   each sample. A book that opened punchy and now runs long has drifted even
   if every word is fine.
4. The "never does" list is checked by grep-and-eye: search the act for each
   never's telltales (hedge words, filter verbs, banned openers).
5. Findings go into the revision pass's single table
   (`Severity | Location ch.scene | Evidence | Suggested fix`). Drift in
   chapters 1–3 outranks drift anywhere else.
6. Distinguish **drift** (fix the prose) from **growth** (the voice got
   better). If late chapters beat the anchor, update the anchor and log why —
   then the early chapters are the ones out of register.

After word-level polish (every-word passes), re-check one polished scene
against the anchor: if polish sanded the voice off, restore the rough plank.
