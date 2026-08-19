import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BOOT_MS,
  FINALE_MS,
  INTRO_SWATCHES,
  LINE_GAP_MS,
  gerundAt,
  glueOrphans,
  inputReady,
  lineDurationMs,
  lineFinished,
  scriptFor,
  substitute,
  tapAdvance,
  type IntroClip,
  type IntroScreen,
  type LineState,
} from "./introScript";
import { loadPersonalization, reducedMotion, savePersonalization } from "./personalize";
import { BACKDROP_PRESETS, presetMarker, resolveBackdrop } from "./backdrops";
import { Logo } from "./Logo";
import { THEMES, useTheme, type Theme } from "./useTheme";
import { profileStore } from "../state/profile";
import { projectStore, toBannerDataUrl, useProjects } from "../state/projects";
import catGif from "../assets/cat-loading.gif?inline";
import catStill from "../assets/cat-still.avif?inline";
import { store } from "../state/vaultStore";
import { isTauri, storage } from "../storage";
import { PRESETS } from "../seed/presets";
import { previewOf, previewSummary } from "./presetPreview";
import { starterFiles } from "../seed/storySeeds";
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
   through in seconds.

   Two screens SHOW rather than ask, in the guided tour's language: a
   small looping window built from the app's own vocabulary, set under
   the copy the way the tour sets one beside its lesson. See the clips
   at the bottom of this file, and the one rule they all obey. */

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
};

interface CreationStep {
  label: string;
  done: boolean;
}

export function WelcomeIntro({ onDone }: { onDone: () => void }) {
  const projects = useProjects();
  const returning = projects.length > 0;
  const { theme, setTheme } = useTheme();

  // The returning path swaps the project screen for the door back in and
  // drops the showing screens. The rule lives in introScript.ts, where it
  // can be asserted without a DOM.
  const script = useMemo<IntroScreen[]>(() => scriptFor(returning), [returning]);

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

  /* The boot: the cat opens the show, cycling one absurd gerund, then
     hands off to the first scene. A tap cuts it instantly. */
  const [boot, setBoot] = useState<"on" | "leaving" | "off">("on");

  /* The glow blooms once when a choice commits. Keyed remount replays it. */
  const [bloomTick, setBloomTick] = useState(0);
  const bloom = () => setBloomTick((n) => n + 1);
  useEffect(() => {
    if (boot !== "on") return;
    const t = setTimeout(() => setBoot("leaving"), BOOT_MS);
    return () => clearTimeout(t);
  }, [boot]);
  useEffect(() => {
    if (boot !== "leaving") return;
    const t = setTimeout(() => setBoot("off"), 520);
    return () => clearTimeout(t);
  }, [boot]);

  /* Scene transitions with a real exit: before the screen index moves,
     the outgoing stage is cloned as an inert ghost that plays the exit
     animation while the new stage enters from the other side. Display
     only — the ghost has no listeners and removes itself. */
  const stageEl = useRef<HTMLDivElement>(null);
  const enterFrom = useRef<"right" | "left">("right");
  const ghostStage = (dir: "left" | "right") => {
    const st = stageEl.current;
    const host = st?.parentElement;
    if (!st || !host) return;
    // Belt and braces: one outgoing scene at a time, always.
    host.querySelectorAll(".stage-exit-left, .stage-exit-right").forEach((n) => n.remove());
    const g = st.cloneNode(true) as HTMLElement;
    g.classList.remove("enter-right", "enter-left");
    g.classList.add(dir === "left" ? "stage-exit-left" : "stage-exit-right");
    g.setAttribute("aria-hidden", "true");
    g.style.pointerEvents = "none";
    host.appendChild(g);
    const drop = () => g.remove();
    g.addEventListener("animationend", drop, { once: true });
    window.setTimeout(drop, 800);
  };

  /* Backdrop step: the chosen scene shows through THIS screen the moment
     it's picked — same promise as the accent recolor. */
  /* Starts bare on purpose: showing a previously chosen scene before the
     writer reaches the question answers it for them. The room fills in
     the moment they pick one. */
  const [introBg, setIntroBg] = useState<string | null>(null);
  const carousel = useRef<HTMLDivElement>(null);

  /* The loading cat cycles its vocabulary while real steps tick. */
  const [gerundTick, setGerundTick] = useState(0);
  const gerundActive = !!steps || boot !== "off";
  useEffect(() => {
    if (!gerundActive) return;
    const t = setInterval(() => setGerundTick((n) => n + 1), 800);
    return () => clearInterval(t);
  }, [gerundActive]);

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
  /* One flag decides whether the windows play or stand still, read at
     render the way the tour reads it. reducedMotion() already folds in
     the OS preference AND the writer's explicit override, so there is no
     second authority here to disagree with it. */
  const still = reducedMotion();

  /* ---- the line clock ----
     One timeout per state: while a line streams, wait out its duration;
     once complete, wait the gap and hand off to the next. Taps cut both
     short via tapAdvance — nothing is gated on the animation. */
  useEffect(() => {
    if (closing || steps || boot !== "off") return;
    const total = lines.length;
    if (inputReady(line, total)) return;
    const wait = line.lineComplete
      ? LINE_GAP_MS
      : lineDurationMs(lines[line.lineIdx] ?? "");
    const t = setTimeout(() => setLine((s) => lineFinished(s, total)), wait);
    return () => clearTimeout(t);
  }, [line, lines, closing, steps, boot]);

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
    if (boot === "on") {
      setBoot("leaving");
      return;
    }
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

  /* Ghosting is a SIDE EFFECT and must never live inside a state updater:
     React deliberately double-invokes updaters in StrictMode, which
     appended two exit clones per scene change and left text animating
     over text. Compute the target first, act once, then set state. */
  const travel = (dir: 1 | -1) => {
    const from = screenIdx;
    const to = Math.min(Math.max(from + dir, 0), script.length - 1);
    if (to === from) return;
    enterFrom.current = dir === 1 ? "right" : "left";
    ghostStage(dir === 1 ? "left" : "right");
    setScreenIdx(to);
  };
  const advance = () => travel(1);
  const goBack = () => travel(-1);

  const finish = useCallback(() => {
    markIntroSeen();
    localStorage.setItem("novella.welcomed", "1");
    setClosing(true);
    // Let the exit finish before the unmount — the workspace is already
    // painted underneath, so this is a reveal, not a load. The exit is a
    // slow zoom-and-blur; the timeout matches its CSS duration.
    setTimeout(onDone, 820);
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
    bloom();
    advance();
  };

  /* Picking a scene previews it in place — this very screen repaints —
     and Continue confirms when the writer is done looking. */
  const previewBackdrop = (stored: string) => {
    savePersonalization({ ...loadPersonalization(), bgImage: stored });
    setIntroBg(resolveBackdrop(stored) ?? null);
  };
  const clearBackdrop = () => {
    const p = { ...loadPersonalization() };
    delete p.bgImage;
    savePersonalization(p);
    setIntroBg(null);
  };
  const scrollCarousel = (dir: -1 | 1) => {
    carousel.current?.scrollBy({ left: dir * 264, behavior: "smooth" });
  };

  const previewTheme = (id: Theme) =>
    document.documentElement.setAttribute("data-theme", id);
  const revertPreview = () =>
    document.documentElement.setAttribute("data-theme", committedTheme);
  const answerTheme = (id: Theme) => {
    setTheme(id);
    setCommittedTheme(id);
    bloom();
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
    const started = performance.now();
    // The seed is taken here, not in the generator, so the generator stays
    // pure — and so two writers installing Novella never open the same book.
    const files = starterFiles(Date.now(), presetId);
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
      for (const [path, contents] of files) {
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
      // The cat holds the stage for its full moment — real work usually
      // finishes in under a second, so the balance is pure curtain time
      // before the zoom-out into the workspace.
      const elapsed = performance.now() - started;
      setTimeout(finish, Math.max(700, FINALE_MS - elapsed));
    } catch {
      setSteps(null);
    }
  };

  /* ---- rendering ---- */

  /* Whole lines, whole thoughts. A line mounts once, rises in as one
     unit, and never re-animates — the stage is top-anchored, so nothing
     already read moves when the next line arrives. */
  const renderLine = (text: string, i: number) => {
    if (i > line.lineIdx) return null;
    const isCurrent = i === line.lineIdx && !line.lineComplete;
    return (
      <p key={`${screenIdx}-${i}`} className={`intro-line ${isCurrent ? "streaming" : "done"}`}>
        {glueOrphans(text)}
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
      {introBg && (
        <div className="intro-bg" aria-hidden>
          <div className="intro-bg-img" style={{ backgroundImage: `url(${introBg})` }} />
        </div>
      )}
      <div className={`intro-glow ${bloomTick > 0 ? "bloom" : ""}`} key={`glow-${bloomTick}`} aria-hidden />
      <div className="intro-motes" aria-hidden />
      <div className="intro-vignette" aria-hidden />

      {screenIdx > 0 && (
        <div className="intro-progress" aria-hidden>
          {Array.from({ length: segments }, (_, i) => (
            <span key={i} className={`intro-seg ${i < filled ? "on" : ""}`} />
          ))}
        </div>
      )}

      <button className="intro-later" onClick={finish}>
        Skip introduction
      </button>

      {screenIdx > 0 && !steps && !closing && (
        <button className="intro-back" onClick={goBack}>
          ‹ Back
        </button>
      )}

      {boot !== "off" && (
        <div className={`intro-boot ${boot === "leaving" ? "leaving" : ""}`} aria-hidden>
          <img src={reducedMotion() ? catStill : catGif} className="intro-boot-cat" alt="" />
          <p className="intro-gerund" key={gerundTick}>
            {gerundAt(gerundTick)}…
          </p>
        </div>
      )}

      {/* Keyed on the screen so each question arrives as its own scene,
          entering from the side the story is moving toward. */}
      <div
        className={`intro-stage ${enterFrom.current === "right" ? "enter-right" : "enter-left"}`}
        key={screenIdx}
        ref={stageEl}
        data-screen={screen.id}
        style={boot !== "off" ? { visibility: "hidden" } : undefined}
      >
        {/* The gates open once, on the title card only: the mark IS the
            promise the first line makes, so it should be the first thing
            that moves. Every later screen is a question, not a curtain. */}
        {screen.id === "cold-open" && (
          <span className="intro-logo">
            <Logo size={84} animate />
          </span>
        )}
        {lines.map((l, i) => renderLine(l, i))}

        {/* The window arrives once the copy has landed, alongside the
            answers, never during the streaming: the stage grows
            downward, and a window mounted between two lines would shove
            the sentence still being read.

            It is a scene, not a prop, so it dissolves in the way the
            stage itself does rather than taking the stop-motion snap
            that belongs to things you can touch. */}
        {screen.clip && ready && (
          <div className="intro-demo">
            <IntroWindow clip={screen.clip} still={still} />
            {still && <p className="intro-clip-caption">{screen.clip.still}</p>}
          </div>
        )}

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

            {/* A showing screen asks nothing, so it offers one way on.
                The window keeps looping behind the press for as long as
                the writer wants to watch it. */}
            {screen.input === "show" && (
              <button className="intro-primary" onClick={advance}>
                Continue
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

            {screen.input === "backdrop" && (
              <div className="intro-backdrop-pick">
                <div className="intro-carousel-wrap">
                  <button
                    className="intro-carousel-arrow"
                    onClick={() => scrollCarousel(-1)}
                    aria-label="Previous backdrops"
                  >
                    ‹
                  </button>
                  <div className="intro-carousel" ref={carousel}>
                    {BACKDROP_PRESETS.map((p) => (
                      <button
                        key={p.id}
                        className={`intro-bg-card ${
                          loadPersonalization().bgImage === presetMarker(p.id) ? "on" : ""
                        }`}
                        style={{ backgroundImage: `url(${p.url})` }}
                        onClick={() => previewBackdrop(presetMarker(p.id))}
                      >
                        <span className="intro-bg-name">{p.name}</span>
                      </button>
                    ))}
                    <label className="intro-bg-card intro-bg-upload">
                      <span className="intro-bg-plus" aria-hidden>
                        +
                      </span>
                      <span className="intro-bg-name">Your own image</span>
                      <input
                        type="file"
                        accept="image/*"
                        hidden
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          void toBannerDataUrl(file, 1600).then((url) => previewBackdrop(url));
                          e.target.value = "";
                        }}
                      />
                    </label>
                  </div>
                  <button
                    className="intro-carousel-arrow"
                    onClick={() => scrollCarousel(1)}
                    aria-label="More backdrops"
                  >
                    ›
                  </button>
                </div>
                <div className="intro-backdrop-actions">
                  <button className="intro-quiet" onClick={clearBackdrop}>
                    Keep it bare
                  </button>
                  <button className="intro-primary" onClick={advance}>
                    Continue
                  </button>
                </div>
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
                {PRESETS.map((p) => {
                  // Derived from the files this preset really creates, so
                  // the demonstration can't drift from what you get.
                  const demo = previewOf(p);
                  return (
                    <button
                      key={p.id}
                      className="preset-card intro-preset"
                      onClick={() => void answerPreset(p.id)}
                    >
                      <span className="preset-name">{p.name}</span>
                      <span className="preset-summary">{previewSummary(demo)}</span>
                      <span className="preset-demo">
                        {demo.rows.map((row) => (
                          <span key={row.folder || "root"}>
                            {row.folder && <span className="preset-folder">{row.folder}/</span>}
                            {row.items.map((item) => (
                              <span key={item} className="preset-file">
                                {item}
                              </span>
                            ))}
                            {row.more > 0 && (
                              <span className="preset-file">and {row.more} more</span>
                            )}
                          </span>
                        ))}
                        {demo.taste && <span className="preset-taste">{demo.taste}</span>}
                      </span>
                      <span className="preset-blurb">{p.blurb}</span>
                    </button>
                  );
                })}
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
            {/* The cat is decoration; the list below is the truth. */}
            <div className="intro-cat-wrap" aria-hidden>
              <img src={reducedMotion() ? catStill : catGif} className="intro-cat" alt="" />
              <p className="intro-gerund" key={gerundTick}>
                {gerundAt(gerundTick)}…
              </p>
            </div>
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

/* ============================================================
   The demonstration windows.

   Same construction as the guided tour's clips (TourOverlay.tsx), for
   the same reasons, and deliberately not a screen recording: a capture
   is a photograph of one afternoon. It cannot follow the accent the
   writer picked ninety seconds ago, cannot repaint itself when they
   hover a theme, cannot stand still for someone who asked for less
   motion, and starts lying the day a border radius changes. A diagram
   made of the same tokens as the room it describes ages with the room —
   and here it does something the tour's clips cannot: it arrives
   already wearing the choices made on the screens before it. The
   intro's whole argument is that Novella listens; these windows are
   that argument in miniature.

   THE RULE, unchanged: the rest state of every clip is its FINISHED
   state. Nothing is styled where the gesture starts; everything is
   styled where the gesture leaves it, and the keyframes reach back to
   the beginning at 0%. Kill the animations — which is exactly what
   reduced motion does — and what is left is a correct, labelled diagram
   instead of an empty box. That is why there is no separate still-frame
   markup below, only a caption.

   The pieces that exist only mid-gesture (the thread being drawn, the
   spark leaving the model) are the exception, and they are invisible at
   rest for the same reason: once the link is made, there is no
   travelling spark.

   Every window is aria-hidden. The lesson lives in the scripted lines,
   which have to teach on their own for anyone who never sees the
   picture; a pile of unlabelled divs announced one at a time would be
   noise, not access.
   ============================================================ */

/** CSS custom properties are the one thing a style object cannot be
    typed for — React.CSSProperties has no index signature, so a `--x`
    key is a type error however true it is. One cast, in one place. */
function cssVars(v: Record<string, string | number>): React.CSSProperties {
  return v as React.CSSProperties;
}

function IntroWindow({ clip, still }: { clip: IntroClip; still: boolean }) {
  return (
    <div
      className={`intro-clip intro-clip-${clip.id}`}
      data-still={still ? "true" : undefined}
      /* One clock per window: every keyframe inside runs at var(--clip),
         so percentage keyframes stay in step with each other and
         retiming a demonstration is one number in introScript.ts. */
      style={cssVars({ "--clip-ms": `${clip.loopMs}ms` })}
      aria-hidden
    >
      {clip.id === "room" && <RoomClip />}
      {clip.id === "pieces" && <PiecesClip />}
      {clip.id === "local" && <LocalClip />}
    </div>
  );
}

/* ---------- 1. the room ---------- */

/* The real shape of the workspace: CodexPane on the left, the editor in
   the middle, InspectorPane on the right — the grid in App.tsx, drawn
   small. The shelf names the two folders every preset really creates,
   Manuscript and Codex, so the picture matches the folder the writer is
   about to be handed. */
const ROOM_SHELF: { label: string; head?: true; on?: true }[] = [
  { label: "Manuscript", head: true },
  { label: "Chapter One", on: true },
  { label: "Chapter Two" },
  { label: "Codex", head: true },
  { label: "The Stranger" },
];

function RoomClip() {
  return (
    <div className="intro-mock intro-mock-room">
      <div className="intro-mock-titlebar">
        <span className="intro-mock-brand">◈</span>
        <span className="intro-mock-view" data-on="true">
          Write
        </span>
        <span className="intro-mock-view">Board</span>
      </div>

      <div className="intro-mock-room-body">
        <div className="intro-mock-col" data-col="shelf">
          {ROOM_SHELF.map((row) =>
            row.head ? (
              /* The tour's own caption class: an uppercase panel label is
                 the same object in both places, so it stays one style. */
              <span className="tour-mock-slot-head" key={row.label}>
                {row.label}
              </span>
            ) : (
              <span
                className="intro-mock-item"
                key={row.label}
                data-on={row.on ? "true" : undefined}
              >
                {row.label}
              </span>
            ),
          )}
        </div>

        <div className="intro-mock-col" data-col="page">
          <span className="intro-mock-page-title">Chapter One</span>
          {[0, 1, 2, 3].map((i) => (
            <span className="intro-mock-line" key={i} style={cssVars({ "--i": i })} />
          ))}
          <span className="intro-mock-row-last">
            <span className="intro-mock-line" data-last="true" style={cssVars({ "--i": 4 })} />
            <span className="intro-mock-caret" />
          </span>
        </div>

        <div className="intro-mock-col" data-col="tools">
          <span className="tour-mock-slot-head">Tools</span>
          {[0, 1, 2].map((i) => (
            <span className="tour-mock-task" key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------- 2. a chapter and a codex entry ---------- */

/* The link is written the way the app really parses it — [[Name]], see
   extractWikiLinks in core/vault.ts — and the entry it reaches carries
   the same "character" kind the preset sheets are born with. A
   demonstration that misspells its own syntax teaches the wrong thing. */
function PiecesClip() {
  return (
    /* No .intro-mock frame around this one: the two cards ARE the
       objects, and the space between them is the lesson. */
    <div className="intro-mock-pieces">
      <div className="intro-mock-sheet">
        <span className="intro-mock-sheet-head">Manuscript / Chapter One</span>
        <p className="intro-mock-prose">
          <span className="tour-mock-run">The lamp guttered when </span>
          <span className="intro-mock-link">[[The Stranger]]</span>
          <span className="tour-mock-run"> came in from the rain.</span>
        </p>
        <span className="tour-mock-card-line" />
        <span className="tour-mock-card-line" />
      </div>

      {/* Exists only while the link is being made, so it is invisible at
          rest and draws itself left to right during the loop. */}
      <span className="intro-mock-thread" />

      <div className="intro-mock-entry">
        <span className="intro-mock-entry-kind">Character</span>
        <span className="intro-mock-entry-name">The Stranger</span>
        <span className="tour-mock-card-line" />
        <span className="tour-mock-card-line" />
        <span className="intro-mock-entry-meta">Codex / Characters</span>
      </div>
    </div>
  );
}

/* ---------- 3. a model on this machine ---------- */

/* The boundary is the whole point: the page, the model and the draft it
   proposed are all inside one dashed edge labelled with the machine.
   Nothing here claims a model is installed — the copy says "can", and
   the honest check on this same screen is what answers that. */
function LocalClip() {
  return (
    /* The dashed edge is its own frame, so no .intro-mock here either. */
    <div className="intro-mock-local">
      <span className="intro-mock-machine-label">This machine</span>

      <div className="intro-mock-sheet">
        <span className="intro-mock-sheet-head">Manuscript / Chapter Two</span>
        <p className="intro-mock-prose">
          <span className="tour-mock-run">She had been walking since the bridge, </span>
          <span className="intro-mock-draft">and the town never once looked back.</span>
        </p>
        <span className="tour-mock-card-line" />
      </div>

      <div className="intro-mock-machine-foot">
        <span className="intro-mock-model">Local model</span>
        {/* Travels from the model into the sentence and stops there:
            everything this window shows stays inside the dashed edge. */}
        <span className="intro-mock-spark" />
      </div>
    </div>
  );
}
