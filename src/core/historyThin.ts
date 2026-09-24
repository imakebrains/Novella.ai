/* ============================================================
   Revision thinning — the pure half of state/history.ts

   Lives here, away from the store, so the cloud sync engine can merge
   two devices' history files by the same rule the app uses to keep
   one from growing forever. Nothing in this file may import state.
   ============================================================ */

export interface Revision {
  /** Epoch ms. Doubles as the identifier — two snapshots of one note
      cannot share a millisecond. */
  at: number;
  body: string;
  /** Why this snapshot exists, shown verbatim in the UI. */
  reason: string;
  words: number;
}

/** Keeping every snapshot forever would grow without bound on a book
    that gets edited for a year. */
export const MAX_REVISIONS = 60;
const HOUR = 3_600_000;
const DAY = 86_400_000;

/** Reduce a revision list to something that stays useful without growing
    forever: everything recent, then progressively coarser going back.

    The newest and oldest are always kept — the oldest is often the one
    that matters most, being the state before any of this started. */
export function thin(revisions: Revision[], now = Date.now()): Revision[] {
  if (revisions.length <= MAX_REVISIONS) return revisions;

  const sorted = [...revisions].sort((a, b) => a.at - b.at);
  const newest = sorted[sorted.length - 1]!;
  const oldest = sorted[0]!;
  const keep = new Map<number, Revision>();

  keep.set(newest.at, newest);
  keep.set(oldest.at, oldest);

  // One survivor per bucket; bucket width grows with age.
  const bucketOf = (r: Revision): string => {
    const age = now - r.at;
    if (age < HOUR) return `m${r.at}`; // last hour: keep them all
    if (age < DAY) return `h${Math.floor(r.at / HOUR)}`;
    return `d${Math.floor(r.at / DAY)}`;
  };

  for (const r of sorted) {
    const b = bucketOf(r);
    // Later revision in a bucket wins — it's the one closer to what
    // the writer actually kept.
    const existing = [...keep.values()].find((k) => bucketOf(k) === b);
    if (existing) {
      if (r.at > existing.at && existing.at !== newest.at && existing.at !== oldest.at) {
        keep.delete(existing.at);
        keep.set(r.at, r);
      }
    } else {
      keep.set(r.at, r);
    }
  }

  const out = [...keep.values()].sort((a, b) => a.at - b.at);
  // Still over budget after bucketing (a very long editing session):
  // drop from the middle, never the ends.
  while (out.length > MAX_REVISIONS) out.splice(Math.floor(out.length / 2), 1);
  return out;
}
