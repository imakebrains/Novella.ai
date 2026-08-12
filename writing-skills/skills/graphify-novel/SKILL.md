---
name: graphify-novel
description: >
  The story-graph tool: a queryable graph of characters, threads, promises,
  motifs, and locations mirrored from the markdown ledgers into
  story-state/story-graph.json. Optional — the checkpoint and scene skills call
  it only if installed. Use when the user says "update the story graph",
  "graph status", "show the story graph", "any dormant threads?", or at every
  5-chapter checkpoint. The ledgers stay canon; the graph is the index that
  makes "what's still open?" a query instead of a re-read.
---

# Graphify Novel — the story graph

One file: `story-state/story-graph.json`. No database. The graph **mirrors**
the ledgers, never replaces them — if graph and ledger disagree, the ledger
wins and the graph gets fixed.

## Schema (`schema_version: 1`)

```json
{
  "schema_version": 1,
  "updated_through": "12.3",
  "nodes": [ ... ],
  "edges": [ ... ]
}
```

**Node**: `id` (`type:slug`, e.g. `thread:harbor-debt`), `type` (`character` |
`thread` | `promise` | `motif` | `location`), `label`, `status` (`active` |
`dormant` | `resolved` | `abandoned`), `first_seen` + `last_touched`
(`chapter.scene` cites), and for dormant nodes **either** `wake` (chapter
number to resurface by) **or** `dormant_reason`. Optional `note`.

**Edge**: `from`, `to` (node ids), `type` (`relationship` | `causality` |
`participates-in` | `pays-off`), `cite` (`chapter.scene` where it was
established or last changed), optional `label` ("owes", "suspects").
A promise being paid = a `pays-off` edge INTO the promise node.

## Procedure 1 — Update (after new chapters; every checkpoint)

1. Read the ledgers for the new chapters only: `promise-ledger.md`,
   `open-threads.md`, `relationship-state.md`, `causality-ledger.md`,
   `motif-registry.md`.
2. New entity/thread/promise/motif → add a node with `first_seen` =
   `last_touched` = its cite. Existing item touched → bump `last_touched`,
   adjust `status`. New relationship/cause/payoff → add an edge with its cite.
3. **Never delete** a node or edge. Off-page = status change
   (`resolved` / `abandoned`), history intact.
4. Putting a thread to sleep? `status: dormant` **requires** a `wake` chapter
   or a `dormant_reason`. No silent dormancy.
5. Bump `updated_through`, then commit with the rest of the checkpoint.

Every mutation cites `chapter.scene`. No cite, no write — go find it in the
ledger first.

## Procedure 2 — Status query ("graph status", "any dormant threads?")

Report three lists, worst first. Staleness = current chapter −
`last_touched` chapter.

1. **Open threads by staleness** — all `thread` nodes with status `active`,
   sorted stalest first. 5+ chapters stale → flag.
2. **Dormant past wake date** — `dormant` nodes with `wake` ≤ current chapter.
   These promised to come back and haven't: wake them or re-justify the sleep.
3. **Orphaned promises** — `promise` nodes with no incoming `pays-off` edge
   AND 15+ chapters since `last_touched` (matches the checkpoint's orphan
   rule): reinforce, schedule the payoff, or mark `abandoned` with a why.

Feed the findings to the checkpoint's triage (fix-now vs park-for-revision).

## Procedure 3 — Render ("show the story graph")

Emit `story-state/story-graph.mmd` — a Mermaid `graph TD` of **active nodes
and their edges only** (dormant/resolved clutter the picture; query them
instead). One subgraph per node type if the graph is big; edge labels from
`type`/`label`. This is a visual pass for spotting isolated clusters and
missing connections, not canon.

## Micro-example

```json
{
  "schema_version": 1,
  "updated_through": "9.2",
  "nodes": [
    {"id": "char:mara", "type": "character", "label": "Mara Voss",
     "status": "active", "first_seen": "1.1", "last_touched": "9.2"},
    {"id": "char:oren", "type": "character", "label": "Oren the harbormaster",
     "status": "active", "first_seen": "2.3", "last_touched": "8.1"},
    {"id": "thread:harbor-debt", "type": "thread",
     "label": "Mara's debt to Oren", "status": "dormant", "wake": 14,
     "first_seen": "2.3", "last_touched": "6.2"},
    {"id": "promise:locked-drawer", "type": "promise",
     "label": "What's in the captain's locked drawer", "status": "active",
     "first_seen": "1.2", "last_touched": "7.3"},
    {"id": "motif:salt-rot", "type": "motif", "label": "Salt-rot smell",
     "status": "active", "first_seen": "1.1", "last_touched": "9.1"}
  ],
  "edges": [
    {"from": "char:mara", "to": "char:oren", "type": "relationship",
     "label": "owes", "cite": "2.3"},
    {"from": "char:mara", "to": "thread:harbor-debt",
     "type": "participates-in", "cite": "2.3"},
    {"from": "char:oren", "to": "thread:harbor-debt",
     "type": "participates-in", "cite": "2.3"},
    {"from": "thread:harbor-debt", "to": "promise:locked-drawer",
     "type": "causality", "label": "debt forced the theft", "cite": "6.2"},
    {"from": "motif:salt-rot", "to": "promise:locked-drawer",
     "type": "pays-off", "label": "smell reveals the drawer's contents",
     "cite": "7.3"}
  ]
}
```

At chapter 15 the status query flags `thread:harbor-debt` (dormant, wake 14,
past due) and — if nothing touches it by chapter 21 — nothing here, because
`promise:locked-drawer` already has a `pays-off` edge in.

## Rules

- **Ledgers are canon.** The graph is an index. Never record something in the
  graph that isn't in a ledger; never skip a ledger update because "the graph
  has it".
- Every mutation cites `chapter.scene`.
- Append/touch, never delete — status changes only.
- `dormant` without `wake` or `dormant_reason` is invalid. Fix on sight.
- New project: copy `templates/story-graph.json` into `story-state/`.
- Do not slide into revision from a status query — findings go to the
  checkpoint triage, same as any other audit.
