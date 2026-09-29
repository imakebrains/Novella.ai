import {
  Compartment,
  EditorState,
  Prec,
  Transaction,
  type EditorStateConfig,
  type Extension,
} from "@codemirror/state";
import { history, historyField } from "@codemirror/commands";
import { store } from "../state/vaultStore";
import { isSyncReload } from "../state/reloadReason";

/* ============================================================
   Undo that survives switching notes

   EditorPane builds a fresh EditorState every time the open note
   changes, so leaving a chapter used to throw its undo history away.
   This keeps it for the session, for the last NOTE_STATE_LIMIT notes.

   What is kept is the JSON — doc, selection, history — never the live
   EditorState. A live state carries the old mount's extensions: an
   updateListener closed over that component's refs, an aria-label
   frozen at the old title, critique and autocomplete fields from a
   view that no longer exists. Serialising forces every reopen through
   today's extensions and carries only the three things worth keeping.

   Keyed by note id, not path, because the store, the drafts and the
   editor all key by id, and nothing in src moves a note's path.

   A rename KEEPS the entry — id-keyed, and renameNote changes neither
   id, path nor body, so there is nothing stale to drop. That departs
   from the brief's "evict on rename" on purpose; the fresh extensions
   pick up the new title. A delete drops it: pruned on the delete's
   emit, and a teardown that lands after the delete is refused, so a
   restored note (or a new one reusing the slug) starts clean.

   The one rule that makes this safe: history is only ever restored
   onto the exact text it was recorded against. If the body changed
   while the note was closed — a Tasks-panel toggle, a revision restore,
   crash recovery, a sync pull, parseNote's trim on reload — the entry
   is dropped, because a stale history would undo into text that no
   longer exists and autosave would then write that over the real one.

   The same rule, applied to the OPEN note, is the adopt guard below.

   Project switches are fenced by an epoch. ingest runs its hooks before
   it emits, so the old book's teardown runs AFTER the clear — and ids
   are slugs that collide across books, so without the fence the old
   book's "chapter-1" would be filed under the new book's. A sync reload
   is the same book: it neither bumps nor clears, and body equality
   decides per note.
   ============================================================ */

export const NOTE_STATE_LIMIT = 20;

const FIELDS = { history: historyField };

/** The shape state.toJSON(FIELDS) produces. */
export interface SavedNoteState {
  doc: string;
  selection: unknown;
  history?: unknown;
}

/** A bounded LRU over a Map: insertion order is recency, so a refresh is
    delete-then-set and eviction takes the first key. */
export class NoteStateCache {
  private entries = new Map<string, SavedNoteState>();

  constructor(readonly limit = NOTE_STATE_LIMIT) {}

  put(id: string, saved: SavedNoteState): void {
    this.entries.delete(id);
    this.entries.set(id, saved);
    // TS 5.6+ types an iterator's value as possibly undefined, so the
    // done check is what keeps delete() honest, not decoration.
    while (this.entries.size > this.limit) {
      const oldest = this.entries.keys().next();
      if (oldest.done) break;
      this.entries.delete(oldest.value);
    }
  }

  /** Remove and return the entry, but only if it was recorded against
      `body`. A mismatch is dropped either way — it can never become
      right again. */
  take(id: string, body: string): SavedNoteState | null {
    const saved = this.entries.get(id);
    if (!saved) return null;
    this.entries.delete(id);
    return saved.doc === body ? saved : null;
  }

  retainOnly(exists: (id: string) => boolean): void {
    for (const id of [...this.entries.keys()]) {
      if (!exists(id)) this.entries.delete(id);
    }
  }

  forget(id: string): void {
    this.entries.delete(id);
  }

  clear(): void {
    this.entries.clear();
  }

  has(id: string): boolean {
    return this.entries.has(id);
  }

  get size(): number {
    return this.entries.size;
  }

  /** Oldest first. */
  ids(): string[] {
    return [...this.entries.keys()];
  }
}

/* ---------- the adopt guard ----------

   EditorPane adopts edits made behind the open note's back (crash
   recovery, a Tasks-panel toggle, a revision restore, a sync pull that
   leaves the same note open) with a whole-document replace. CodeMirror
   records that as an ordinary undo step, so Ctrl+Z would put back the
   text the outside edit replaced and autosave would write it over the
   pull. That was already true within one visit; keeping history across
   switches would have made it outlive the visit too.

   So the open note gets the same rule as a closed one: text that
   changed underneath means a fresh history. The adoption is recognised
   without touching EditorPane — no userEvent, and the store ALREADY
   holds the resulting text while the editor's did not. Typing, paste,
   undo and redo all carry a userEvent; the Assistant's insert and
   Alt+arrow paragraph moves carry none, but the store still holds the
   old text when they dispatch, because it only learns of them from the
   updateListener afterwards.

   Transaction.addToHistory.of(false) alone would be wrong: it maps the
   older events through a replace of the whole document, which deletes
   every position they point at, so undo would splice fragments of old
   text onto the ends of the new one. Instead the history field is
   re-initialised: a fresh init extension in a compartment makes
   CodeMirror recreate the field, and addToHistory false stops the
   adoption itself being the first entry in it. Prec.highest because
   fromJSON puts its own history init ahead of the config, and the field
   takes the first init it finds. */

const resetSlot = new Compartment();
let emptyHistory: unknown;

function freshHistory(): unknown {
  emptyHistory ??= EditorState.create({ extensions: history() }).field(historyField);
  return emptyHistory;
}

function adoptGuard(id: string): Extension {
  return [
    resetSlot.of([]),
    EditorState.transactionExtender.of((tr) => {
      if (!tr.docChanged || tr.annotation(Transaction.userEvent) !== undefined) return null;
      if (tr.startState.field(historyField, false) === undefined) return null;
      const body = store.vault.get(id)?.body;
      if (body === undefined || tr.newDoc.length !== body.length) return null;
      if (tr.newDoc.toString() !== body || tr.startState.doc.toString() === body) return null;
      return {
        effects: resetSlot.reconfigure(Prec.highest(historyField.init(freshHistory))),
        annotations: Transaction.addToHistory.of(false),
      };
    }),
  ];
}

/* ---------- the session cache ---------- */

const cache = new NoteStateCache();
let epoch = 0;
const openedIn = new Map<string, number>();

/** Rebuild a kept state onto fresh extensions. Falls back to a new state
    when the entry will not parse — a malformed entry must never cost the
    writer the note. */
export function restoreFrom(saved: SavedNoteState | null, config: EditorStateConfig): EditorState {
  if (saved) {
    try {
      return EditorState.fromJSON(saved, { extensions: config.extensions }, FIELDS);
    } catch {
      /* fall through to a fresh state */
    }
  }
  return EditorState.create(config);
}

/** EditorState.create for a note, with its history back if the note's
    text is exactly what it was when the writer left it. */
export function openNoteState(id: string, config: EditorStateConfig): EditorState {
  openedIn.set(id, epoch);
  const body = typeof config.doc === "string" ? config.doc : (config.doc?.toString() ?? "");
  const guarded: EditorStateConfig = {
    ...config,
    extensions: [config.extensions ?? [], adoptGuard(id)],
  };
  return restoreFrom(cache.take(id, body), guarded);
}

/** Called at teardown. Refuses a state from an older project, a note
    that has since been deleted, and a doc the store no longer agrees
    with — a pull that replaced the note while it was open. */
export function keepNoteState(id: string, state: EditorState): void {
  const opened = openedIn.get(id);
  openedIn.delete(id);
  if (opened !== epoch) return;
  const body = store.vault.get(id)?.body;
  if (body === undefined || state.doc.toString() !== body) return;
  cache.put(id, state.toJSON(FIELDS) as SavedNoteState);
}

/* Test-only readers. */
export function noteStateIds(): string[] {
  return cache.ids();
}

export function hasNoteState(id: string): boolean {
  return cache.has(id);
}

/* A different book: nothing carries over. A pull reloading the same book
   is left to the per-note body check.

   One exception to the fence. When the new book's first chapter has the
   same id as the note open now, EditorPane's activeId does not change,
   so the view is never rebuilt — it simply carries on in the new book,
   and its teardown belongs there. Left stamped with the old epoch it
   would be refused, and that is every browser first run: the seed loads,
   is copied into IndexedDB and reopened, and the writer's first chapter
   would lose its undo at the first switch. ingest has already set the
   new activeId by the time this runs. */
store.onVaultReplaced(() => {
  if (isSyncReload()) return;
  epoch++;
  cache.clear();
  const survivor = store.active()?.id;
  if (survivor !== undefined && openedIn.has(survivor)) openedIn.set(survivor, epoch);
});

/* Runs on every emit, keystrokes included — so existence only, at most
   NOTE_STATE_LIMIT map lookups. Comparing bodies here would be twenty
   whole-chapter string compares per keystroke; take() does that lazily. */
store.subscribe(() => {
  if (cache.size) cache.retainOnly((id) => store.vault.get(id) !== undefined);
});
