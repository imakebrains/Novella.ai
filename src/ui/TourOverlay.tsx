import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { reducedMotion } from "./personalize";
import { REWORD_STYLES } from "./rewordCore";
import { SLASH_COMMANDS } from "./slashCommands";
import { introPending } from "./WelcomeIntro";
import {
  AUTO_OFFER_MS,
  currentStep,
  finishTour,
  goToStep,
  hintGroups,
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
  type ClipId,
  type TourState,
  type TourStep,
} from "./tourSteps";

/* ============================================================
   The hints library — sixteen gestures, shown rather than described.

   Each hint carries a small looping diagram built from the app's own
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
   drop zone, the context menu, the cursor — are the exception, and
   they are invisible at rest for the same reason: after the drop,
   there is no drop zone.

   TWO WAYS THROUGH IT. Next and Back still walk the list from the
   top, which is what a writer on their first morning wants. The
   sidebar is for the other visit: the one six weeks later where the
   question is "what was the key for focus mode" and pressing Next
   eleven times is not an answer. Both read the same list in the same
   order — see the contiguity rule in tourSteps.ts — so the sidebar is
   a table of contents rather than a second, competing arrangement.
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
      data-tip="Every hint, and a short tour of how things move"
      aria-label="Show me around"
    >
      ? <span>Hints</span>
    </button>
  );
}

export function TourOverlay() {
  const [state, setState] = useState<TourState>(() => loadTourState());
  const [open, setOpen] = useState(false);
  /* The filter is deliberately NOT persisted and NOT part of TourState.
     It's a way of looking at the list for the next thirty seconds, not a
     preference — reopening Hints to yesterday's search term would be a
     small haunting. */
  const [query, setQuery] = useState("");
  const shell = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const currentRow = useRef<HTMLButtonElement>(null);

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
      setQuery("");
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
      /* The search field is a text input inside a panel whose arrow keys
         change the page. Left and right have to belong to the caret while
         the writer is typing, or the field is unusable. */
      const typing = e.target === search.current;

      if (e.key === "Escape") {
        // Capture phase and stopPropagation together: App's own window
        // listener reads Escape as "leave focus mode", and one keypress
        // must not both close this and change the room behind it.
        e.stopPropagation();
        // Escape backs out one layer at a time: a live filter first, the
        // panel only once the list is whole again.
        if (typing && search.current?.value) {
          setQuery("");
          return;
        }
        close();
      } else if (e.key === "ArrowRight" && !typing) {
        e.preventDefault();
        commit(nextStep(latest.current));
      } else if (e.key === "ArrowLeft" && !typing) {
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

  /* Next can walk the current hint off the bottom of a sixteen-row
     sidebar. Nudging it back into view — nearest, so a row already on
     screen never scrolls — keeps "where am I" answerable at a glance. */
  useEffect(() => {
    if (!open) return;
    currentRow.current?.scrollIntoView({ block: "nearest" });
  }, [open, state.step, query]);

  const groups = useMemo(() => hintGroups(query), [query]);

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
          {/* The library. A nav rather than a tablist: these are sixteen
              destinations in a scrolling list, and a screen reader that
              announces "tab 12 of 16" is describing a widget nobody
              built. */}
          <nav className="tour-sidebar" aria-label="All hints">
            <input
              ref={search}
              className="tour-search"
              type="search"
              value={query}
              placeholder="Search hints…"
              aria-label="Search hints"
              onChange={(e) => setQuery(e.target.value)}
            />

            {groups.map((group) => (
              <div className="tour-group" key={group.category.id}>
                <h4 className="tour-group-head" title={group.category.blurb}>
                  {group.category.label}
                </h4>
                {group.items.map(({ step: hint, index }) => {
                  const on = index === state.step;
                  return (
                    <button
                      key={hint.id}
                      ref={on ? currentRow : undefined}
                      className={`tour-hint ${on ? "on" : ""}`}
                      aria-current={on ? "true" : undefined}
                      title={hint.where}
                      onClick={() => commit(goToStep(state, index))}
                    >
                      <span className="tour-hint-name">{hint.title}</span>
                      {hint.keys && <span className="tour-hint-keys">{hint.keys}</span>}
                    </button>
                  );
                })}
              </div>
            ))}

            {groups.length === 0 && (
              <p className="tour-no-match">
                Nothing here matches that. The hints cover moving things, the
                editor, the board and the look of the place.
              </p>
            )}
          </nav>

          <div className="tour-main">
            {/* Keyed on the step so each clip mounts fresh and starts its
                loop from the top rather than joining the previous one
                mid-gesture. */}
            <div className="tour-stage" key={step.id}>
              <Clip step={step} still={still} />
            </div>

            <div className="tour-text" aria-live="polite">
              <h3 className="tour-title">
                {step.title}
                {step.keys && <span className="tour-keys">{step.keys}</span>}
              </h3>
              <p className="tour-copy">{step.body}</p>
              <p className="tour-where">{step.where}</p>
              {still && <p className="tour-still-caption">{step.still}</p>}
            </div>
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

/* A record rather than a run of `step.id === "x" && <XClip/>` lines. At
   six clips the chain was fine; at sixteen it was a wall, and — the real
   reason — a Record keyed by ClipId means adding a hint without drawing
   it is a compile error rather than a blank stage in front of a writer. */
const CLIPS: Record<ClipId, () => React.ReactElement> = {
  palette: PaletteClip,
  focus: FocusClip,
  views: ViewsClip,
  reorder: ReorderClip,
  stack: StackClip,
  resize: ResizeClip,
  tasks: TasksClip,
  timer: TimerClip,
  board: BoardClip,
  trash: TrashClip,
  theme: ThemeClip,
  backdrop: BackdropClip,
  slash: SlashClip,
  wikilink: WikiLinkClip,
  paragraph: ParagraphClip,
  reword: RewordClip,
};

function Clip({ step, still }: { step: TourStep; still: boolean }) {
  const Draw = CLIPS[step.id];
  return (
    <div
      className={`tour-clip tour-clip-${step.id}`}
      data-still={still ? "true" : undefined}
      style={vars({ "--clip-ms": `${step.loopMs}ms` })}
      aria-hidden
    >
      <Draw />
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

/** A run of prose, as bars. Used wherever a clip needs "there are words
    here" without asking the reader to actually read them. */
function MockLines({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <span className="tour-mock-line" key={i} style={vars({ "--i": i })} />
      ))}
    </>
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

/* ---------- 2. focus mode ---------- */

/* Rest is focus mode itself: rails gone, chrome faded, page at its full
   measure. The clip runs the shortcut and then takes the room away — so
   the still frame is the state the shortcut leaves you in, which is the
   only frame worth showing to someone who asked for no motion. */
function FocusClip() {
  return (
    <>
      <div className="tour-keycaps">
        <span className="tour-key" data-key="ctrl">
          Ctrl
        </span>
        <span className="tour-key-join">+</span>
        <span className="tour-key" data-key="shift">
          Shift
        </span>
        <span className="tour-key-join">+</span>
        <span className="tour-key" data-key="f">
          F
        </span>
      </div>

      <div className="tour-mock tour-mock-room">
        <div className="tour-mock-chrome">
          <span className="tour-mock-chrome-dot" />
          <span className="tour-mock-chrome-bar" />
          <span className="tour-mock-chrome-bar" />
        </div>
        <div className="tour-mock-room-body">
          <div className="tour-mock-rail" data-side="left" />
          <div className="tour-mock-page">
            <MockLines count={6} />
          </div>
          <div className="tour-mock-rail" data-side="right" />
        </div>
      </div>
    </>
  );
}

/* ---------- 3. three views of the board ---------- */

/* Three layers stacked in the same box, crossfading. Same box on purpose:
   the lesson is that these are three shapes of ONE set of chapters, and a
   stage that resized between them would be arguing the opposite. */
const VIEW_TABS: { id: string; label: string }[] = [
  { id: "cards", label: "Cards" },
  { id: "grid", label: "Grid" },
  { id: "table", label: "Table" },
];

const VIEW_ROWS: { title: string; words: string }[] = [
  { title: "Chapter One", words: "2,006" },
  { title: "Chapter Two", words: "1,712" },
  { title: "Chapter Three", words: "1,240" },
  { title: "Chapter Four", words: "890" },
];

function ViewsClip() {
  return (
    <div className="tour-mock tour-mock-views">
      <div className="tour-mock-seg">
        {VIEW_TABS.map((tab, i) => (
          <span
            className="tour-mock-seg-btn"
            key={tab.id}
            data-view={tab.id}
            style={vars({ "--i": i })}
          >
            {tab.label}
          </span>
        ))}
      </div>

      <div className="tour-mock-view-body">
        <div className="tour-mock-view" data-view="cards">
          {VIEW_ROWS.slice(0, 3).map((row, i) => (
            <span className="tour-mock-minicard" key={row.title} style={vars({ "--i": i })}>
              <span className="tour-mock-minicard-title">{row.title}</span>
              <span className="tour-mock-line" />
              <span className="tour-mock-line" />
            </span>
          ))}
        </div>

        <div className="tour-mock-view" data-view="grid">
          {Array.from({ length: 24 }, (_, i) => (
            <span
              className="tour-mock-cell"
              key={i}
              data-on={i % 7 === 3 || i % 11 === 5 ? "true" : undefined}
              style={vars({ "--i": i })}
            />
          ))}
        </div>

        <div className="tour-mock-view" data-view="table">
          {VIEW_ROWS.map((row, i) => (
            <span className="tour-mock-trow" key={row.title} style={vars({ "--i": i })}>
              <span className="tour-mock-tcell">{row.title}</span>
              <span className="tour-mock-tbar" />
              <span className="tour-mock-tnum">{row.words}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------- 4. reorder a tab ---------- */

/* DOM order is the FINISHED order — Calendar already at the front. The
   keyframes start it two slots to the right and slide the two it passes
   out of its way. Same trick in the board and paragraph clips below. */
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

/* ---------- 5. stack two panels ---------- */

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

/* ---------- 6. the divider ---------- */

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

/* ---------- 7. the tasks panel ---------- */

/* Two halves, and the whole lesson is that they are the same thing: the
   panel above, the Markdown line below. The tick lands in both at once,
   because in the app there is only one of them to land in. */
const TASK_ROWS: { text: string; where: string; tick?: boolean }[] = [
  { text: "Ask the ferryman's name", where: "Chapter Two", tick: true },
  { text: "Cut the prologue in half", where: "Notes" },
  { text: "Decide what Elowen knows", where: "Chapter Nine" },
];

function TasksClip() {
  return (
    <>
      <div className="tour-mock tour-mock-tasks">
        <span className="tour-mock-slot-head">Tasks</span>
        {TASK_ROWS.map((row, i) => (
          <span
            className="tour-mock-todo"
            key={row.text}
            data-role={row.tick ? "tick" : "static"}
            style={vars({ "--i": i })}
          >
            <span className="tour-mock-check" />
            <span className="tour-mock-todo-text">{row.text}</span>
            <span className="tour-mock-todo-where">{row.where}</span>
          </span>
        ))}
      </div>

      <div className="tour-mock tour-mock-source">
        <span className="tour-mock-source-head">Chapter Two.md</span>
        <span className="tour-mock-source-line">
          <span className="tour-mock-source-mark">
            {"- ["}
            <span className="tour-mock-source-x">x</span>
            {"]"}
          </span>
          <span className="tour-mock-source-text">Ask the ferryman's name</span>
        </span>
      </div>

      <TourCursor />
    </>
  );
}

/* ---------- 8. the timer ---------- */

/* Four ticks, stacked, one visible at a time — the last one is the rest
   state, which is why it is the only one styled visible by default. The
   CSS slices the loop into quarters, so this array staying four long is
   part of the contract with 9.44. */
const TIMER_TICKS = ["25:00", "24:59", "24:58", "24:57"];

function TimerClip() {
  return (
    <div className="tour-mock tour-mock-timer">
      <span className="tour-mock-slot-head">Timer</span>

      <div className="tour-mock-face">
        {TIMER_TICKS.map((tick, i) => (
          <span
            className="tour-mock-tick"
            key={tick}
            data-last={i === TIMER_TICKS.length - 1 ? "true" : undefined}
            style={vars({ "--i": i })}
          >
            {tick}
          </span>
        ))}
      </div>

      <div className="tour-mock-timer-bar">
        <span className="tour-mock-timer-fill" />
      </div>

      <div className="tour-mock-timer-btns">
        <span className="tour-mock-timer-btn" data-role="run">
          Pause
        </span>
        <span className="tour-mock-timer-btn">Reset</span>
      </div>

      {/* Always present, at rest and in motion: "the other clock is still
          set" is the actual lesson, and a line that appeared only at the
          end would teach that it starts when the countdown finishes. */}
      <span className="tour-mock-timer-foot">Alarm set — 3:00 PM</span>
    </div>
  );
}

/* ---------- 9. a card on the board ---------- */

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

/* ---------- 10. the trash ---------- */

/* Rest is the deleted state, not the restored one — deliberately. The
   thing a frightened writer needs to see is where the chapter went and
   that there is a button marked Restore next to it; a still frame of the
   note back in the codex would be a picture of nothing having happened. */
const TRASH_LIST = ["Chapter Eight", "Chapter Nine", "Chapter Ten"];

function TrashClip() {
  return (
    <>
      <div className="tour-mock tour-mock-trash">
        <div className="tour-mock-trash-list">
          <span className="tour-mock-slot-head">Codex</span>
          {TRASH_LIST.map((title, i) => (
            <span
              className="tour-mock-list-row"
              key={title}
              data-role={title === "Chapter Nine" ? "gone" : "static"}
              style={vars({ "--i": i })}
            >
              {title}
            </span>
          ))}
        </div>

        <div className="tour-mock-trash-pane">
          <span className="tour-mock-slot-head">Trash</span>
          <div className="tour-mock-trash-row">
            <span className="tour-mock-trash-name">Chapter Nine</span>
            <span className="tour-mock-trash-left">29 days left</span>
            <span className="tour-mock-trash-btns">
              <span className="tour-mock-trash-btn" data-role="restore">
                Restore
              </span>
              <span className="tour-mock-trash-btn" data-role="danger">
                Delete forever
              </span>
            </span>
          </div>
        </div>

        {/* Gone at rest, like the drop zone: after the click there is no
            menu. It is here at all because "right-click" is half the
            lesson and a diagram of a vanished note doesn't say it. */}
        <div className="tour-mock-ctx">
          <span className="tour-mock-ctx-item">Archive note</span>
          <span className="tour-mock-ctx-item" data-pick="true">
            Delete note
          </span>
          <span className="tour-mock-ctx-item">Open trash…</span>
        </div>
      </div>
      <TourCursor />
    </>
  );
}

/* ---------- 11. a theme of your own ---------- */

/* The five colors are the five that customThemes.ts actually asks for,
   in its order. The chips are drawn from the live tokens rather than from
   hex, so this clip is wearing whatever theme the writer is already in —
   which is the argument the clip is making. */
const THEME_SLOTS = [
  { id: "window", label: "Window" },
  { id: "panes", label: "Panes" },
  { id: "page", label: "Page" },
  { id: "text", label: "Text" },
  { id: "accent", label: "Accent" },
];

function ThemeClip() {
  return (
    <div className="tour-mock tour-mock-theme">
      <div className="tour-mock-skin">
        <div className="tour-mock-skin-bar">
          <span className="tour-mock-skin-dot" />
          <span className="tour-mock-skin-name" />
          <span className="tour-mock-skin-pill" />
        </div>
        <div className="tour-mock-skin-body">
          <div className="tour-mock-skin-rail" />
          <div className="tour-mock-skin-page">
            <MockLines count={4} />
          </div>
        </div>
      </div>

      <div className="tour-mock-swatches">
        {THEME_SLOTS.map((slot, i) => (
          <span
            className="tour-mock-swatch"
            key={slot.id}
            data-slot={slot.id}
            style={vars({ "--i": i })}
          >
            <span className="tour-mock-swatch-chip" />
            <span className="tour-mock-swatch-label">{slot.label}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/* ---------- 12. the backdrop ---------- */

/* The "photograph" is a gradient, not an image. A bundled asset would
   have to be shipped twice and would stop matching the day the presets
   change; a gradient built from the theme's own tokens can't go stale and
   costs nothing to load. The lesson is the dim control anyway. */
function BackdropClip() {
  return (
    <div className="tour-mock tour-mock-scene">
      <div className="tour-mock-backdrop" />
      <div className="tour-mock-scene-body">
        <div className="tour-mock-glass" data-pane="left" />
        <div className="tour-mock-glass" data-pane="page">
          <MockLines count={5} />
        </div>
        <div className="tour-mock-glass" data-pane="right" />
      </div>
      <div className="tour-mock-slider">
        <span className="tour-mock-slider-label">Dim</span>
        <span className="tour-mock-slider-track">
          <span className="tour-mock-slider-fill" />
          <span className="tour-mock-knob" />
        </span>
      </div>
    </div>
  );
}

/* ---------- 13. the slash menu ---------- */

/* The menu comes from the real command list rather than being retyped,
   so it can't drift from the menu it demonstrates. Four fit; the app
   offers six. Rest keeps the menu open, as in the reword clip: "the task
   line it left behind" is a claim that needs the mechanism in frame. */
const SLASH_PICKS = SLASH_COMMANDS.slice(0, 4);

function SlashClip() {
  return (
    <>
      <div className="tour-mock tour-mock-slash">
        <p className="tour-mock-para">
          <span className="tour-mock-run">She counted what the crossing would cost.</span>
        </p>

        <p className="tour-mock-slashline">
          <span className="tour-mock-slash-char">/</span>
          <span className="tour-mock-caret" />
        </p>

        <div className="tour-mock-menu">
          {SLASH_PICKS.map((cmd, i) => (
            <span
              className="tour-mock-menu-item"
              key={cmd.id}
              data-pick={i === 0 ? "true" : undefined}
              style={vars({ "--i": i })}
            >
              {cmd.label}
              <span className="tour-mock-menu-hint">{cmd.hint}</span>
            </span>
          ))}
        </div>

        <p className="tour-mock-para" data-para="after">
          <span className="tour-mock-todo-line">
            <span className="tour-mock-check" />
            <span className="tour-mock-todo-text">Ask the ferryman's name</span>
          </span>
        </p>
      </div>
      <TourCursor />
    </>
  );
}

/* ---------- 14. wiki links ---------- */

/* Rest closes the menu here, unlike the slash clip: the brackets in the
   prose ARE the mechanism, so the still frame still says how it was done.
   What has to survive instead is the backlink underneath — the half of
   the feature nobody discovers on their own. */
const CODEX_HITS = ["Elowen Vance", "Elowen's ward", "Ferry House"];

function WikiLinkClip() {
  return (
    <>
      <div className="tour-mock tour-mock-wiki">
        <p className="tour-mock-para">
          <span className="tour-mock-run">The ferryman would not look at </span>
          <span className="tour-mock-link">
            [[<span className="tour-mock-link-name">Elowen Vance</span>]]
          </span>
          <span className="tour-mock-run">, not once in the crossing.</span>
        </p>

        <div className="tour-mock-menu" data-menu="wiki">
          {CODEX_HITS.map((name, i) => (
            <span
              className="tour-mock-menu-item"
              key={name}
              data-pick={i === 0 ? "true" : undefined}
              style={vars({ "--i": i })}
            >
              {name}
            </span>
          ))}
        </div>

        <div className="tour-mock-links">
          <span className="tour-mock-links-head">Backlinks · Elowen Vance</span>
          <span className="tour-mock-link-row">
            Chapter Nine
            <span className="tour-mock-link-count">1</span>
          </span>
        </div>
      </div>
      <TourCursor />
    </>
  );
}

/* ---------- 15. move a paragraph ---------- */

/* Vertical twin of the tab drag: DOM order is the finished order, and the
   keyframes start the moved paragraph one slot lower with its neighbour
   one slot higher. The caret rides along, because "the cursor is still in
   it" is the difference between this and cut-and-paste. */
const PARA_BLOCKS: { role: "static" | "move"; lines: number }[] = [
  { role: "static", lines: 2 },
  { role: "move", lines: 2 },
  { role: "static", lines: 2 },
];

function ParagraphClip() {
  return (
    <>
      <div className="tour-keycaps">
        <span className="tour-key" data-key="alt">
          Alt
        </span>
        <span className="tour-key-join">+</span>
        <span className="tour-key" data-key="up">
          ↑
        </span>
      </div>

      <div className="tour-mock tour-mock-blocks">
        {PARA_BLOCKS.map((block, i) => (
          <span
            className="tour-mock-block"
            key={i}
            data-role={block.role}
            style={vars({ "--i": i })}
          >
            <MockLines count={block.lines} />
            {block.role === "move" && <span className="tour-mock-block-caret" />}
          </span>
        ))}
      </div>
    </>
  );
}

/* ---------- 16. reword ---------- */

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
