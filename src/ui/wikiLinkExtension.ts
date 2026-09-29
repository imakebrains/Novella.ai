import { Prec, StateEffect, StateField, type Extension } from "@codemirror/state";
import {
  EditorView,
  ViewPlugin,
  closeHoverTooltips,
  hoverTooltip,
  keymap,
  showTooltip,
  type Tooltip,
} from "@codemirror/view";
import { store } from "../state/vaultStore";
import type { Note } from "../core/vault";
import { codexNames } from "./critiqueExtension";
import { firstParagraph, linkAt, linkExists, refreshWikiLinks, wikiLinkField } from "./wikiLinks";

/* [[links]] in the prose — the half that talks to the vault.

   Live preview (brackets hidden off the cursor's line) comes from
   wikiLinkField in wikiLinks.ts. This file adds what needs the store:
   whether a link resolves, the hover card, and opening on click.

   Ctrl+click opens (Cmd+click on macOS), not a plain click. On a rendered
   line a plain click is the only pointer route into editing a link — it
   lands the cursor, the line reveals its raw [[...]], and the writer
   types. A plain click that navigated would make links uneditable by
   mouse and would fire whenever a drag-selection started on one. The
   modifier isn't discoverable, so the hover card carries an Open button
   and says the shortcut out loud. */

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
const modName = isMac ? "⌘" : "Ctrl";

const resolveAgainstVault = linkExists.of((name) => store.vault.resolveLink(name) !== undefined);

/* Creating an entry from the Codex pane changes whether a link resolves
   without any editor transaction, so the field would keep painting it
   dangling. The store emits on every keystroke, though, so this only
   repaints when the set of names actually moved — codexNames() is cached
   per store version and shared with critique, so a keystroke costs one
   walk of the index between both.

   The dispatch waits a microtask: the store emits from inside the
   editor's own updateListener (setBody), and CodeMirror throws on a
   dispatch made during an update. */
const vaultWatcher = ViewPlugin.fromClass(
  class {
    private readonly stop: () => void;
    private signature: string;
    private seenVersion: number;
    private queued = false;
    private gone = false;

    constructor(private readonly view: EditorView) {
      this.seenVersion = store.getSnapshot();
      this.signature = codexNames().join("\n");
      this.stop = store.subscribe(() => {
        const version = store.getSnapshot();
        if (version === this.seenVersion) return;
        this.seenVersion = version;
        const next = codexNames().join("\n");
        if (next === this.signature || this.queued) return;
        this.signature = next;
        this.queued = true;
        queueMicrotask(() => {
          this.queued = false;
          if (!this.gone) this.view.dispatch({ effects: refreshWikiLinks.of(null) });
        });
      });
    }

    destroy() {
      this.gone = true;
      this.stop();
    }
  },
);

/* Card buttons must not steal focus from the editor, or the caret and
   the card's own dismissal logic go with it. */
function cardButton(label: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "btn-ghost";
  button.textContent = label;
  button.addEventListener("mousedown", (e) => e.preventDefault());
  button.addEventListener("click", onClick);
  return button;
}

/* textContent throughout: note bodies are the writer's own text and are
   never parsed as HTML. */
function noteCard(note: Note, name: string): HTMLElement {
  const card = document.createElement("div");
  card.className = "cm-wikilink-card";

  const type = document.createElement("span");
  type.className = "cm-wikilink-card-type";
  type.dataset.type = note.type;
  type.textContent = note.type;

  const title = document.createElement("div");
  title.className = "cm-wikilink-card-title";
  title.textContent = note.title;

  card.append(type, title);

  // A link that resolved through an alias says so, or "[[the captain]]"
  // opening a card titled Kestrel looks like the wrong note.
  if (name.trim().toLowerCase() !== note.title.trim().toLowerCase()) {
    const via = document.createElement("div");
    via.className = "cm-wikilink-card-via";
    via.textContent = `via “${name}”`;
    card.append(via);
  }

  const excerpt = firstParagraph(note.body);
  const body = document.createElement("p");
  body.className = excerpt ? "cm-wikilink-card-body" : "cm-wikilink-card-body empty";
  body.textContent = excerpt || "Nothing written yet.";

  const actions = document.createElement("div");
  actions.className = "cm-wikilink-card-actions";
  const hint = document.createElement("span");
  hint.className = "cm-wikilink-card-hint";
  hint.textContent = `${modName}+click to open`;
  actions.append(cardButton("Open", () => store.open(note.id)), hint);

  card.append(body, actions);
  return card;
}

/* A dangling link's card. Buttons, not confirm(): this webview suppresses
   dialogs, so a confirm silently returns false (see TrashPanel). The three
   types are the codex folders createFromDanglingLink tells apart. Opening
   the new entry swaps the active note, EditorPane rebuilds the editor,
   and this card goes with the old view. */
function createCard(name: string): HTMLElement {
  const card = document.createElement("div");
  card.className = "cm-wikilink-card";

  const type = document.createElement("span");
  type.className = "cm-wikilink-card-type";
  type.dataset.type = "dangling";
  type.textContent = "Not in the codex yet";

  const title = document.createElement("div");
  title.className = "cm-wikilink-card-title";
  title.textContent = name;

  // "Create as" plus one-word buttons, so all three fit on one row.
  const actions = document.createElement("div");
  actions.className = "cm-wikilink-card-actions";
  const lead = document.createElement("span");
  lead.className = "cm-wikilink-card-lead";
  lead.textContent = "Create as";
  actions.append(lead);
  for (const [label, noteType] of [
    ["Character", "character"],
    ["Location", "location"],
    ["Lore", "lore"],
  ] as const) {
    actions.append(cardButton(label, () => store.open(store.createFromDanglingLink(name, noteType).id)));
  }

  card.append(type, title, actions);
  return card;
}

const openCreateCard = StateEffect.define<{ pos: number; name: string }>();
const closeCreateCard = StateEffect.define<null>();

/* The card a Ctrl+click on a dangling link pins open. Any edit or cursor
   move dismisses it, so its anchor never needs mapping through changes. */
const createCardField = StateField.define<Tooltip | null>({
  create: () => null,
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(openCreateCard)) {
        const { pos, name } = e.value;
        return { pos, above: true, arrow: true, create: () => ({ dom: createCard(name) }) };
      }
      if (e.is(closeCreateCard)) return null;
    }
    return tr.docChanged || tr.selection ? null : value;
  },
  provide: (f) => showTooltip.from(f),
});

const hoverCard = hoverTooltip(
  (view, pos) => {
    // A pinned create card already says everything the hover would.
    if (view.state.field(createCardField)) return null;
    const link = linkAt(view.state.field(wikiLinkField).links, pos);
    if (!link) return null;
    const note = store.vault.resolveLink(link.name);
    return {
      pos: link.from,
      end: link.to,
      above: true,
      create: () => ({ dom: note ? noteCard(note, link.name) : createCard(link.name) }),
    };
  },
  { hoverTime: 400, hideOnChange: true },
);

const openOnModClick = EditorView.domEventHandlers({
  mousedown(event, view) {
    // Ctrl+click on macOS is the context menu, so only Cmd counts there.
    const mod = isMac ? event.metaKey : event.ctrlKey;
    if (!mod || event.button !== 0) return false;
    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
    if (pos === null) return false;
    const link = linkAt(view.state.field(wikiLinkField).links, pos);
    if (!link) return false;
    // CodeMirror's own Ctrl+click adds a second cursor; on a link, opening wins.
    event.preventDefault();
    if (!store.openByName(link.name)) {
      view.dispatch({ effects: [openCreateCard.of({ pos: link.from, name: link.name }), closeHoverTooltips] });
    }
    return true;
  },
});

/* Declines when no card is open, so autocompletion's own Escape (which
   sits at Prec.highest) still closes the [[ menu. Prec.high so the
   default keymap's Escape, bound earlier in EditorPane, doesn't get there
   first. */
const closeOnEscape = Prec.high(keymap.of([
  {
    key: "Escape",
    run: (view) => {
      if (!view.state.field(createCardField)) return false;
      view.dispatch({ effects: closeCreateCard.of(null) });
      return true;
    },
  },
]));

/* Shipped as a baseTheme beside the extension, like critiqueTheme, so the
   feature lands without touching app.css. If it ever moves to app.css,
   delete this in the same commit — baseTheme rules are scoped under
   CodeMirror's theme class and would quietly out-rank the stylesheet.
   The markdown highlighter already underlines the inner [text] as a Link
   node; text-decoration is set here so the underline is ours on purpose. */
const wikiLinkTheme = EditorView.baseTheme({
  ".cm-wikilink": {
    color: "var(--link)",
    textDecoration: "underline",
    textDecorationColor: "color-mix(in srgb, var(--link) 45%, transparent)",
    textUnderlineOffset: "3px",
  },
  ".cm-wikilink-dangling": {
    color: "var(--fg-muted)",
    textDecorationStyle: "dashed",
    textDecorationColor: "var(--fg-muted)",
  },
  // Cursor's line only: the syntax dims so the link text reads through it.
  ".cm-wikilink-bracket": {
    color: "var(--fg-muted)",
    opacity: "0.55",
  },
  ".cm-wikilink-card": {
    padding: "var(--space-2) var(--space-3)",
    maxWidth: "24rem",
    fontFamily: "var(--font-ui)",
    fontSize: "var(--text-sm)",
    lineHeight: "1.5",
    color: "var(--fg-primary)",
  },
  ".cm-wikilink-card-type": {
    display: "block",
    fontSize: "var(--text-xs)",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: "var(--fg-muted)",
  },
  '.cm-wikilink-card-type[data-type="character"]': { color: "var(--type-character)" },
  '.cm-wikilink-card-type[data-type="location"]': { color: "var(--type-location)" },
  '.cm-wikilink-card-type[data-type="lore"]': { color: "var(--type-lore)" },
  '.cm-wikilink-card-type[data-type="faction"]': { color: "var(--type-faction)" },
  '.cm-wikilink-card-type[data-type="object"]': { color: "var(--type-object)" },
  '.cm-wikilink-card-type[data-type="chapter"], .cm-wikilink-card-type[data-type="scene"]': {
    color: "var(--type-chapter)",
  },
  '.cm-wikilink-card-type[data-type="prompt"]': { color: "var(--type-prompt)" },
  ".cm-wikilink-card-title": {
    fontWeight: "600",
    margin: "var(--space-05) 0 var(--space-1)",
  },
  ".cm-wikilink-card-via": {
    marginTop: "calc(-1 * var(--space-1))",
    marginBottom: "var(--space-1)",
    fontSize: "var(--text-xs)",
    color: "var(--fg-muted)",
  },
  ".cm-wikilink-card-body": {
    margin: "0",
    color: "var(--fg-secondary)",
  },
  ".cm-wikilink-card-body.empty": {
    fontStyle: "italic",
    color: "var(--fg-muted)",
  },
  ".cm-wikilink-card-actions": {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "var(--space-1)",
    marginTop: "var(--space-2)",
  },
  ".cm-wikilink-card-lead": {
    marginRight: "var(--space-1)",
    fontSize: "var(--text-xs)",
    color: "var(--fg-muted)",
  },
  ".cm-wikilink-card-hint": {
    marginLeft: "auto",
    fontSize: "var(--text-xs)",
    color: "var(--fg-muted)",
  },
});

export function wikiLinkExtension(): Extension {
  return [
    wikiLinkField,
    resolveAgainstVault,
    vaultWatcher,
    createCardField,
    openOnModClick,
    hoverCard,
    closeOnEscape,
    wikiLinkTheme,
  ];
}
