---
name: every-word
description: >
  The line-editing pass system: ten ordered passes per chapter (cut → verb →
  filter → concreteness → echo → rhythm → dialogue → AI-tell → mechanical →
  read-aloud), at standard or maximum strictness. Use when the user says
  "line edit", "polish the chapter", "run every-word", or "ten passes".
  Runs ONLY after structural revision — never line-edit a scene that might
  still be cut. Maximum strictness on chapters 1–3: they carry the submission.
---

# Every Word — the ten-pass line edit

## Preconditions (hard)

- **Structure first.** The novel-revision audits are done and their fixes applied.
  If a scene might still be cut or moved, stop — polishing it is wasted work.
- **One chapter at a time**, passes in order 1→10. Each pass changes what the
  next one sees; out of order means re-runs.
- **Read the voice anchor before pass 1.** Deliberate fragments, sanctioned comma
  splices, pet constructions listed in the anchor are protected — a pass may not
  flag what the anchor licenses. Polish that sands the voice off is a defect.
- **Keep a per-chapter tally**: one line per pass, count of fixes + the chapter's
  top offenders. Patterns invisible in one chapter are undeniable across ten;
  the tally feeds the next chapter's passes (especially 5 and 8).

## Strictness

- **standard** — fix clear faults; leave defensible choices alone. Tie goes to
  the sentence as written.
- **maximum** — chapters 1–3, prologues, any first page of an excerpt. Every
  sentence must justify its existence; "not wrong" is not a defense. Tie goes
  to the cut. Agents and browsing readers decide here.

## The ten passes

### 1. Cut — delete what adds nothing

Redundancies, stage directions, filler beats, emotions stated twice.

- "She shrugged her shoulders and nodded her head" → "She shrugged and nodded"
- "He reached out, picked up the phone, and dialed" → "He dialed"
- "She paused for a moment, considering how to answer. 'No.'" → "'No.'"
- "Rage flooded through her. 'Get out!' she shouted angrily." → "'Get out.'" —
  the line already carries it; the label and the adverb are the same emotion said three times

### 2. Verb — one strong verb beats a weak one propped up

Weak verb + adverb; was/were + -ing; actions buried in nominalizations.

- "walked quickly across the lot" → "strode across the lot"
- "She was standing in the doorway, watching" → "She stood in the doorway and watched"
- "made the decision to leave" → "decided to leave"; "came to the realization" → "realized"
- Keep was + -ing only when the ongoing action is genuinely interrupted:
  "She was dialing when the lights died."

### 3. Filter — stop narrating the narrator

saw, heard, felt, noticed, watched, realized, seemed: they report perception
instead of rendering it, pushing the reader one layer out of the POV.

- "She saw the door swing open" → "The door swung open"
- "He felt the cold seep through his coat" → "Cold seeped through his coat"
- "It seemed like the room was getting smaller" → "The room shrank"
- Keep the filter only when the *act of perceiving* is the beat:
  "Then she noticed the second set of footprints" earns its verb.

### 4. Concreteness — abstractions to things

Generic nouns to named ones; stated qualities to sensory evidence the POV
character would actually register.

- "The room smelled bad" → "The room smelled of mildew and someone else's cigarettes"
- "She drove her car to the store" → "She drove the Corolla to the Safeway on Fifth"
- "He had always been poor" → "He paid the rent in fives, counted twice"
- "beautiful flowers by the fence" → "foxgloves gone leggy against the chain-link"

### 5. Echo — unintentional repetition in proximity

Same word or phrase twice within ~100 words; same sentence-opener stacking;
the chapter's pet words (tally them — *just, small, turned, back, look* are
usual suspects).

- "She glanced at the clock, then glanced at the door" → "…then looked at the door"
- "He turned to the window. Outside, the storm turned the street to a river." →
  recast one: "Outside, the storm made the street a river."
- Deliberate repetition (anaphora, a motif word, refrain) is protected —
  flag only when repetition is accidental. Don't synonym-cycle to dodge an echo;
  if the plain word is right three times, keep it three times.

### 6. Rhythm — length variety, paragraph shape, stress position

- Four 20-word sentences in a row is a drone. Break one short. "The car
  wouldn't start."
- The end of a sentence carries the weight — put the payload word there:
  "He was dead, she was fairly sure, by the look of him" →
  "By the look of him, she was fairly sure: he was dead."
- "There was a body under the tarp in the yard" → "Under the tarp in the yard lay a body"
- Paragraph shape is rhythm at scale: a run of same-height blocks flattens the
  page. Give the turn its own one-line paragraph.

### 7. Dialogue — people talk sideways

Said-bookisms; on-the-nose lines; characters answering exactly the question
asked; missing subtext.

- "'Never,' she exclaimed" / "he opined" / "she interjected" → "said," "asked,"
  or an action beat. Said is invisible; the exotic tag isn't.
- "'I'm angry because you lied to me about the money'" → "'Count it again. Slowly.'"
- "'Do you love him?' 'Yes, I love him very much.'" → "'Do you love him?'
  'He fixed the porch light. Twice.'" — real answers deflect, bargain, dodge
- "'Fine,' she said bitterly." → "'Fine.' She left his plate in the sink, unwashed."

### 8. AI-tell — flag, don't fix here

Patterns that read machine-generated. This pass **marks spans for the separate
AI-pattern rewrite** (avoid-ai-writing detect → rewrite, or story-deslop);
do not rewrite mid-pass. Flag:

- Triadic lists everywhere — "cold, dark, and silent" three times a page; vary group sizes
- "It wasn't just X, it was Y" — "It wasn't just a house; it was a promise" →
  say the one true thing: "The house was the only promise he'd kept"
- Over-balanced sentences: matched clause pairs, "part X, part Y," tidy antitheses in runs
- Empty intensifiers and summary emotions: "a profound sense of unease,"
  "a wave of grief washed over her" → the specific gesture instead
- Uniform paragraph lengths across a page (also a rhythm fault; cite both, mark once)

One instance is style; density is the tell. Mark `<!-- AI-TELL: reason -->` on
the span, log it in the tally, move on.

### 9. Mechanical — the copyedit layer

- Dialogue punctuation: tag takes a comma inside the quotes — "'Stop,' she said."
  Action beat takes a period — "'Stop.' She grabbed his arm."
- Comma splices → period, dash, or conjunction ("He knocked, nobody answered." →
  "He knocked. Nobody answered.") — unless the anchor licenses splices in this voice.
- Tense slips: past narration drifting present (or the reverse) without intent.
- Small-fact continuity: the coffee poured on page 2 is full again on page 4;
  she sits down twice; he pockets keys he already pocketed. Track objects,
  postures, light, and hands through the scene.

### 10. Read-aloud — the pass that catches everything else

Performed **aloud**, actually aloud, full chapter. At maximum strictness,
the opening gets read aloud twice, a day apart.

- Stumble twice in the same spot → the sentence is wrong, not the reader. Rewrite it.
- Breath-starved sentences — no natural pause before the verb resolves → split
  or re-clause.
- Unintentional rhyme and thick alliteration: "a slight white light in the night" —
  break the chime unless the moment wants incantation.
- Mark every hesitation; each mark is a finding for the tally even if the fix waits.

## Close the chapter

1. Write the tally line (per-pass counts, pet words, AI-TELL spans outstanding).
2. Voice check: read the polished chapter against the anchor sample. If it now
   reads flatter than the anchor, restore the rough plank — undo the "fix."
3. Hand AI-TELL spans to the AI-pattern rewrite. Commit. Next chapter.

Ten focused passes beat one heroic everything-pass: a single lens per read is
what makes faults visible at all.
