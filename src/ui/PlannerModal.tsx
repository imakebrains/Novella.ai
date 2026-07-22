import { useEffect } from "react";
import { useProfile } from "../state/profile";
import { plannerStore, usePlanner, weekOf } from "../state/planner";
import { currentStreak, dayKey, recentDays, useSessions } from "../state/sessions";

/* The weekly planner — the writer-planner dashboard, Novella-shaped.

   Each day: an intent you set, and the truth beside it (words written,
   goal met). The point of pairing them is honesty — a plan you never
   see against reality is a wish. */

export function PlannerModal({ onClose }: { onClose: () => void }) {
  usePlanner();
  useSessions();
  const [profile] = useProfile();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const goal = profile.dailyGoal;
  const week = weekOf();
  const today = dayKey();
  // Sessions data for lookups. 14 days comfortably covers this week.
  const byDay = new Map(recentDays(14).map((d) => [d.day, d]));
  const streak = currentStreak(goal);
  const weekWords = week.reduce((sum, d) => sum + Math.max(0, byDay.get(d.day)?.words ?? 0), 0);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal planner-modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2>This week</h2>
          <button className="icon-btn" onClick={onClose} title="Close (Esc)">
            ✕
          </button>
        </header>

        <div className="modal-body">
          <p className="hint planner-summary">
            {weekWords.toLocaleString()} words this week
            {goal > 0 && ` · goal ${goal.toLocaleString()}/day`}
            {streak > 0 && ` · ${streak}-day streak`}
          </p>

          <div className="planner-week">
            {week.map(({ day, date }) => {
              const record = byDay.get(day);
              const words = record?.words ?? 0;
              const met = goal > 0 ? words >= goal : words > 0;
              const isToday = day === today;
              const isFuture = day > today;

              return (
                <div key={day} className={`planner-day ${isToday ? "today" : ""} ${isFuture ? "future" : ""}`}>
                  <div className="planner-day-head">
                    <span className="planner-day-name">
                      {date.toLocaleDateString(undefined, { weekday: "short" })}
                    </span>
                    <span className="planner-day-date">
                      {date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </span>
                  </div>

                  <textarea
                    className="planner-intent"
                    value={plannerStore.intent(day)}
                    placeholder={isFuture ? "Plan…" : isToday ? "Today's intention…" : "—"}
                    onChange={(e) => plannerStore.setIntent(day, e.target.value)}
                    rows={2}
                    aria-label={`Plan for ${day}`}
                  />

                  <div className={`planner-day-result ${met ? "met" : ""}`}>
                    {isFuture ? (
                      <span className="muted">·</span>
                    ) : (
                      <>
                        {met && <span className="planner-met">✓</span>}
                        <span>
                          {words !== 0 ? `${words > 0 ? "+" : ""}${words.toLocaleString()}w` : "—"}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <p className="hint">
            Intents are yours, not the book's — they stay on this device. Words come from
            the day's actual writing, and a cutting day can read negative. That's honest.
          </p>
        </div>
      </div>
    </div>
  );
}
