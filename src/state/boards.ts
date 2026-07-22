import { useSyncExternalStore } from "react";
import { storage } from "../storage";
import { store } from "./vaultStore";

/* ============================================================
   Boards

   The Manuscript board is built in: every chapter, in reading
   order. Custom boards are the writer's own tables — "Act Two",
   "Flashbacks", "Cut but not dead" — any notes, in any order,
   the same cards.

   A custom board holds note IDS, not copies. The same chapter can
   sit on three boards and it's still one chapter; reordering a
   custom board never touches the manuscript's `order` frontmatter,
   so arranging a working set can't scramble the book.

   Stored in .novella/boards.json — a board is part of how a
   particular book is being worked, so it travels with the project.
   ============================================================ */

export interface Board {
  id: string;
  name: string;
  noteIds: string[];
}

/** The id of the built-in all-chapters board. Not stored; always first. */
export const MANUSCRIPT_BOARD = "manuscript";

const FILE = ".novella/boards.json";

function lsKey(): string {
  return `novella.boards.${store.vaultRoot() ?? "app"}`;
}

let cached: Board[] = [];
let loadedFor: string | null | undefined;
const listeners = new Set<() => void>();
let version = 0;

function emit(): void {
  version++;
  for (const l of listeners) l();
}

function normalize(raw: unknown): Board[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (b): b is Board =>
      !!b && typeof b === "object" && "id" in b && "name" in b && Array.isArray((b as Board).noteIds),
  );
}

async function load(): Promise<void> {
  const root = store.vaultRoot();
  loadedFor = root;
  let boards: Board[] = [];
  if (root) {
    try {
      const bytes = await storage().readBytes(root, FILE);
      if (bytes) boards = normalize(JSON.parse(new TextDecoder().decode(bytes)));
    } catch {
      /* missing or corrupt config never blocks the board */
    }
  } else {
    try {
      boards = normalize(JSON.parse(localStorage.getItem(lsKey()) ?? "[]"));
    } catch {
      /* same */
    }
  }
  cached = boards;
  emit();
}

async function persist(): Promise<void> {
  const root = store.vaultRoot();
  const json = JSON.stringify(cached);
  if (root) {
    try {
      await storage().writeBytes(root, FILE, new TextEncoder().encode(json));
    } catch {
      /* best-effort */
    }
  } else {
    try {
      localStorage.setItem(lsKey(), json);
    } catch {
      /* quota */
    }
  }
}

function newId(): string {
  return `board_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export const boardStore = {
  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
  getVersion(): number {
    return version;
  },

  all(): Board[] {
    if (loadedFor !== store.vaultRoot()) void load();
    return cached;
  },

  get(id: string): Board | undefined {
    return this.all().find((b) => b.id === id);
  },

  add(name: string): Board {
    const board: Board = { id: newId(), name: name.trim() || "New board", noteIds: [] };
    cached = [...cached, board];
    void persist();
    emit();
    return board;
  },

  rename(id: string, name: string): void {
    cached = cached.map((b) => (b.id === id ? { ...b, name } : b));
    void persist();
    emit();
  },

  remove(id: string): void {
    cached = cached.filter((b) => b.id !== id);
    void persist();
    emit();
  },

  /** Add a note to a board. Already present is a quiet no-op — "add again"
      should never create duplicates or feel like an error. */
  addNote(boardId: string, noteId: string): void {
    cached = cached.map((b) =>
      b.id === boardId && !b.noteIds.includes(noteId)
        ? { ...b, noteIds: [...b.noteIds, noteId] }
        : b,
    );
    void persist();
    emit();
  },

  removeNote(boardId: string, noteId: string): void {
    cached = cached.map((b) =>
      b.id === boardId ? { ...b, noteIds: b.noteIds.filter((n) => n !== noteId) } : b,
    );
    void persist();
    emit();
  },

  /** Reorder a custom board. The manuscript board never routes here —
      its order is the book's `order` frontmatter. */
  setOrder(boardId: string, noteIds: string[]): void {
    cached = cached.map((b) => (b.id === boardId ? { ...b, noteIds } : b));
    void persist();
    emit();
  },
};

/* A different book, different working tables. */
store.onVaultReplaced(() => {
  loadedFor = undefined;
  cached = [];
  emit();
});

export function useBoards(): Board[] {
  useSyncExternalStore(boardStore.subscribe, boardStore.getVersion, boardStore.getVersion);
  return boardStore.all();
}
