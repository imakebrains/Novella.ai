/* Assertions for per-note undo (src/ui/noteStates.ts): history kept across
   note switches, dropped whenever the text changed underneath it.

   Same shape as test-units.ts — silent unless something is wrong, non-zero
   exit when it is.

   Runs headless against the real store (seed world, memory adapter) and
   the real @codemirror/state and @codemirror/commands, because the thing
   being proven is that CodeMirror's own toJSON/fromJSON round trip carries
   an undo history that still undoes — a mock would prove the mock.

   Edits carry isolateHistory "full" so two transactions in the same
   millisecond stay two undo steps instead of joining into one. */

import { EditorState, Transaction } from "@codemirror/state";
import { history, historyField, isolateHistory, undo, undoDepth } from "@codemirror/commands";
import { store } from "./src/state/vaultStore";
import { asSyncReload } from "./src/state/reloadReason";
import {
  NOTE_STATE_LIMIT,
  NoteStateCache,
  hasNoteState,
  keepNoteState,
  noteStateIds,
  openNoteState,
  restoreFrom,
  type SavedNoteState,
} from "./src/ui/noteStates";

let failures = 0;
let checks = 0;

function check(name: string, actual: unknown, expected: unknown): void {
  checks++;
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    failures++;
    console.error(`FAIL  ${name}\n        expected ${e}\n        actual   ${a}`);
  }
}

function ok(name: string, condition: boolean): void {
  checks++;
  if (!condition) {
    failures++;
    console.error(`FAIL  ${name}`);
  }
}

/* ---------- helpers mirroring EditorPane ---------- */

function body(id: string): string {
  return store.vault.get(id)?.body ?? "";
}

// The same config shape EditorPane hands openNoteState.
function mount(id: string): EditorState {
  return openNoteState(id, { doc: body(id), extensions: [history()] });
}

// Typing at the end: the cursor moves with it, and the updateListener
// pushes the doc into the store afterwards — which is why the store still
// holds the OLD text while the transaction is being built.
function type(state: EditorState, id: string, text: string): EditorState {
  const end = state.doc.length;
  const next = state.update({
    changes: { from: end, insert: text },
    selection: { anchor: end + text.length },
    userEvent: "input.type",
    annotations: isolateHistory.of("full"),
  }).state;
  store.setBody(id, next.doc.toString());
  return next;
}

function eraseLast(state: EditorState, id: string, n: number): EditorState {
  const end = state.doc.length;
  const next = state.update({
    changes: { from: end - n, to: end },
    userEvent: "delete.backward",
    annotations: isolateHistory.of("full"),
  }).state;
  store.setBody(id, next.doc.toString());
  return next;
}

// EditorPane's adopt effect, verbatim in shape: a whole-doc replace with
// no userEvent, dispatched after the store already changed.
function adopt(state: EditorState, id: string): EditorState {
  const next = body(id);
  const current = state.doc.toString();
  if (next === current) return state;
  return state.update({
    changes: { from: 0, to: current.length, insert: next },
    selection: { anchor: Math.min(state.selection.main.head, next.length) },
  }).state;
}

function undone(state: EditorState): EditorState {
  let out: EditorState = state;
  undo({ state, dispatch: (tr: Transaction) => { out = tr.state; } });
  return out;
}

/* ---------- setup ---------- */

store.loadSeed();

// vaultStore logs the first edit of a session (a standing trap for an old
// phantom-dirty bug). Spring it here, muted, so the suite stays silent.
{
  const scratch = store.vault.all().find((n) => n.type !== "prompt")!;
  const log = console.log;
  console.log = () => {};
  store.setBody(scratch.id, `${scratch.body} `);
  console.log = log;
  store.loadSeed();
}

function pickTwo(): [string, string] {
  const notes = store.vault.all().filter((n) => n.type !== "prompt");
  if (notes.length < 2) throw new Error("the seed needs two non-prompt notes");
  return [notes[0]!.id, notes[1]!.id];
}

/* ---------- 1. switch away and back ---------- */
{
  store.loadSeed();
  const [A, B] = pickTwo();
  const original = body(A);

  let a = mount(A);
  a = type(a, A, " one");
  a = type(a, A, " two");
  const head = a.selection.main.head;
  keepNoteState(A, a);

  const b = mount(B);
  keepNoteState(B, b);

  const a2 = mount(A);
  check("switch: undo depth survives", undoDepth(a2), 2);
  check("switch: doc restored", a2.doc.toString(), `${original} one two`);
  check("switch: one undo takes the last typing", undone(a2).doc.toString(), `${original} one`);
  check("switch: two undos restore the original", undone(undone(a2)).doc.toString(), original);
  check("switch: cursor restored", a2.selection.main.head, head);
  check("switch: cursor was at the end", head, a2.doc.length);

  /* ---------- 2. the live view owns the entry ---------- */
  check("taken: gone while the note is open", hasNoteState(A), false);
  keepNoteState(A, a2);
  check("taken: back after teardown", hasNoteState(A), true);
}

/* ---------- 3. a state with no history ---------- */
{
  store.loadSeed();
  const [A] = pickTwo();
  const bare = openNoteState(A, { doc: body(A), extensions: [] });
  keepNoteState(A, bare);
  const again = mount(A);
  check("no history, no crash: depth 0", undoDepth(again), 0);
  check("no history, no crash: doc", again.doc.toString(), body(A));
}

/* ---------- 4. changed underneath while away ---------- */
{
  store.loadSeed();
  const [A, B] = pickTwo();
  let a = mount(A);
  a = type(a, A, " away");
  keepNoteState(A, a);
  keepNoteState(B, mount(B));

  // The Tasks panel / revision restore / recovery path: store.setBody on a
  // note that is not open.
  store.setBody(A, "Rewritten elsewhere.");
  const a2 = mount(A);
  check("changed underneath: history dropped", undoDepth(a2), 0);
  check("changed underneath: doc is the new body", a2.doc.toString(), "Rewritten elsewhere.");
  keepNoteState(B, mount(B));
  ok("changed underneath: entry not kept", !noteStateIds().includes(A));
}

/* ---------- 5. changed while still open ---------- */
{
  store.loadSeed();
  const [A] = pickTwo();
  let a = mount(A);
  a = type(a, A, " typed");
  store.setBody(A, "pulled");
  keepNoteState(A, a);
  check("stale at teardown: refused", hasNoteState(A), false);
}

/* ---------- 6. rename keeps the entry (by design) ----------
   Id-keyed, and renameNote changes neither id, path nor body — so this
   deliberately departs from the brief's "evict on rename". */
{
  store.loadSeed();
  const [A] = pickTwo();
  const original = body(A);
  let a = mount(A);
  a = type(a, A, " renamed");
  keepNoteState(A, a);
  store.renameNote(A, "Renamed for the test");
  check("rename keeps: entry survives", hasNoteState(A), true);
  const a2 = mount(A);
  ok("rename keeps: history survives", undoDepth(a2) > 0);
  check("rename keeps: undo still works", undone(a2).doc.toString(), original);
}

/* ---------- 7. delete drops the entry ---------- */
{
  store.loadSeed();
  const [A, B] = pickTwo();
  let b = mount(B);
  b = type(b, B, " doomed");
  keepNoteState(B, b);
  await store.deleteNote(B);
  check("delete drops: pruned on emit", hasNoteState(B), false);

  // Teardown landing after the delete — the order React actually uses.
  let a = mount(A);
  a = type(a, A, " also doomed");
  await store.deleteNote(A);
  keepNoteState(A, a);
  check("delete drops: teardown after delete refused", hasNoteState(A), false);
}

/* ---------- 8. sync reload, body unchanged ---------- */
{
  store.loadSeed();
  const [A] = pickTwo();
  const original = body(A);
  let a = mount(A);
  a = type(a, A, "x");
  a = eraseLast(a, A, 1);
  check("sync keeps: doc back to the seed", a.doc.toString(), original);
  keepNoteState(A, a);
  await asSyncReload(async () => store.loadSeed());
  const a2 = mount(A);
  check("sync keeps: history survives a pull", undoDepth(a2), 2);
  check("sync keeps: doc", a2.doc.toString(), original);
}

/* ---------- 9. sync reload, body changed ---------- */
{
  store.loadSeed();
  const [A] = pickTwo();
  const original = body(A);
  let a = mount(A);
  a = type(a, A, " pulled-over");
  keepNoteState(A, a);
  await asSyncReload(async () => store.loadSeed());
  const a2 = mount(A);
  check("sync drops: history dropped", undoDepth(a2), 0);
  check("sync drops: doc is the pulled body", a2.doc.toString(), original);
}

/* ---------- 10. project switch clears ---------- */
{
  store.loadSeed();
  const [A] = pickTwo();
  let a = mount(A);
  a = type(a, A, "x");
  a = eraseLast(a, A, 1);
  keepNoteState(A, a);
  check("project switch: entry kept before", hasNoteState(A), true);
  store.loadSeed();
  check("project switch: cache cleared", noteStateIds(), []);
}

/* ---------- 11. the epoch ---------- */
{
  store.loadSeed();
  const [A] = pickTwo();
  const a = mount(A);
  store.loadSeed();
  // Same id, same text — the old book's teardown landing in the new book.
  keepNoteState(A, a);
  check("epoch: old book's teardown refused", hasNoteState(A), false);
}

/* ---------- 11b. a view that survives the replace ----------
   The browser first run: seed, copied into IndexedDB, reopened. The first
   chapter is active both times, so EditorPane never rebuilds its view —
   its teardown belongs to the new book and must be kept. Caught in the
   running app, where it made the fix work two runs in three. */
{
  store.loadSeed();
  const first = store.active()!.id;
  let c = mount(first);
  store.loadSeed();
  check("survivor: still the active note", store.active()?.id, first);
  c = type(c, first, " after reopen");
  keepNoteState(first, c);
  check("survivor: teardown kept", hasNoteState(first), true);
  check("survivor: history restored", undoDepth(mount(first)), 1);
}

/* ---------- 12. the adopt guard: outside edits to the OPEN note ---------- */
{
  store.loadSeed();
  const [A] = pickTwo();
  let a = mount(A);
  // A deletion in the history is what makes this a real test: its undo
  // is an insertion, which survives being mapped through a whole-doc
  // replace and would splice the old words onto the pulled text.
  a = type(a, A, " mine");
  a = eraseLast(a, A, 8);
  check("adopt: history before", undoDepth(a), 2);

  store.setBody(A, "Pulled text.");
  a = adopt(a, A);
  check("adopt: doc adopted", a.doc.toString(), "Pulled text.");
  check("adopt: history reset", undoDepth(a), 0);
  check("adopt: undo cannot reach the old text", undone(a).doc.toString(), "Pulled text.");

  a = type(a, A, " after");
  check("adopt: new typing is undoable", undoDepth(a), 1);
  check("adopt: undo stops at the adopted text", undone(a).doc.toString(), "Pulled text.");

  // And it carries through a switch.
  keepNoteState(A, a);
  let a2 = mount(A);
  check("adopt: kept across a switch", undoDepth(a2), 1);
  a2 = eraseLast(a2, A, 3);
  check("adopt: restored state has a deletion to undo", undoDepth(a2), 2);

  // A state restored from JSON has fromJSON's own history init ahead of
  // the config — the reset must still win.
  store.setBody(A, "Pulled again.");
  a2 = adopt(a2, A);
  check("adopt after restore: history reset", undoDepth(a2), 0);
  check("adopt after restore: undo inert", undone(a2).doc.toString(), "Pulled again.");

  // A second adoption on the same state resets again.
  a2 = type(a2, A, " x");
  store.setBody(A, "Third pull.");
  a2 = adopt(a2, A);
  check("adopt twice: history reset again", undoDepth(a2), 0);
  a2 = type(a2, A, " y");
  check("adopt twice: history works after", undoDepth(a2), 1);
}

/* ---------- 13. what the guard must NOT catch ---------- */
{
  store.loadSeed();
  const [A] = pickTwo();
  const original = body(A);
  let a = mount(A);

  // The Assistant's insert: no userEvent, and the store still holds the
  // old text when it dispatches.
  a = a.update({ changes: { from: a.doc.length, insert: "\n\nGenerated." } }).state;
  store.setBody(A, a.doc.toString());
  check("not adopt: assistant insert is undoable", undoDepth(a), 1);

  // Alt+arrow paragraph move: a whole-doc replace, also without userEvent.
  const moved = `Moved.\n\n${a.doc.toString()}`;
  a = a.update({
    changes: { from: 0, to: a.doc.length, insert: moved },
    annotations: isolateHistory.of("full"),
  }).state;
  store.setBody(A, a.doc.toString());
  check("not adopt: paragraph move is undoable", undoDepth(a), 2);
  check("not adopt: undo all the way back", undone(undone(a)).doc.toString(), original);
}

/* ---------- 14. the LRU itself ---------- */
{
  const s = (doc: string): SavedNoteState => ({ doc, selection: { ranges: [{ anchor: 0, head: 0 }], main: 0 } });
  const c = new NoteStateCache(3);
  for (const k of ["a", "b", "c", "d"]) c.put(k, s(k));
  check("lru: oldest evicted", c.ids(), ["b", "c", "d"]);
  c.put("b", s("b"));
  c.put("e", s("e"));
  check("lru: put refreshes recency", c.ids(), ["d", "b", "e"]);
  check("lru: take of a missing id", c.take("zz", ""), null);
  check("lru: take of a mismatched body", c.take("d", "not d"), null);
  check("lru: mismatch is removed", c.has("d"), false);
  check("lru: matching take returns it", c.take("b", "b")?.doc, "b");
  check("lru: take removes", c.has("b"), false);
  c.put("f", s("f"));
  c.retainOnly((id) => id === "f");
  check("lru: retainOnly", c.ids(), ["f"]);
  c.forget("f");
  check("lru: forget", c.size, 0);
}

/* ---------- 15. the bound, through the real store ---------- */
{
  store.loadSeed();
  check("bound: limit is 20", NOTE_STATE_LIMIT, 20);
  const made: string[] = [];
  for (let i = 1; i <= 25; i++) {
    const note = store.createNote("note", `Undo test ${i}`);
    made.push(note.id);
    let st = mount(note.id);
    st = type(st, note.id, ` words ${i}`);
    keepNoteState(note.id, st);
  }
  check("bound: holds 20", noteStateIds().length, 20);
  check("bound: oldest five gone", made.slice(0, 5).filter(hasNoteState), []);
  check("bound: newest kept", noteStateIds(), made.slice(5));
}

/* ---------- 16. a malformed entry ---------- */
{
  const config = { doc: "Short.", extensions: [history()] };
  const broken: SavedNoteState = { doc: "Short.", selection: { ranges: [{ anchor: 999, head: 999 }], main: 0 } };
  const st = restoreFrom(broken, config);
  check("malformed: falls back to a fresh state", st.doc.toString(), "Short.");
  check("malformed: fresh history", undoDepth(st), 0);
  const nonsense = { doc: "Short.", selection: null } as unknown as SavedNoteState;
  check("malformed: null selection falls back", restoreFrom(nonsense, config).doc.toString(), "Short.");

  // And the round trip the whole feature rests on, direct.
  let good = EditorState.create({ doc: "Hi", extensions: [history()] });
  good = good.update({ changes: { from: 2, insert: "!" }, userEvent: "input.type" }).state;
  const back = restoreFrom(good.toJSON({ history: historyField }) as SavedNoteState, config);
  check("round trip: history survives toJSON", undone(back).doc.toString(), "Hi");
}

if (failures > 0) {
  console.error(`\n${failures} of ${checks} note undo checks failed`);
  process.exit(1);
}
console.log(`note undo: ${checks} checks passed`);
