import { useEffect, useState } from "react";
import {
  MINUTE,
  TIMER_PRESETS_MIN,
  alarmArm,
  alarmDismiss,
  alarmDisarm,
  alarmLeft,
  countdownLeft,
  formatClockTime,
  formatGap,
  formatTimer,
  isAlarmArmed,
  isCountdownRunning,
  parseClockTime,
  alarmSetTime,
  setTimerMode,
  setTimerRinger,
  timerDismiss,
  timerPause,
  timerReset,
  timerSetMinutes,
  timerStart,
  timersState,
  useTimers,
} from "../state/timers";
import { playChime } from "./chime";

/* The timer tab: a countdown and an alarm, in one place.

   The state is all in src/state/timers.ts, which is the whole point —
   this file may unmount at any moment (switch to Links, close the
   inspector, reopen it tomorrow) and none of that is allowed to touch a
   running clock. What lives here is only what a window is for: the face,
   the buttons, and a `now` that ticks fast enough for the digits to look
   alive. Firing happens in the store either way.

   The two halves run independently. A writer can have a 25-minute sprint
   going AND a 3pm alarm set; switching the face doesn't cancel either, so
   the face you aren't looking at reports itself in one line at the bottom
   rather than disappearing. */

// Module scope on purpose: the store must be able to make a sound before
// this tab has ever been opened, so the wiring can't wait for a mount.
setTimerRinger(playChime);

/** A minute-of-day as the reader's own locale writes it. */
function clockLabel(minuteOfDay: number): string {
  const d = new Date(2000, 0, 1, Math.floor(minuteOfDay / 60), minuteOfDay % 60);
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** A local `now`, refreshed only while something is actually counting.
    Faster than one second so the seconds column flips on time rather than
    up to a second late. */
function useTickingNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [active]);
  return now;
}

export function TimerTab() {
  useTimers();
  const state = timersState();
  const { countdown, alarm, mode } = state;
  const now = useTickingNow(isCountdownRunning(countdown) || isAlarmArmed(alarm));

  return (
    <div className="timer-tab">
      <div className="timer-modes" role="radiogroup" aria-label="Timer or alarm">
        <button
          className={`timer-mode-btn ${mode === "countdown" ? "on" : ""}`}
          role="radio"
          aria-checked={mode === "countdown"}
          onClick={() => setTimerMode("countdown")}
        >
          Timer
        </button>
        <button
          className={`timer-mode-btn ${mode === "alarm" ? "on" : ""}`}
          role="radio"
          aria-checked={mode === "alarm"}
          onClick={() => setTimerMode("alarm")}
        >
          Alarm
        </button>
      </div>

      {mode === "countdown" ? <CountdownFace now={now} /> : <AlarmFace now={now} />}

      <OtherHalf now={now} />
    </div>
  );
}

function CountdownFace({ now }: { now: number }) {
  const { countdown } = timersState();
  const running = isCountdownRunning(countdown);
  const rang = countdown.rangAt !== null;
  const left = countdownLeft(countdown, now);
  const minutes = Math.round(countdown.durationMs / MINUTE);

  // The dial's field keeps a draft so a half-typed number ("1" on the way
  // to "12") isn't rejected and snapped back mid-keystroke.
  const [dial, setDial] = useState(() => String(minutes));
  useEffect(() => setDial(String(minutes)), [minutes]);

  return (
    <div className="timer-face">
      <div className={`timer-clock tnum ${rang ? "rang" : running ? "running" : ""}`} role="timer">
        {formatTimer(rang ? 0 : left)}
      </div>

      {rang ? (
        <div className="timer-fired">
          <p className="timer-fired-line">Time's up.</p>
          <button className="btn-primary" onClick={timerDismiss} autoFocus>
            Dismiss
          </button>
        </div>
      ) : (
        <>
          <div className="timer-controls">
            <button className="btn-primary" onClick={running ? timerPause : timerStart}>
              {running ? "Pause" : left < countdown.durationMs ? "Resume" : "Start"}
            </button>
            <button
              className="btn-ghost"
              onClick={timerReset}
              disabled={!running && left === countdown.durationMs}
            >
              Reset
            </button>
          </div>

          {/* Changing the dial stops the clock, so it's hidden while one is
              running rather than offered and then quietly destructive. */}
          {!running && (
            <>
              <div className="timer-presets">
                {TIMER_PRESETS_MIN.map((m) => (
                  <button
                    key={m}
                    className={`timer-preset ${minutes === m ? "on" : ""}`}
                    onClick={() => timerSetMinutes(m)}
                  >
                    {m}m
                  </button>
                ))}
              </div>

              <label className="timer-dial">
                <span className="timer-dial-label">Minutes</span>
                <input
                  className="field-input timer-dial-input tnum"
                  type="number"
                  min={1}
                  max={600}
                  value={dial}
                  onChange={(e) => {
                    setDial(e.target.value);
                    const n = Number(e.target.value);
                    if (Number.isFinite(n) && n >= 1 && n <= 600) timerSetMinutes(n);
                  }}
                  onBlur={() => setDial(String(minutes))}
                />
              </label>
            </>
          )}
        </>
      )}
    </div>
  );
}

function AlarmFace({ now }: { now: number }) {
  const { alarm } = timersState();
  const armed = isAlarmArmed(alarm);
  const rang = alarm.rangAt !== null;

  return (
    <div className="timer-face">
      <div className={`timer-clock tnum ${rang ? "rang" : armed ? "running" : ""}`} role="timer">
        {clockLabel(alarm.minuteOfDay)}
      </div>

      {rang ? (
        <div className="timer-fired">
          <p className="timer-fired-line">It's {clockLabel(alarm.minuteOfDay)}.</p>
          <button className="btn-primary" onClick={alarmDismiss} autoFocus>
            Dismiss
          </button>
        </div>
      ) : (
        <>
          <p className="hint timer-due">
            {armed
              ? `Rings in ${formatGap(alarmLeft(alarm, now))}`
              : "Rings once, then clears itself."}
          </p>

          <div className="timer-controls">
            <label className="timer-time">
              <span className="timer-dial-label">At</span>
              <input
                className="field-input timer-time-input tnum"
                type="time"
                value={formatClockTime(alarm.minuteOfDay)}
                aria-label="Alarm time"
                onChange={(e) => {
                  // A field that can't be read must not become midnight.
                  const min = parseClockTime(e.target.value);
                  if (min !== null) alarmSetTime(min);
                }}
              />
            </label>
            <button className={armed ? "btn-ghost" : "btn-primary"} onClick={armed ? alarmDisarm : alarmArm}>
              {armed ? "Cancel" : "Set alarm"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/* One line about the half you're not looking at — and a way back to it.
   Silent when there's nothing to say, which is most of the time. */
function OtherHalf({ now }: { now: number }) {
  const { countdown, alarm, mode } = timersState();

  if (mode === "countdown") {
    if (alarm.rangAt !== null)
      return (
        <button className="btn-ghost timer-other" onClick={() => setTimerMode("alarm")}>
          The alarm went off — dismiss it
        </button>
      );
    if (!isAlarmArmed(alarm)) return null;
    return (
      <button className="btn-ghost timer-other" onClick={() => setTimerMode("alarm")}>
        Alarm at {clockLabel(alarm.minuteOfDay)}, in {formatGap(alarmLeft(alarm, now))}
      </button>
    );
  }

  if (countdown.rangAt !== null)
    return (
      <button className="btn-ghost timer-other" onClick={() => setTimerMode("countdown")}>
        The timer finished — dismiss it
      </button>
    );
  if (!isCountdownRunning(countdown)) return null;
  return (
    <button className="btn-ghost timer-other" onClick={() => setTimerMode("countdown")}>
      Timer running — {formatTimer(countdownLeft(countdown, now))} left
    </button>
  );
}
