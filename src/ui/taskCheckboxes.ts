import { RangeSetBuilder } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import { TASK_LINE } from "../core/tasks";

/* Clickable checkboxes for `- [ ]` lines, right in the prose.

   The raw `[x]` token is replaced with a real box you can click. The
   line under the cursor is left as plain text — decorating the line
   being edited would fight the keyboard for it, and the writer editing
   a task wants characters, not chrome. Same deal as autocomplete:
   assist, don't wrestle. */

class CheckboxWidget extends WidgetType {
  constructor(
    readonly done: boolean,
    readonly pos: number,
  ) {
    super();
  }

  override eq(other: CheckboxWidget): boolean {
    return other.done === this.done && other.pos === this.pos;
  }

  override toDOM(view: EditorView): HTMLElement {
    const box = document.createElement("span");
    box.className = `cm-task-box${this.done ? " done" : ""}`;
    box.setAttribute("role", "checkbox");
    box.setAttribute("aria-checked", String(this.done));
    box.textContent = this.done ? "✓" : "";
    box.addEventListener("mousedown", (e) => {
      e.preventDefault();
      // Re-read the token at toggle time: the decoration may be a paint
      // behind the live document, and writing blind would eat prose.
      const token = view.state.doc.sliceString(this.pos, this.pos + 3);
      if (token !== "[ ]" && token !== "[x]" && token !== "[X]") return;
      view.dispatch({
        changes: { from: this.pos, to: this.pos + 3, insert: token === "[ ]" ? "[x]" : "[ ]" },
      });
    });
    return box;
  }
}

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const cursorLines = new Set<number>();
  for (const range of view.state.selection.ranges) {
    cursorLines.add(view.state.doc.lineAt(range.head).number);
  }

  for (const { from, to } of view.visibleRanges) {
    let pos = from;
    while (pos <= to) {
      const line = view.state.doc.lineAt(pos);
      const m = TASK_LINE.exec(line.text);
      if (m && !cursorLines.has(line.number)) {
        const done = (m[2] ?? "").toLowerCase() === "x";
        const checkbox = line.from + m[1]!.length;
        if (done) {
          builder.add(line.from, line.from, Decoration.line({ class: "cm-task-done-line" }));
        }
        builder.add(
          checkbox,
          checkbox + 3,
          Decoration.replace({ widget: new CheckboxWidget(done, checkbox) }),
        );
      }
      pos = line.to + 1;
    }
  }
  return builder.finish();
}

export const taskCheckboxes = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }

    update(update: ViewUpdate) {
      // selectionSet matters: moving the cursor onto a task line reveals
      // the raw text for editing, and off it re-shows the box.
      if (update.docChanged || update.viewportChanged || update.selectionSet) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);
