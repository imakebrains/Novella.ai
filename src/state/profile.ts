import { useCallback, useSyncExternalStore } from "react";

/* Author profile.

   This is NOT an account. There is no server, nothing to log into, and
   none of this leaves the machine. It exists because a manuscript needs a
   byline: exports, title pages and copyright lines all need to know who
   wrote the thing, and asking every time would be tedious.

   If a sync tier is ever built, an account would be a separate concept
   layered on top of this — not a replacement for it. Someone who never
   signs up should still have their name on their own book. */

export interface AuthorProfile {
  /** Legal or working name — used for copyright lines. */
  name: string;
  /** Published-as name, if different. Used on title pages. */
  penName: string;
  /** Shown in exported front matter. Optional and never transmitted. */
  website: string;
  /** Default point-of-view style for new chapters. */
  defaultPov: "third-limited" | "first" | "third-omniscient" | "unset";
  /** Daily word target, 0 to disable. */
  dailyGoal: number;
}

const KEY = "novella.profile";

const EMPTY: AuthorProfile = {
  name: "",
  penName: "",
  website: "",
  defaultPov: "unset",
  dailyGoal: 0,
};

function read(): AuthorProfile {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    return { ...EMPTY, ...(JSON.parse(raw) as Partial<AuthorProfile>) };
  } catch {
    return EMPTY;
  }
}

let cached: AuthorProfile = read();
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export const profileStore = {
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
  get(): AuthorProfile {
    return cached;
  },
  set(patch: Partial<AuthorProfile>): void {
    cached = { ...cached, ...patch };
    localStorage.setItem(KEY, JSON.stringify(cached));
    emit();
  },
  clear(): void {
    cached = EMPTY;
    localStorage.removeItem(KEY);
    emit();
  },
};

export function useProfile(): [AuthorProfile, (patch: Partial<AuthorProfile>) => void] {
  const profile = useSyncExternalStore(profileStore.subscribe, profileStore.get, profileStore.get);
  const update = useCallback((patch: Partial<AuthorProfile>) => profileStore.set(patch), []);
  return [profile, update];
}

/** The name to put on a title page. */
export function bylineOf(p: AuthorProfile): string {
  return p.penName.trim() || p.name.trim() || "";
}
