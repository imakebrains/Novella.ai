import { useSyncExternalStore } from "react";
import { onPersistenceAnswer, persistenceAnswer } from "../storage/persistence";
import { persistenceLine } from "../storage/persistenceCopy";
import { isTauri, storage } from "../storage";

/* One quiet sentence under Settings → Account about whether the browser
   agreed to keep the books. The copy and its "denied is not a failure"
   rule live in persistenceCopy.ts.

   useSyncExternalStore rather than state plus an effect: the ask settles
   during boot, and an answer landing between render and subscribe would
   be missed by an effect but not by the store's re-check. */

export function StorageDurabilityLine() {
  const answer = useSyncExternalStore(onPersistenceAnswer, persistenceAnswer, persistenceAnswer);
  if (isTauri()) return null;
  const line = persistenceLine(answer, storage().kind);
  if (!line) return null;
  return (
    <p className={line.tone === "ok" ? "hint ok storage-durability" : "hint storage-durability"}>
      {line.text}
    </p>
  );
}
