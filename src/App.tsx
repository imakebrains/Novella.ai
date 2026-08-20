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
import { TrashHost } from "./ui/TrashPanel";
import { ConflictHost } from "./ui/ConflictPanel";
import { BoardPanels } from "./ui/BoardPanels";
import { STYLE_ME_COMMAND, StyleMeHost } from "./ui/StyleMeModal";
import { TourButton, TourOverlay, openTour } from "./ui/TourOverlay";
import { Logo } from "./ui/Logo";
import { AmbientGlow } from "./ui/AmbientGlow";
import { Backdrop } from "./ui/Backdrop";
import { WelcomeIntro, introPending, registerIntroOpener } from "./ui/WelcomeIntro";
import { useAutosave, type SaveState } from "./state/autosave";
import { probeSetup } from "./setupProbe";
import { installAgentRunner } from "./state/agentRunner";
import { useTheme } from "./ui/useTheme";
import { store, useVaultVersion } from "./state/vaultStore";
import { isTauri, storage } from "./storage";
import {
  loadPersonalization,
  overridingReducedMotion,
  savePersonalization,
} from "./ui/personalize";

export default function App() {
  useVaultVersion();
  const { cycle: cycleTheme, info: themeInfo } = useTheme();
  const [loaded, setLoaded] = useState(false);
  // Pane toggles are remembered; the first-run branch below closes both
  // so a new writer meets one calm page, not three panes of controls.
  const [leftOpen, setLeftOpen] = useState(
    () => localStorage.getItem("novella.pane.left") !== "0",
  );
  const [rightOpen, setRightOpen] = useState(
    () => localStorage.getItem("novella.pane.right") !== "0",
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [musicOpen, setMusicOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [introOpen, setIntroOpen] = useState(false);
  const activeProject = useActiveProject();
  const left = usePaneWidth("left", 268);
  const right = usePaneWidth("right", 340);
  const [mode, setMode] = useState<"write" | "board">("write");
  // Which board layout: loose cards (corkboard) or the plot grid. Remembered
  // so a plotter who lives in the grid isn't dropped back to cards each time.
  const [boardLayout, setBoardLayout] = useState<BoardLayout>(() => {
    const saved = localStorage.getItem("novella.boardLayout") as BoardLayout | null;
    // Web and Stats were cut from the switch (owner, 2026-07-23); a saved
    // preference for them would strand the board on an unreachable view.
    return saved && ["cards", "grid", "table"].includes(saved) ? saved : "cards";
  });
  // Cover art on the board. Global rather than per-project: a writer who
  // finds a hero image distracting finds it distracting on every book, and
  // a per-project flag would mean re-hiding it after every switch. Default
  // on, so nobody loses art they deliberately added.
  const [bannerOn, setBannerOn] = useState(
    () => localStorage.getItem("novella.board.banner") !== "0",
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

      // The welcome runs once for everyone — returning writers see it too
      // (their projects and settings are untouched; it's presentation).
      // Settings can replay it any time.
      // The welcome is for first arrivals. A writer with books already
      // on the shelf goes straight to them — the intro stays reachable
      // from Settings → About → Replay (owner round 12).
      if (introPending()) {
        if (projectStore.all().length === 0) setIntroOpen(true);
        else localStorage.setItem("novella.introSeen", "1");
      }

      // Resume where the writer left off. Before this, every launch loaded
      // the demo world into memory even when their real project was one
      // click away — an app that forgets your book on restart isn't done.
      const active = projectStore.active();
      // Anyone who already has projects predates the welcome interview.
      if (projectStore.all().length > 0) localStorage.setItem("novella.welcomed", "1");
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
        // Genuinely the first launch: quiet by default. The panes exist
        // one click away ("Codex", "Tools" in the titlebar) — depth on
        // demand instead of a cockpit on day one. The two-minute
        // "Let's get started" interview opens over the seed world.
        setLeftOpen(false);
        setRightOpen(false);
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

  // Settings can reopen the welcome without owning it.
  useEffect(() => {
    registerIntroOpener(() => setIntroOpen(true));
    return () => registerIntroOpener(null);
  }, []);

  // Panels deep in the tree send people to Settings — "no provider
  // connected" is only useful if the way to fix it is one click away. The
  // event is cancelable and the sender falls back to naming the gear icon,
  // so answering it here upgrades the button rather than enabling it.
  useEffect(() => {
    const open = (e: Event) => {
      e.preventDefault();
      setSettingsOpen(true);
    };
    window.addEventListener("novella:open-settings", open);
    return () => window.removeEventListener("novella:open-settings", open);
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

  // Mirrored onto <body> the way focus mode is. The cards board takes the
  // flag as a prop, but the grid/table/web/stats views each render their
  // own banner; a body class reaches all of them without threading a
  // preference through five component signatures.
  useEffect(() => {
    localStorage.setItem("novella.board.banner", bannerOn ? "1" : "0");
    document.body.classList.toggle("board-banner-off", !bannerOn);
  }, [bannerOn]);

  useEffect(() => {
    localStorage.setItem("novella.pane.left", leftOpen ? "1" : "0");
  }, [leftOpen]);
  useEffect(() => {
    localStorage.setItem("novella.pane.right", rightOpen ? "1" : "0");
  }, [rightOpen]);

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
    STYLE_ME_COMMAND,
    { id: "tour", label: "Show me around", hint: "tour", run: () => openTour() },
    { id: "music", label: "Open music player", run: () => setMusicOpen(true) },
    { id: "theme", label: `Change theme (now: ${themeInfo.name})`, run: cycleTheme },
    { id: "left", label: leftOpen ? "Hide codex pane" : "Show codex pane", run: () => setLeftOpen((v) => !v) },
    { id: "right", label: rightOpen ? "Hide inspector" : "Show inspector", run: () => setRightOpen((v) => !v) },
    { id: "banner", label: bannerOn ? "Hide board cover art" : "Show board cover art", hint: "board", run: () => setBannerOn((v) => !v) },
  ];

  // The centre of the workspace. Board and Write are two views of one
  // room, not two rooms: whichever is showing, the Codex and Tools panes
  // bracket it, so their titlebar toggles mean the same thing in both.
  const center =
    mode === "board" ? (
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
          bannerOn={bannerOn}
          onToggleBanner={() => setBannerOn((v) => !v)}
        />
      )
    ) : (
      <EditorPane />
    );

  return (
    <div className="app">
      <header className="titlebar">
        <div className="brand">
          <span className="brand-mark">
            <Logo size={20} animate />
          </span>
          <span className="brand-name">Novella</span>
          <button
            className="brand-vault"
            onClick={() => setProjectsOpen(true)}
            data-tip={root ?? "No folder open — click to choose a project"}
            disabled={store.isBusy()}
          >
            {activeProject?.name ?? vaultLabel}
            {!persistent && (
              <span
                className="badge-warn"
                data-tip="Not saved anywhere — edits vanish when the app closes"
              >
                in memory
              </span>
            )}
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
              data-tip={
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
            data-tip="Chapters, characters and notes"
            aria-pressed={leftOpen}
          >
            ▤ <span>Codex</span>
          </button>
          <button
            className={`icon-btn labeled ${rightOpen ? "on" : ""}`}
            onClick={() => setRightOpen((v) => !v)}
            data-tip="Links, tasks, history, assistant"
            aria-pressed={rightOpen}
          >
            ▥ <span>Tools</span>
          </button>
          <button
            className={`icon-btn labeled ${focus ? "on" : ""}`}
            onClick={() => setFocus((v) => !v)}
            data-tip="Just the page (Ctrl+Shift+F)"
            aria-pressed={focus}
          >
            ◎ <span>Focus</span>
          </button>
          <button
            className="icon-btn theme-cycle"
            onClick={cycleTheme}
            data-tip={`${themeInfo.name} — click for the next theme`}
            aria-label={`Theme: ${themeInfo.name}. Click to change.`}
          >
            <span className="theme-dot" style={{ background: themeInfo.swatch[2] }} />
          </button>
          <TourButton />
          <button
            className="icon-btn"
            onClick={() => setSettingsOpen(true)}
            data-tip="Settings"
            aria-label="Settings"
          >
            ⚙
          </button>
        </div>
      </header>

      <RecoveryBanner />
      <MotionNotice />

      {!persistent && (
        <div className="banner">
          <span className="banner-icon" aria-hidden>
            ⚠
          </span>
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

      {store.error() && (
        <div className="banner error">
          <span className="banner-icon" aria-hidden>
            ⚠
          </span>
          {store.error()}
        </div>
      )}

      <div
        className={`workspace ${mode === "board" ? "board-mode" : ""}`}
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

        {center}
        {mode === "board" && !focus && (
          <BoardPanels onShowMusicPlayer={() => setMusicOpen(true)} />
        )}

        {!focus && rightOpen && (
          <Resizer
            side="right"
            onResize={(d) => right.setWidth((w) => right.clamp(w + d))}
            onReset={right.reset}
          />
        )}
        {!focus && rightOpen && <InspectorPane onShowMusicPlayer={() => setMusicOpen(true)} />}
      </div>

      {focus && (
        <button className="focus-exit" onClick={() => setFocus(false)} data-tip="Leave focus mode (Esc)">
          Leave focus
        </button>
      )}

      <Backdrop />
      <AmbientGlow />
      <MusicDock open={musicOpen} onClose={() => setMusicOpen(false)} />
      <UndoToastHost />
      <TrashHost />
      <ConflictHost />

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
      <StyleMeHost onOpenSettings={() => setSettingsOpen(true)} />
      {introOpen && <WelcomeIntro onDone={() => setIntroOpen(false)} />}
      {!introOpen && <TourOverlay />}
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
      <span className="save-status warn" data-tip="No folder open — nothing is written to disk">
        not saving
      </span>
    ) : null;
  }

  if (state === "saving")
    return (
      <span className="save-status" data-tip="Writing your changes now">
        saving…
      </span>
    );
  if (state === "error")
    return (
      <span className="save-status warn" title={store.error() ?? ""}>
        save failed
      </span>
    );
  if (state === "pending" || dirty > 0)
    return (
      <span
        className="save-status"
        data-tip="Autosaves 1.5s after you pause — or Ctrl+S"
      >
        unsaved
      </span>
    );
  if (state === "saved" && lastSaved)
    return (
      <span className="save-status ok" data-tip={new Date(lastSaved).toLocaleTimeString()}>
        saved
      </span>
    );
  return null;
}


/* Honest disclosure: animations ship on by default, because the OS
   "reduce motion" flag is off on countless machines whose owners never
   asked for stillness. Anyone who DID ask deserves to be told, once,
   that we are overriding them — and to fix it in one click. */
function MotionNotice() {
  const DISMISS_KEY = "novella.motionNoticeSeen";
  const [show, setShow] = useState(
    () => overridingReducedMotion() && localStorage.getItem(DISMISS_KEY) !== "1",
  );
  if (!show) return null;
  const close = () => {
    localStorage.setItem(DISMISS_KEY, "1");
    setShow(false);
  };
  return (
    <div className="banner">
      <span className="banner-icon" aria-hidden>
        ✳
      </span>
      Your system asks for reduced motion. Novella is playing its animations anyway.
      <button
        className="banner-action"
        onClick={() => {
          savePersonalization({ ...loadPersonalization(), motion: "auto" });
          close();
        }}
      >
        Follow my system
      </button>
      <button className="banner-action" onClick={close}>
        Keep the motion
      </button>
    </div>
  );
}
