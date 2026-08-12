---
name: master-novel
description: >
  The state engine under the whole novel stack — owns the `story-state/` ledgers
  that every other stage (day-one, sessions, scenes, checkpoints, revision,
  finish) reads and writes. Use when the user says "init the story state",
  "set up the ledgers", "update the ledgers", "what's the state of the book",
  or when any novel skill needs a ledger created, appended to, or rolled up.
  Twelve append-only ledgers, one fixed update order, one canon owner, ever.
---

# Master Novel — the story-state engine

Model context spans a session. A book spans months. These ledgers are the
memory that makes chapter 40 consistent with chapter 4. Everything here is
cheap to write and expensive to skip.

## Init

`master-novel init` — run once, at day one:

1. Create `story-state/` in the project root.
2. Copy every template from this skill's `templates/` into it, one file per
   ledger (12 files, listed below).
3. **Canon check:** if another bible system already exists (story-skills, a
   `bible/` folder, a `story.md`), do NOT duplicate its facts. Write
   `story-state/BIBLE.md` containing one line — a pointer to the existing
   canon owner — and record character facts, world facts, and timeline THERE.
   One canon owner, ever. The ledgers track *change*; the bible holds *facts*.
4. Commit ("scaffold story-state").

Done when all 12 ledgers exist and `session-log.md` has its first entry.

## The ledgers

Every entry cites `chapter.scene` (e.g. `12.3`). All history is append-only.

### scene-functions.md — what each scene does
| Scene | POV | Want | Conflict | Change | Revelation | Emotional shift | Exit condition |

One row per scene, written immediately after drafting. If Change AND
Revelation are both "—", the scene does nothing — flag it in the row now.

### causality-ledger.md — why events follow
| Scene | Event | Interpretation | Emotion | Decision | Consequence lands in |

The chain that makes "because" instead of "and then". "Consequence lands in"
is often unknown at write time — leave it "TBD" and backfill when it lands.
Rows with TBD older than an act are removability suspects.

### knowledge-state.md — who knows what
| Scene | Character | Delta | Fact | How |

Delta ∈ learned / mislearned / hid / revealed-to. One row per change of
knowledge — never a full re-listing. This ledger is what prevents a POV
character acting on a fact their rows don't contain.

### irony-tracker.md — reader-knows vs character-knows
| Gap | Opened | Reader knows | Character believes | Tension it powers | Closed |

A gap is open from the scene the reader learns the truth until the scene the
character does. Closed = cite the closing `chapter.scene`; a gap carried to
the end on purpose says so.

### relationship-state.md — deltas per pair
| Scene | Pair | Delta | A's read | B's read | What remains unsaid |

Delta is signed ("+1 trust", "−2 warmth"). Both interpretations, always —
the gap between A's read and B's read is where scenes come from. At act
boundaries, roll the raw rows into a **Current standing** snapshot per pair
at the top of the file and move the rows to an `## Archive` section below.
Snapshots summarize; archives never delete.

### promise-ledger.md — what the reader is reading FOR
| Promise | Planted | Touches | Paid | Status | Notes |

Lifecycle: planted → reinforced / complicated (log each touch with its
`chapter.scene`) → paid. Status ∈ open / paid / abandoned-intentional
(abandoning requires a recorded why in Notes). **Orphan** = open and
untouched for 15+ chapters — the checkpoint hunts these.

### reveal-ledger.md — the reveal economy
| Reveal | Scene | Reinterprets | Expectation changed | Decision forced | Setup at |

Every reveal must do at least one of the three middle columns; a reveal doing
none is trivia, not a reveal. "Setup at" cites where it was planted —
payoff-before-setup is an audit failure.

### motif-registry.md — images that echo
| Motif | First appears | Echoes | Meaning drift | Planned final echo |

Append each echo's `chapter.scene` to Echoes. A motif that never drifts in
meaning is decoration; note what it means *now*.

### reader-experience.md — the felt waveform
| Chapter | Target feeling | Actual | Question alive in the reader's mind |

Target is set before drafting; Actual after. Feelings carry intensity
("dread 4"). An empty Question cell means the reader has no reason to turn
the page — treat it as a finding, not a blank.

### open-threads.md — loose ends with alarms
| Thread | Opened | Status | Wake | Last touched | Resolved at |

Status ∈ open / dormant / resolved. **Wake** = the chapter by which a dormant
thread must resurface; downstream tools (graphify-novel) query "dormant past
wake date", so keep Wake a plain chapter number. Resolving cites the scene.

### voice-anchor.md — the register's fingerprint
Not a table. Sections: sentence rhythm, interiority depth, metaphor domains,
lexical tics, "what this narrator never does", plus 2–3 anchor passages
(the writer's own strongest prose, or the chosen register's exemplars).
Read in full before every scene; revised deliberately or never.

### session-log.md — the bridge across days
Newest entry on top, ≤10 lines each:

- **Wrote:** scenes touched, draft status
- **Decided:** each decision WITH its why
- **State touched:** which ledgers got deltas
- **Flagged:** anything left broken on purpose
- **Open question:** what's unresolved in the writer's head
- **Next:** the single concrete step, with target reader-feeling

Never close a session without the Next line.

## After-scene update (fixed order — do not shuffle)

1. `scene-functions.md` row — flag now if Change AND Revelation are "—"
2. `causality-ledger.md` chain
3. `knowledge-state.md` + `irony-tracker.md` deltas
4. `relationship-state.md` deltas per pair present
5. `promise-ledger.md` / `reveal-ledger.md` / `motif-registry.md` — anything
   planted, reinforced, complicated, paid, revealed, or echoed
6. `reader-experience.md` — the chapter's row
7. `open-threads.md` (or the story-graph tool if installed)

The order runs from what the scene *is* to what it *did* to what it *owes* —
skipping ahead loses entries. Whole update: ~2 minutes.

## Rules

- **Append, never rewrite.** Ledger history is evidence; corrections are new
  rows, roll-ups are snapshots above an archive.
- **Every entry cites `chapter.scene`.** An uncited row can't be audited.
- **Deltas, not restatements.** Record what changed this scene, never the
  full current state (roll-up snapshots are the one sanctioned exception).
- **One canon owner.** Facts live in the bible (or `BIBLE.md`'s target);
  ledgers track change. Never record the same fact in two systems.
- **Ledgers before prose beats memory.** If a ledger and your recollection
  disagree, the ledger wins until the manuscript proves otherwise.
