import { useEffect, useState } from "react";
import { CodexPane } from "./ui/CodexPane";
import { EditorPane } from "./ui/EditorPane";
import { InspectorPane } from "./ui/InspectorPane";
import { SettingsModal } from "./ui/SettingsModal";
import { CommandPalette, type PaletteCommand } from "./ui/CommandPalette";
import { ExportModal } from "./ui/ExportModal";
import { ImportModal } from "./ui/ImportModal";
import { QuickCreate } from "./ui/QuickCreate";
import { MusicDock } from "./ui/MusicDock";
import { ProjectsPanel } from "./ui/ProjectsPanel";
import { hydrateProjectBanner, projectStore, useActiveProject } from "./state/projects";
import { SEED_FILES } from "./seed/seedWorld";
import { Resizer, usePaneWidth } from "./ui/Resizer";
import { Corkboard } from "./ui/Corkboard";
import { PlotGrid } from "./ui/PlotGrid";
import { TableView } from "./ui/TableView";
import { RelationshipWeb } from "./ui/RelationshipWeb";
import { BoardStats } from "./ui/BoardStats";
import type { BoardLayout } from "./ui/BoardLayoutToggle";
import { RecoveryBanner } from "./ui/RecoveryBanner";
import { UndoToastHost } from "./ui/UndoToastHost";
import { useAutosave, type SaveState } from "./state/autosave";
import { probeSetup } from "./setupProbe";
import { installAgentRunner } from "./state/agentRunner";
import { useTheme } from "./ui/useTheme";
import { store, useVaultVersion } from "./state/vaultStore";
import { isTauri, storage } from "./storage";

export default function App() {
  useVaultVersion();
  const { cycle: cycleTheme, info: themeInfo } = useTheme();
  const [loaded, setLoaded] = useState(false);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [musicOpen, setMusicOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const activeProject = useActiveProject();
  const left = usePaneWidth("left", 268);
  const right = usePaneWidth("right", 340);
  const [mode, setMode] = useState<"write" | "board">("write");
  // Which board layout: loose cards (corkboard) or the plot grid. Remembered
  // so a plotter who lives in the grid isn't dropped back to cards each time.
  const [boardLayout, setBoardLayout] = useState<BoardLayout>(
    () => (localStorage.getItem("novella.boardLayout") as BoardLayout) || "cards",
  );
  // Focus mode: nothing but the page. Distraction-free writing is the most
  // consistently praised feature across every competitor, and it's the one
  // that makes a feature-dense app bearable — depth on demand, calm by
  // default. Remembered across sessions so it's a mode, not a fidget.
  const [focus, setFocus] = useState(() => localStorage.getItem("novella.focus") === "1");
  // Autosave only writes to disk when there's a disk to write to; the
  // draft snapshots inside run either way.
  const { state: saveState, lastSaved } = useAutosave(store.isPersistent());

  // Boot. In dev, VITE_DEV_VAULT opens a real folder and runs the disk
  // round-trip check — the part a browser can't exercise.
  useEffect(() => {
    const boot = async () => {
      const devVault = import.meta.env.DEV
        ? (import.meta.env.VITE_DEV_VAULT as string | undefined)
        : undefined;

      if (devVault && isTauri()) {
        await import("./dev/vaultSelfTest")
          .then((m) => m.runVaultSelfTest(devVault))
          .finally(() => setLoaded(true));
        return;
      }

      // Agents watch for their triggers from here on. Installed before the
      // project opens so the vault swap below counts as their "app open".
      installAgentRunner();

      // Resume where the writer left off. Before this, every launch loaded
      // the demo world into memory even when their real project was one
      // click away — an app that forgets your book on restart isn't done.
      const active = projectStore.active();
      if (active?.path) {
        const ok = await store.openFolderAt(active.path);
        if (ok) {
          void hydrateProjectBanner(active);
          setLoaded(true);
          void probeSetup();
          return;
        }
        // Folder missing (moved, or another machine): fall through to seed.
      }

      if (store.vault.all().length === 0) store.loadSeed();

      if (projectStore.all().length === 0) {
        if (storage().kind === "web") {
          // Browser first run: the seed world becomes a REAL project in
          // IndexedDB, so everything done to it persists. The browser is a
          // product here, not a demo.
          try {
            const root = "web://seed-world";
            for (const [path, contents] of SEED_FILES) {
              await storage().write(root, path, contents);
            }
            const p = projectStore.add({
              name: "Seed World",
              path: root,
              subtitle: "Bundled example — yours to keep",
            });
            projectStore.setActive(p.id);
            await store.openFolderAt(root);
          } catch {
            // IndexedDB refused (private mode?) — stay on the in-memory
            // seed; the banner explains the situation.
          }
        } else {
          const demo = projectStore.add({
            name: "Seed World",
            path: null,
            subtitle: "Bundled example — try things here",
          });
          projectStore.setActive(demo.id);
        }
      }

      setLoaded(true);

      // Probe the local AI setup at launch and log it. GUI processes can
      // inherit a different PATH than a shell, so "installed" from a
      // terminal doesn't guarantee the app can find it — and if it can't,
      // the app would wrongly offer to install something already present.
      void probeSetup();
    };
    void boot();
  }, []);

  // Keyboard: Ctrl/Cmd+K opens the palette; Ctrl/Cmd+S saves;
  // Ctrl/Cmd+Shift+F toggles focus mode; Esc leaves focus mode, since
  // it's the one mode you might want out of in a hurry without reaching
  // for a shortcut you've forgotten.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void store.saveAll();
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setFocus((v) => !v);
      } else if (e.key === "Escape") {
        setFocus((v) => (v ? false : v));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Persist focus mode and reflect it on <body>, so the editor can widen
  // its measure and the chrome can fade without prop-drilling.
  useEffect(() => {
    localStorage.setItem("novella.focus", focus ? "1" : "0");
    document.body.classList.toggle("focus-mode", focus);
  }, [focus]);

  useEffect(() => {
    localStorage.setItem("novella.boardLayout", boardLayout);
  }, [boardLayout]);

  if (!loaded) return null;

  const root = store.vaultRoot();
  const dirty = store.dirtyCount();
  const persistent = store.isPersistent();
  const totalWords = store.vault
    .byType("chapter")
    .reduce((sum, n) => sum + (n.body.trim() ? n.body.trim().split(/\s+/).length : 0), 0);

  const vaultLabel = root ? (root.split(/[\\/]/).pop() ?? root) : "Seed World";

  // Everything the titlebar can do, reachable from the keyboard. The
  // palette closes itself before running, so commands that open a modal
  // don't stack two layers.
  const paletteCommands: PaletteCommand[] = [
    { id: "write", label: "Go to Write", hint: "view", run: () => setMode("write") },
    { id: "board", label: "Go to Board", hint: "view", run: () => setMode("board") },
    { id: "focus", label: focus ? "Leave focus mode" : "Enter focus mode", hint: "Ctrl+Shift+F", run: () => setFocus((v) => !v) },
    { id: "save", label: "Save all", hint: "Ctrl+S", run: () => void store.saveAll() },
    { id: "export", label: "Export or back up…", run: () => setExportOpen(true) },
    { id: "import", label: "Import manuscript…", run: () => setImportOpen(true) },
    { id: "projects", label: "Switch project…", run: () => setProjectsOpen(true) },
    { id: "settings", label: "Open Settings", run: () => setSettingsOpen(true) },
    { id: "music", label: "Open music player", run: () => setMusicOpen(true) },
    { id: "theme", label: `Change theme (now: ${themeInfo.name})`, run: cycleTheme },
    { id: "left", label: leftOpen ? "Hide codex pane" : "Show codex pane", run: () => setLeftOpen((v) => !v) },
    { id: "right", label: rightOpen ? "Hide inspector" : "Show inspector", run: () => setRightOpen((v) => !v) },
  ];

  return (
    <div className="app">
      <header className="titlebar">
        <div className="brand">
          <span className="brand-mark">◈</span>
          <span className="brand-name">Novella</span>
          <button
            className="brand-vault"
            onClick={() => setProjectsOpen(true)}
            title={root ?? "No folder open — click to choose a project"}
            disabled={store.isBusy()}
          >
            {activeProject?.name ?? vaultLabel}
            {!persistent && <span className="badge-warn">in memory</span>}
          </button>
          <QuickCreate
            onCreated={() => setMode("write")}
            onNewProject={() => setProjectsOpen(true)}
          />
        </div>

        <div className="titlebar-center">
          <div className="view-switch main-views" role="group" aria-label="View">
            <button
              className={mode === "write" ? "on" : ""}
              onClick={() => setMode("write")}
              aria-pressed={mode === "write"}
            >
              <span className="view-icon">✎</span> Write
            </button>
            <button
              className={mode === "board" ? "on" : ""}
              onClick={() => setMode("board")}
              aria-pressed={mode === "board"}
            >
              <span className="view-icon">▦</span> Board
            </button>
          </div>
        </div>

        <div className="titlebar-right">
          <span className="stat">{totalWords.toLocaleString()} words</span>
          <SaveStatus state={saveState} lastSaved={lastSaved} dirty={dirty} persistent={persistent} />
          {dirty > 0 && (
            <button
              className="save-btn"
              onClick={() => void store.saveAll()}
              disabled={store.isBusy()}
              title={
                persistent
                  ? "Save to disk (Ctrl+S)"
                  : "No folder open — this only updates the current session"
              }
            >
              {store.isBusy() ? "Saving…" : `Save ${dirty}`}
            </button>
          )}
          <button
            className={`icon-btn labeled ${leftOpen ? "on" : ""}`}
            onClick={() => setLeftOpen((v) => !v)}
            title="Show or hide the left pane — your chapters, characters and notes"
            aria-pressed={leftOpen}
          >
            ▤ <span>Codex</span>
          </button>
          <button
            className={`icon-btn labeled ${rightOpen ? "on" : ""}`}
            onClick={() => setRightOpen((v) => !v)}
            title="Show or hide the right pane — links, tasks, history, assistant"
            aria-pressed={rightOpen}
          >
            ▥ <span>Tools</span>
          </button>
          <button
            className={`icon-btn labeled ${focus ? "on" : ""}`}
            onClick={() => setFocus((v) => !v)}
            title="Focus mode — just the page, nothing else (Ctrl+Shift+F). Esc leaves."
            aria-pressed={focus}
          >
            ◎ <span>Focus</span>
          </button>
          <button
            className="icon-btn theme-cycle"
            onClick={cycleTheme}
            title={`${themeInfo.name} — click for the next theme`}
            aria-label={`Theme: ${themeInfo.name}. Click to change.`}
          >
            <span className="theme-dot" style={{ background: themeInfo.swatch[2] }} />
          </button>
          <button className="icon-btn" onClick={() => setSettingsOpen(true)} title="Settings">
            ⚙
          </button>
        </div>
      </header>

      <RecoveryBanner />

      {!persistent && (
        <div className="banner">
          {isTauri()
            ? "No vault folder open — edits live in memory only."
            : storage().kind === "web"
              ? "No project open — edits here vanish on reload."
              : "This browser can't store projects, so edits vanish on reload."}
          {isTauri() ? (
            <button className="banner-action" onClick={() => void store.openFolder()}>
              Open a folder
            </button>
          ) : (
            storage().kind === "web" && (
              <button className="banner-action" onClick={() => setProjectsOpen(true)}>
                Choose a project
              </button>
            )
          )}
        </div>
      )}

      {store.error() && <div className="banner error">{store.error()}</div>}

      {mode === "board" ? (
        boardLayout === "grid" ? (
          <PlotGrid
            onOpen={(id) => {
              store.open(id);
              setMode("write");
            }}
            layout={boardLayout}
            setLayout={setBoardLayout}
          />
        ) : boardLayout === "table" ? (
          <TableView
            onOpen={(id) => {
              store.open(id);
              setMode("write");
            }}
            layout={boardLayout}
            setLayout={setBoardLayout}
          />
        ) : boardLayout === "web" ? (
          <RelationshipWeb
            onOpen={(id) => {
              store.open(id);
              setMode("write");
            }}
            layout={boardLayout}
            setLayout={setBoardLayout}
          />
        ) : boardLayout === "stats" ? (
          <BoardStats
            onOpen={(id) => {
              store.open(id);
              setMode("write");
            }}
            layout={boardLayout}
            setLayout={setBoardLayout}
          />
        ) : (
          <Corkboard
            onOpen={(id) => {
              store.open(id);
              setMode("write");
            }}
            layout={boardLayout}
            setLayout={setBoardLayout}
          />
        )
      ) : (
      <div
        className="workspace"
        style={{
          // Focus mode is the whole point of a "just the page" view, so the
          // side panes collapse regardless of their toggles — one centered
          // column of text and nothing else.
          gridTemplateColumns: focus
            ? "minmax(0, 1fr)"
            : [
                leftOpen ? `${left.width}px` : null,
                leftOpen ? "auto" : null,
                "minmax(0, 1fr)",
                rightOpen ? "auto" : null,
                rightOpen ? `${right.width}px` : null,
              ]
                .filter(Boolean)
                .join(" "),
        }}
      >
        {!focus && leftOpen && (
          <CodexPane onImport={() => setImportOpen(true)} onExport={() => setExportOpen(true)} />
        )}
        {!focus && leftOpen && (
          <Resizer
            side="left"
            onResize={(d) => left.setWidth((w) => left.clamp(w + d))}
            onReset={left.reset}
          />
        )}

        <EditorPane />

        {!focus && rightOpen && (
          <Resizer
            side="right"
            onResize={(d) => right.setWidth((w) => right.clamp(w + d))}
            onReset={right.reset}
          />
        )}
        {!focus && rightOpen && <InspectorPane onShowMusicPlayer={() => setMusicOpen(true)} />}
      </div>
      )}

      {focus && (
        <button className="focus-exit" onClick={() => setFocus(false)} title="Leave focus mode (Esc)">
          Leave focus
        </button>
      )}

      <MusicDock open={musicOpen} onClose={() => setMusicOpen(false)} />
      <UndoToastHost />

      {paletteOpen && (
        <CommandPalette
          commands={paletteCommands}
          onOpenNote={(id) => {
            store.open(id);
            setMode("write");
          }}
          onClose={() => setPaletteOpen(false)}
        />
      )}
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
      {exportOpen && <ExportModal onClose={() => setExportOpen(false)} />}
      {importOpen && <ImportModal onClose={() => setImportOpen(false)} />}
      {projectsOpen && <ProjectsPanel onClose={() => setProjectsOpen(false)} />}
    </div>
  );
}

/* Tells the writer, without being asked, whether their words are safe.
   Silence is the wrong default here — "did that save?" is exactly the
   anxiety autosave is supposed to remove. */
function SaveStatus({
  state,
  lastSaved,
  dirty,
  persistent,
}: {
  state: SaveState;
  lastSaved: number | null;
  dirty: number;
  persistent: boolean;
}) {
  if (!persistent) {
    return dirty > 0 ? (
      <span className="save-status warn" title="No vault folder is open, so nothing is being written to disk">
        not saving
      </span>
    ) : null;
  }

  if (state === "saving") return <span className="save-status">saving…</span>;
  if (state === "error")
    return (
      <span className="save-status warn" title={store.error() ?? ""}>
        save failed
      </span>
    );
  if (state === "pending" || dirty > 0) return <span className="save-status">unsaved</span>;
  if (state === "saved" && lastSaved)
    return (
      <span className="save-status ok" title={new Date(lastSaved).toLocaleTimeString()}>
        saved
      </span>
    );
  return null;
}
