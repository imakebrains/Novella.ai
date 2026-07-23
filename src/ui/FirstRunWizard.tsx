import { useState } from "react";
import { isTauri, storage } from "../storage";
import { store } from "../state/vaultStore";
import { projectStore, useProjects } from "../state/projects";
import { profileStore } from "../state/profile";
import { PRESETS, presetById } from "../seed/presets";
import { THEMES, useTheme } from "./useTheme";
import { probeSetup, type SetupReport } from "../setupProbe";

/* "Let's get started" — the two-minute interview.

   Four small steps instead of tutorial screens: who's writing, how it
   should look, whether local AI is available, and the first project.
   Every step can be skipped — this collects preferences, it doesn't
   gate the app. Honesty rule: the AI step reports what was actually
   found on this machine; it never pretends to connect anything. */

const LS_DONE = "novella.welcomed";

export function firstRunPending(): boolean {
  return localStorage.getItem(LS_DONE) !== "1";
}

export function FirstRunWizard({ onDone }: { onDone: () => void }) {
  const projects = useProjects();
  const { theme, setTheme } = useTheme();
  const [step, setStep] = useState(0);
  const [penName, setPenName] = useState("");
  const [ai, setAi] = useState<SetupReport | null | "checking">(null);
  const [preset, setPreset] = useState("novel");
  const [projectName, setProjectName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const finish = () => {
    localStorage.setItem(LS_DONE, "1");
    onDone();
  };

  const checkAi = async () => {
    setAi("checking");
    try {
      setAi(await probeSetup());
    } catch {
      setAi(null);
    }
  };

  const createProject = async () => {
    const name = projectName.trim() || "My first book";
    setBusy(true);
    setError(null);
    try {
      // Desktop keeps its files-first promise: the project is a real
      // folder the writer picks. The browser gets a virtual root in
      // IndexedDB — same shape, no picker to offer.
      let root: string;
      if (isTauri()) {
        const picked = await storage().pickFolder();
        if (!picked) return;
        await storage().grantAccess(picked);
        root = picked;
      } else {
        const slug =
          name.toLowerCase().replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").slice(0, 40) ||
          "project";
        root = `web://${slug}`;
        for (let i = 2; projects.some((p) => p.path === root); i++) root = `web://${slug}-${i}`;
      }
      for (const [path, contents] of presetById(preset).files) {
        await storage().write(root, path, contents);
      }
      const project = projectStore.add({ name, path: root });
      const ok = await store.openFolderAt(root);
      if (!ok) {
        setError(store.error() ?? "Could not open the new project.");
        return;
      }
      projectStore.setActive(project.id);
      finish();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal wizard" role="dialog" aria-label="Let's get started">
        <div className="wizard-progress">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className={`wizard-dot ${i <= step ? "on" : ""}`} />
          ))}
        </div>

        {step === 0 && (
          <div className="wizard-step">
            <h2>Let's get started</h2>
            <p className="hint">
              Two minutes of questions so Novella fits you from the first page.
              Everything here can be changed later in Settings — and skipped now.
            </p>
            <label className="personalize-row">
              <span>What name do you write under?</span>
              <input
                className="search bare"
                autoFocus
                value={penName}
                placeholder="Pen name or your own"
                onChange={(e) => setPenName(e.target.value)}
                aria-label="Pen name"
              />
            </label>
            <p className="hint">
              It goes on title pages and exports — nowhere else. Novella has no
              accounts and no server; everything you write stays on this machine.
            </p>
          </div>
        )}

        {step === 1 && (
          <div className="wizard-step">
            <h2>Pick a mood</h2>
            <p className="hint">
              Five themes, tuned for long sessions. Settings → Appearance can
              also change the accent color, font, text size and page width later.
            </p>
            <div className="theme-grid wizard-themes">
              {THEMES.map((t) => (
                <button
                  key={t.id}
                  className={`theme-card ${theme === t.id ? "on" : ""}`}
                  onClick={() => setTheme(t.id)}
                  aria-pressed={theme === t.id}
                >
                  <span className="theme-preview" style={{ background: t.swatch[0] }}>
                    <span className="theme-preview-pane" style={{ background: t.swatch[1] }} />
                    <span className="theme-preview-accent" style={{ background: t.swatch[2] }} />
                  </span>
                  <span className="theme-name">{t.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="wizard-step">
            <h2>Writing with AI — optional</h2>
            <p className="hint">
              Novella can draft alongside you using a model that runs on your own
              computer — free, private, nothing leaves the machine. It can also
              use paid providers later, or stay a plain writing app forever.
            </p>
            {ai === null && (
              <button className="btn-primary" onClick={() => void checkAi()}>
                Check this computer
              </button>
            )}
            {ai === "checking" && <p className="hint">Looking for a local AI engine…</p>}
            {ai !== null && ai !== "checking" && (
              <p className="hint">
                {ai.apiReachable
                  ? `Found a local AI engine running${ai.models.length ? ` with ${ai.models.length} model${ai.models.length === 1 ? "" : "s"}` : ""} — the Assistant tab is ready to use.`
                  : "No local engine found right now. Settings → Connections can install one in a click, or set up a paid provider — whenever you want, or never."}
              </p>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="wizard-step">
            <h2>Your first project</h2>
            <label className="personalize-row">
              <span>Call it</span>
              <input
                className="search bare"
                autoFocus
                value={projectName}
                placeholder="My first book"
                onChange={(e) => setProjectName(e.target.value)}
                aria-label="Project name"
              />
            </label>
            <div className="preset-row wizard-presets" role="radiogroup" aria-label="Start from">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  className={`preset-card ${preset === p.id ? "on" : ""}`}
                  role="radio"
                  aria-checked={preset === p.id}
                  onClick={() => setPreset(p.id)}
                >
                  <span className="preset-name">{p.name}</span>
                  <span className="preset-blurb">{p.blurb}</span>
                </button>
              ))}
            </div>
            {error && <p className="hint music-error">{error}</p>}
          </div>
        )}

        <div className="wizard-nav">
          <button className="btn-ghost" onClick={finish} disabled={busy}>
            Skip the tour
          </button>
          <div className="btn-row">
            {step > 0 && (
              <button className="btn-ghost" onClick={() => setStep(step - 1)} disabled={busy}>
                Back
              </button>
            )}
            {step < 3 ? (
              <button
                className="btn-primary"
                onClick={() => {
                  if (step === 0 && penName.trim()) {
                    profileStore.set({ penName: penName.trim() });
                  }
                  setStep(step + 1);
                }}
              >
                Next
              </button>
            ) : (
              <button className="btn-primary" onClick={() => void createProject()} disabled={busy}>
                {busy ? "Creating…" : "Create it"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
