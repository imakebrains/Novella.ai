import { useCallback, useEffect, useMemo, useState } from "react";
import { useProfile } from "../state/profile";
import { dayKey, useSessions, wordsOn } from "../state/sessions";
import {
  ENTRY_LABELS,
  addMonths,
  calendarStore,
  dateOf,
  dayDots,
  dayTint,
  entryColor,
  feedStore,
  formatTime,
  groupByDay,
  isSameMonth,
  labelById,
  monthAnchor,
  monthGrid,
  monthNames,
  normalizeTime,
  useCalendarEntries,
  yearOptions,
  type CalendarEntry,
  type CalendarFeed,
} from "../state/calendarEntries";
import { expandOccurrences, type IcsOccurrence } from "../state/icsFeed";

/* A real calendar.

   A month grid in the writer's own timezone, a live clock so it visibly
   agrees with the wall, words-written marks on the days that earned them,
   and — the part that makes it a planner rather than a date display — a
   LIST of entries on any day you open, plus whatever a subscribed
   calendar says is happening.

   Three states have to be told apart at a glance, and they stack: a day
   can be today AND selected AND full. So they use three different
   channels rather than three colors — a ring for today, a filled ground
   for selected, dots and a tint for content. Read the month without
   clicking anything and you can still see where the work is. */

interface FeedOccurrence extends IcsOccurrence {
  feedId: string;
  feedName: string;
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

/** Close on Escape or a click outside the given class. The app's popovers
    all behave this way; a picker that only closes via its own button is
    the one that traps people. */
function useDismiss(selector: string, onClose: () => void, active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const away = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest(selector)) onClose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("mousedown", away);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("mousedown", away);
      window.removeEventListener("keydown", key);
    };
  }, [selector, onClose, active]);
}

/* ---------- the month/year picker ---------- */

function MonthPicker({
  anchor,
  today,
  onPick,
  onToday,
  onClose,
}: {
  anchor: Date;
  today: Date;
  onPick: (next: Date) => void;
  onToday: () => void;
  onClose: () => void;
}) {
  useDismiss(".cal-picker, .cal-month", onClose, true);

  const months = useMemo(() => monthNames("short"), []);
  const years = useMemo(() => yearOptions(anchor.getFullYear()), [anchor]);

  // Land the writer's current year in the middle of the scroller instead
  // of making them hunt for it at whatever offset the list happens to be.
  const centerYear = useCallback((el: HTMLButtonElement | null) => {
    el?.scrollIntoView({ block: "center" });
  }, []);

  return (
    <div className="menu-pop cal-picker" role="dialog" aria-label="Jump to a month">
      <div className="cal-picker-months" role="group" aria-label="Month">
        {months.map((name, m) => (
          <button
            key={name}
            className={`cal-picker-month ${anchor.getMonth() === m ? "on" : ""} ${
              today.getFullYear() === anchor.getFullYear() && today.getMonth() === m ? "now" : ""
            }`}
            onClick={() => onPick(monthAnchor(anchor.getFullYear(), m))}
          >
            {name}
          </button>
        ))}
      </div>

      <div className="cal-picker-years" role="group" aria-label="Year">
        {years.map((y) => {
          const on = y === anchor.getFullYear();
          return (
            <button
              key={y}
              ref={on ? centerYear : undefined}
              className={`cal-picker-year ${on ? "on" : ""} ${y === today.getFullYear() ? "now" : ""}`}
              onClick={() => onPick(monthAnchor(y, anchor.getMonth()))}
            >
              {y}
            </button>
          );
        })}
      </div>

      <button className="menu-item cal-picker-today" onClick={onToday}>
        Today
      </button>
    </div>
  );
}

/* ---------- one of the writer's entries ---------- */

function EntryRow({
  entry,
  autoFocus,
  labelling,
  onToggleLabels,
  onCloseLabels,
}: {
  entry: CalendarEntry;
  autoFocus: boolean;
  /** Which row's label menu is open is the PANEL's business, not the
      row's — two rows each minding their own would happily leave two
      menus open at once. */
  labelling: boolean;
  onToggleLabels: () => void;
  onCloseLabels: () => void;
}) {
  const [time, setTime] = useState(entry.time ?? "");

  // The time field takes anything time-shaped ("9", "930", "9:30pm") and
  // is only read back on commit — normalising every keystroke would fight
  // the writer for the caret halfway through typing.
  const commitTime = () => {
    const normalized = normalizeTime(time);
    calendarStore.update(entry.id, { time: normalized ?? null });
    setTime(normalized ?? "");
  };

  const label = labelById(entry.label);
  const color = entryColor(entry);

  return (
    <li
      className="cal-entry"
      style={color ? ({ "--cal-tint": color } as React.CSSProperties) : undefined}
      onBlur={(e) => {
        // Leaving an entry you never wrote anything in throws it away.
        // Otherwise every mis-click leaves a blank row on the day forever.
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        if (!entry.text.trim()) calendarStore.remove(entry.id);
      }}
    >
      <button
        className={`cal-label-swatch ${label ? "on" : ""}`}
        style={color ? { background: color } : undefined}
        onClick={onToggleLabels}
        data-tip={label ? `${label.name} — click to change` : "Add a color label"}
        aria-label={label ? `Label: ${label.name}` : "No label"}
      />

      {labelling && (
        <div className="menu-pop cal-label-menu" role="menu" aria-label="Entry label">
          {ENTRY_LABELS.map((l) => (
            <button
              key={l.id}
              role="menuitem"
              className="menu-item"
              onClick={() => {
                calendarStore.update(entry.id, { label: l.id });
                onCloseLabels();
              }}
            >
              <span className="cal-label-dot" style={{ background: l.color }} />
              {l.name}
              {entry.label === l.id && <span className="cal-label-check">✓</span>}
            </button>
          ))}
          <button
            role="menuitem"
            className="menu-item"
            onClick={() => {
              calendarStore.update(entry.id, { label: null });
              onCloseLabels();
            }}
          >
            <span className="cal-label-dot none" />
            No label
          </button>
        </div>
      )}

      <input
        className="field-input cal-entry-time"
        value={time}
        placeholder="—"
        onChange={(e) => setTime(e.target.value)}
        onBlur={commitTime}
        onKeyDown={(e) => {
          if (e.key === "Enter") commitTime();
        }}
        aria-label="Time (optional)"
        data-tip="Optional — 9, 930 and 9:30pm all work"
      />

      <input
        className="field-input cal-entry-text"
        autoFocus={autoFocus}
        value={entry.text}
        placeholder="What's happening…"
        onChange={(e) => calendarStore.update(entry.id, { text: e.target.value })}
        aria-label="Entry"
      />

      <button
        className="icon-btn cal-entry-remove"
        onClick={() => calendarStore.remove(entry.id)}
        data-tip="Remove this entry"
        aria-label="Remove entry"
      >
        ×
      </button>
    </li>
  );
}

/* ---------- subscribed calendars ---------- */

function FeedRow({ feed }: { feed: CalendarFeed }) {
  const [busy, setBusy] = useState(false);
  const [pasting, setPasting] = useState(false);
  const [pasted, setPasted] = useState("");

  const refresh = async () => {
    setBusy(true);
    await feedStore.refresh(feed.id);
    setBusy(false);
  };

  const skipped = feed.events.filter((e) => e.recurrenceSkipped).length;

  return (
    <li className="cal-feed">
      <div className="cal-feed-head">
        <span className="cal-feed-name">{feed.name}</span>
        <span className="cal-feed-count">
          {feed.lastFetched === null
            ? "not read yet"
            : `${feed.events.length} event${feed.events.length === 1 ? "" : "s"}`}
        </span>
        <button
          className="icon-btn"
          onClick={() => void refresh()}
          disabled={busy}
          data-tip="Read this calendar again now"
          aria-label={`Refresh ${feed.name}`}
        >
          ↻
        </button>
        <button
          className="icon-btn"
          onClick={() => feedStore.remove(feed.id)}
          data-tip="Unsubscribe — your own entries are untouched"
          aria-label={`Unsubscribe from ${feed.name}`}
        >
          ×
        </button>
      </div>

      <div className="cal-feed-url">{feed.url}</div>

      {feed.lastFetched !== null && (
        <div className="hint">
          Last read {new Date(feed.lastFetched).toLocaleString()}
          {skipped > 0 &&
            ` · ${skipped} repeating event${skipped === 1 ? "" : "s"} shown once only`}
        </div>
      )}

      {feed.lastError && <div className="hint cal-feed-error">{feed.lastError}</div>}

      {pasting ? (
        <div className="cal-feed-paste">
          <textarea
            className="field-input"
            rows={3}
            value={pasted}
            placeholder="Paste the contents of the downloaded .ics file…"
            onChange={(e) => setPasted(e.target.value)}
            aria-label="Paste ICS file contents"
          />
          <div className="cal-feed-actions">
            <button
              className="btn-primary"
              disabled={!pasted.trim()}
              onClick={() => {
                feedStore.acceptText(feed.id, pasted);
                setPasted("");
                setPasting(false);
              }}
            >
              Read it
            </button>
            <button className="btn-ghost" onClick={() => setPasting(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          className="btn-ghost cal-feed-paste-open"
          onClick={() => setPasting(true)}
          data-tip="Works even when the calendar's host blocks direct reads"
        >
          Paste the .ics file instead
        </button>
      )}
    </li>
  );
}

function FeedsSection({ version }: { version: number }) {
  const [url, setUrl] = useState("");
  // `version` only exists to re-read the store when it changes; the list
  // itself is the store's, not a copy.
  const feeds = useMemo(() => feedStore.list(), [version]);

  const subscribe = async () => {
    const trimmed = url.trim();
    if (!trimmed) return;
    const feed = feedStore.add(trimmed);
    setUrl("");
    await feedStore.refresh(feed.id);
  };

  return (
    <section className="cal-feeds">
      <div className="cal-feeds-head">
        <h3 className="cal-feeds-title">Subscribed calendars</h3>
        {feeds.length > 0 && (
          <button
            className="icon-btn"
            onClick={() => void feedStore.refreshAll()}
            data-tip="Read every subscribed calendar again"
            aria-label="Refresh all calendars"
          >
            ↻
          </button>
        )}
      </div>

      {feeds.length > 0 && <ul className="cal-feed-list">{feeds.map((f) => <FeedRow key={f.id} feed={f} />)}</ul>}

      <div className="cal-feed-add">
        <input
          className="field-input"
          value={url}
          placeholder="https://…/basic.ics"
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void subscribe();
          }}
          aria-label="Calendar ICS address"
        />
        <button className="btn-primary" disabled={!url.trim()} onClick={() => void subscribe()}>
          Subscribe
        </button>
      </div>

      <p className="hint">
        Google, Apple and Outlook each publish a calendar as a secret .ics address — in Google it's
        “Settings → your calendar → Secret address in iCal format”. Paste that here and its events
        appear alongside your own, read-only. Novella never writes to it.
      </p>
    </section>
  );
}

/* ---------- the tab ---------- */

export function CalendarTab() {
  const version = useCalendarEntries();
  useSessions();
  const [profile] = useProfile();
  const now = useNow();
  const [anchor, setAnchor] = useState(() => new Date());
  const [selected, setSelected] = useState(() => dayKey());
  const [picking, setPicking] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [labelFor, setLabelFor] = useState<string | null>(null);

  const closeLabels = useCallback(() => setLabelFor(null), []);
  useDismiss(".cal-label-menu, .cal-label-swatch", closeLabels, labelFor !== null);

  const goal = profile.dailyGoal;
  const today = dayKey(now);
  const days = useMemo(() => monthGrid(anchor), [anchor]);
  const weekdayNames = days
    .slice(0, 7)
    .map((d) => d.toLocaleDateString(undefined, { weekday: "narrow" }));
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const byDay = useMemo(() => groupByDay(calendarStore.all()), [version]);

  // Subscribed events are expanded once for the whole visible grid rather
  // than per cell — 42 lookups, one walk of each recurrence rule.
  const eventsByDay = useMemo(() => {
    // monthGrid is always 42 cells, so first and last are always there.
    const from = dayKey(days[0]!);
    const to = dayKey(days[41]!);
    const out: Record<string, FeedOccurrence[]> = {};
    for (const feed of feedStore.list()) {
      for (const occ of expandOccurrences(feed.events, from, to)) {
        (out[occ.day] ??= []).push({ ...occ, feedId: feed.id, feedName: feed.name });
      }
    }
    for (const day of Object.keys(out)) {
      out[day] = (out[day] ?? []).sort((a, b) => (a.time ?? "99").localeCompare(b.time ?? "99"));
    }
    return out;
  }, [days, version]);

  const move = (delta: number) => setAnchor(addMonths(anchor, delta));

  const jumpToday = () => {
    setAnchor(new Date());
    setSelected(today);
    setPicking(false);
  };

  const selectedDate = dateOf(selected);
  const selectedWords = wordsOn(selected);
  const selectedEntries = byDay[selected] ?? [];
  const selectedEvents = eventsByDay[selected] ?? [];

  const addEntry = () => {
    const entry = calendarStore.add(selected);
    setFocusId(entry.id);
  };

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
        <div className="cal-month-wrap">
          <button
            className="cal-month"
            onClick={() => setPicking((v) => !v)}
            aria-haspopup="dialog"
            aria-expanded={picking}
            data-tip="Pick a month and year"
          >
            {anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
            <span className="cal-month-caret" aria-hidden="true">
              ▾
            </span>
          </button>
          {picking && (
            <MonthPicker
              anchor={anchor}
              today={now}
              onPick={(next) => {
                setAnchor(next);
                setPicking(false);
              }}
              onToday={jumpToday}
              onClose={() => setPicking(false)}
            />
          )}
        </div>
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
          const outside = !isSameMonth(d, anchor);
          const entries = byDay[key] ?? [];
          const events = eventsByDay[key] ?? [];
          const tint = dayTint(entries);
          const dots = dayDots(entries);
          const count = entries.length + events.length;

          return (
            <button
              key={key}
              className={[
                "cal-day",
                outside ? "outside" : "",
                key === today ? "today" : "",
                key === selected ? "selected" : "",
                count > 0 ? "has-content" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              style={tint ? ({ "--cal-tint": tint } as React.CSSProperties) : undefined}
              onClick={() => setSelected(key)}
              aria-label={`${d.toDateString()}${count > 0 ? `, ${count} scheduled` : ""}`}
            >
              <span className="cal-day-num">{d.getDate()}</span>
              <span className="cal-day-marks">
                {met && <span className="cal-mark words" title={`${words} words`} />}
                {dots.map((c, i) => (
                  <span
                    key={`d${i}`}
                    className="cal-mark plan"
                    style={c ? { background: c } : undefined}
                  />
                ))}
                {events.length > 0 && <span className="cal-mark feed" title="Subscribed calendar" />}
              </span>
            </button>
          );
        })}
      </div>

      <div className="cal-day-panel">
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

        {selectedEntries.length === 0 && selectedEvents.length === 0 ? (
          <div className="empty-state cal-empty">
            <span className="empty-glyph" aria-hidden>
              ❧
            </span>
            <p className="empty-line">
              {selected > today ? "Nothing planned yet." : "Nothing was on this day."}
            </p>
          </div>
        ) : (
          <ul className="cal-entries">
            {selectedEntries.map((e) => (
              <EntryRow
                key={e.id}
                entry={e}
                autoFocus={e.id === focusId}
                labelling={labelFor === e.id}
                onToggleLabels={() => setLabelFor((v) => (v === e.id ? null : e.id))}
                onCloseLabels={closeLabels}
              />
            ))}

            {selectedEvents.map((o, i) => (
              <li key={`${o.feedId}-${o.uid}-${i}`} className="cal-entry subscribed">
                <span className="cal-entry-time-read">
                  {o.allDay || !o.time ? "all day" : formatTime(o.time)}
                </span>
                <span className="cal-entry-text-read">{o.summary}</span>
                <span
                  className="chip cal-entry-source"
                  data-tip={
                    o.recurrenceSkipped
                      ? `From ${o.feedName} · repeats in a way Novella won't guess at, so only its first date is shown`
                      : `From ${o.feedName} · read-only`
                  }
                >
                  {o.feedName}
                  {o.recurrenceSkipped ? " ⚠" : ""}
                </span>
              </li>
            ))}
          </ul>
        )}

        <button className="btn-ghost cal-add" onClick={addEntry}>
          + Add to this day
        </button>
      </div>

      <FeedsSection version={version} />
    </div>
  );
}
