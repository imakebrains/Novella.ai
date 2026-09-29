import { useEffect } from "react";
import { installSyncHost } from "./syncHost";
import { statusText, statusTip, useSyncStatus } from "./syncStatus";

/* The cloud's word beside the autosave line. Silent when sync is off —
   no cloud in this build, this book not synced, the demo world — so a
   writer who never signs in never sees it. Installing the host from
   here is what keeps App.tsx's part of this to one line. */
export function SyncStatusLine() {
  useEffect(() => {
    installSyncHost();
  }, []);
  const s = useSyncStatus();
  const text = statusText(s);
  if (!text) return null;
  return (
    <span className={`sync-status ${s.state}`} data-tip={statusTip(s)}>
      {text}
    </span>
  );
}
