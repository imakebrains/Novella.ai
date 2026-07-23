import { useEffect, useMemo, useRef, useState } from "react";
import { store, useVaultVersion } from "../state/vaultStore";
import { matchPalette, type PaletteItem } from "./palette";

/* Ctrl+K — jump anywhere, do anything, without leaving the keyboard.

   One list, two things in it: app commands and every note in the project.
   Notion, NovelCrafter and Scrivener all converged on this; it's the
   feature that lets a 40-chapter manuscript feel as small as a 4-chapter
   one. */

export interface PaletteCommand {
  id: string;
  label: string;
  hint?: string;
  run: () => void;
}

export function CommandPalette({
  commands,
  onOpenNote,
  onClose,
}: {
  commands: PaletteCommand[];
  onOpenNote: (id: string) => void;
  onClose: () => void;
}) {
  useVaultVersion();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => inputRef.current?.focus(), []);

  const items = useMemo<PaletteItem[]>(() => {
    const cmds: PaletteItem[] = commands.map((c) => ({
      id: `cmd:${c.id}`,
      label: c.label,
      hint: c.hint,
      kind: "command",
    }));
    // Chapters in book order first, then everything else alphabetically —
    // the list an author would write by hand.
    const chapters: PaletteItem[] = store.orderedChapters().map((n) => ({
      id: `note:${n.id}`,
      label: n.title,
      hint: "chapter",
      kind: "chapter",
    }));
    const rest: PaletteItem[] = store.vault
      .all()
      .filter((n) => n.type !== "chapter")
      .sort((a, b) => a.title.localeCompare(b.title))
      .map((n) => ({
        id: `note:${n.id}`,
        label: n.title,
        hint: n.type,
        kind: "note",
      }));
    return [...cmds, ...chapters, ...rest];
  }, [commands]);

  const results = useMemo(() => matchPalette(query, items), [query, items]);
  const pick = Math.min(selected, Math.max(0, results.length - 1));

  const run = (item: PaletteItem) => {
    onClose();
    if (item.kind === "command") {
      commands.find((c) => `cmd:${c.id}` === item.id)?.run();
    } else {
      onOpenNote(item.id.slice("note:".length));
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    // The palette owns the keyboard while open — Escape must not also
    // kick the writer out of focus mode, so nothing leaks to window.
    e.stopPropagation();
    if (e.key === "Escape") onClose();
    else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected(Math.min(pick + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected(Math.max(pick - 1, 0));
    } else if (e.key === "Enter" && results[pick]) {
      e.preventDefault();
      run(results[pick]);
    }
  };

  // Keep the highlighted row in view while arrowing through a long list.
  useEffect(() => {
    listRef.current
      ?.querySelector('[data-picked="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [pick]);

  return (
    <div className="modal-backdrop palette-backdrop" onMouseDown={onClose}>
      <div
        className="palette"
        role="dialog"
        aria-label="Command palette"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <input
          ref={inputRef}
          className="palette-input"
          placeholder="Jump to a chapter or note, or type a command…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected(0);
          }}
          spellCheck={false}
        />
        <div className="palette-list" ref={listRef}>
          {results.length === 0 && (
            <p className="hint palette-empty">Nothing matches “{query}”.</p>
          )}
          {results.map((item, i) => (
            <button
              key={item.id}
              className={`palette-row ${i === pick ? "picked" : ""}`}
              data-picked={i === pick || undefined}
              onMouseEnter={() => setSelected(i)}
              onClick={() => run(item)}
            >
              <span className="palette-kind">
                {item.kind === "command" ? "›" : item.kind === "chapter" ? "§" : "✦"}
              </span>
              <span className="palette-label">{item.label}</span>
              {item.hint && <span className="palette-hint">{item.hint}</span>}
            </button>
          ))}
        </div>
        <p className="palette-foot hint">↑↓ choose · Enter open · Esc close</p>
      </div>
    </div>
  );
}
