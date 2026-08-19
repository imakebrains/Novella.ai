import { useCallback, useEffect, useRef, useState } from "react";
import { reducedMotion } from "./personalize";
import { REWORD_STYLES } from "./rewordCore";
import { introPending } from "./WelcomeIntro";
import {
  AUTO_OFFER_MS,
  TOUR_STEPS,
  currentStep,
  finishTour,
  goToStep,
  isFirstStep,
  isLastStep,
  loadTourState,
  markOffered,
  nextStep,
  prevStep,
  progressLabel,
  replayTour,
  saveTourState,
  shouldAutoOffer,
  skipTour,
  type TourState,
  type TourStep,
} from "./tourSteps";

/* ============================================================
   The tour — six gestures, shown rather than described.

   Each step carries a small looping diagram built from the app's own
   vocabulary: mock panes, mock tabs, index cards, key caps. Not a
   screen recording. A recording is a photograph of one afternoon —
   it can't follow the writer's theme or accent, it can't be slowed
   down for someone who asked for less motion, and it starts lying
   the day a border radius changes. A diagram made of the same tokens
   as the room it describes ages with the room.

   THE ONE RULE THE CLIPS ARE BUILT ON: the rest state of every clip
   is its FINISHED state. Nothing here is styled where the gesture
   starts; everything is styled where the gesture leaves it, and the
   keyframes reach back to the beginning at 0% and arrive home before
   the loop ends. Kill the animations — which is exactly what reduced
   motion does — and what's left is a correct, labelled diagram of the
   result rather than an empty box. That's why there is no separate
   still-frame markup anywhere below.

   The elements that only exist mid-gesture — the travelling tab, the
   drop zone, the cursor — are the exception, and they are invisible at
   rest for the same reason: after the drop, there is no drop zone.
   ============================================================ */

/* Settings and the titlebar button reopen the tour without owning the
   component — the same opener pattern as replayIntro(). */
let opener: (() => void) | null = null;

export function openTour(): boolean {
  if (!opener) return false;
  opener();
  return true;
}

export function registerTourOpener(fn: (() => void) | null): void {
  opener = fn;
}

/** The titlebar's way in. Labelled rather than a lone glyph: a writer
    hunting for help scans for a word, and its neighbours (Codex, Tools,
    Focus) are labelled too. */
export function TourButton() {
  return (
    <button
      className="icon-btn labeled tour-btn"
      onClick={() => openTour()}
      data-tip="A short tour of how things move"
      aria-label="Show me around"
    >
      ? <span>Hints</span>
    </button>
  );
}

export function TourOverlay() {
  const [state, setState] = useState<TourState>(() => loadTourState());
  const [open, setOpen] = useState(false);
  const shell = useRef<HTMLDivElement>(null);

  /* Effects below run once and must not close over a stale snapshot; a
     ref rather than a dependency, because re-registering the opener or
     re-arming the auto-offer on every step change is how a tour ends up
     offering itself twice. */
  const latest = useRef(state);
  latest.current = state;

  /* One persist point. Every transition goes through here, so "which
     step" on disk can never disagree with the step on screen. */
  const commit = useCallback((next: TourState) => {
    setState(next);
    saveTourState(next);
  }, []);

  /* The offer, once, ever.

     Mounting is itself the signal that the intro is out of the way (see
     the mount line in App.tsx), and introPending() is the belt to that
     braces: two full-screen welcomes back to back is a hazing, not an
     onboarding. `offered` is written the moment the panel opens rather
     than when it closes — a writer who quits mid-tour has neither
     finished nor skipped, and greeting them with it again on next launch
     is precisely the nagging we promised not to do. */
  useEffect(() => {
    if (!shouldAutoOffer(latest.current, !introPending())) return;
    const t = setTimeout(() => {
      commit(markOffered(latest.current));
      setOpen(true);
    }, AUTO_OFFER_MS);
    return () => clearTimeout(t);
  }, [commit]);

  useEffect(() => {
    registerTourOpener(() => {
      commit(replayTour(latest.current));
      setOpen(true);
    });
    return () => registerTourOpener(null);
  }, [commit]);

  /* Any way out is the same promise: closing marks it seen, so the tour
     never returns on its own. Skipping keeps the bookmark, finishing
     clears it — see the note in tourSteps.ts. */
  const close = useCallback(() => {
    commit(skipTour(latest.current));
    setOpen(false);
  }, [commit]);

  const done = useCallback(() => {
    commit(finishTour(latest.current));
    setOpen(false);
  }, [commit]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // Capture phase and stopPropagation together: App's own window
        // listener reads Escape as "leave focus mode", and one keypress
        // must not both close this and change the room behind it.
        e.stopPropagation();
        close();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        commit(nextStep(latest.current));
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        commit(prevStep(latest.current));
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        // The palette would open behind the panel that is teaching the
        // palette. Inert is a better answer than half-working.
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, close, commit]);

  // Take focus so the arrow keys work without a click first.
  useEffect(() => {
    if (open) shell.current?.focus();
  }, [open]);

  if (!open) return null;

  const step = currentStep(state);
  const still = reducedMotion();

  return (
    <div className="modal-backdrop tour-backdrop" onMouseDown={close}>
      <div
        ref={shell}
        tabIndex={-1}
        className="modal tour-modal"
        role="dialog"
        aria-modal="true"
        aria-label="How Novella moves"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="modal-head tour-head">
          <h2>How Novella moves</h2>
          <span className="tour-count">{progressLabel(state)}</span>
          <button className="icon-btn" onClick={close} title="Close (Esc)" aria-label="Close">
            ✕
          </button>
        </header>

        <div className="modal-body tour-body">
          {/* Keyed on the step so each clip mounts fresh and starts its
              loop from the top rather than joining the previous one
              mid-gesture. */}
          <div className="tour-stage" key={step.id}>
            <Clip step={step} still={still} />
          </div>

          <div className="tour-text" aria-live="polite">
            <h3 className="tour-title">{step.title}</h3>
            <p className="tour-copy">{step.body}</p>
            <p className="tour-where">{step.where}</p>
            {still && <p className="tour-still-caption">{step.still}</p>}
          </div>

          <div className="tour-dots" role="tablist" aria-label="Tour steps">
            {TOUR_STEPS.map((s, i) => (
              <button
                key={s.id}
                role="tab"
                className={`tour-dot ${i === state.step ? "on" : ""}`}
                aria-selected={i === state.step}
                aria-label={s.title}
                title={s.title}
                onClick={() => commit(goToStep(state, i))}
              />
            ))}
          </div>
        </div>

        <footer className="tour-foot">
          <button className="btn-ghost tour-skip" onClick={close}>
            Skip the tour
          </button>
          <p className="hint tour-recall">Hints, in the titlebar, brings this back.</p>
          <div className="btn-row tour-nav">
            <button
              className="btn-ghost"
              onClick={() => commit(prevStep(state))}
              disabled={isFirstStep(state)}
            >
              Back
            </button>
            {isLastStep(state) ? (
              <button className="btn-primary" onClick={done}>
                Done
              </button>
            ) : (
              <button className="btn-primary" onClick={() => commit(nextStep(state))}>
                Next
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}

/* ============================================================
   The clips.

   Every clip is decorative — aria-hidden — because the lesson lives in
   step.body, which has to teach on its own for anyone who never sees
   the picture. A pile of empty divs announced one at a time would be
   noise, not access.

   `--clip-ms` is the one genuinely dynamic value in here: each clip's
   duration is data in tourSteps.ts, handed to CSS so that every
   keyframe inside the clip runs on the same clock. Percentage keyframes
   then stay in sync with each other for free, and retiming a
   demonstration is one number in the step list.
   ============================================================ */

/** CSS custom properties are the one thing a style object can't be typed
    for — React.CSSProperties has no index signature, so a `--x` key is a
    type error however true it is. One cast, in one place. */
function vars(v: Record<string, string | number>): React.CSSProperties {
  return v as React.CSSProperties;
}

function Clip({ step, still }: { step: TourStep; still: boolean }) {
  return (
    <div
      className={`tour-clip tour-clip-${step.id}`}
      data-still={still ? "true" : undefined}
      style={vars({ "--clip-ms": `${step.loopMs}ms` })}
      aria-hidden
    >
      {step.id === "palette" && <PaletteClip />}
      {step.id === "reorder" && <ReorderClip />}
      {step.id === "stack" && <StackClip />}
      {step.id === "resize" && <ResizeClip />}
      {step.id === "board" && <BoardClip />}
      {step.id === "reword" && <RewordClip />}
    </div>
  );
}

/** The pointer. Drawn rather than imported: an SVG path costs nothing,
    themes with it, and doesn't add an asset that has to be shipped,
    licensed and kept in step with the palette. */
function TourCursor() {
  return (
    <svg className="tour-cursor" viewBox="0 0 12 18" aria-hidden focusable="false">
      <path
        d="M1 1 L1 14.4 L4.4 11.2 L6.6 16.8 L9 15.8 L6.8 10.4 L11 10.2 Z"
        fill="currentColor"
        stroke="var(--bg-app)"
        strokeWidth="1"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ---------- 1. Ctrl+K ---------- */

/* Real commands, and a query that really would leave exactly one of them
   standing: matchPalette puts "boa" in its word-start tier for "Go to
   Board" and finds no letter b anywhere else in the list. A demonstration
   that misrepresents its own search is worse than no demonstration. */
const PALETTE_QUERY = "boa";
const PALETTE_ROWS: { label: string; hint?: string; match?: boolean }[] = [
  { label: "Go to Board", hint: "view", match: true },
  { label: "Go to Write", hint: "view" },
  { label: "Enter focus mode", hint: "Ctrl+Shift+F" },
  { label: "Save all", hint: "Ctrl+S" },
  { label: "Switch project…" },
];

function PaletteClip() {
  return (
    <>
      <div className="tour-keycaps">
        <span className="tour-key" data-key="ctrl">
          Ctrl
        </span>
        <span className="tour-key-join">+</span>
        <span className="tour-key" data-key="k">
          K
        </span>
      </div>

      <div className="tour-mock tour-mock-palette">
        <div className="tour-mock-input">
          <span className="tour-mock-query">
            {[...PALETTE_QUERY].map((ch, i) => (
              <span className="tour-mock-char" key={i} style={vars({ "--i": i })}>
                {ch}
              </span>
            ))}
          </span>
          <span className="tour-mock-caret" />
        </div>
        <div className="tour-mock-rows">
          {PALETTE_ROWS.map((row, i) => (
            <div
              className="tour-mock-row"
              key={row.label}
              data-match={row.match ? "true" : "false"}
              style={vars({ "--i": i })}
            >
              <span className="tour-mock-kind">›</span>
              <span className="tour-mock-label">{row.label}</span>
              {row.hint && <span className="tour-mock-hint">{row.hint}</span>}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

/* ---------- 2. reorder a tab ---------- */

/* DOM order is the FINISHED order — Calendar already at the front. The
   keyframes start it two slots to the right and slide the two it passes
   out of its way. Same trick in the board clip below. */
const STRIP_TABS = ["Calendar", "Links", "Tasks", "History"];

function ReorderClip() {
  return (
    <>
      <div className="tour-mock tour-mock-strip">
        {STRIP_TABS.map((label, i) => (
          <span
            className="tour-mock-tab"
            key={label}
            data-role={i === 0 ? "drag" : "static"}
            style={vars({ "--i": i })}
          >
            {label}
          </span>
        ))}
      </div>
      <TourCursor />
    </>
  );
}

/* ---------- 3. stack two panels ---------- */

function StackClip() {
  return (
    <>
      <div className="tour-mock tour-mock-pane">
        <div className="tour-mock-strip">
          <span className="tour-mock-tab on">Tasks</span>
          <span className="tour-mock-tab-add">+</span>
        </div>

        <div className="tour-mock-slot" data-slot="tasks">
          <span className="tour-mock-slot-head">Tasks</span>
          {[0, 1, 2].map((i) => (
            <span className="tour-mock-task" key={i} style={vars({ "--i": i })} />
          ))}
        </div>

        {/* Absolutely positioned over the seam, so a zone that exists only
            during the drag costs the finished diagram no layout. */}
        <div className="tour-mock-dropzone">Drop to stack</div>

        <div className="tour-mock-slot" data-slot="calendar">
          <span className="tour-mock-slot-head">Calendar</span>
          <div className="tour-mock-month">
            {Array.from({ length: 21 }, (_, i) => (
              <span className="tour-mock-day" key={i} data-on={i === 9 ? "true" : undefined} />
            ))}
          </div>
        </div>
      </div>

      {/* The tab in flight. It begins life sitting in the strip, which is
          what makes the gesture read as "this tab, moved" rather than
          "a new thing appeared". */}
      <span className="tour-drag-chip">Calendar</span>
      <TourCursor />
    </>
  );
}

/* ---------- 4. the divider ---------- */

function ResizeClip() {
  return (
    <>
      <div className="tour-mock tour-mock-pane">
        <div className="tour-mock-slot" data-slot="tasks">
          <span className="tour-mock-slot-head">Tasks</span>
          {[0, 1, 2].map((i) => (
            <span className="tour-mock-task" key={i} style={vars({ "--i": i })} />
          ))}
        </div>

        <div className="tour-mock-divider">
          <span className="tour-mock-grip" />
        </div>

        <div className="tour-mock-slot" data-slot="calendar">
          <span className="tour-mock-slot-head">Calendar</span>
          <div className="tour-mock-month">
            {Array.from({ length: 21 }, (_, i) => (
              <span className="tour-mock-day" key={i} data-on={i === 9 ? "true" : undefined} />
            ))}
          </div>
        </div>
      </div>
      <TourCursor />
    </>
  );
}

/* ---------- 5. a card on the board ---------- */

const BOARD_CARDS = [
  { title: "Chapter Three", meta: "1,240" },
  { title: "Chapter One", meta: "2,006" },
  { title: "Chapter Two", meta: "1,712" },
  { title: "Chapter Four", meta: "890" },
];

function BoardClip() {
  return (
    <>
      <div className="tour-mock tour-mock-board">
        {BOARD_CARDS.map((card, i) => (
          <div
            className="tour-mock-card"
            key={card.title}
            data-role={i === 0 ? "drag" : "static"}
            style={vars({ "--i": i })}
          >
            <span className="tour-mock-card-title">{card.title}</span>
            <span className="tour-mock-card-line" />
            <span className="tour-mock-card-line" />
            <span className="tour-mock-card-meta">{card.meta} words</span>
          </div>
        ))}
      </div>
      <TourCursor />
    </>
  );
}

/* ---------- 6. reword ---------- */

/* The menu is taken from the real style list rather than retyped, so the
   demonstration can't drift from the menu it demonstrates. Three fit;
   the app offers five. */
const REWORD_PICKS = REWORD_STYLES.slice(0, 3);

function RewordClip() {
  return (
    <>
      <div className="tour-mock tour-mock-reword">
        <p className="tour-mock-para" data-para="before">
          <span className="tour-mock-run">The lamp guttered, and </span>
          <span className="tour-mock-sel">
            she went on writing anyway, because the night was long
          </span>
          <span className="tour-mock-run">.</span>
        </p>

        <div className="tour-mock-reword-ui">
          <span className="tour-mock-chip">✎ Reword</span>
          <div className="tour-mock-menu">
            {REWORD_PICKS.map((style, i) => (
              <span
                className="tour-mock-menu-item"
                key={style.id}
                data-pick={i === 0 ? "true" : undefined}
                style={vars({ "--i": i })}
              >
                {style.label}
              </span>
            ))}
          </div>
        </div>

        <p className="tour-mock-para" data-para="after">
          <span className="tour-mock-run">The lamp guttered, and </span>
          <span className="tour-mock-new">she wrote on. The night was long</span>
          <span className="tour-mock-run">.</span>
        </p>
      </div>
      <TourCursor />
    </>
  );
}
