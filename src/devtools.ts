import { store } from "./state/vaultStore";
import { pluginHost } from "./plugins/runtime";
import { probeSetup } from "./setupProbe";
import { profileStore } from "./state/profile";
import {
  clearProjectBanner,
  hydrateProjectBanner,
  projectStore,
  setProjectBanner,
  toBannerDataUrl,
} from "./state/projects";
import { activeProviderSlash } from "./ai/generate";
import {
  clearHistory,
  restore,
  revisionsOf,
  // Aliased: this module already has a local `snapshot` for app state.
  snapshot as snapshotNote,
  snapshotById,
  thin,
} from "./state/history";
import { insertIntoEditor } from "./ui/editorBridge";
import { readDocx } from "./import/docx";
import { splitIntoChapters, textToParagraphs } from "./import/manuscript";
import { extractEntities } from "./import/entities";
import { allDrafts, pendingRecovery } from "./state/autosave";
import { analyseProse } from "./analysis/prose";
import { compileManuscript } from "./export/compile";
import { render, type Format } from "./export/formats";

/* Dev-only debug surface.

   Verifying this app meant a lot of guesswork: reading computed styles,
   scraping log files, forcing remounts to make a probe fire. This exposes
   the same information directly, so checking state is one call instead of
   an archaeology expedition.

   Stripped from production builds — the whole module is behind
   import.meta.env.DEV, so the bundler drops it and `window.__novella`
   simply doesn't exist in a shipped app. */

export interface AppSnapshot {
  notes: number;
  byType: Record<string, number>;
  activeNote: string | null;
  dirty: number;
  vaultRoot: string | null;
  persistent: boolean;
  theme: string | null;
  providers: string[];
  activeProvider: string;
  drafts: number;
  pendingRecovery: number;
  danglingLinks: string[];
}

function snapshot(): AppSnapshot {
  const byType: Record<string, number> = {};
  for (const note of store.vault.all()) {
    byType[note.type] = (byType[note.type] ?? 0) + 1;
  }

  return {
    notes: store.vault.all().length,
    byType,
    activeNote: store.active()?.title ?? null,
    dirty: store.dirtyCount(),
    vaultRoot: store.vaultRoot(),
    persistent: store.isPersistent(),
    theme: document.documentElement.getAttribute("data-theme"),
    providers: pluginHost.providers().map((p) => p.slash),
    activeProvider: activeProviderSlash(),
    drafts: allDrafts().length,
    pendingRecovery: pendingRecovery().length,
    danglingLinks: store.vault.danglingLinks(),
  };
}

export function installDevtools(): void {
  if (!import.meta.env.DEV) return;

  const api = {
    /** Everything worth knowing about current app state, in one object. */
    state: snapshot,
    /** Re-run the local AI setup probe and return its findings. */
    probe: probeSetup,
    /** Prose analysis of the open note, or of supplied text. */
    analyse: (text?: string) => analyseProse(text ?? store.active()?.body ?? ""),
    /** Compile the vault to a manuscript without exporting it. */
    compile: compileManuscript,
    /** Render an export in memory so its bytes can be inspected. */
    render: async (format: Format = "docx") => render(compileManuscript({}), format),
    /** Escape hatches for poking at internals during development. */
    store,
    pluginHost,
    profile: profileStore,
    projects: projectStore,
    history: { snapshot: snapshotNote, snapshotById, revisionsOf, restore, clearHistory, thin },
    insertIntoEditor,
    importing: { readDocx, splitIntoChapters, textToParagraphs, extractEntities },
    toBannerDataUrl,
    setProjectBanner,
    clearProjectBanner,
    hydrateProjectBanner,
  };

  (window as unknown as { __novella: typeof api }).__novella = api;
  console.info(
    "%cNovella devtools ready — try __novella.state() or __novella.probe()",
    "color:#e8a33d",
  );
}
