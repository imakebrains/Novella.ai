/* The pure half of backups, split out so tests can import it in Node —
   backup.ts reaches into the stores, which reach for localStorage at
   import time. Same reason diff.ts and webLayout.ts live apart. */

/** Deterministic, sortable, collision-proof-by-the-minute filename. */
export function backupFilename(projectName: string, at = new Date()): string {
  const slug =
    projectName.trim().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-").slice(0, 40) || "project";
  const y = at.getFullYear();
  const m = String(at.getMonth() + 1).padStart(2, "0");
  const d = String(at.getDate()).padStart(2, "0");
  const hh = String(at.getHours()).padStart(2, "0");
  const mm = String(at.getMinutes()).padStart(2, "0");
  return `${slug}-backup-${y}-${m}-${d}-${hh}${mm}.zip`;
}
