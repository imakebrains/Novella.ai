import { useEffect, useRef, useState } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, placeholder, highlightActiveLine } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { syntaxHighlighting, defaultHighlightStyle } from "@codemirror/language";
import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";
import { store, useVaultVersion } from "../state/vaultStore";
import { registerEditorInsert } from "./editorBridge";
import { BeatsPanel } from "./BeatsPanel";
import {
  critiqueExtension,
  setCritiqueKinds,
  ALL_KINDS,
  KIND_LABEL,
} from "./critiqueExtension";
import { taskCheckboxes } from "./taskCheckboxes";
import { boardStore, useBoards } from "../state/boards";
import type { IssueKind } from "../analysis/prose";

/* Autocomplete inside [[ ]]. Sourced from the live vault every
   keystroke, so a character you created a moment ago is offered
   immediately — including by alias. */
function wikiLinkSource(ctx: CompletionContext): CompletionResult | null {
  const before = ctx.matchBefore(/\[\[[^\]\n]*$/);
  if (!before) return null;
  if (before.from === before.to && !ctx.explicit) return null;

  return {
    from: before.from + 2,
    options: store.linkTargets().map((name) => ({
      label: name,
      type: "keyword",
      apply: name,
    })),
    validFor: /^[^\]\n]*$/,
  };
}

/* Editor chrome. Kept in CodeMirror's theme system rather than app.css so
   it can reach into .cm-* internals without fighting specificity. */
const novellaTheme = EditorView.theme({
  "&": {
    height: "100%",
    fontSize: "var(--text-prose)",
    backgroundColor: "var(--bg-editor)",
    color: "var(--fg-primary)",
  },
  ".cm-content": {
    fontFamily: "var(--font-prose)",
    lineHeight: "1.75",
    padding: "var(--space-6) 0 40vh 0",
    maxWidth: "42rem",
    margin: "0 auto",
    caretColor: "var(--accent)",
  },
  "&.cm-focused": { outline: "none" },
  ".cm-line": { padding: "0 var(--space-4)" },
  ".cm-activeLine": { backgroundColor: "transparent" },
  ".cm-cursor": { borderLeftColor: "var(--accent)", borderLeftWidth: "2px" },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
    backgroundColor: "color-mix(in srgb, var(--accent) 28%, transparent)",
  },
  ".cm-tooltip": {
    backgroundColor: "var(--bg-raised)",
    border: "1px solid var(--border-strong)",
    borderRadius: "var(--radius-md)",
    boxShadow: "var(--shadow)",
    fontFamily: "var(--font-ui)",
    fontSize: "var(--text-sm)",
  },
  ".cm-tooltip-autocomplete ul li[aria-selected]": {
    backgroundColor: "var(--accent)",
    color: "var(--accent-fg)",
  },
});

export function EditorPane() {
  const version = useVaultVersion();
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const mountedNoteId = useRef<string | undefined>(undefined);

  // Which inline critique markers are on. Mirrored into a ref so a newly
  // created view can pick them up without waiting for a render.
  const [kinds, setKinds] = useState<Set<IssueKind>>(new Set());
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const kindsRef = useRef(kinds);
  kindsRef.current = kinds;

  useEffect(() => {
    view.current?.dispatch({
      effects: setCritiqueKinds.of(kinds.size ? kinds : null),
    });
  }, [kinds]);

  /* Adopt changes made to the note from outside the editor.

     CodeMirror otherwise only reads note.body when a different note
     opens, so anything that edits the active note behind its back —
     crash recovery, and later sync — would appear to do nothing, and
     the next keystroke would push the editor's stale document back over
     it. When the writer is the one typing, store body and editor doc are
     already identical, so this is a no-op on the hot path. */
  useEffect(() => {
    const instance = view.current;
    const id = mountedNoteId.current;
    if (!instance || !id) return;

    const body = store.vault.get(id)?.body ?? "";
    const current = instance.state.doc.toString();
    if (body === current) return;

    const head = instance.state.selection.main.head;
    instance.dispatch({
      changes: { from: 0, to: current.length, insert: body },
      selection: { anchor: Math.min(head, body.length) },
    });
  }, [version]);

  const toggleKind = (k: IssueKind) =>
    setKinds((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  const active = store.active();
  const activeId = active?.id;

  // Keyed on activeId alone: a different note rebuilds the editor, but a
  // keystroke (which bumps the store version) does not — that would destroy
  // the cursor. The cleanup lives in this same effect so StrictMode's
  // double-mount tears down and rebuilds symmetrically.
  useEffect(() => {
    const parent = host.current;
    if (!parent || !activeId) return;

    mountedNoteId.current = activeId;

    const state = EditorState.create({
      doc: store.vault.get(activeId)?.body ?? "",
      extensions: [
        history(),
        closeBrackets(),
        autocompletion({ override: [wikiLinkSource], activateOnTyping: true }),
        keymap.of([...closeBracketsKeymap, ...completionKeymap, ...historyKeymap, ...defaultKeymap]),
        markdown(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        critiqueExtension(),
        taskCheckboxes,
        highlightActiveLine(),
        EditorView.lineWrapping,
        placeholder("Begin the chapter…"),
        novellaTheme,
        EditorView.updateListener.of((u) => {
          if (u.docChanged && mountedNoteId.current) {
            store.setBody(mountedNoteId.current, u.state.doc.toString());
          }
        }),
      ],
    });

    const instance = new EditorView({ state, parent });
    view.current = instance;
    instance.focus();

    // Re-apply the critique toggles to the fresh view.
    instance.dispatch({
      effects: setCritiqueKinds.of(kindsRef.current.size ? kindsRef.current : null),
    });

    // Let the Assistant drop generated prose into the manuscript.
    registerEditorInsert((text) => {
      const doc = instance.state.doc;

      // Only trust the cursor if the writer actually put it somewhere.
      // Otherwise it sits at position 0, and "continue the scene" would
      // paste the continuation on top of the chapter's opening line.
      const pos = instance.hasFocus ? instance.state.selection.main.head : doc.length;

      // Separate from surrounding prose without piling up blank lines.
      const before = instance.state.sliceDoc(Math.max(0, pos - 2), pos);
      const after = instance.state.sliceDoc(pos, Math.min(doc.length, pos + 2));
      const lead = pos === 0 || before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n";
      const tail = pos === doc.length || after.startsWith("\n\n") ? "" : after.startsWith("\n") ? "\n" : "\n\n";

      const insert = `${lead}${text.trim()}${tail}`;
      instance.dispatch({
        changes: { from: pos, insert },
        selection: { anchor: pos + insert.length },
        scrollIntoView: true,
      });
      instance.focus();
    });

    return () => {
      registerEditorInsert(null);
      instance.destroy();
      view.current = null;
    };
  }, [activeId]);

  if (!active) {
    return (
      <main className="editor">
        <div className="empty-state">
          <p>No note open.</p>
          <p className="muted">Pick something from the Story Bible to start writing.</p>
        </div>
      </main>
    );
  }

  const words = active.body.trim() ? active.body.trim().split(/\s+/).length : 0;

  return (
    <main className="editor">
      <header className="editor-head">
        <div>
          <h1 className="editor-title">{active.title}</h1>
          <div className="editor-path">{active.path}</div>
        </div>
        <div className="editor-meta">
          <div className="critique-toggles" role="group" aria-label="Inline critique">
            {ALL_KINDS.map((k) => (
              <button
                key={k}
                className={`critique-chip ${k} ${kinds.has(k) ? "on" : ""}`}
                onClick={() => toggleKind(k)}
                title={`${kinds.has(k) ? "Hide" : "Show"} ${KIND_LABEL[k].toLowerCase()} in the text`}
                aria-pressed={kinds.has(k)}
              >
                {KIND_LABEL[k]}
              </button>
            ))}
          </div>
          {store.isDirty(active.id) && <span className="dot-dirty" title="Unsaved changes" />}
          <span>{words.toLocaleString()} words</span>
        </div>
      </header>
      {active.type === "chapter" || active.type === "scene" ? <BeatsPanel /> : null}
      <div
        className="editor-surface"
        ref={host}
        onContextMenu={(e) => {
          // Our own menu: pin the open note to a board from where you're
          // writing. CodeMirror has no native spellcheck menu to lose.
          e.preventDefault();
          setMenu({ x: e.clientX, y: e.clientY });
        }}
      />
      {menu && (
        <EditorContextMenu
          x={menu.x}
          y={menu.y}
          noteId={active.id}
          noteTitle={active.title}
          onClose={() => setMenu(null)}
        />
      )}
    </main>
  );
}

/* ---------------- right-click menu ---------------- */

function EditorContextMenu({
  x,
  y,
  noteId,
  noteTitle,
  onClose,
}: {
  x: number;
  y: number;
  noteId: string;
  noteTitle: string;
  onClose: () => void;
}) {
  const boards = useBoards();
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");

  useEffect(() => {
    const away = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest(".editor-menu")) onClose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("mousedown", away);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("mousedown", away);
      window.removeEventListener("keydown", key);
    };
  }, [onClose]);

  // Keep the menu on screen near the pointer.
  const style: React.CSSProperties = {
    left: Math.min(x, window.innerWidth - 240),
    top: Math.min(y, window.innerHeight - 200),
  };

  return (
    <div className="editor-menu" style={style} role="menu" aria-label="Editor menu">
      <div className="editor-menu-title">“{noteTitle}”</div>
      <div className="editor-menu-label">Add to board</div>
      {boards.length === 0 && !naming && (
        <p className="editor-menu-empty">No boards yet — make one:</p>
      )}
      {boards.map((b) => {
        const on = b.noteIds.includes(noteId);
        return (
          <button
            key={b.id}
            role="menuitem"
            className="editor-menu-item"
            onClick={() => {
              if (on) boardStore.removeNote(b.id, noteId);
              else boardStore.addNote(b.id, noteId);
              onClose();
            }}
          >
            {on ? "✓ " : ""}
            {b.name}
            {on && <span className="editor-menu-hint"> — remove</span>}
          </button>
        );
      })}
      {naming ? (
        <input
          className="editor-menu-input"
          autoFocus
          value={name}
          placeholder="New board name…"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              const board = boardStore.add(name);
              boardStore.addNote(board.id, noteId);
              onClose();
            } else if (e.key === "Escape") {
              onClose();
            }
          }}
          aria-label="New board name"
        />
      ) : (
        <button role="menuitem" className="editor-menu-item" onClick={() => setNaming(true)}>
          + New board…
        </button>
      )}
    </div>
  );
}
