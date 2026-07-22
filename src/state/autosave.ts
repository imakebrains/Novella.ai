import { useEffect, useRef, useState } from "react";
import { store, useVaultVersion } from "../state/vaultStore";
import { recordProgress } from "./sessions";

/* ============================================================
   Autosave and crash recovery

   Two separate protections, because they fail differently:

   1. AUTOSAVE writes dirty notes to disk shortly after you stop
      typing. Only possible when a real vault folder is open.

   2. DRAFT SNAPSHOTS mirror unsaved text into localStorage on every
      keystroke. This survives a crash, a force-quit, or a browser
      reload — including in the web build where there is no disk at
      all. It's the seatbelt for when autosave can't run or hasn't
      fired yet.

   Snapshots are cleared once the text is safely on disk, so a stale
   snapshot never resurrects old prose over newer saved work.
   ============================================================ */

const DRAFT_PREFIX = "novella.draft.";
const AUTOSAVE_DELAY_MS = 1500;

export interface Draft {
  path: string;
  title: string;
  body: string;
  savedAt: number;
}

function draftKey(id: string): string {
  return `${DRAFT_PREFIX}${id}`;
}

export function writeDraft(id: string, draft: Draft): void {
  try {
    localStorage.setItem(draftKey(id), JSON.stringify(draft));
  } catch {
    // Storage full or blocked. Autosave to disk is the real protection;
    // losing the snapshot shouldn't take the app down with it.
  }
}

export function clearDraft(id: string): void {
  localStorage.removeItem(draftKey(id));
}

/** True when a stored draft holds exactly the text already in the note,
    meaning it protects nothing and can safely be discarded. */
export function draftMatches(id: string, body: string): boolean {
  const raw = localStorage.getItem(draftKey(id));
  if (!raw) return false;
  try {
    return (JSON.parse(raw) as Draft).body === body;
  } catch {
    return true; // corrupt entry — dropping it is the right move
  }
}

export function allDrafts(): { id: string; draft: Draft }[] {
  const out: { id: string; draft: Draft }[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith(DRAFT_PREFIX)) continue;
    const raw = localStorage.getItem(key);
    if (!raw) continue;
    try {
      out.push({ id: key.slice(DRAFT_PREFIX.length), draft: JSON.parse(raw) as Draft });
    } catch {
      localStorage.removeItem(key);
    }
  }
  return out;
}

/** Drafts whose text differs from what's currently loaded — i.e. work that
    a crash would otherwise have eaten. */
export function pendingRecovery(): { id: string; draft: Draft }[] {
  return allDrafts().filter(({ id, draft }) => {
    const note = store.vault.get(id);
    if (!note) return true; // note is gone entirely; the draft is all that's left
    return note.body !== draft.body;
  });
}

export type SaveState = "idle" | "pending" | "saving" | "saved" | "error";

/** Drives autosave + snapshots. Returns status for the UI to show. */
export function useAutosave(enabled: boolean): { state: SaveState; lastSaved: number | null } {
  const version = useVaultVersion();
  const [state, setState] = useState<SaveState>("idle");
  const [lastSaved, setLastSaved] = useState<number | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    // Attribute the manuscript's current size to today. Cheap, idempotent
    // within a day, and this effect already fires on every edit.
    recordProgress();

    for (const note of store.vault.all()) {
      if (store.isDirty(note.id)) {
        // Snapshot every dirty note immediately — this is the cheap
        // protection and it must not wait for the debounce.
        writeDraft(note.id, {
          path: note.path,
          title: note.title,
          body: note.body,
          savedAt: Date.now(),
        });
      } else if (draftMatches(note.id, note.body)) {
        // Nothing left to recover, so stop hoarding it. The test is
        // deliberately "the draft equals the current text" rather than
        // "the note isn't dirty": at startup a note holding unsaved work
        // is NOT dirty yet, and clearing on that basis would delete the
        // very draft the recovery banner is about to offer back.
        clearDraft(note.id);
      }
    }

    if (!enabled || store.dirtyCount() === 0) {
      if (store.dirtyCount() === 0 && state === "pending") setState("idle");
      return;
    }

    setState("pending");
    if (timer.current !== null) window.clearTimeout(timer.current);

    timer.current = window.setTimeout(() => {
      const ids = store.vault.all().filter((n) => store.isDirty(n.id)).map((n) => n.id);
      setState("saving");
      void store.saveAll().then(() => {
        if (store.error()) {
          setState("error");
          return;
        }
        // Only drop snapshots for notes that actually made it to disk.
        for (const id of ids) if (!store.isDirty(id)) clearDraft(id);
        setState("saved");
        setLastSaved(Date.now());
      });
    }, AUTOSAVE_DELAY_MS);

    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
    // `version` is the change signal from the vault store.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, enabled]);

  return { state, lastSaved };
}
