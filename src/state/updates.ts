/* ============================================================
   In-app updates, via GitHub Releases

   The app checks the project's GitHub repository for a newer
   release and offers the download right here — no hunting through
   a releases page. The check is a single unauthenticated read of
   the public GitHub API.

   What this deliberately is NOT yet: silent background
   auto-install. That requires a signing key and CI-built
   installers — the owner's keys, the owner's account — and faking
   it would mean shipping unsigned binaries. The scaffolding here
   (version compare, release lookup, download hand-off) is the
   part that doesn't need anyone's credentials.
   ============================================================ */

const REPO_KEY = "novella.updateRepo";

/** The app's own version. Injected at build time from package.json. */
export function currentVersion(): string {
  return typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "0.0.0";
}

/** The home repository. Ships as the default so the update check works out
    of the box; a writer running their own fork can point it elsewhere. */
const DEFAULT_REPO = "imakebrains/Novella.ai";

export function updateRepo(): string {
  return localStorage.getItem(REPO_KEY) ?? DEFAULT_REPO;
}

export function setUpdateRepo(repo: string): void {
  const cleaned = repo.trim().replace(/^https?:\/\/github\.com\//, "").replace(/\/+$/, "");
  if (cleaned) localStorage.setItem(REPO_KEY, cleaned);
  else localStorage.removeItem(REPO_KEY);
}

/** Compare two version strings numerically: "1.2.10" > "1.2.9", a leading
    "v" is ignored, missing segments count as zero. Returns -1/0/1. */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) =>
    v.trim().replace(/^v/i, "").split(".").map((s) => Number.parseInt(s, 10) || 0);
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da !== db) return da < db ? -1 : 1;
  }
  return 0;
}

export interface UpdateCheck {
  current: string;
  latest: string;
  newer: boolean;
  /** Human page for the release. */
  releaseUrl: string;
  /** Direct installer asset when one is attached, else null. */
  downloadUrl: string | null;
  publishedAt: string | null;
}

/** Ask GitHub for the latest release of the configured repo. Throws with a
    readable message on any failure — the UI shows it verbatim. */
export async function checkForUpdate(): Promise<UpdateCheck> {
  const repo = updateRepo();
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) {
    throw new Error('Set the repository first — the "owner/name" from its GitHub URL.');
  }

  const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (res.status === 404) {
    throw new Error(`${repo} has no published releases yet (or isn't public).`);
  }
  if (!res.ok) throw new Error(`GitHub answered ${res.status} — try again in a minute.`);

  const release = (await res.json()) as {
    tag_name?: string;
    html_url?: string;
    published_at?: string;
    assets?: { name?: string; browser_download_url?: string }[];
  };

  const latest = release.tag_name ?? "0.0.0";
  // Prefer a Windows installer asset; fall back to the release page.
  const asset =
    release.assets?.find((a) => /\.(msi|exe)$/i.test(a.name ?? "")) ??
    release.assets?.find((a) => /\.(dmg|AppImage|deb)$/i.test(a.name ?? ""));

  return {
    current: currentVersion(),
    latest,
    newer: compareVersions(currentVersion(), latest) < 0,
    releaseUrl: release.html_url ?? `https://github.com/${repo}/releases`,
    downloadUrl: asset?.browser_download_url ?? null,
    publishedAt: release.published_at ?? null,
  };
}
