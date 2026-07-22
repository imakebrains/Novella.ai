import { useEffect, useState } from "react";
import { useProfile } from "../state/profile";
import { plannerStore, usePlanner } from "../state/planner";
import { dayKey, useSessions, wordsOn } from "../state/sessions";

/* A real calendar.

   A month grid in the writer's own timezone, a live clock so it visibly
   agrees with the wall, words-written marks on the days that earned them,
   and a plan line for any day you select. Nothing here is a stylised
   "planner widget" — it's the calendar a writing habit actually lives on. */

function monthDays(anchor: Date): Date[] {
  // 6 rows × 7 days starting the Monday on/before the 1st — the fixed
  // shape means the grid never jumps height between months.
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1, 12);
  const start = new Date(first);
  start.setDate(first.getDate() - ((first.getDay() + 6) % 7));
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

/** Live minute clock, so the header time is always the wall's time. */
function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const tick = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(tick);
  }, []);
  return now;
}

export function CalendarTab() {
  usePlanner();
  useSessions();
  const [profile] = useProfile();
  const now = useNow();
  const [anchor, setAnchor] = useState(() => new Date());
  const [selected, setSelected] = useState(() => dayKey());

  const goal = profile.dailyGoal;
  const today = dayKey(now);
  const days = monthDays(anchor);
  const weekdayNames = days
    .slice(0, 7)
    .map((d) => d.toLocaleDateString(undefined, { weekday: "narrow" }));
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const move = (delta: number) => {
    const next = new Date(anchor);
    next.setMonth(next.getMonth() + delta, 1);
    setAnchor(next);
  };

  const selectedDate = new Date(`${selected}T12:00:00`);
  const selectedWords = wordsOn(selected);

  return (
    <div className="calendar-tab">
      <div className="cal-clock">
        <span className="cal-clock-time">
          {now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
        </span>
        <span className="cal-clock-date">
          {now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
        </span>
        <span className="cal-clock-tz">{timezone.replace(/_/g, " ")}</span>
      </div>

      <div className="cal-head">
        <button className="icon-btn" onClick={() => move(-1)} aria-label="Previous month">
          ‹
        </button>
        <button
          className="cal-month"
          onClick={() => {
            setAnchor(new Date());
            setSelected(today);
          }}
          title="Jump to today"
        >
          {anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
        </button>
        <button className="icon-btn" onClick={() => move(1)} aria-label="Next month">
          ›
        </button>
      </div>

      <div className="cal-grid" role="grid" aria-label="Month calendar">
        {weekdayNames.map((w, i) => (
          <span key={`w${i}`} className="cal-weekday">
            {w}
          </span>
        ))}
        {days.map((d) => {
          const key = dayKey(d);
          const words = wordsOn(key);
          const met = goal > 0 ? words >= goal : words > 0;
          const outside = d.getMonth() !== anchor.getMonth();
          const hasPlan = !!plannerStore.intent(key).trim();
          return (
            <button
              key={key}
              className={[
                "cal-day",
                outside ? "outside" : "",
                key === today ? "today" : "",
                key === selected ? "selected" : "",
              ].join(" ")}
              onClick={() => setSelected(key)}
              aria-label={d.toDateString()}
            >
              <span className="cal-day-num">{d.getDate()}</span>
              <span className="cal-day-marks">
                {met && <span className="cal-mark words" title={`${words} words`} />}
                {hasPlan && <span className="cal-mark plan" title="Planned" />}
              </span>
            </button>
          );
        })}
      </div>

      <div className="cal-selected">
        <div className="cal-selected-head">
          <span>
            {selectedDate.toLocaleDateString(undefined, {
              weekday: "long",
              month: "short",
              day: "numeric",
            })}
          </span>
          <span className={`cal-selected-words ${selectedWords > 0 ? "some" : ""}`}>
            {selectedWords !== 0
              ? `${selectedWords > 0 ? "+" : ""}${selectedWords.toLocaleString()} words`
              : selected > today
                ? "ahead"
                : "no writing"}
          </span>
        </div>
        <textarea
          className="planner-intent cal-intent"
          rows={2}
          value={plannerStore.intent(selected)}
          placeholder={
            selected === today ? "Today's intention…" : selected > today ? "Plan this day…" : "What happened…"
          }
          onChange={(e) => plannerStore.setIntent(selected, e.target.value)}
          aria-label={`Plan for ${selected}`}
        />
      </div>
    </div>
  );
}
