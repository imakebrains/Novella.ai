import { useSyncExternalStore } from "react";
import { manuscriptWordCount } from "./sessions";

/* Writing sprints — the fourth app.

   Every dedicated sprint timer (Write/Sprint, Ohwrite, Write or Die,
   Pomowatch, Trackbear) does one thing: pick a duration, count the words
   written during it, log the result. Writers run these *alongside* their
   writing app. This collapses that habit into Novella by sampling the same
   manuscript count the daily goal already uses, so a sprint's number and
   the day's number never disagree.

   Net words, like the daily goal — a sprint spent cleaning up a scene is
   still real work, even if the count reads negative. */

export interface SprintRecord {
  id: string;
  startedAt: number;
  durationMin: number;
  /** Net words written during the sprint. May be negative. */
  words: number;
  /** False if the writer stopped it early rather than letting it finish. */
  completed: boolean;
}

interface ActiveSprint {
  id: string;
  startedAt: number;
  durationMin: number;
  wordsStart: number;
}

interface SprintState {
  /** Most recent first, capped so history never grows unbounded. */
  history: SprintRecord[];
  active: ActiveSprint | null;
}

const KEY = "novella.sprints";
const HISTORY_LIMIT = 50;

function read(): SprintState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SprintState>;
      return { history: parsed.history ?? [], active: parsed.active ?? null };
    }
  } catch {
    /* fall through to empty */
  }
  return { history: [], active: null };
}

let state: SprintState = read();
const listeners = new Set<() => void>();
let version = 0;

function persist(): void {
  version++;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Sprint history is a nicety; never let it interfere with writing.
  }
  for (const l of listeners) l();
}

/** Seconds left in a sprint. Pure over its inputs so the countdown logic
    can be tested without a real clock. Never negative — 0 means done,
    including for a sprint the app missed the end of because it wasn't
    open, so reopening it settles up immediately rather than drifting. */
export function remainingSeconds(startedAt: number, durationMin: number, now = Date.now()): number {
  const totalMs = durationMin * 60_000;
  const elapsed = now - startedAt;
  return Math.max(0, Math.ceil((totalMs - elapsed) / 1000));
}

/** MM:SS for the countdown display. */
export function formatClock(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function startSprint(durationMin: number): void {
  if (state.active) return; // one sprint at a time
  state = {
    ...state,
    active: {
      id: `${Date.now()}`,
      startedAt: Date.now(),
      durationMin,
      wordsStart: manuscriptWordCount(),
    },
  };
  persist();
}

function endActive(completed: boolean): SprintRecord | null {
  const active = state.active;
  if (!active) return null;
  const record: SprintRecord = {
    id: active.id,
    startedAt: active.startedAt,
    durationMin: active.durationMin,
    words: manuscriptWordCount() - active.wordsStart,
    completed,
  };
  state = { active: null, history: [record, ...state.history].slice(0, HISTORY_LIMIT) };
  persist();
  return record;
}

/** Stop the running sprint early; logged, but not as completed. */
export function cancelSprint(): void {
  endActive(false);
}

/** Called once the countdown reaches zero. */
export function finishSprint(): SprintRecord | null {
  return endActive(true);
}

export function activeSprint(): ActiveSprint | null {
  return state.active;
}

export function sprintHistory(): SprintRecord[] {
  return state.history;
}

export function subscribeSprints(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
export function sprintsVersion(): number {
  return version;
}
export function useSprints(): number {
  return useSyncExternalStore(subscribeSprints, sprintsVersion, sprintsVersion);
}
