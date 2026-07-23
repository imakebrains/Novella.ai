import { useSyncExternalStore } from "react";

/* A single app-wide undo toast.

   Destructive actions here follow the Notion/Gmail school: act
   immediately, then hold the door open. No "Are you sure?" — people
   click those without reading. One live toast at a time; a second
   destructive act commits the first (its trash copy remains the
   fallback). */

export interface UndoToast {
  label: string;
  undo: () => void;
  at: number;
}

let current: UndoToast | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((fn) => fn());

export function showUndo(label: string, undo: () => void, ttlMs = 8000): void {
  if (timer) clearTimeout(timer);
  current = { label, undo, at: Date.now() };
  timer = setTimeout(() => {
    current = null;
    timer = null;
    emit();
  }, ttlMs);
  emit();
}

export function runUndo(): void {
  const toast = current;
  if (!toast) return;
  if (timer) clearTimeout(timer);
  current = null;
  timer = null;
  toast.undo();
  emit();
}

export function dismissUndo(): void {
  if (timer) clearTimeout(timer);
  current = null;
  timer = null;
  emit();
}

export function useUndoToast(): UndoToast | null {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => current,
    () => current,
  );
}
