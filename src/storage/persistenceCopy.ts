/* ============================================================
   What to tell the writer about the browser's persist() answer

   persistence.ts asks; this decides the sentence. Kept pure so the one
   rule that matters can be pinned by a test: "denied" is Chrome's normal
   first answer on a first visit, so the copy for it must read as "the
   usual arrangement, keep a backup", never as a failure. A writer who
   sees "denied" in red on day one assumes the app is broken.

   persist() is decided per origin, not per book, so every book in this
   browser shares the answer — the copy says "your books", not "this
   book", to avoid implying the next book might fare differently.

   Only the IndexedDB backing gets a line. The desktop build writes real
   files and never asks; a browser that fell back to memory already has
   App's "edits vanish on reload" banner, and a durability line there
   would contradict it.
   ============================================================ */

import type { PersistenceAnswer } from "./persistence";

export type StorageBacking = "web" | "tauri" | "memory";

export interface PersistenceLine {
  text: string;
  tone: "ok" | "quiet";
}

export function persistenceLine(
  answer: PersistenceAnswer | null,
  backing: StorageBacking,
): PersistenceLine | null {
  if (backing !== "web") return null;
  // Null is "not settled yet", or a build that skipped the ask — saying
  // nothing beats guessing.
  if (answer === null) return null;
  switch (answer) {
    case "granted":
      return {
        tone: "ok",
        text: "This browser has agreed to keep your books here — it won't clear them to make room.",
      };
    case "denied":
      return {
        tone: "quiet",
        text:
          "This browser keeps your books here the ordinary way — it may clear them if the disk runs short or the site goes unused for a long while. That's the usual answer until a browser knows a site well; export a copy now and then.",
      };
    case "unsupported":
      return {
        tone: "quiet",
        text: "This browser doesn't say whether it will keep your books here, so export a copy now and then.",
      };
  }
}
