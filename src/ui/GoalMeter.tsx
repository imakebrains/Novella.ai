import { useProfile } from "../state/profile";
import {
  bestStreak,
  currentStreak,
  recentDays,
  useSessions,
  wordsToday,
} from "../state/sessions";

/* The daily-goal meter in the titlebar.

   Small on purpose. It's a nudge, not a dashboard — a ring that fills as
   you write and a streak count. Clicking it opens the fuller breakdown in
   Settings. The whole feature is motivational, so it stays quiet until
   there's something to be pleased about. */

export function GoalMeter({ onOpen }: { onOpen: () => void }) {
  useSessions();
  const [profile] = useProfile();
  const goal = profile.dailyGoal;
  const today = wordsToday();
  const streak = currentStreak(goal);

  // With no goal and nothing written, there's nothing to show yet.
  if (goal <= 0 && today === 0) {
    return (
      <button className="goal-meter empty" onClick={onOpen} title="Set a daily writing goal">
        Set a goal
      </button>
    );
  }

  const pct = goal > 0 ? Math.max(0, Math.min(1, today / goal)) : today > 0 ? 1 : 0;
  const met = goal > 0 && today >= goal;
  const circumference = 2 * Math.PI * 9;

  return (
    <button
      className={`goal-meter ${met ? "met" : ""}`}
      onClick={onOpen}
      title={
        goal > 0
          ? `${today.toLocaleString()} of ${goal.toLocaleString()} words today${
              streak > 0 ? ` · ${streak}-day streak` : ""
            }`
          : `${today.toLocaleString()} words today`
      }
    >
      <svg width="22" height="22" viewBox="0 0 22 22" className="goal-ring" aria-hidden="true">
        <circle cx="11" cy="11" r="9" className="goal-ring-track" />
        <circle
          cx="11"
          cy="11"
          r="9"
          className="goal-ring-fill"
          style={{
            strokeDasharray: circumference,
            strokeDashoffset: circumference * (1 - pct),
          }}
        />
      </svg>
      <span className="goal-figures">
        {met ? (
          <span className="goal-check">✓</span>
        ) : (
          <span className="goal-today">{today > 0 ? `+${today.toLocaleString()}` : today.toLocaleString()}</span>
        )}
        {streak > 1 && <span className="goal-streak">{streak}🔥</span>}
      </span>
    </button>
  );
}

/* The fuller view, shown in Settings. A month of daily bars, the streak,
   and the best streak to beat. */
export function SessionSummary() {
  useSessions();
  const [profile] = useProfile();
  const goal = profile.dailyGoal;
  const days = recentDays(30);
  const streak = currentStreak(goal);
  const best = Math.max(bestStreak(), streak);
  const max = Math.max(goal, ...days.map((d) => Math.abs(d.words)), 1);

  const totalThisMonth = days.reduce((sum, d) => sum + Math.max(0, d.words), 0);

  return (
    <div className="session-summary">
      <div className="session-stats">
        <Stat label="Today" value={wordsToday().toLocaleString()} />
        <Stat label="Streak" value={streak > 0 ? `${streak} day${streak === 1 ? "" : "s"}` : "—"} />
        <Stat label="Best" value={best > 0 ? `${best} day${best === 1 ? "" : "s"}` : "—"} />
        <Stat label="30-day total" value={totalThisMonth.toLocaleString()} />
      </div>

      <div className="session-bars" role="img" aria-label="Words written each of the last 30 days">
        {days.map((d) => {
          const h = Math.round((Math.abs(d.words) / max) * 100);
          const met = goal > 0 ? d.words >= goal : d.words > 0;
          return (
            <div
              key={d.day}
              className={`session-bar ${d.words < 0 ? "cut" : ""} ${met ? "met" : ""}`}
              style={{ height: `${Math.max(2, h)}%` }}
              title={`${d.day}: ${d.words >= 0 ? "+" : ""}${d.words.toLocaleString()} words`}
            />
          );
        })}
      </div>
      {goal > 0 && <div className="session-goal-line" style={{ bottom: `${(goal / max) * 100}%` }} />}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="session-stat">
      <span className="session-stat-value">{value}</span>
      <span className="session-stat-label">{label}</span>
    </div>
  );
}
