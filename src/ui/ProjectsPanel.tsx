import { useEffect, useRef, useState, type MouseEvent } from "react";
import { store, useVaultVersion } from "../state/vaultStore";
import { ProjectPreviewModal } from "./ProjectPreviewModal";
import {
  clearProjectBanner,
  hydrateProjectBanner,
  projectStore,
  setProjectBanner,
  useActiveProject,
  useProjects,
  type Project,
} from "../state/projects";
import { isTauri, storage } from "../storage";
import type { WebStorage } from "../storage/webStorage";
import { PRESETS, presetById } from "../seed/presets";
import { starterFiles } from "../seed/storySeeds";
import { defaultBanner } from "../seed/bannerArt";

/* The projects screen.

   Each card is one vault folder. Switching projects swaps the entire
   vault — codex, links, board and all — so nothing from one book can
   leak into another. */

export function ProjectsPanel({ onClose }: { onClose: () => void }) {
  useVaultVersion();
  const projects = useProjects();
  const active = useActiveProject();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [webName, setWebName] = useState("");
  const [preset, setPreset] = useState("novel");
  const isWeb = storage().kind === "web";

  /* Which card is being previewed, held by id rather than by object: the
     project re-renders while the preview is up (cover art hydrating off
     disk), and the preview should show the current one, not the copy that
     existed at click time. A forgotten project closes its own preview. */
  const [previewId, setPreviewId] = useState<string | null>(null);
  const preview = projects.find((p) => p.id === previewId) ?? null;

  useEffect(() => {
    // One owner for Escape. Two window listeners would both fire and the
    // preview would take the whole projects screen down with it.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (previewId) setPreviewId(null);
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, previewId]);

  const openExisting = async () => {
    setBusy("Opening…");
    setError(null);
    try {
      const picked = await storage().pickFolder();
      if (!picked) return;
      const name = picked.split(/[\\/]/).filter(Boolean).pop() ?? "Project";
      const project = projectStore.add({ name: name.replace(/[-_]+/g, " "), path: picked });
      const ok = await store.openFolderAt(picked);
      if (!ok) {
        setError(store.error() ?? "Could not open that folder.");
        return;
      }
      projectStore.setActive(project.id);
      // A folder opened for the first time may already carry cover art —
      // from another machine, a backup, or a collaborator.
      void hydrateProjectBanner(project);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const createNew = async () => {
    setBusy("Creating…");
    setError(null);
    try {
      const picked = await storage().pickFolder();
      if (!picked) return;

      const name = picked.split(/[\\/]/).filter(Boolean).pop() ?? "Project";
      const title = name.replace(/[-_]+/g, " ");

      // Scaffold the chosen preset so the folder structure explains itself.
      // Seeded here rather than in the generator: every project gets its own
      // starter world instead of everyone's first book being the same one.
      await storage().grantAccess(picked);
      for (const [path, contents] of starterFiles(Date.now(), preset)) {
        await storage().write(picked, path, contents);
      }

      const project = projectStore.add({ name: title, path: picked });
      const ok = await store.openFolderAt(picked);
      if (!ok) {
        setError(store.error() ?? "Created the files, but could not open the folder.");
        return;
      }
      projectStore.setActive(project.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  /** Browser projects are created by name, not folder picker — there is no
      picker on the open web. The vault lives in IndexedDB under a virtual
      root, and everything downstream treats it exactly like a folder. */
  const createWeb = async () => {
    const name = webName.trim() || "Untitled project";
    setBusy("Creating…");
    setError(null);
    try {
      const slug =
        name.toLowerCase().replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").slice(0, 40) ||
        "project";
      // A second project with the same name gets a suffix rather than
      // silently opening the first one.
      let root = `web://${slug}`;
      for (let i = 2; projects.some((p) => p.path === root); i++) root = `web://${slug}-${i}`;

      // Files may exist under this root with no project entry (a forgotten
      // project). Adopt them instead of scaffolding over them.
      const backing = storage();
      const orphaned =
        backing.kind === "web" ? await (backing as WebStorage).rootExists(root) : false;
      if (!orphaned) {
        for (const [path, contents] of starterFiles(Date.now(), preset)) {
          await backing.write(root, path, contents);
        }
      }

      const project = projectStore.add({ name, path: root });
      const ok = await store.openFolderAt(root);
      if (!ok) {
        setError(store.error() ?? "Could not open the new project.");
        return;
      }
      projectStore.setActive(project.id);
      setWebName("");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const switchTo = async (project: Project) => {
    if (!project.path) {
      // The bundled demo world — no folder to open.
      store.loadSeed();
      projectStore.setActive(project.id);
      onClose();
      return;
    }
    setBusy(`Opening ${project.name}…`);
    setError(null);
    try {
      const ok = await store.openFolderAt(project.path);
      if (!ok) {
        setError(
          `Could not open ${project.path}. Has the folder moved or been renamed?`,
        );
        return;
      }
      projectStore.setActive(project.id);
      void hydrateProjectBanner(project);
      onClose();
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal projects-modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2>Projects</h2>
          <button className="icon-btn" onClick={onClose} title="Close (Esc)">
            ✕
          </button>
        </header>

        <div className="modal-body">
          <p className="hint">
            Each project is its own folder. Characters, locations and links never cross
            between them. Writing a series? Keep the books in one project so they share a
            codex.
          </p>

          <div className="preset-row" role="radiogroup" aria-label="Start from">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                className={`preset-chip ${preset === p.id ? "on" : ""}`}
                role="radio"
                aria-checked={preset === p.id}
                title={p.blurb}
                onClick={() => setPreset(p.id)}
              >
                {p.name}
              </button>
            ))}
          </div>
          <p className="hint preset-blurb">{presetById(preset).blurb}</p>

          {isTauri() ? (
            <div className="btn-row projects-actions">
              <button className="btn-primary" onClick={() => void createNew()} disabled={!!busy}>
                New project
              </button>
              <button className="btn-ghost" onClick={() => void openExisting()} disabled={!!busy}>
                Open a folder…
              </button>
            </div>
          ) : (
            <div className="btn-row projects-actions">
              <input
                className="search bare project-new-name"
                value={webName}
                placeholder="Name a new project…"
                onChange={(e) => setWebName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !busy && isWeb) void createWeb();
                }}
                disabled={!isWeb}
                aria-label="New project name"
              />
              <button className="btn-primary" onClick={() => void createWeb()} disabled={!!busy || !isWeb}>
                Create
              </button>
            </div>
          )}

          {!isTauri() && (
            <p className="hint">
              {isWeb
                ? "Projects made here are stored by your browser, on this device. They survive reloads and work offline; clearing site data removes them. The desktop app keeps real folders on disk instead."
                : "This browser can't store projects (private browsing?). Edits will vanish on reload."}
            </p>
          )}

          {busy && <p className="hint">{busy}</p>}
          {error && <div className="notice error-notice">{error}</div>}

          {projects.length === 0 ? (
            <p className="empty-note">No projects yet.</p>
          ) : (
            <div className="project-grid">
              {projects.map((p) => (
                <ProjectCard
                  key={p.id}
                  project={p}
                  active={active?.id === p.id}
                  onOpen={() => void switchTo(p)}
                  onPreview={() => setPreviewId(p.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>

    {/* A sibling, not a child: it needs its own backdrop over the projects
        screen, and nesting it inside would inherit that screen's
        click-to-close. */}
    {preview && (
      <ProjectPreviewModal
        project={preview}
        active={active?.id === preview.id}
        busy={!!busy}
        onClose={() => setPreviewId(null)}
        onOpen={() => {
          // Close first: switching can take a moment or fail outright, and
          // both the progress line and the error live on the screen behind.
          setPreviewId(null);
          void switchTo(preview);
        }}
      />
    )}
    </>
  );
}

function ProjectCard({
  project,
  active,
  onOpen,
  onPreview,
}: {
  project: Project;
  active: boolean;
  onOpen: () => void;
  onPreview: () => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [bannerError, setBannerError] = useState<string | null>(null);

  /* Clicking the card shows what's inside instead of swapping the vault
     on the spot — a name and a folder path are not enough to choose by.
     The card can't be a <button> (it holds the name and subtitle fields),
     so the controls it contains keep their own clicks; the Preview button
     in the footer is the keyboard route to the same place. */
  const cardClick = (e: MouseEvent<HTMLElement>) => {
    if (e.target instanceof HTMLElement && e.target.closest("input, button, textarea, a, label")) {
      return;
    }
    onPreview();
  };

  const pickBanner = async (file: File | undefined) => {
    if (!file) return;
    setBannerError(null);
    try {
      await setProjectBanner(project, file);
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : String(err));
    }
  };

  const removeBanner = async () => {
    setBannerError(null);
    try {
      await clearProjectBanner(project);
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <article
      className={`project-card previewable ${active ? "active" : ""}`}
      onClick={cardClick}
    >
      {/* No cover chosen yet? Show generated art seeded by the name, so a
          fresh project never sits there as a grey rectangle. The moment a
          real cover is set, it takes over. */}
      <div
        className="project-banner"
        style={{
          // Quoted url(): the generated SVG data URL contains parentheses
          // (hsl colours), which break an unquoted CSS url() outright.
          backgroundImage: `url("${project.banner ?? defaultBanner(project.name)}")`,
        }}
      >
        <div className="project-banner-actions">
          <button
            className="banner-btn"
            onClick={() => fileInput.current?.click()}
            title="Choose a cover image"
          >
            {project.banner ? "Change cover" : "Add cover"}
          </button>
          {project.banner && (
            <button
              className="banner-btn"
              onClick={() => void removeBanner()}
              title="Remove cover"
            >
              Remove
            </button>
          )}
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => void pickBanner(e.target.files?.[0])}
        />
      </div>

      <div className="project-meta">
        <input
          className="project-name"
          value={project.name}
          onChange={(e) => projectStore.update(project.id, { name: e.target.value })}
          aria-label="Project name"
        />
        <input
          className="project-subtitle"
          value={project.subtitle}
          placeholder="Genre, status, anything"
          onChange={(e) => projectStore.update(project.id, { subtitle: e.target.value })}
          aria-label="Project subtitle"
        />
        <div className="project-path" title={project.path ?? "In memory only"}>
          {project.path === null
            ? "In memory — nothing saved to disk"
            : project.path.startsWith("web://")
              ? "Stored in this browser"
              : project.path}
        </div>
        {bannerError && <p className="hint">{bannerError}</p>}
      </div>

      <footer className="project-actions">
        {/* Still one click to open. The preview is an offer, not a toll. */}
        <button className="btn-primary" onClick={onOpen} disabled={active}>
          {active ? "Open" : "Switch to"}
        </button>
        <button className="btn-ghost" onClick={onPreview} title="See what's inside">
          Preview
        </button>
        <button
          className="btn-ghost"
          onClick={() => projectStore.forget(project.id)}
          title="Remove from this list. The folder and its files are left untouched."
        >
          Forget
        </button>
      </footer>
    </article>
  );
}
