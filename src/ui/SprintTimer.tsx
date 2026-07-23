import { useEffect, useState } from "react";
import { manuscriptWordCount } from "../state/sessions";
import {
  activeSprint,
  cancelSprint,
  finishSprint,
  formatClock,
  remainingSeconds,
  sprintHistory,
  startSprint,
  useSprints,
} from "../state/sprints";
import { useVaultVersion } from "../state/vaultStore";
import { playChime } from "./chime";

const PRESETS = [15, 25, 45];

/* A sprint timer wired to the word counter — the fourth app (a focus/sprint
   timer) collapsed into Novella instead of run alongside it. Pick a
   duration, write, watch the count climb, get a chime when time's up. */
export function SprintTimer() {
  useSprints();
  useVaultVersion();
  const active = activeSprint();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const tick = () => {
      if (remainingSeconds(active.startedAt, active.durationMin) <= 0) {
        window.clearInterval(id);
        playChime();
        finishSprint();
      } else {
        setNow(Date.now());
      }
    };
    const id = window.setInterval(tick, 1000);
    tick();
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id]);

  const remaining = active ? remainingSeconds(active.startedAt, active.durationMin, now) : 0;
  const wordsSoFar = active ? manuscriptWordCount() - active.wordsStart : 0;
  const history = sprintHistory().slice(0, 5);

  return (
    <div className="sprint-timer">
      <h3 className="sprint-title">Sprint</h3>

      {!active ? (
        <div className="sprint-presets">
          {PRESETS.map((min) => (
            <button key={min} className="sprint-preset" onClick={() => startSprint(min)}>
              {min} min
            </button>
          ))}
        </div>
      ) : (
        <div className="sprint-active">
          <span className="sprint-clock">{formatClock(remaining)}</span>
          <span className={`sprint-words ${wordsSoFar < 0 ? "cut" : ""}`}>
            {wordsSoFar >= 0 ? `+${wordsSoFar.toLocaleString()}` : wordsSoFar.toLocaleString()} words
          </span>
          <button className="sprint-stop" onClick={() => cancelSprint()}>
            Stop
          </button>
        </div>
      )}

      {history.length > 0 && (
        <ul className="sprint-history">
          {history.map((s) => (
            <li key={s.id} className="sprint-history-row">
              <span className="sprint-history-time">
                {new Date(s.startedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
              </span>
              <span className="sprint-history-duration">{s.durationMin}m</span>
              <span className={`sprint-history-words ${s.words < 0 ? "cut" : ""}`}>
                {s.words >= 0 ? `+${s.words.toLocaleString()}` : s.words.toLocaleString()}
              </span>
              {!s.completed && <span className="sprint-history-stopped">stopped early</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
