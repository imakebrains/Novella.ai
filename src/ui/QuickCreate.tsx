import { useEffect, useRef, useState } from "react";
import { store } from "../state/vaultStore";

/* Other surfaces (the codex pane's own + button) can pop this open
   without owning the component. */
let opener: (() => void) | null = null;
export function openQuickCreate(): boolean {
  if (!opener) return false;
  opener();
  return true;
}

/* The + button — Notion's fastest habit, adapted.

   One press, name the thing, pick what it is, and you're writing in it.
   No hunting through panes for the right section. Everything it makes is
   an ordinary vault note, so it shows up in the codex, the board, links
   and search like anything written the slow way. */

const KINDS: { type: string; label: string; hint: string }[] = [
  { type: "chapter", label: "Chapter", hint: "Lands at the end of the manuscript" },
  { type: "scene", label: "Scene", hint: "A smaller unit — also on the board" },
  { type: "character", label: "Character", hint: "Codex entry, linkable with [[name]]" },
  { type: "location", label: "Location", hint: "Codex entry for a place" },
  { type: "note", label: "Note", hint: "Checklists, research, anything" },
];

export function QuickCreate({
  onCreated,
  onNewProject,
}: {
  onCreated: () => void;
  onNewProject: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState("chapter");
  const [tplId, setTplId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    opener = () => setOpen(true);
    return () => {
      opener = null;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const create = () => {
    const tpl = tplId ? store.vault.get(tplId) : undefined;
    const effectiveKind = tpl
      ? typeof tpl.data.templateFor === "string"
        ? tpl.data.templateFor
        : "note"
      : kind;
    const title = name.trim() || defaultName(effectiveKind);
    if (store.vault.resolveLink(title)) {
      setError(`"${title}" already exists — pick another name.`);
      return;
    }
    if (tpl) store.createFromTemplate(tpl.id, title);
    else store.createNote(kind, title);
    setName("");
    setError(null);
    setOpen(false);
    onCreated();
  };

  const defaultName = (type: string): string => {
    if (type === "chapter") return `Chapter ${store.orderedChapters().length + 1}`;
    const count = store.vault.byType(type).length + 1;
    return `${type.charAt(0).toUpperCase()}${type.slice(1)} ${count}`;
  };

  return (
    <div className="quick-create" ref={wrap}>
      <button
        className={`quick-create-btn ${open ? "on" : ""}`}
        onClick={() => setOpen((v) => !v)}
        title="Create a chapter, character, location or note — or start from a template"
        aria-expanded={open}
      >
        + <span className="quick-create-word">New</span>
      </button>

      {open && (
        <div className="quick-create-pop">
          <input
            ref={input}
            className="quick-create-name"
            value={name}
            placeholder={defaultName(kind)}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") create();
            }}
            aria-label="Name for the new item"
          />

          <div className="quick-create-kinds" role="radiogroup" aria-label="What to create">
            {KINDS.map((k) => (
              <button
                key={k.type}
                className={`quick-kind ${kind === k.type && !tplId ? "on" : ""}`}
                role="radio"
                aria-checked={kind === k.type && !tplId}
                title={k.hint}
                onClick={() => {
                  setKind(k.type);
                  setTplId(null);
                }}
              >
                <span className="type-dot" data-type={k.type} /> {k.label}
              </button>
            ))}
          </div>

          {store.templates().length > 0 && (
            <>
              <p className="hint quick-create-label">…or from a template</p>
              <div className="quick-create-kinds" role="radiogroup" aria-label="From a template">
                {store.templates().map((t) => {
                  const forType =
                    typeof t.data.templateFor === "string" ? t.data.templateFor : "note";
                  return (
                    <button
                      key={t.id}
                      className={`quick-kind ${tplId === t.id ? "on" : ""}`}
                      role="radio"
                      aria-checked={tplId === t.id}
                      title={`New ${forType} with this template's contents. Save any note as a template from its right-click menu.`}
                      onClick={() => setTplId(tplId === t.id ? null : t.id)}
                    >
                      <span className="type-dot" data-type={forType} />{" "}
                      {t.title.replace(/ \(template\)$/, "")}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {error && <p className="hint quick-create-error">{error}</p>}

          <div className="quick-create-actions">
            <button className="btn-primary" onClick={create}>
              Create
            </button>
            <button
              className="btn-ghost"
              onClick={() => {
                setOpen(false);
                onNewProject();
              }}
            >
              New project…
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
