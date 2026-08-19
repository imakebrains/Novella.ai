/* A tiny bridge so panels outside the editor can put text into it.

   The Assistant needs to insert generated prose at the cursor. Going
   through the vault store instead would not work: the store updates
   note.body, but CodeMirror only rebuilds its document when the active
   note *changes*, so the new text would not appear until you navigated
   away and back. The editor registers its own insert function here. */

import type { EditorView } from "@codemirror/view";
import { snapshotById } from "../state/history";
import { store } from "../state/vaultStore";

type InsertFn = (text: string) => void;

let insertFn: InsertFn | null = null;

export function registerEditorInsert(fn: InsertFn | null): void {
  insertFn = fn;
}

/* Same problem, opposite direction: the editor's "/beat" slash command
   needs to open the Beats panel and focus its draft input. A beat can't
   be added as inline prose text — setBeats() scrubs blank entries, and a
   beat lives in note.data.beats, not the body — so the slash command
   hands off to whatever the mounted BeatsPanel registers here instead. */
let beatFocusFn: (() => void) | null = null;

export function registerBeatFocus(fn: (() => void) | null): void {
  beatFocusFn = fn;
}

export function focusBeatDraft(): boolean {
  if (!beatFocusFn) return false;
  beatFocusFn();
  return true;
}

/* And once more for renaming: "Rename" on a note's right-click menu
   opens the note and puts the cursor in the editable title — the title
   input IS the rename surface, this just walks you to it. */
let titleFocusFn: (() => void) | null = null;

export function registerTitleFocus(fn: (() => void) | null): void {
  titleFocusFn = fn;
}

export function focusEditorTitle(): boolean {
  if (!titleFocusFn) return false;
  titleFocusFn();
  return true;
}

export function editorReady(): boolean {
  return insertFn !== null;
}

/** Insert at the cursor. Returns false if no editor is mounted.

    Every path that lets the assistant write into the manuscript comes
    through here, which makes it the one place a "before the AI" revision
    has to be taken. The snapshot reads the current text synchronously
    before the insert lands, so it genuinely records the earlier version. */
export function insertIntoEditor(text: string): boolean {
  if (!insertFn) return false;
  const id = store.activeIdOrUndefined();
  if (id) void snapshotById(id, "before the assistant added prose");
  insertFn(text);
  return true;
}

/* The prose highlighters used to be chips under the chapter title, where
   they read as clutter over the page. They belong with the report that
   explains them, so the Critique tab owns them now and the editor just
   registers how to apply them. */
type HighlightFn = (kinds: string[]) => void;

let highlightFn: HighlightFn | null = null;
let activeKinds: string[] = [];
const kindListeners = new Set<() => void>();

export function registerCritiqueHighlight(fn: HighlightFn | null): void {
  highlightFn = fn;
  if (fn) fn(activeKinds);
}

export function critiqueHighlights(): string[] {
  return activeKinds;
}

export function setCritiqueHighlights(kinds: string[]): void {
  activeKinds = kinds;
  highlightFn?.(kinds);
  for (const l of kindListeners) l();
}

export function subscribeCritiqueHighlights(fn: () => void): () => void {
  kindListeners.add(fn);
  return () => {
    kindListeners.delete(fn);
  };
}

/* The format bar needs the opposite of an insert: before it can light up
   "Bold" it has to read the document, and before it can toggle anything
   it has to know the selection. So this one hands over the live view
   rather than a function — the bar does its own reading and dispatching,
   and the bridge stays a phone book instead of turning into an editor.

   It is observable because the view is thrown away and rebuilt whenever a
   different note opens, and a toolbar still pointing at a destroyed view
   is a row of buttons that quietly do nothing. */
let formatView: EditorView | null = null;
const formatListeners = new Set<() => void>();

export function registerFormatTarget(view: EditorView | null): void {
  if (formatView === view) return;
  formatView = view;
  for (const l of formatListeners) l();
}

export function formatTarget(): EditorView | null {
  return formatView;
}

export function subscribeFormatTarget(fn: () => void): () => void {
  formatListeners.add(fn);
  return () => {
    formatListeners.delete(fn);
  };
}
