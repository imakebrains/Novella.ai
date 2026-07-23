import { useMemo, useState } from "react";
import type { Note } from "../core/vault";
import { store, useVaultVersion } from "../state/vaultStore";
import { useActiveProject } from "../state/projects";
import { NoteMenu } from "./NoteMenu";
import { openQuickCreate } from "./QuickCreate";

/* Order matters — manuscript sits above the world bible, because
   that's what a writer reaches for most. */
const GROUPS: { type: string; label: string }[] = [
  { type: "chapter", label: "Manuscript" },
  { type: "scene", label: "Scenes" },
  { type: "character", label: "Characters" },
  { type: "location", label: "Locations" },
  { type: "faction", label: "Factions" },
  { type: "object", label: "Objects" },
  { type: "lore", label: "Lore" },
  { type: "note", label: "Notes" },
  { type: "prompt", label: "Prompts" },
];

export function CodexPane({
  onImport,
  onExport,
}: {
  onImport: () => void;
  onExport: () => void;
}) {
  useVaultVersion();
  const project = useActiveProject();
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);

  const activeId = store.activeIdOrUndefined();
  const matches = useMemo(
    () => (query.trim() ? new Set(store.vault.search(query).map((n) => n.id)) : null),
    [query, store.getSnapshot()],
  );

  const dangling = store.vault.danglingLinks();

  const toggle = (type: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const visible = (notes: Note[]) =>
    matches ? notes.filter((n) => matches.has(n.id)) : notes;

  return (
    <nav className="pane pane-left">
      <div className="pane-head codex-head">
        <span className="pane-title" title="This project">
          {project?.name ?? "Project"}
        </span>
        <span className="count">{store.vault.all().length}</span>
        <button
          className="pane-word-btn"
          onClick={() => openQuickCreate()}
          title="New chapter, character, location or note — or from a template"
        >
          + New
        </button>
        <button
          className="pane-word-btn"
          onClick={onImport}
          title="Import a manuscript (.docx, .md, .txt) into this project"
        >
          Import
        </button>
        <button
          className="pane-word-btn"
          onClick={onExport}
          title="Export the manuscript, or back up the whole project"
        >
          Export
        </button>
      </div>

      <div className="search-wrap">
        <input
          className="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search titles, tags, prose…"
          spellCheck={false}
        />
        {query && (
          <button className="search-clear" onClick={() => setQuery("")} title="Clear">
            ×
          </button>
        )}
      </div>

      <div className="pane-scroll">
        {GROUPS.map(({ type, label }) => {
          const notes = visible(store.vault.byType(type));
          if (!notes.length) return null;
          const isCollapsed = collapsed.has(type);

          return (
            <section key={type} className="group">
              <button className="group-head" onClick={() => toggle(type)}>
                <span className={`caret ${isCollapsed ? "closed" : ""}`}>▾</span>
                <span className="type-dot" data-type={type} />
                {label}
                <span className="count">{notes.length}</span>
              </button>

              {!isCollapsed && (
                <ul className="note-list">
                  {notes.map((note) => (
                    <li key={note.id}>
                      <button
                        className={`note-item ${note.id === activeId ? "active" : ""}`}
                        onClick={() => store.open(note.id)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setMenu({ id: note.id, x: e.clientX, y: e.clientY });
                        }}
                        title={note.path}
                      >
                        <span className="note-name">{note.title}</span>
                        {store.isDirty(note.id) && <span className="dot-dirty" />}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}

        {matches && matches.size === 0 && (
          <p className="empty-note">No matches for “{query}”.</p>
        )}

        {dangling.length > 0 && !query && (
          <section className="group dangling">
            <div className="group-head static">
              <span className="type-dot" data-type="dangling" />
              Unwritten
              <span className="count">{dangling.length}</span>
            </div>
            <p className="hint">Referenced in your prose but not yet created.</p>
            <ul className="note-list">
              {dangling.map((name) => (
                <li key={name}>
                  <button
                    className="note-item dangling-item"
                    onClick={() => store.open(store.createFromDanglingLink(name, "character").id)}
                    title={`Create "${name}" as a character`}
                  >
                    <span className="note-name">{name}</span>
                    <span className="plus">+</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {menu && (
        <NoteMenu
          noteId={menu.id}
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
        />
      )}
    </nav>
  );
}
