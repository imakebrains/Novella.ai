import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  INTRO_SCRIPT,
  INTRO_SWATCHES,
  LINE_GAP_MS,
  RETURNING_SCREEN,
  WORD_MS,
  glueOrphans,
  inputReady,
  lineDurationMs,
  lineFinished,
  substitute,
  tapAdvance,
  wordsOf,
  type IntroScreen,
  type LineState,
} from "./introScript";
import { loadPersonalization, savePersonalization } from "./personalize";
import { THEMES, useTheme, type Theme } from "./useTheme";
import { profileStore } from "../state/profile";
import { projectStore, useProjects } from "../state/projects";
import { store } from "../state/vaultStore";
import { isTauri, storage } from "../storage";
import { PRESETS, presetById } from "../seed/presets";
import { probeSetup, type SetupReport } from "../setupProbe";

/* The welcome — a separate room, not a dialog.

   Full-screen, mounted over the workspace, scripted end to end
   (docs/DESIGN-INTRO.md). It is a narrator, not a chatbot: no bubbles, no
   avatar, no pretend AI. Every question's answer changes the app in the
   same frame — the accent recolors this very screen, the theme repaints
   it — because an intro that listens is the promise the rest of the app
   has to keep.

   The impatience ladder is load-bearing: one tap completes the streaming
   line, another completes the screen, and "Set up later" (top right)
   exits to working defaults from any point. A returning writer can be
   through in seconds. */

const SEEN_KEY = "novella.introSeen";

export function introPending(): boolean {
  return localStorage.getItem(SEEN_KEY) !== "1";
}

export function markIntroSeen(): void {
  localStorage.setItem(SEEN_KEY, "1");
}

/* Settings can reopen the intro without owning the component — same
   opener pattern as QuickCreate. */
let opener: (() => void) | null = null;
export function replayIntro(): boolean {
  if (!opener) return false;
  opener();
  return true;
}
export function registerIntroOpener(fn: (() => void) | null): void {
  opener = fn;
}

/* Short, specific theme acknowledgments — warmth from specificity. */
const THEME_ACK: Record<Theme, string> = {
  ember: "Ember it is. Dark, warm, made for late nights.",
  vellum: "Vellum it is. Parchment and bronze, like a found manuscript.",
  nocturne: "Nocturne it is. Deep water. Something waits under it.",
  driftwood: "Driftwood it is. Coffee-warm and unfussy.",
  linen: "Linen it is. Morning light and a clear head.",
};

interface CreationStep {
  label: string;
  done: boolean;
}

export function WelcomeIntro({ onDone }: { onDone: () => void }) {
  const projects = useProjects();
  const returning = projects.length > 0;
  const { theme, setTheme } = useTheme();

  // The returning path swaps the last screen: no project creation.
  const script = useMemo<IntroScreen[]>(
    () => (returning ? [...INTRO_SCRIPT.slice(0, 5), RETURNING_SCREEN] : INTRO_SCRIPT),
    [returning],
  );

  const [screenIdx, setScreenIdx] = useState(0);
  const [line, setLine] = useState<LineState>({ lineIdx: 0, lineComplete: false });
  const [penName, setPenName] = useState("");
  const [accent, setAccent] = useState<string | null>(null);
  const [committedTheme, setCommittedTheme] = useState<Theme>(theme);
  const [ai, setAi] = useState<SetupReport | "checking" | null>(null);
  const [aiLine, setAiLine] = useState<string | null>(null);
  const [steps, setSteps] = useState<CreationStep[] | null>(null);
  const [closing, setClosing] = useState(false);
  const nameField = useRef<HTMLInputElement>(null);

  const screen = script[screenIdx]!;
  const vars = useMemo(
    () => ({ name: penName, themeAck: THEME_ACK[committedTheme] }),
    [penName, committedTheme],
  );
  const lines = useMemo(
    () => screen.lines.map((l) => substitute(l, vars)),
    [screen, vars],
  );
  const ready = inputReady(line, lines.length) && !steps;

  /* ---- the line clock ----
     One timeout per state: while a line streams, wait out its duration;
     once complete, wait the gap and hand off to the next. Taps cut both
     short via tapAdvance — nothing is gated on the animation. */
  useEffect(() => {
    if (closing || steps) return;
    const total = lines.length;
    if (inputReady(line, total)) return;
    const wait = line.lineComplete
      ? LINE_GAP_MS
      : lineDurationMs(lines[line.lineIdx] ?? "");
    const t = setTimeout(() => setLine((s) => lineFinished(s, total)), wait);
    return () => clearTimeout(t);
  }, [line, lines, closing, steps]);

  // Fresh screen, fresh clock.
  useEffect(() => {
    setLine({ lineIdx: 0, lineComplete: false });
  }, [screenIdx]);

  // The pen-name field takes focus the moment it lands.
  useEffect(() => {
    if (ready && screen.input === "name") nameField.current?.focus();
  }, [ready, screen.input]);

  const skipAhead = useCallback(() => {
    setLine((s) => tapAdvance(s, lines.length));
  }, [lines.length]);

  // Tap anywhere (that isn't a control) climbs the impatience ladder.
  const onSurfaceClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button, input, a, .intro-answers")) return;
    skipAhead();
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return; // reserved: nothing to escape to
      if ((e.target as HTMLElement).tagName === "INPUT") return;
      if (e.key === "Enter" || e.key === " ") skipAhead();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [skipAhead]);

  const advance = () => setScreenIdx((i) => Math.min(i + 1, script.length - 1));

  const finish = useCallback(() => {
    markIntroSeen();
    localStorage.setItem("novella.welcomed", "1");
    setClosing(true);
    // Let the fade finish before the unmount — the workspace is already
    // painted underneath, so this is a reveal, not a load.
    setTimeout(onDone, 420);
  }, [onDone]);

  /* ---- answers ---- */

  const answerName = () => {
    const clean = penName.trim();
    if (clean) profileStore.set({ penName: clean });
    advance();
  };

  const answerColor = (hex: string) => {
    setAccent(hex);
    // The signature moment: this very screen recolors in the same frame.
    savePersonalization({ ...loadPersonalization(), accent: hex });
    advance();
  };

  const previewTheme = (id: Theme) =>
    document.documentElement.setAttribute("data-theme", id);
  const revertPreview = () =>
    document.documentElement.setAttribute("data-theme", committedTheme);
  const answerTheme = (id: Theme) => {
    setTheme(id);
    setCommittedTheme(id);
    advance();
  };

  const runAiCheck = async () => {
    setAi("checking");
    try {
      const report = await probeSetup();
      setAi(report);
      setAiLine(
        report.apiReachable
          ? `Found a local AI running${report.models.length ? ` with ${report.models.length} model${report.models.length === 1 ? "" : "s"}` : ""}. It'll be there when you want it.`
          : "Nothing running right now. That's fine — Novella works completely offline. You can add one later in Settings.",
      );
    } catch {
      setAi(null);
      setAiLine("Couldn't check just now. Novella works completely offline either way.");
    }
  };

  /* ---- first project: real steps, honestly reported ----
     Each line checks off when its actual operation completes. If it all
     takes under a second (it will), the list holds a beat so it reads. */
  const answerPreset = async (presetId: string) => {
    const preset = presetById(presetId);
    const title = "My first book";
    const themeName = THEMES.find((t) => t.id === committedTheme)?.name ?? "Ember";
    const plan: CreationStep[] = [
      { label: `Binding “${title}”`, done: false },
      { label: `${themeName} theme · your color on the spine`, done: false },
      { label: "Opening the first page", done: false },
    ];
    setSteps([...plan]);
    const tick = (i: number) =>
      setSteps((s) => (s ? s.map((st, j) => (j === i ? { ...st, done: true } : st)) : s));

    try {
      let root: string;
      if (isTauri()) {
        const picked = await storage().pickFolder();
        if (!picked) {
          setSteps(null);
          return;
        }
        await storage().grantAccess(picked);
        root = picked;
      } else {
        const slug = title.toLowerCase().replace(/\s+/g, "-");
        root = `web://${slug}`;
        for (let i = 2; projects.some((p) => p.path === root); i++)
          root = `web://${slug}-${i}`;
      }
      for (const [path, contents] of preset.files) {
        await storage().write(root, path, contents);
      }
      tick(0);
      const project = projectStore.add({ name: title, path: root });
      projectStore.setActive(project.id);
      tick(1);
      const ok = await store.openFolderAt(root);
      tick(2);
      if (!ok) {
        setSteps(null);
        return;
      }
      // Hold so the completed list is readable, then hand off.
      setTimeout(finish, 700);
    } catch {
      setSteps(null);
    }
  };

  /* ---- rendering ---- */

  const renderLine = (text: string, i: number) => {
    const isCurrent = i === line.lineIdx && !line.lineComplete;
    const visible = i < line.lineIdx || line.lineComplete || i === line.lineIdx;
    if (!visible || i > line.lineIdx) return null;
    const words = wordsOf(glueOrphans(text));
    return (
      <p key={`${screenIdx}-${i}`} className={`intro-line ${isCurrent ? "streaming" : "done"}`}>
        {words.map((w, j) => (
          <span
            key={j}
            className="intro-word"
            style={isCurrent ? { animationDelay: `${j * WORD_MS}ms` } : undefined}
          >
            {w}{" "}
          </span>
        ))}
      </p>
    );
  };

  const segments = script.length - 1; // cold open doesn't count
  const filled = Math.max(1, screenIdx); // endowed progress: segment 1 pre-filled

  return (
    <div
      className={`intro ${closing ? "closing" : ""}`}
      onClick={onSurfaceClick}
      role="dialog"
      aria-label="Welcome to Novella"
    >
      <div className="intro-glow" aria-hidden />

      {screenIdx > 0 && (
        <div className="intro-progress" aria-hidden>
          {Array.from({ length: segments }, (_, i) => (
            <span key={i} className={`intro-seg ${i < filled ? "on" : ""}`} />
          ))}
        </div>
      )}

      <button className="intro-later" onClick={finish}>
        Set up later
      </button>

      <div className="intro-stage">
        {lines.map((l, i) => renderLine(l, i))}
        {aiLine && screen.input === "ai" && ready && (
          <p className="intro-line done intro-ai-result">{glueOrphans(aiLine)}</p>
        )}

        {ready && !steps && (
          <div className="intro-answers">
            {screen.input === "begin" && (
              <button className="intro-primary" onClick={advance}>
                Begin
              </button>
            )}

            {screen.input === "name" && (
              <div className="intro-name-row">
                <input
                  ref={nameField}
                  className="intro-field"
                  value={penName}
                  placeholder="e.g. J. M. Ashford"
                  onChange={(e) => setPenName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") answerName();
                  }}
                  aria-label="Pen name"
                />
                <button className="intro-primary" onClick={answerName}>
                  Continue
                </button>
              </div>
            )}

            {screen.input === "color" && (
              <div className="intro-swatches" role="radiogroup" aria-label="Accent color">
                {INTRO_SWATCHES.map((hex) => (
                  <button
                    key={hex}
                    className={`intro-swatch ${accent === hex ? "on" : ""}`}
                    style={{ background: hex }}
                    onClick={() => answerColor(hex)}
                    aria-label={`Choose ${hex}`}
                  />
                ))}
              </div>
            )}

            {screen.input === "theme" && (
              <div className="intro-themes" role="radiogroup" aria-label="Theme">
                {THEMES.map((t) => (
                  <button
                    key={t.id}
                    className={`intro-theme ${committedTheme === t.id ? "on" : ""}`}
                    onMouseEnter={() => previewTheme(t.id)}
                    onMouseLeave={revertPreview}
                    onFocus={() => previewTheme(t.id)}
                    onBlur={revertPreview}
                    onClick={() => answerTheme(t.id)}
                  >
                    <span className="intro-theme-dots" aria-hidden>
                      <i style={{ background: t.swatch[0] }} />
                      <i style={{ background: t.swatch[1] }} />
                      <i style={{ background: t.swatch[2] }} />
                    </span>
                    {t.name}
                  </button>
                ))}
              </div>
            )}

            {screen.input === "ai" &&
              (ai === null || ai === "checking" ? (
                <button
                  className="intro-primary"
                  onClick={() => void runAiCheck()}
                  disabled={ai === "checking"}
                >
                  {ai === "checking" ? "Checking…" : "Check for local AI"}
                </button>
              ) : (
                <button className="intro-primary" onClick={advance}>
                  Continue
                </button>
              ))}
            {screen.input === "ai" && ai === null && (
              <button className="intro-quiet" onClick={advance}>
                Continue without checking
              </button>
            )}

            {screen.input === "preset" && (
              <div className="intro-presets">
                {PRESETS.map((p) => (
                  <button
                    key={p.id}
                    className="preset-card intro-preset"
                    onClick={() => void answerPreset(p.id)}
                  >
                    <span className="preset-name">{p.name}</span>
                    <span className="preset-blurb">{p.blurb}</span>
                  </button>
                ))}
              </div>
            )}

            {screen.input === "enter" && (
              <button className="intro-primary" onClick={finish}>
                Open my library
              </button>
            )}
          </div>
        )}

        {steps && (
          <div className="intro-steps" aria-live="polite">
            {steps.map((s, i) => (
              <p key={i} className={`intro-step ${s.done ? "done" : ""}`}>
                <span className="intro-step-mark">{s.done ? "✓" : "·"}</span> {s.label}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
