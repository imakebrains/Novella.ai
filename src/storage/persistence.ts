/* ============================================================
   Persistent storage — asking the browser not to evict the book

   The web build keeps the vault in IndexedDB, and IndexedDB is
   "best-effort" by default: under disk pressure Chrome may clear the
   whole origin without asking, and Safari evicts script-writable storage
   after seven days without a visit. navigator.storage.persist() asks for
   the origin to be upgraded to durable. It is the only lever a page has.

   What the answers mean, so nobody reads them wrong later:
   - Chrome never prompts. It grants silently for installed, bookmarked or
     high-engagement origins and returns false otherwise, so "denied" is
     the NORMAL first answer on a first visit — status copy must not read
     it as a failure, only as "back up, the browser may clear this".
   - Firefox shows a permission prompt, which is why this is called once
     per boot and never retried in a loop.
   - Safari (15.2+) has the call and mostly answers false; in some
     private contexts it throws, which maps to "unsupported" — there is
     nothing to tell the writer that "denied" would not already say.

   The answer is device state, not book state (same split as d8464ef), so
   it lives here in memory and is re-asked each boot rather than being
   written into the vault or a pref. The desktop build writes real files
   and never calls this; persistenceAnswer() stays null there.
   ============================================================ */

export type PersistenceAnswer = "granted" | "denied" | "unsupported";

/** The slice of Navigator this needs, so a test can pass a fake. */
export interface PersistenceNavigator {
  storage?: { persist?: () => Promise<boolean> };
}

/** Never throws: a failed ask must not be able to take boot down. */
export async function decidePersistence(
  nav: PersistenceNavigator | undefined,
): Promise<PersistenceAnswer> {
  const persist = nav?.storage?.persist;
  if (typeof persist !== "function") return "unsupported";
  try {
    // Called as a method: the real one throws "Illegal invocation" when
    // detached from its StorageManager.
    return (await persist.call(nav!.storage)) ? "granted" : "denied";
  } catch {
    return "unsupported";
  }
}

let answer: PersistenceAnswer | null = null;
const listeners = new Set<(a: PersistenceAnswer) => void>();

/** Ask once, remember the answer, tell whoever is listening. */
export async function requestPersistentStorage(
  nav: PersistenceNavigator | undefined = globalThis.navigator as PersistenceNavigator | undefined,
): Promise<PersistenceAnswer> {
  const a = await decidePersistence(nav);
  answer = a;
  for (const cb of listeners) {
    // The status UI must never be able to take the boot path down.
    try {
      cb(a);
    } catch {
      /* a broken listener is the listener's problem */
    }
  }
  return a;
}

/** Null means not asked yet — the desktop build, or before the ask settles. */
export function persistenceAnswer(): PersistenceAnswer | null {
  return answer;
}

/** So the status UI re-renders when the answer lands instead of polling.
    Returns the unsubscribe. */
export function onPersistenceAnswer(cb: (a: PersistenceAnswer) => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
