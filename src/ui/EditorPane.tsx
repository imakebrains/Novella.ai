import { useEffect, useMemo, useRef, useState } from "react";
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
  startCompletion,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";
import { store, useVaultVersion } from "../state/vaultStore";
import { registerEditorInsert, registerTitleFocus, focusBeatDraft } from "./editorBridge";
import { BeatsPanel } from "./BeatsPanel";
import {
  critiqueExtension,
  setCritiqueKinds,
  ALL_KINDS,
  KIND_EXPLAIN,
  KIND_LABEL,
} from "./critiqueExtension";
import { taskCheckboxes } from "./taskCheckboxes";
import { moveParagraph } from "../core/paragraphs";
import { boardStore, useBoards } from "../state/boards";
import { SLASH_TRIGGER, SLASH_INSERT, matchSlashCommands } from "./slashCommands";
import { analyseProse, type IssueKind } from "../analysis/prose";

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

/* Slash-command menu. Fires on a blank line only (see SLASH_TRIGGER) —
   the command word itself becomes the completion, and applying one
   replaces it in place rather than inserting after it. */
function slashCommandSource(ctx: CompletionContext): CompletionResult | null {
  const before = ctx.matchBefore(SLASH_TRIGGER);
  if (!before) return null;

  const query = before.text.slice(1);
  const commands = matchSlashCommands(query);
  if (commands.length === 0) return null;

  return {
    from: before.from,
    options: commands.map((cmd) => ({
      label: `/${cmd.label}`,
      detail: cmd.hint,
      type: "keyword",
      apply: (view: EditorView, _completion, from: number, to: number) => {
        applySlashCommand(cmd.id, view, from, to);
      },
    })),
    validFor: /^\/\w*$/,
  };
}

/* Plain-text commands insert fixed prose (SLASH_INSERT). The rest reach
   into the vault: a beat lands in the chapter's beat plan rather than the
   prose itself, a link reopens the [[ menu so the writer keeps typing,
   and a new character is created on the spot and linked in immediately —
   no trip to the codex to break the writer's flow. */
function applySlashCommand(id: string, view: EditorView, from: number, to: number): void {
  const plain = SLASH_INSERT[id];
  if (plain !== undefined) {
    view.dispatch({ changes: { from, to, insert: plain } });
    return;
  }

  if (id === "link") {
    view.dispatch({ changes: { from, to, insert: "[[" } });
    startCompletion(view);
    return;
  }

  if (id === "beat") {
    view.dispatch({ changes: { from, to, insert: "" } });
    focusBeatDraft();
    return;
  }

  if (id === "character") {
    const active = store.active();
    if (!active) {
      view.dispatch({ changes: { from, to, insert: "" } });
      return;
    }
    const name = `Character ${store.vault.byType("character").length + 1}`;
    store.createFromDanglingLink(name, "character");
    const insert = `[[${name}]]`;
    view.dispatch({
      changes: { from, to, insert },
      selection: { anchor: from + insert.length },
    });
  }
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
    // Both overridable from Settings → Appearance.
    lineHeight: "var(--prose-leading, 1.75)",
    padding: "var(--space-6) 0 40vh 0",
    maxWidth: "var(--editor-measure, 42rem)",
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
  const [titleDraft, setTitleDraft] = useState<string | null>(null);
  const titleInput = useRef<HTMLInputElement>(null);

  // "Rename" on any right-click menu lands here: the title input is the
  // rename surface, so the menu just walks the cursor to it.
  useEffect(() => {
    registerTitleFocus(() => {
      titleInput.current?.focus();
      titleInput.current?.select();
    });
    return () => registerTitleFocus(null);
  }, []);
  const kindsRef = useRef(kinds);
  kindsRef.current = kinds;

  useEffect(() => {
    view.current?.dispatch({
      effects: setCritiqueKinds.of(kinds.size ? kinds : null),
    });
  }, [kinds]);

  // Counts on the chips, so toggling one with nothing to show doesn't
  // read as a dead button — "Sticky" with no number means all clear.
  const activeBody = store.active()?.body ?? "";
  const critiqueCounts = useMemo<Record<IssueKind, number>>(() => {
    const r = analyseProse(activeBody);
    return {
      sticky: r.stickySentences.length,
      adverb: r.adverbs.length,
      passive: r.passive.length,
      echo: r.echoes.length,
    };
  }, [activeBody]);

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
        autocompletion({ override: [wikiLinkSource, slashCommandSource], activateOnTyping: true }),
        keymap.of([
          // Alt+arrows move the paragraph under the cursor — Notion's block
          // drag, sized to prose. Registered ahead of the defaults so
          // nothing shadows it.
          {
            key: "Alt-ArrowUp",
            run: (v) => {
              const moved = moveParagraph(v.state.doc.toString(), v.state.selection.main.head, -1);
              if (!moved) return false;
              v.dispatch({
                changes: { from: 0, to: v.state.doc.length, insert: moved.body },
                selection: { anchor: moved.cursor },
                scrollIntoView: true,
              });
              return true;
            },
          },
          {
            key: "Alt-ArrowDown",
            run: (v) => {
              const moved = moveParagraph(v.state.doc.toString(), v.state.selection.main.head, 1);
              if (!moved) return false;
              v.dispatch({
                changes: { from: 0, to: v.state.doc.length, insert: moved.body },
                selection: { anchor: moved.cursor },
                scrollIntoView: true,
              });
              return true;
            },
          },
          ...closeBracketsKeymap,
          ...completionKeymap,
          ...historyKeymap,
          ...defaultKeymap,
        ]),
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
          <p className="muted">Pick a chapter or note from the left to start writing.</p>
        </div>
      </main>
    );
  }

  const words = active.body.trim() ? active.body.trim().split(/\s+/).length : 0;

  return (
    <main className="editor">
      <header className="editor-head">
        <div className="editor-title-wrap">
          <input
            ref={titleInput}
            className="editor-title editor-title-input"
            value={titleDraft ?? active.title}
            onChange={(e) => setTitleDraft(e.target.value)}
            onFocus={() => setTitleDraft(active.title)}
            onBlur={(e) => {
              // Read the field itself, not state — a blur that lands in the
              // same tick as the last keystroke would otherwise see a stale
              // draft and quietly drop the rename.
              store.renameNote(active.id, e.currentTarget.value);
              setTitleDraft(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              else if (e.key === "Escape") {
                setTitleDraft(null);
                (e.target as HTMLInputElement).blur();
              }
            }}
            aria-label="Note title — edit to rename"
            title="Click to rename. Old links keep working."
          />
          <div className="editor-path" title="Where this note lives in the project folder — plain Markdown, yours to open anywhere">
            {active.path}
          </div>
        </div>
        <div className="editor-meta">
          <div
            className="critique-toggles"
            role="group"
            aria-label="Prose critique highlighters"
            title="Prose critique — each toggle highlights one habit in the text. Hover a chip for what it means; the Critique tab on the right explains findings in full."
          >
            {ALL_KINDS.map((k) => (
              <button
                key={k}
                className={`critique-chip ${k} ${kinds.has(k) ? "on" : ""}`}
                onClick={() => toggleKind(k)}
                title={`${KIND_EXPLAIN[k]} Click to ${kinds.has(k) ? "hide" : "highlight"}.`}
                aria-pressed={kinds.has(k)}
              >
                {KIND_LABEL[k]}
                {critiqueCounts[k] > 0 && (
                  <span className="critique-count">{critiqueCounts[k]}</span>
                )}
              </button>
            ))}
          </div>
          {store.isDirty(active.id) && <span className="dot-dirty" title="Unsaved changes" />}
          <span title="Words in this note">{words.toLocaleString()} words</span>
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
