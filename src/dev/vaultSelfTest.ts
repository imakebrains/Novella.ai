import { store } from "../state/vaultStore";
import { storage } from "../storage";
import { desktopLog } from "../debug";

/* Dev-only end-to-end check of real disk access.

   Runs only when VITE_DEV_VAULT points at a folder AND we're in a dev
   build. It exercises the parts that a browser can never reach: the
   Tauri fs scope, recursive directory walking, and the save round-trip
   through serializeNote — including whether frontmatter survives.

   Output goes through desktopLog, so under `npm run tauri dev` the
   results land in the terminal rather than needing devtools. */

// React StrictMode invokes effects twice in dev. Two concurrent runs race
// on the same file — one reads before the other has written — which reads
// as a failure that isn't one.
let started = false;

export async function runVaultSelfTest(path: string): Promise<void> {
  if (started) return;
  started = true;

  const log = (line: string) => desktopLog(`selftest: ${line}`);
  log(`opening ${path}`);

  const ok = await store.openFolderAt(path);
  if (!ok) {
    log(`FAIL open — ${store.error() ?? "unknown error"}`);
    return;
  }

  const notes = store.vault.all();
  log(`PASS open — ${notes.length} notes: ${notes.map((n) => n.title).join(", ")}`);

  // Frontmatter backlinks are the subtle one: the chapter references its
  // POV character only inside a YAML field, never in the prose.
  const pov = store.vault.resolveLink("Sela Marrow");
  if (!pov) {
    log("FAIL — could not resolve 'Sela Marrow'");
    return;
  }
  const backlinks = store.vault.backlinksOf(pov);
  log(
    `backlinks for ${pov.title}: ${
      backlinks.map((b) => `${b.note.title}(${b.count})`).join(", ") || "none"
    }`,
  );
  const fromChapter = backlinks.some((b) => b.note.type === "chapter");
  log(fromChapter ? "PASS frontmatter backlink from chapter" : "FAIL no chapter backlink");

  // Round-trip: edit prose, save to disk, read the raw file back, and
  // confirm both the new text and the original frontmatter are intact.
  const marker = `Self-test marker ${Date.now()}`;
  const target = store.vault.byType("chapter")[0];
  if (!target) {
    log("FAIL — no chapter to write to");
    return;
  }

  store.setBody(target.id, `${target.body}\n\n${marker}`);
  log(`dirty before save: ${store.dirtyCount()}`);
  await store.saveAll();
  if (store.error()) {
    log(`FAIL save — ${store.error()}`);
    return;
  }
  log(`PASS save — dirty now ${store.dirtyCount()}`);

  const reread = await storage().readAll(path);
  const file = reread.find((f) => f.path === target.path);
  if (!file) {
    log(`FAIL reread — ${target.path} missing from disk`);
    return;
  }
  const hasMarker = file.contents.includes(marker);
  const hasFrontmatter = /^---[\s\S]*?type:\s*chapter[\s\S]*?---/.test(file.contents);
  const hasPov = file.contents.includes("Sela Marrow");

  log(`reread ${target.path}: marker=${hasMarker} frontmatter=${hasFrontmatter} pov=${hasPov}`);
  log(
    hasMarker && hasFrontmatter && hasPov
      ? "PASS round-trip — prose written, frontmatter preserved"
      : "FAIL round-trip",
  );

  await checkCapabilities(path, log);
}

/* The capability check.

   Every fs call the app makes has to be granted in
   src-tauri/capabilities/default.json, and a missing grant fails ONLY in a
   Tauri build — the browser's WebStorage never goes near Tauri, so browser
   verification cannot see it. That gap shipped: readBytes/listFiles call
   readFile and remove() calls remove, neither of which was granted, which
   silently broke cover art, card images, the backup zip and note deletion
   in the packaged app while every browser check stayed green.

   So this walks the binary and delete paths deliberately, and cleans up
   after itself. If a permission is ever dropped again, this says so in the
   terminal instead of a writer discovering it. */
async function checkCapabilities(path: string, log: (line: string) => void): Promise<void> {
  const backing = storage();
  const probe = ".novella/selftest-probe.bin";
  const bytes = new Uint8Array([0x4e, 0x6f, 0x76, 0x65, 0x6c, 0x6c, 0x61]); // "Novella"

  try {
    // writeBytes → readBytes exercises writeFile + readFile. readFile is the
    // one that was missing, and it also powers listFiles (the backup zip).
    await backing.writeBytes(path, probe, bytes);
    const back = await backing.readBytes(path, probe);
    const same = !!back && back.length === bytes.length && back.every((b, i) => b === bytes[i]);
    log(same ? "PASS readBytes — binary round-trip (fs:allow-read-file)" : "FAIL readBytes");

    const files = await backing.listFiles(path);
    log(
      files.length > 0
        ? `PASS listFiles — ${files.length} files readable (backup zip path)`
        : "FAIL listFiles — read nothing",
    );

    // remove was the other missing grant: note deletion and card-image removal.
    await backing.remove(path, probe);
    const gone = (await backing.readBytes(path, probe)) === null;
    log(gone ? "PASS remove — probe deleted (fs:allow-remove)" : "FAIL remove — probe survived");
  } catch (err) {
    // An ACL denial lands here, and its message names the missing permission.
    log(`FAIL capabilities — ${err instanceof Error ? err.message : String(err)}`);
    try {
      await backing.remove(path, probe);
    } catch {
      /* nothing to clean up if the write itself was denied */
    }
  }
}
