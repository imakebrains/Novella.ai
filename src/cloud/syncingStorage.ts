/* ============================================================
   The storage adapter, as the sync engine hears it

   Every write and delete Novella makes goes through storage(). Wrapping
   that one door is how the engine learns what changed without a single
   feature (boards, plot, trash, history, the editor) knowing that sync
   exists.
   ============================================================ */

import type { VaultStorage } from "../storage/adapter";

export type ChangeReport = (kind: "write" | "remove", path: string) => void;

/** A Proxy, not a class. vaultStore casts the adapter to TauriStorage
    for knownMtime/statMtime, ProjectsPanel casts it to WebStorage for
    rootExists; a wrapper that only implemented VaultStorage would hand
    them undefined and break desktop saving. Everything forwards, and
    only the three mutators report — for the bound root only, and only
    AFTER the raw call resolves, so a failed write never queues a push
    and a failed remove never pushes a tombstone (rule 2 in
    syncEngine.ts). */
export function syncingStorage(
  raw: VaultStorage,
  boundRoot: () => string | null,
  report: ChangeReport,
): VaultStorage {
  const tell = (root: string, kind: "write" | "remove", path: string) => {
    if (root !== boundRoot()) return;
    try {
      report(kind, path);
    } catch {
      // The write already landed. A sync bookkeeping failure must never
      // reach the caller as a failed save — scan() on the next bind
      // finds anything this missed by content.
    }
  };
  return new Proxy(raw, {
    get(target, prop, receiver) {
      if (prop === "write") {
        return async (root: string, rel: string, contents: string) => {
          await target.write(root, rel, contents);
          tell(root, "write", rel);
        };
      }
      if (prop === "writeBytes") {
        return async (root: string, rel: string, bytes: Uint8Array) => {
          await target.writeBytes(root, rel, bytes);
          tell(root, "write", rel);
        };
      }
      if (prop === "remove") {
        return async (root: string, rel: string) => {
          await target.remove(root, rel);
          tell(root, "remove", rel);
        };
      }
      const value = Reflect.get(target, prop, receiver) as unknown;
      // Bound, so TauriStorage's private maps are reached through the
      // real instance rather than through the proxy.
      return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(target) : value;
    },
  });
}
