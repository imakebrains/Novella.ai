import { useSyncExternalStore } from "react";

/* ============================================================
   Timers — a countdown and an alarm

   The sprint timer counts words; this one just counts. Two shapes,
   because writers reach for two different things: "twenty-five
   minutes from now" (tea, a stretch, a scene attempt) and "quarter
   to four" (the school run, a call, dinner). Both were the phone
   sitting face-up next to the keyboard, which is one more screen
   than a writing session survives.

   Two rules shape this file.

   A timer that only counts while you're looking at it is not a
   timer. So the clock lives here, at module level, and ticks
   whether or not any tab is mounted — TimerTab is a window onto
   this state, never its owner. Absolute deadlines (not "seconds
   remaining" decremented per tick) mean a backgrounded tab, a
   throttled interval or a reload all settle up correctly on the
   next pass instead of drifting.

   And the arithmetic must be provable without a clock. Everything
   above the store is pure, takes `now` as an argument, and returns
   the SAME object when nothing changed — which is also what lets
   tick() tell "it just rang" from "another quiet quarter second".
   test-timers.ts is the reason that discipline holds.
   ============================================================ */

export const MINUTE = 60_000;

/** The dial's stops. Twenty-five leads because it's the one people
    arrive already knowing. */
export const TIMER_PRESETS_MIN = [5, 10, 15, 25, 45, 60];

export type TimerMode = "countdown" | "alarm";

export interface CountdownState {
  /** What Reset returns to, and what a preset sets. */
  durationMs: number;
  /** Milliseconds left while stopped. Ignored while running. */
  restMs: number;
  /** Wall-clock deadline while running; null when stopped or paused. */
  endsAt: number | null;
  /** When it reached zero, until the writer acknowledges it. */
  rangAt: number | null;
}

export interface AlarmState {
  /** Minutes past local midnight — 7:30am is 450. */
  minuteOfDay: number;
  /** Wall-clock time of the next ring; null when disarmed. */
  dueAt: number | null;
  rangAt: number | null;
}

export interface TimersState {
  /** Which face the tab shows. Both halves keep running regardless. */
  mode: TimerMode;
  countdown: CountdownState;
  alarm: AlarmState;
}

/* ============================================================
   Pure: the countdown
   ============================================================ */

export function isCountdownRunning(c: CountdownState): boolean {
  return c.endsAt !== null;
}

/** Milliseconds still to run. Never negative — zero means done. */
export function countdownLeft(c: CountdownState, now: number): number {
  return c.endsAt === null ? Math.max(0, c.restMs) : Math.max(0, c.endsAt - now);
}

/** Start, or resume from a pause. Starting a finished timer runs it
    again from the top: the writer who hits Start on a zero has asked for
    another one, not for a timer that sits there refusing. */
export function startCountdown(c: CountdownState, now: number): CountdownState {
  if (isCountdownRunning(c)) return c;
  const left = c.restMs > 0 && c.rangAt === null ? c.restMs : c.durationMs;
  if (left <= 0) return c;
  return { ...c, restMs: left, endsAt: now + left, rangAt: null };
}

export function pauseCountdown(c: CountdownState, now: number): CountdownState {
  if (!isCountdownRunning(c)) return c;
  return { ...c, restMs: countdownLeft(c, now), endsAt: null };
}

export function resetCountdown(c: CountdownState): CountdownState {
  if (c.endsAt === null && c.rangAt === null && c.restMs === c.durationMs) return c;
  return { ...c, restMs: c.durationMs, endsAt: null, rangAt: null };
}

/** Set the dial. Always stops the clock: silently re-timing a running
    countdown would leave the number on screen meaning nothing. Sub-second
    durations are refused rather than rounded — there's no such timer. */
export function withCountdownDuration(c: CountdownState, durationMs: number): CountdownState {
  const clean = Math.max(0, Math.round(durationMs));
  if (clean < 1000) return c;
  const same = c.durationMs === clean && c.restMs === clean && c.endsAt === null && c.rangAt === null;
  return same ? c : { durationMs: clean, restMs: clean, endsAt: null, rangAt: null };
}

/** One pass of the clock. Returns `c` unchanged unless this is the pass
    the countdown reached zero on. */
export function tickCountdown(c: CountdownState, now: number): CountdownState {
  if (c.endsAt === null || now < c.endsAt) return c;
  return { ...c, restMs: 0, endsAt: null, rangAt: now };
}

/** Acknowledge a finished countdown: back to the dial, ready to go again. */
export function dismissCountdown(c: CountdownState): CountdownState {
  if (c.rangAt === null) return c;
  return { ...c, restMs: c.durationMs, endsAt: null, rangAt: null };
}

/* ============================================================
   Pure: the alarm
   ============================================================ */

/** The next wall-clock moment it is `minuteOfDay` — today if that's still
    ahead, otherwise tomorrow.

    Built by setting hours on a local Date rather than by adding
    milliseconds to midnight, so the clocks changing overnight moves the
    alarm with them: 7am stays 7am through a DST shift, which is the only
    behaviour a person would forgive. */
export function nextAlarmAt(minuteOfDay: number, now: number): number {
  const clean = clampMinuteOfDay(minuteOfDay);
  const h = Math.floor(clean / 60);
  const m = clean % 60;
  const d = new Date(now);
  d.setHours(h, m, 0, 0);
  if (d.getTime() <= now) {
    d.setDate(d.getDate() + 1);
    d.setHours(h, m, 0, 0);
  }
  return d.getTime();
}

export function clampMinuteOfDay(minuteOfDay: number): number {
  if (!Number.isFinite(minuteOfDay)) return 0;
  return Math.min(1439, Math.max(0, Math.round(minuteOfDay)));
}

export function isAlarmArmed(a: AlarmState): boolean {
  return a.dueAt !== null;
}

export function alarmLeft(a: AlarmState, now: number): number {
  return a.dueAt === null ? 0 : Math.max(0, a.dueAt - now);
}

export function armAlarm(a: AlarmState, now: number): AlarmState {
  return { ...a, dueAt: nextAlarmAt(a.minuteOfDay, now), rangAt: null };
}

export function disarmAlarm(a: AlarmState): AlarmState {
  if (a.dueAt === null && a.rangAt === null) return a;
  return { ...a, dueAt: null, rangAt: null };
}

/** Move the alarm. An armed alarm re-aims at the new time immediately
    rather than waiting to be re-armed — otherwise the field and the
    countdown beside it would disagree about when this thing rings. */
export function withAlarmTime(a: AlarmState, minuteOfDay: number, now: number): AlarmState {
  const clean = clampMinuteOfDay(minuteOfDay);
  if (clean === a.minuteOfDay) return a;
  const next: AlarmState = { ...a, minuteOfDay: clean, rangAt: null };
  return isAlarmArmed(a) ? { ...next, dueAt: nextAlarmAt(clean, now) } : { ...next, dueAt: null };
}

/** One-shot on purpose: it rings once and disarms. A repeating alarm the
    writer forgot about would go off tomorrow mid-scene, and nothing about
    this panel would explain why. */
export function tickAlarm(a: AlarmState, now: number): AlarmState {
  if (a.dueAt === null || now < a.dueAt) return a;
  return { ...a, dueAt: null, rangAt: now };
}

export function dismissAlarm(a: AlarmState): AlarmState {
  if (a.rangAt === null) return a;
  return { ...a, rangAt: null };
}

/* ============================================================
   Pure: reading and writing clock text
   ============================================================ */

/** Parse what a person might type or a time field might hand over:
    "7:30", "07:30", "19:05", "7:30pm", "7 pm". Null when it isn't a
    time — an unparseable field must not silently become midnight. */
export function parseClockTime(raw: string): number | null {
  const s = raw.trim().toLowerCase().replace(/\./g, "");
  const m = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)?$/.exec(s);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] === undefined ? 0 : Number(m[2]);
  if (min > 59) return null;
  const suffix = m[3];
  if (suffix) {
    if (h < 1 || h > 12) return null;
    h = (h % 12) + (suffix.startsWith("p") ? 12 : 0);
  } else if (h > 23) {
    return null;
  }
  return h * 60 + min;
}

/** 24-hour `HH:MM` — what an <input type="time"> reads and writes. */
export function formatClockTime(minuteOfDay: number): string {
  const clean = clampMinuteOfDay(minuteOfDay);
  return `${String(Math.floor(clean / 60)).padStart(2, "0")}:${String(clean % 60).padStart(2, "0")}`;
}

/** The big display: `M:SS`, or `H:MM:SS` once there's an hour to show.
    Rounds up, so a fresh 25-minute timer reads 25:00 rather than 24:59. */
export function formatTimer(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return h > 0 ? `${h}:${mm}:${String(s).padStart(2, "0")}` : `${mm}:${String(s).padStart(2, "0")}`;
}

/** How far off something is, in words. Coarse by design: an alarm four
    hours out doesn't need a seconds column ticking at it. */
export function formatGap(ms: number): string {
  const mins = Math.max(0, Math.round(ms / MINUTE));
  if (mins < 1) return "under a minute";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}

/* ============================================================
   The store — persist, notify, and keep the clock running
   ============================================================ */

const KEY = "novella.timers";
const TICK_MS = 250;
const DEFAULT_MIN = 25;
const DEFAULT_ALARM_MIN = 7 * 60;

function blank(): TimersState {
  const ms = DEFAULT_MIN * MINUTE;
  return {
    mode: "countdown",
    countdown: { durationMs: ms, restMs: ms, endsAt: null, rangAt: null },
    alarm: { minuteOfDay: DEFAULT_ALARM_MIN, dueAt: null, rangAt: null },
  };
}

function read(): TimersState {
  const base = blank();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<TimersState>;
    return {
      mode: parsed.mode === "alarm" ? "alarm" : "countdown",
      countdown: { ...base.countdown, ...(parsed.countdown ?? {}) },
      alarm: { ...base.alarm, ...(parsed.alarm ?? {}) },
    };
  } catch {
    return base;
  }
}

let state: TimersState = read();
const listeners = new Set<() => void>();
let version = 0;
let ticker: number | null = null;

/* What a finished timer sounds like. Injected rather than imported so this
   module stays free of the UI layer — TimerTab hands it the chime at
   import time, which is early enough that the sound doesn't depend on the
   tab having ever been opened. */
let ring: () => void = () => {};

export function setTimerRinger(fn: () => void): void {
  ring = fn;
}

function isArmed(s: TimersState): boolean {
  return s.countdown.endsAt !== null || s.alarm.dueAt !== null;
}

/* The interval exists only while something is actually counting. Nothing
   in a writing app should burn a wakeup every quarter second to watch a
   stopped clock. */
function syncTicker(): void {
  if (typeof window === "undefined") return; // headless: assertions import the pure half
  const want = isArmed(state);
  if (want && ticker === null) ticker = window.setInterval(tick, TICK_MS);
  else if (!want && ticker !== null) {
    window.clearInterval(ticker);
    ticker = null;
  }
}

function tick(): void {
  const now = Date.now();
  const countdown = tickCountdown(state.countdown, now);
  const alarm = tickAlarm(state.alarm, now);
  // Both pure functions return the same object unless this is the pass
  // something fired, so this comparison IS the "did it ring" test.
  if (countdown === state.countdown && alarm === state.alarm) return;
  commit({ ...state, countdown, alarm });
  ring();
}

/* Every action spreads a fresh wrapper, so identity on the whole state
   would always look like a change. The halves are what carry meaning:
   each pure function returns its argument untouched when it refused, and
   comparing those references is how a refusal stays silent instead of
   re-rendering React and rewriting localStorage for nothing. */
function commit(next: TimersState): void {
  if (next.mode === state.mode && next.countdown === state.countdown && next.alarm === state.alarm)
    return;
  state = next;
  version++;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // A remembered timer is a nicety; never let it interfere with writing.
  }
  for (const l of listeners) l();
  syncTicker();
}

export function timersState(): TimersState {
  return state;
}

export function setTimerMode(mode: TimerMode): void {
  if (state.mode === mode) return;
  commit({ ...state, mode });
}

/* ---------- countdown actions ---------- */

export function timerStart(): void {
  commit({ ...state, countdown: startCountdown(state.countdown, Date.now()) });
}
export function timerPause(): void {
  commit({ ...state, countdown: pauseCountdown(state.countdown, Date.now()) });
}
export function timerReset(): void {
  commit({ ...state, countdown: resetCountdown(state.countdown) });
}
export function timerSetMinutes(minutes: number): void {
  commit({ ...state, countdown: withCountdownDuration(state.countdown, minutes * MINUTE) });
}
export function timerDismiss(): void {
  commit({ ...state, countdown: dismissCountdown(state.countdown) });
}

/* ---------- alarm actions ---------- */

export function alarmArm(): void {
  commit({ ...state, alarm: armAlarm(state.alarm, Date.now()) });
}
export function alarmDisarm(): void {
  commit({ ...state, alarm: disarmAlarm(state.alarm) });
}
export function alarmSetTime(minuteOfDay: number): void {
  commit({ ...state, alarm: withAlarmTime(state.alarm, minuteOfDay, Date.now()) });
}
export function alarmDismiss(): void {
  commit({ ...state, alarm: dismissAlarm(state.alarm) });
}

/* ---------- subscription ---------- */

export function subscribeTimers(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
export function timersVersion(): number {
  return version;
}
export function useTimers(): number {
  return useSyncExternalStore(subscribeTimers, timersVersion, timersVersion);
}

// A deadline restored from a previous session may already be behind us;
// starting the ticker here means reopening the app settles it at once
// rather than leaving a stale clock on screen.
syncTicker();
