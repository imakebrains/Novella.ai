/* Telling the running app that settings sync changed a key.

   Most stores keep their value in memory and write the whole blob back
   on the next change — sessions on every autosave. A key applied without
   a re-read is overwritten by the stale copy moments later, and the next
   round pushes that over the other device. So each "refresher" key in
   settingsSync.ts's REFRESH table names the store's reload here, and the
   round calls runRefreshers() synchronously, before it awaits the push.

   Browser-only: every import below touches localStorage or the DOM. */

import { adoptStoredTheme } from "../ui/useTheme";
import { reloadPersonalization } from "../ui/personalize";
import { reloadCustomThemes } from "../ui/customThemes";
import { profileStore } from "../state/profile";
import { reloadConnections } from "../plugins/providers/connections";
import { reloadCalendarStores } from "../state/calendarEntries";
import { plannerStore } from "../state/planner";
import { reloadSessions } from "../state/sessions";
import { reloadTimers } from "../state/timers";
import { refreshRuleOf } from "./settingsSync";

const THEME_KEY = "novella.theme";

/* The theme is handled apart from this table: see runRefreshers. */
const REFRESHERS: Record<string, () => void> = {
  "novella.personalize": reloadPersonalization,
  "novella.profile": () => profileStore.reload(),
  "novella.roleRouting": reloadConnections,
  "novella.connections": reloadConnections,
  "novella.calendar": reloadCalendarStores,
  "novella.calendarLabels": reloadCalendarStores,
  "novella.calendarFeeds": reloadCalendarStores,
  "novella.planner": () => plannerStore.reload(),
  "novella.sessions": reloadSessions,
  "novella.timers": reloadTimers,
};

export function runRefreshers(applied: string[]): void {
  const rules = new Set(applied.map(refreshRuleOf).filter((r): r is string => r !== null));
  const run = (fn: () => void) => {
    try {
      fn();
    } catch {
      /* one store failing to re-read must not stop the rest */
    }
  };

  if (rules.has(THEME_KEY) || rules.has("novella.customThemes")) {
    // Read before the custom themes reload: its listener moves a theme
    // it can't find to the OS default and writes that over the key. A
    // new custom theme also has to be in THEMES before the id is checked.
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(THEME_KEY);
    } catch {
      /* no storage: nothing to adopt */
    }
    if (rules.has("novella.customThemes")) run(reloadCustomThemes);
    run(() => adoptStoredTheme(saved));
  }

  const done = new Set<() => void>();
  for (const rule of rules) {
    const fn = REFRESHERS[rule];
    if (!fn || done.has(fn)) continue;
    done.add(fn);
    run(fn);
  }
}
