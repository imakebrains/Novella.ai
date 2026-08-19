import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { StateEffect } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { redo, redoDepth, undo, undoDepth } from "@codemirror/commands";
import { formatTarget, subscribeFormatTarget } from "./editorBridge";
import {
  NO_FORMAT,
  inspect,
  toggleHeading,
  toggleInline,
  toggleLink,
  toggleList,
  toggleQuote,
  type FormatResult,
  type FormatState,
  type HeadingLevel,
  type InlineMark,
  type ListKind,
} from "./formatCommands";

/* The formatting bar — Google Docs' row of buttons, sized for a
   manuscript rather than an office suite.

   It never appears and disappears. A bar that pops in when you select
   something pushes the page down while you are reading it, and reflow
   under the cursor is the one thing the design system will not have
   (DESIGN-SYSTEM §5). So the strip is always in the layout, always the
   same height, and only *dims* when the editor is idle: present enough to
   find on your first day, quiet enough to forget on your hundredth.
   Hovering it or focusing it brings it back — that part is CSS.

   Nothing here animates inside .cm-editor, and nothing re-renders on the
   typing path unless a button's lit state genuinely changed: the update
   listener compares the whole toolbar state and drops the keystroke on
   the floor when it matches. Typing latency is the product.

   All the text arithmetic lives in formatCommands.ts, which is pure and
   proved in test-format.ts. What is left here is CodeMirror plumbing. */

/* Reading the document to decide what is lit runs on every keystroke, so
   it reads a window around the selection rather than the whole chapter —
   every command in formatCommands only ever touches the selected lines,
   plus a couple of characters either side for the unwrap check. */
const WINDOW_PAD = 4;

/** Above this many characters in the window, stop reading and show
    nothing lit. Selecting a whole chapter should not cost a frame. */
const INSPECT_LIMIT = 20_000;

interface DocWindow {
  start: number;
  end: number;
  text: string;
  from: number;
  to: number;
}

function windowOf(view: EditorView): DocWindow {
  const { doc } = view.state;
  const sel = view.state.selection.main;
  const first = doc.lineAt(sel.from);
  // A selection ending exactly at a line start belongs to the line above.
  const tail = sel.to > sel.from && doc.lineAt(sel.to).from === sel.to ? sel.to - 1 : sel.to;
  const last = doc.lineAt(Math.max(sel.from, tail));
  const start = Math.max(0, first.from - WINDOW_PAD);
  const end = Math.min(doc.length, last.to + WINDOW_PAD);
  return {
    start,
    end,
    text: view.state.sliceDoc(start, end),
    from: sel.from - start,
    to: sel.to - start,
  };
}

interface BarState extends FormatState {
  focused: boolean;
  selecting: boolean;
  canUndo: boolean;
  canRedo: boolean;
}

function read(view: EditorView): BarState {
  const w = windowOf(view);
  const sel = view.state.selection.main;
  const marks = w.text.length > INSPECT_LIMIT ? NO_FORMAT : inspect(w.text, w.from, w.to);
  return {
    ...marks,
    focused: view.hasFocus,
    selecting: !sel.empty,
    canUndo: undoDepth(view.state) > 0,
    canRedo: redoDepth(view.state) > 0,
  };
}

function same(a: BarState | null, b: BarState): boolean {
  return (
    a !== null &&
    a.bold === b.bold &&
    a.italic === b.italic &&
    a.strike === b.strike &&
    a.code === b.code &&
    a.bullet === b.bullet &&
    a.numbered === b.numbered &&
    a.quote === b.quote &&
    a.heading === b.heading &&
    a.link === b.link &&
    a.focused === b.focused &&
    a.selecting === b.selecting &&
    a.canUndo === b.canUndo &&
    a.canRedo === b.canRedo
  );
}

type Command = (text: string, from: number, to: number) => FormatResult;

/** Run a pure command against the window and put the answer back.

    The replacement is bounded by the window, not the document, so a bold
    toggle in chapter 30 stays a small change — CodeMirror's history keeps
    its grain and Ctrl+Z undoes exactly the button press. */
function apply(view: EditorView, command: Command): void {
  const w = windowOf(view);
  const out = command(w.text, w.from, w.to);
  view.dispatch({
    changes: { from: w.start, to: w.end, insert: out.text },
    selection: { anchor: w.start + out.from, head: w.start + out.to },
    scrollIntoView: true,
  });
  view.focus();
}

/* One update listener per view, appended to the live configuration so the
   bar can watch the editor without EditorPane knowing it exists. The
   callback is routed through a module-level hook rather than captured, so
   a remount (StrictMode does two) never leaves a second listener talking
   to a dead component. */
const wired = new WeakSet<EditorView>();
let notify: (() => void) | null = null;

function watch(view: EditorView): void {
  if (wired.has(view)) return;
  wired.add(view);
  view.dispatch({
    effects: StateEffect.appendConfig.of(
      EditorView.updateListener.of((u) => {
        if (u.selectionSet || u.docChanged || u.focusChanged) notify?.();
      }),
    ),
  });
}

const HEADINGS: { level: HeadingLevel; label: string; short: string; marks: string }[] = [
  { level: 0, label: "Body text", short: "Body", marks: "" },
  { level: 1, label: "Title", short: "Title", marks: "#" },
  { level: 2, label: "Heading 1", short: "H1", marks: "##" },
  { level: 3, label: "Heading 2", short: "H2", marks: "###" },
  { level: 4, label: "Heading 3", short: "H3", marks: "####" },
];

/* Tab order. The bar sits above the editor, so eleven tab stops would
   stand between the keyboard and the page. One stop, arrows to move
   inside — the toolbar pattern, and the reason role="toolbar" is honest
   here rather than decorative. */
const ITEMS = [
  "bold",
  "italic",
  "strike",
  "code",
  "heading",
  "bullet",
  "numbered",
  "quote",
  "link",
  "undo",
  "redo",
] as const;

export function FormatBar() {
  const view = useSyncExternalStore(subscribeFormatTarget, formatTarget, formatTarget);
  const [state, setState] = useState<BarState | null>(null);
  const [open, setOpen] = useState<"heading" | "link" | null>(null);
  const [url, setUrl] = useState("");
  const [rove, setRove] = useState(0);
  const bar = useRef<HTMLDivElement>(null);
  const live = useRef<BarState | null>(null);
  live.current = state;

  // Watch the editor. Only a change in what the bar would *draw* reaches
  // React; ordinary typing inside a paragraph stops here.
  useEffect(() => {
    if (!view) {
      setState(null);
      return;
    }
    const pull = () => {
      const next = read(view);
      if (!same(live.current, next)) setState(next);
    };
    notify = pull;
    watch(view);
    pull();
    return () => {
      notify = null;
    };
  }, [view]);

  const run = useCallback(
    (command: Command) => {
      if (view) apply(view, command);
    },
    [view],
  );

  const linkNow = useCallback(() => {
    if (!view) return;
    if (live.current?.link) {
      // Already a link: the button is a switch, so this takes it off.
      run((t, f, o) => toggleLink(t, f, o, ""));
      return;
    }
    setUrl("");
    setOpen("link");
  }, [run, view]);

  /* Ctrl+B / Ctrl+I / Ctrl+K, registered on the window in the capture
     phase so they land before App's palette listener.

     Ctrl+K is the one with a rival: it opens the command palette
     everywhere in Novella, and taking that away inside the editor would
     be a worse trade than the shortcut is worth. So it only becomes
     "link" when there is prose selected to link — a bare caret still
     opens the palette. */
  useEffect(() => {
    if (!view) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
      if (!view.hasFocus) return;
      const key = e.key.toLowerCase();
      if (key === "b") {
        e.preventDefault();
        apply(view, (t, f, o) => toggleInline(t, f, o, "bold"));
      } else if (key === "i") {
        e.preventDefault();
        apply(view, (t, f, o) => toggleInline(t, f, o, "italic"));
      } else if (key === "k") {
        if (view.state.selection.main.empty) return;
        e.preventDefault();
        e.stopPropagation();
        linkNow();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [view, linkNow]);

  // Popovers close the way every other menu in the app closes.
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!bar.current?.contains(e.target as Node)) setOpen(null);
    };
    // Capture, and stop there: while a popover is open Escape belongs to
    // it, not to App's "leave focus mode".
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setOpen(null);
      view?.focus();
    };
    window.addEventListener("mousedown", away);
    window.addEventListener("keydown", key, true);
    return () => {
      window.removeEventListener("mousedown", away);
      window.removeEventListener("keydown", key, true);
    };
  }, [open, view]);

  const move = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.target instanceof HTMLInputElement) return;
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    let next = rove;
    if (step !== 0) next = (rove + step + ITEMS.length) % ITEMS.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = ITEMS.length - 1;
    else return;
    const id = ITEMS[next];
    if (!id) return;
    e.preventDefault();
    setRove(next);
    bar.current?.querySelector<HTMLElement>(`[data-fb="${id}"]`)?.focus();
  };

  const s = state;
  const off = !view;
  const level = HEADINGS.find((h) => h.level === (s?.heading ?? 0)) ?? HEADINGS[0]!;
  const awake = open !== null || (s !== null && (s.focused || s.selecting));

  const tab = (id: (typeof ITEMS)[number]) => (ITEMS[rove] === id ? 0 : -1);

  return (
    <div
      className="format-bar"
      role="toolbar"
      aria-label="Formatting"
      data-idle={awake ? undefined : "true"}
      ref={bar}
      onKeyDown={move}
      // Keep the selection: a button that steals focus first has nothing
      // left to format by the time it is clicked.
      onMouseDown={(e) => {
        if (!(e.target instanceof HTMLInputElement)) e.preventDefault();
      }}
    >
      <Mark id="bold" label="Bold" hint="Ctrl+B" on={s?.bold} off={off} tab={tab} run={run}>
        <b aria-hidden="true">B</b>
      </Mark>
      <Mark id="italic" label="Italic" hint="Ctrl+I" on={s?.italic} off={off} tab={tab} run={run}>
        <i aria-hidden="true">I</i>
      </Mark>
      <Mark id="strike" label="Strikethrough" on={s?.strike} off={off} tab={tab} run={run}>
        <s aria-hidden="true">S</s>
      </Mark>
      <Mark id="code" label="Inline code" on={s?.code} off={off} tab={tab} run={run}>
        <span className="fb-glyph fb-mono" aria-hidden="true">
          {"‹›"}
        </span>
      </Mark>

      <span className="fb-sep" aria-hidden="true" />

      <span className="fb-anchor">
        <button
          type="button"
          className="fb-btn fb-style"
          data-fb="heading"
          tabIndex={tab("heading")}
          disabled={off}
          aria-haspopup="menu"
          aria-expanded={open === "heading"}
          aria-label={`Paragraph style — ${level.label}`}
          title="Paragraph style"
          onClick={() => setOpen(open === "heading" ? null : "heading")}
        >
          <span className="fb-style-name">{level.short}</span>
          <span className="fb-caret" aria-hidden="true">
            ▾
          </span>
        </button>
        {open === "heading" && (
          <div className="fb-pop" role="menu" aria-label="Paragraph style">
            {HEADINGS.map((h) => (
              <button
                key={h.level}
                type="button"
                role="menuitemradio"
                aria-checked={level.level === h.level}
                className="fb-pop-item"
                onClick={() => {
                  setOpen(null);
                  run((t, f, o) => toggleHeading(t, f, o, h.level));
                }}
              >
                <span className={`fb-pop-name fb-h${h.level}`}>{h.label}</span>
                <span className="fb-pop-marks" aria-hidden="true">
                  {h.marks}
                </span>
              </button>
            ))}
          </div>
        )}
      </span>

      <span className="fb-sep" aria-hidden="true" />

      <Block
        id="bullet"
        label="Bullet list"
        on={s?.bullet}
        off={off}
        tab={tab}
        run={run}
        kind="bullet"
      >
        <span className="fb-glyph" aria-hidden="true">
          •
        </span>
      </Block>
      <Block
        id="numbered"
        label="Numbered list"
        on={s?.numbered}
        off={off}
        tab={tab}
        run={run}
        kind="numbered"
      >
        <span className="fb-glyph fb-mono" aria-hidden="true">
          1.
        </span>
      </Block>
      <button
        type="button"
        className="fb-btn"
        data-fb="quote"
        tabIndex={tab("quote")}
        disabled={off}
        aria-pressed={s?.quote ?? false}
        aria-label="Blockquote"
        title="Blockquote"
        onClick={() => run(toggleQuote)}
      >
        <span className="fb-glyph fb-quote" aria-hidden="true">
          ”
        </span>
      </button>

      <span className="fb-anchor">
        <button
          type="button"
          className="fb-btn"
          data-fb="link"
          tabIndex={tab("link")}
          disabled={off}
          aria-pressed={s?.link ?? false}
          aria-label={s?.link ? "Remove link" : "Add link"}
          title={s?.link ? "Remove link" : "Add link — Ctrl+K with prose selected"}
          onClick={linkNow}
        >
          <svg className="fb-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
            <path
              d="M6.6 9.4a2.9 2.9 0 0 0 4.1 0l1.9-1.9a2.9 2.9 0 0 0-4.1-4.1l-1 1"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <path
              d="M9.4 6.6a2.9 2.9 0 0 0-4.1 0L3.4 8.5a2.9 2.9 0 0 0 4.1 4.1l1-1"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
        {open === "link" && (
          <form
            className="fb-pop fb-link-pop"
            onSubmit={(e) => {
              e.preventDefault();
              const target = url.trim();
              if (!target) return;
              setOpen(null);
              run((t, f, o) => toggleLink(t, f, o, target));
            }}
          >
            <input
              className="fb-link-input"
              autoFocus
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Paste a link…"
              aria-label="Link address"
            />
            <button type="submit" className="fb-link-go">
              Link
            </button>
          </form>
        )}
      </span>

      <span className="fb-sep" aria-hidden="true" />

      <button
        type="button"
        className="fb-btn"
        data-fb="undo"
        tabIndex={tab("undo")}
        disabled={off || !s?.canUndo}
        aria-label="Undo"
        title="Undo — Ctrl+Z"
        onClick={() => {
          if (view) {
            undo(view);
            view.focus();
          }
        }}
      >
        <svg className="fb-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <path
            d="M3.5 6.5h6.2a3.2 3.2 0 1 1 0 6.4H6.2M6.2 3.5 3.2 6.5l3 3"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <button
        type="button"
        className="fb-btn"
        data-fb="redo"
        tabIndex={tab("redo")}
        disabled={off || !s?.canRedo}
        aria-label="Redo"
        title="Redo — Ctrl+Y"
        onClick={() => {
          if (view) {
            redo(view);
            view.focus();
          }
        }}
      >
        <svg className="fb-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <path
            d="M12.5 6.5H6.3a3.2 3.2 0 1 0 0 6.4h3.5M9.8 3.5l3 3-3 3"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </div>
  );
}

/* ---------------- the two repeated buttons ---------------- */

interface ToolProps {
  id: (typeof ITEMS)[number];
  label: string;
  hint?: string;
  on: boolean | undefined;
  off: boolean;
  tab: (id: (typeof ITEMS)[number]) => number;
  run: (command: Command) => void;
  children: React.ReactNode;
}

function Mark({ id, label, hint, on, off, tab, run, children }: ToolProps & { id: InlineMark }) {
  return (
    <button
      type="button"
      className="fb-btn"
      data-fb={id}
      tabIndex={tab(id)}
      disabled={off}
      aria-pressed={on ?? false}
      aria-label={label}
      title={hint ? `${label} — ${hint}` : label}
      onClick={() => run((t, f, o) => toggleInline(t, f, o, id))}
    >
      {children}
    </button>
  );
}

function Block({ kind, id, label, on, off, tab, run, children }: ToolProps & { kind: ListKind }) {
  return (
    <button
      type="button"
      className="fb-btn"
      data-fb={id}
      tabIndex={tab(id)}
      disabled={off}
      aria-pressed={on ?? false}
      aria-label={label}
      title={label}
      onClick={() => run((t, f, o) => toggleList(t, f, o, kind))}
    >
      {children}
    </button>
  );
}
