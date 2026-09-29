import { EditorView, ViewPlugin, hoverTooltip, type ViewUpdate } from "@codemirror/view";
import { Compartment } from "@codemirror/state";
import { findInlineIssues, type IssueKind } from "../analysis/prose";
import { store } from "../state/vaultStore";
import { critiqueField, critiqueHitAt, echoStale, setEchoIssues } from "./critiqueField";

/* Inline critique for the manuscript.

   Sticky sentences get a soft background; adverbs, passive constructions
   and echoes get an underline. Hovering explains why. Everything is
   advisory — this never changes the text.

   Adverbs, passives and sticky sentences rescan only the sentences an
   edit touched (critiquePlan.ts); echoes, being document-global, rescan
   when typing pauses. */

export { setCritiqueKinds } from "./critiqueField";

/* Every name the book knows — titles and aliases of every codex entry.
   The echo check uses this so a character called Sparrow isn't underlined
   as a repeated common noun. linkTargets() walks and sorts the whole
   index, and this runs on every keystroke, so it's cached against the
   store's version counter. */
let namesCache: { version: number; names: string[] } | null = null;
export function codexNames(): string[] {
  const version = store.getSnapshot();
  if (namesCache?.version !== version) namesCache = { version, names: store.linkTargets() };
  return namesCache.names;
}

/* Echoes are document-global (see critiquePlan.ts), so they are rechecked
   once typing pauses rather than per keystroke, and mapped through the
   edits in between. The max wait stops a writer who never pauses from
   never seeing them refresh. */
const ECHO_IDLE_MS = 400;
const ECHO_MAX_WAIT_MS = 2000;

const echoOn = (view: EditorView) => view.state.field(critiqueField, false)?.kinds?.has("echo") ?? false;

/* Also rescans when the codex's names move — a new entry exempts its name
   from echoes without any editor transaction. The store emits on every
   keystroke, so it compares the names, not the version; codexNames() is
   cached per version and shared with the wiki-link watcher.

   Every dispatch here comes from a timer, never from inside an editor
   update, which CodeMirror would throw on. */
const echoScheduler = ViewPlugin.fromClass(
  class {
    private timer: ReturnType<typeof setTimeout> | null = null;
    private idle: number | null = null;
    private firstQueuedAt = 0;
    private gone = false;
    private signature: string;
    private seenVersion: number;
    private readonly stop: () => void;

    constructor(private readonly view: EditorView) {
      this.seenVersion = store.getSnapshot();
      this.signature = codexNames().join("\n");
      this.stop = store.subscribe(() => {
        const version = store.getSnapshot();
        if (version === this.seenVersion) return;
        this.seenVersion = version;
        const next = codexNames().join("\n");
        if (next === this.signature) return;
        this.signature = next;
        if (echoOn(this.view)) this.schedule(ECHO_IDLE_MS);
      });
      if (echoStale(view.state)) this.schedule(0);
    }

    update(u: ViewUpdate) {
      if (echoStale(u.state)) this.schedule(u.state.field(critiqueField).echoDoc === null ? 0 : ECHO_IDLE_MS);
    }

    private schedule(ms: number) {
      // A scan already waiting for idle time will read the doc as it is then.
      if (this.idle !== null) return;
      if (this.timer !== null) clearTimeout(this.timer);
      const now = Date.now();
      if (!this.firstQueuedAt) this.firstQueuedAt = now;
      if (now - this.firstQueuedAt >= ECHO_MAX_WAIT_MS) ms = 0;
      this.timer = setTimeout(() => {
        this.timer = null;
        // WKWebView (the macOS shell) has no requestIdleCallback.
        if (typeof requestIdleCallback === "function") {
          this.idle = requestIdleCallback(() => {
            this.idle = null;
            this.run();
          }, { timeout: 500 });
        } else {
          this.run();
        }
      }, ms);
    }

    private run() {
      this.firstQueuedAt = 0;
      if (this.gone || !echoOn(this.view)) return;
      const doc = this.view.state.doc;
      const names = codexNames();
      this.signature = names.join("\n");
      const issues = findInlineIssues(doc.toString(), new Set<IssueKind>(["echo"]), { known: names });
      this.view.dispatch({ effects: setEchoIssues.of({ doc, issues }) });
    }

    destroy() {
      this.gone = true;
      if (this.timer !== null) clearTimeout(this.timer);
      if (this.idle !== null && typeof cancelIdleCallback === "function") cancelIdleCallback(this.idle);
      this.stop();
    }
  },
);

const critiqueTooltip = hoverTooltip((view, pos) => {
  const v = view.state.field(critiqueField, false);
  if (!v?.kinds || v.kinds.size === 0) return null;
  // Innermost match wins, so hovering an adverb inside a sticky sentence
  // explains the adverb rather than the sentence. Read from what is
  // painted, so the tooltip never disagrees with a mapped echo underline.
  const hit = critiqueHitAt(v, pos);
  if (!hit) return null;

  return {
    pos: hit.from,
    end: hit.to,
    above: true,
    create() {
      const dom = document.createElement("div");
      dom.className = "cm-issue-tooltip";
      dom.textContent = hit.message;
      return { dom };
    },
  };
});

export const critiqueTheme = EditorView.baseTheme({
  ".cm-issue-adverb": {
    textDecoration: "underline wavy",
    textDecorationColor: "var(--type-object)",
    textUnderlineOffset: "4px",
  },
  ".cm-issue-passive": {
    textDecoration: "underline wavy",
    textDecorationColor: "var(--type-lore)",
    textUnderlineOffset: "4px",
  },
  ".cm-issue-echo": {
    textDecoration: "underline wavy",
    textDecorationColor: "var(--type-chapter)",
    textUnderlineOffset: "4px",
  },
  ".cm-issue-sticky": {
    backgroundColor: "color-mix(in srgb, var(--accent) 11%, transparent)",
    borderRadius: "3px",
  },
  ".cm-issue-tooltip": {
    padding: "6px 10px",
    maxWidth: "280px",
    fontFamily: "var(--font-ui)",
    fontSize: "var(--text-xs)",
    lineHeight: "1.5",
    color: "var(--fg-primary)",
    backgroundColor: "var(--bg-raised)",
    border: "1px solid var(--border-strong)",
    borderRadius: "var(--radius-md)",
    boxShadow: "var(--shadow)",
  },
});

export const critiqueCompartment = new Compartment();

export function critiqueExtension() {
  return [critiqueField, echoScheduler, critiqueTooltip, critiqueTheme];
}

export const ALL_KINDS: IssueKind[] = ["sticky", "adverb", "passive", "echo"];

export const KIND_LABEL: Record<IssueKind, string> = {
  sticky: "Sticky",
  adverb: "Adverbs",
  passive: "Passive",
  echo: "Echoes",
};

/* One sentence per chip, because the labels alone are editor jargon.
   Shown as the toggle tooltip and in the Critique tab's legend. */
export const KIND_EXPLAIN: Record<IssueKind, string> = {
  sticky:
    "Sticky sentences — held together by glue words (of, that, just, very…). They read slow; highlighting shows where prose drags.",
  adverb:
    "-ly adverbs (walked slowly, said angrily). Often a weak verb in disguise — 'crept' beats 'walked slowly'.",
  passive:
    "Passive voice (the door was opened by her). Fine on purpose, flat by accident — highlights let you decide which is which. 'She was tired' isn't passive and isn't flagged.",
  echo:
    "Echoes — the same word repeated within a few lines without meaning to. Readers hear it before writers do. Names, anything in your codex, and dialogue tags like 'said' are left alone, because those are meant to repeat.",
};
