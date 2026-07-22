import { useProfile } from "../state/profile";
import { SessionSummary } from "./GoalMeter";
import { currentStreak, useSessions, wordsToday } from "../state/sessions";

/* Goals, promoted from a titlebar trinket to a proper tab.

   The big ring, today's count against the goal, the streak, the month of
   bars — and the goal itself editable right here, because "open Settings
   to change a number you look at daily" was a paper cut. */

export function GoalsTab() {
  useSessions();
  const [profile, update] = useProfile();
  const goal = profile.dailyGoal;
  const today = wordsToday();
  const streak = currentStreak(goal);
  const pct = goal > 0 ? Math.max(0, Math.min(1, today / goal)) : today > 0 ? 1 : 0;
  const met = goal > 0 && today >= goal;
  const R = 52;
  const circumference = 2 * Math.PI * R;

  return (
    <div className="goals-tab">
      <div className="goals-ring-wrap">
        <svg width="140" height="140" viewBox="0 0 140 140" className="goals-ring" aria-hidden="true">
          <circle cx="70" cy="70" r={R} className="goal-ring-track" strokeWidth="8" />
          <circle
            cx="70"
            cy="70"
            r={R}
            className={`goal-ring-fill ${met ? "met" : ""}`}
            strokeWidth="8"
            style={{
              strokeDasharray: circumference,
              strokeDashoffset: circumference * (1 - pct),
            }}
          />
        </svg>
        <div className="goals-ring-center">
          <span className="goals-today">{today.toLocaleString()}</span>
          <span className="goals-of">{goal > 0 ? `of ${goal.toLocaleString()}` : "words today"}</span>
        </div>
      </div>

      {met && <p className="goals-met">Goal met{streak > 1 ? ` — ${streak} days running` : ""} ✓</p>}

      <label className="goals-edit">
        Daily goal
        <input
          type="number"
          min={0}
          step={100}
          value={goal || ""}
          placeholder="none"
          onChange={(e) => update({ dailyGoal: Number(e.target.value) || 0 })}
        />
        words
      </label>

      <SessionSummary />
      <p className="hint">
        Net words — a day spent cutting can read negative, and that's honest work too.
      </p>
    </div>
  );
}
