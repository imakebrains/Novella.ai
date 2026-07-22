import { useSyncExternalStore } from "react";
import { dayKey } from "./sessions";

/* ============================================================
   The weekly planner

   One line of intent per day — "draft the lighthouse scene" —
   beside what actually happened (words, goal met). Planning lives
   next to the record of the plan surviving contact with the week.

   Intents are the WRITER'S schedule, not the book's, so they're
   app-level (localStorage), not part of any vault: your Tuesday
   plan doesn't belong inside a novel's folder.
   ============================================================ */

const KEY = "novella.planner";

function read(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

let intents = read();
const listeners = new Set<() => void>();
let version = 0;

function emit(): void {
  version++;
  for (const l of listeners) l();
}

export const plannerStore = {
  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
  getVersion(): number {
    return version;
  },

  intent(day: string): string {
    return intents[day] ?? "";
  },

  setIntent(day: string, text: string): void {
    if (text.trim()) intents = { ...intents, [day]: text };
    else {
      const { [day]: _, ...rest } = intents;
      intents = rest;
    }
    try {
      localStorage.setItem(KEY, JSON.stringify(intents));
    } catch {
      /* planning is best-effort */
    }
    emit();
  },
};

/** The seven dates of the week containing `now`, Monday first. */
export function weekOf(now = new Date()): { day: string; date: Date }[] {
  const monday = new Date(now);
  // getDay(): Sunday 0 … Saturday 6. Walk back to Monday.
  const back = (monday.getDay() + 6) % 7;
  monday.setDate(monday.getDate() - back);
  monday.setHours(12, 0, 0, 0); // noon dodges DST edges when adding days

  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + i);
    return { day: dayKey(date), date };
  });
}

export function usePlanner(): number {
  return useSyncExternalStore(plannerStore.subscribe, plannerStore.getVersion, plannerStore.getVersion);
}
