/* Assertions for vault safety in a synced folder — Phase D.

   Same shape as test-units.ts and test-trash.ts: silent unless something
   is wrong, non-zero exit when it is.

   What is worth proving here, and why:

   • The TEMP NAME. D1's whole atomic-write scheme depends on the scratch
     file being invisible to the vault. If that ever stops being true a
     writer opens their book and finds a phantom chapter in the codex, so
     the claim is checked against the actual adapter filters rather than
     against a comment.

   • The DON'T-CLOBBER TABLE. Three inputs, three outcomes, and one of
     the outcomes means "refuse to save". Every cell is asserted,
     especially the ones where we know nothing — those must all resolve
     to "write", because hardening that invents a new way to lose a save
     has failed at its only job.

   • The CONFLICT-COPY CLASSIFIER. Recognising junk is the easy half.
     The hard half is NOT flagging `Act 2.md`, so the false-positive
     cases get more assertions than the true positives do.

   • The ID HIJACK. A sync client's copy carries the original note's
     frontmatter id verbatim. Loading one evicts the real chapter from
     the index — the single most expensive bug this feature could have —
     so it is exercised end to end through the real store against the
     memory adapter, not just reasoned about.

   The filesystem half (temp write, rename, retry, fallback) needs a real
   Tauri shell and is verified in the app; everything reachable from node
   is here. */

import {
  SERIES_ESCAPE,
  TEMP_MARKER,
  classifyVaultFile,
  decideWrite,
  diskChanged,
  extensionOf,
  isTempPath,
  keepBothPathFor,
  partitionVaultFiles,
  sidecarPathFor,
  splitPath,
  stemOf,
  tempPathFor,
  uniqueIdAmong,
  type SaveVerdict,
} from "./src/storage/vaultSafety";
import { storage } from "./src/storage";
import { store } from "./src/state/vaultStore";

let failures = 0;
let checks = 0;

function check(name: string, actual: unknown, expected: unknown): void {
  checks++;
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    failures++;
    console.error(`FAIL  ${name}\n        expected ${e}\n        actual   ${a}`);
  }
}

function ok(name: string, condition: boolean): void {
  checks++;
  if (!condition) {
    failures++;
    console.error(`FAIL  ${name}`);
  }
}

/* ============================================================
   Paths
   ============================================================ */

{
  check("split: nested path", splitPath("Manuscript/Act-1/01.md"), {
    dir: "Manuscript/Act-1/",
    base: "01.md",
  });
  check("split: root file", splitPath("README.md"), { dir: "", base: "README.md" });
  check("split: backslashes survive", splitPath("Manuscript\\01.md"), {
    dir: "Manuscript\\",
    base: "01.md",
  });

  check("ext: ordinary", extensionOf("Chapter 7.md"), ".md");
  check("ext: none", extensionOf("Makefile"), "");
  check("ext: a dotfile has no extension", extensionOf(".gitignore"), "");
  check("stem: strips the extension", stemOf("Chapter 7.md"), "Chapter 7");
  check("stem: leaves an extensionless name", stemOf("Makefile"), "Makefile");
}

/* ============================================================
   D1 — the temp file the vault must never see
   ============================================================ */

{
  const target = "Manuscript/Act-1/Chapter 7.md";
  const temp = tempPathFor(target, "k3f9");

  check("temp: sits beside its target", splitPath(temp).dir, splitPath(target).dir);
  ok("temp: hidden by a leading dot", splitPath(temp).base.startsWith("."));
  ok("temp: not a .md file", !temp.toLowerCase().endsWith(".md"));
  ok("temp: carries the marker", temp.includes(TEMP_MARKER));
  ok("temp: recognises itself", isTempPath(temp));

  // The two filters the adapters actually apply, quoted from the source.
  // tauriStorage skips any entry whose NAME starts with a dot; webStorage
  // and memoryStorage skip any PATH starting with "." or containing "/.".
  ok("temp: skipped by the disk adapter's filter", splitPath(temp).base.startsWith("."));
  ok(
    "temp: skipped by the browser adapters' filter",
    temp.startsWith(".") || temp.includes("/."),
  );

  check("temp: root-level target", tempPathFor("Notes.md", "ab"), `.Notes.md${TEMP_MARKER}-ab`);
  check(
    "temp: a hostile token is scrubbed to something path-safe",
    tempPathFor("a.md", "../../etc"),
    `.a.md${TEMP_MARKER}-etc`,
  );
  check("temp: an empty token still yields a name", tempPathFor("a.md", ""), `.a.md${TEMP_MARKER}-0`);

  // Two windows on one vault must not pick the same scratch name.
  ok("temp: different tokens, different files", tempPathFor("a.md", "x") !== tempPathFor("a.md", "y"));

  // A temp file left by a crashed older build still has to be recognised,
  // or it rides into the next backup zip as if it were content.
  ok("temp: tolerates a missing token", isTempPath(`.Chapter 7.md${TEMP_MARKER}`));
  ok("temp: recognised in a subfolder", isTempPath(`Manuscript/.Chapter 7.md${TEMP_MARKER}-9z`));

  ok("temp: a real note is not temp", !isTempPath("Manuscript/Chapter 7.md"));
  ok("temp: a dotfile is not temp", !isTempPath(".gitignore"));
  ok("temp: a note merely mentioning the marker is not temp", !isTempPath("The novella-tmp story.md"));
}

/** End to end through a real adapter: the memory adapter applies the same
    visibility rule the browser and disk adapters do, so a temp file
    written into it must not come back as a note. */
async function tempIsInvisible(): Promise<void> {
  const mem = storage();
  const temp = tempPathFor("Manuscript/Chapter 7.md", "probe");
  await mem.write("", temp, "half a save");
  const seen = (await mem.readAll("")).map((f) => f.path);
  ok("temp: readAll does not return it", !seen.includes(temp));
  await mem.remove("", temp);
}

/* ============================================================
   D2 — the don't-clobber decision
   ============================================================ */

{
  const verdict = (ourMtime: number | null, diskMtime: number | null, dirty: boolean): SaveVerdict =>
    decideWrite({ ourMtime, diskMtime, dirty });

  // Nothing moved.
  check("clobber: unchanged file, dirty note", verdict(1000, 1000, true), "write");
  check("clobber: unchanged file, clean note", verdict(1000, 1000, false), "write");

  // Somebody else got there first.
  check("clobber: disk newer + local edits refuses to write", verdict(1000, 2000, true), "conflict");
  check("clobber: disk newer + nothing to keep reloads", verdict(1000, 2000, false), "reload");

  // Ignorance always resolves to "write". This is the load-bearing row.
  check("clobber: no baseline is not evidence", verdict(null, 2000, true), "write");
  check("clobber: no stat is not evidence", verdict(1000, null, true), "write");
  check("clobber: neither is known", verdict(null, null, true), "write");

  // An mtime that went BACKWARDS is a clock change or a restore, not a
  // newer edit. Refusing to save over it would strand the writer.
  check("clobber: an older disk mtime still writes", verdict(2000, 1000, true), "write");

  // Equal counts as unchanged, deliberately. We re-stat after every one
  // of our own writes and store that exact value, so an unmoved number
  // means an untouched file — and a skew tolerance here would be a
  // window in which a real conflict is silently overwritten.
  check("clobber: equal mtimes are unchanged", diskChanged(1000, 1000), false);
  check("clobber: strictly greater is a change", diskChanged(1000, 1001), true);
  check("clobber: unknown baseline", diskChanged(null, 1001), false);
  check("clobber: unknown disk", diskChanged(1000, null), false);

  // The cheap gate and the full rule must never disagree.
  const times: (number | null)[] = [null, 0, 1000, 1001];
  for (const a of times) {
    for (const b of times) {
      for (const dirty of [true, false]) {
        const agree = diskChanged(a, b) === (decideWrite({ ourMtime: a, diskMtime: b, dirty }) !== "write");
        ok(`clobber: gate agrees with rule (${a}, ${b}, ${dirty})`, agree);
      }
    }
  }
}

/* ============================================================
   Keep both, and sidecar names in general
   ============================================================ */

{
  check("keepBoth: first copy", keepBothPathFor("Manuscript/Chapter 7.md", []), "Manuscript/Chapter 7 (my version).md");
  check(
    "keepBoth: steps aside when taken",
    keepBothPathFor("Manuscript/Chapter 7.md", ["Manuscript/Chapter 7 (my version).md"]),
    "Manuscript/Chapter 7 (my version 2).md",
  );
  check(
    "keepBoth: keeps stepping",
    keepBothPathFor("Chapter 7.md", ["Chapter 7 (my version).md", "Chapter 7 (my version 2).md"]),
    "Chapter 7 (my version 3).md",
  );
  check(
    "sidecar: arbitrary label",
    sidecarPathFor("Manuscript/Chapter 7.md", "from another device", []),
    "Manuscript/Chapter 7 (from another device).md",
  );
  // A name we chose on purpose must never be re-read as sync junk on the
  // next open, or the app would keep flagging its own output.
  check(
    "keepBoth: our own name is not a conflict copy",
    classifyVaultFile(keepBothPathFor("Chapter 7.md", [])).kind,
    "note",
  );
  check(
    "sidecar: 'from another device' is not a conflict copy",
    classifyVaultFile(sidecarPathFor("Chapter 7.md", "from another device", [])).kind,
    "note",
  );
}

{
  check("uniqueId: free id is kept", uniqueIdAmong("chapter-7", []), "chapter-7");
  check("uniqueId: taken id steps aside", uniqueIdAmong("chapter-7", ["chapter-7"]), "chapter-7-2");
  check(
    "uniqueId: keeps stepping",
    uniqueIdAmong("chapter-7", ["chapter-7", "chapter-7-2"]),
    "chapter-7-3",
  );
}

/* ============================================================
   D3 — recognising a sync client's handwriting
   ============================================================ */

{
  const service = (path: string): string => classifyVaultFile(path).service ?? "none";
  const origin = (path: string): string => classifyVaultFile(path).origin ?? "none";

  // Dropbox, with and without a device name.
  check("classify: dropbox named", service("Chapter 7 (Drew's conflicted copy 2026-08-19).md"), "dropbox");
  check("classify: dropbox plain", service("Chapter 7 (conflicted copy 2026-08-19).md"), "dropbox");
  check(
    "classify: dropbox origin",
    origin("Manuscript/Chapter 7 (Drew's conflicted copy 2026-08-19).md"),
    "Manuscript/Chapter 7.md",
  );
  // The curly apostrophe macOS actually inserts.
  check("classify: dropbox smart quote", service("Chapter 7 (Drew’s conflicted copy 2026-08-19).md"), "dropbox");

  // Syncthing.
  check("classify: syncthing", service("Chapter 7.sync-conflict-20260819-140523-K3F9QW2.md"), "syncthing");
  check(
    "classify: syncthing origin",
    origin("Manuscript/Chapter 7.sync-conflict-20260819-140523-K3F9QW2.md"),
    "Manuscript/Chapter 7.md",
  );

  // OneDrive stamps the device name on.
  check("classify: onedrive desktop", service("Chapter 7-DESKTOP-AB12.md"), "onedrive");
  check("classify: onedrive laptop", service("Chapter 7-LAPTOP-9QZ.md"), "onedrive");
  check("classify: onedrive origin", origin("Chapter 7-DESKTOP-AB12.md"), "Chapter 7.md");

  // Google Drive numbers its copies.
  check("classify: drive", service("Chapter 7 (1).md"), "drive");
  check("classify: drive origin", origin("Chapter 7 (1).md"), "Chapter 7.md");
  // Stacked suffixes claim the file one step up, not all the way back.
  check("classify: drive stacked origin", origin("Chapter 7 (1) (1).md"), "Chapter 7 (1).md");

  // iCloud just adds a number.
  check("classify: icloud", service("Chapter 7 2.md"), "icloud");
  check("classify: icloud origin", origin("Chapter 7 2.md"), "Chapter 7.md");

  // Our own scratch, and the vault's own hidden furniture.
  check("classify: temp", classifyVaultFile(tempPathFor("Chapter 7.md", "z")).kind, "temp");
  check("classify: dotfile", classifyVaultFile(".gitignore").kind, "hidden");
  check("classify: inside a dotfolder", classifyVaultFile(".novella/trash/items/x.md").kind, "hidden");

  /* ---- the two tiers of confidence ----

     "conflicted copy", ".sync-conflict-" and "-DESKTOP-" are things no
     human types, so the name alone convicts. A bare trailing number is
     not: `Chapter 7.md` is the commonest filename in a novel and it is
     also exactly the shape of an iCloud copy. Those come back marked
     requiresOrigin, and only partitionVaultFiles — which can see
     whether `Chapter.md` is sitting next to it — settles them. */

  ok(
    "classify: dropbox needs no corroboration",
    classifyVaultFile("Chapter 7 (conflicted copy 2026-08-19).md").requiresOrigin !== true,
  );
  ok(
    "classify: syncthing needs no corroboration",
    classifyVaultFile("Chapter 7.sync-conflict-20260819-140523-K3F9QW2.md").requiresOrigin !== true,
  );
  ok(
    "classify: onedrive needs no corroboration",
    classifyVaultFile("Chapter 7-DESKTOP-AB12.md").requiresOrigin !== true,
  );
  ok("classify: drive numbering is only a suspicion", classifyVaultFile("Chapter 7 (1).md").requiresOrigin === true);
  ok("classify: so is a bare trailing number", classifyVaultFile("Chapter 7 2.md").requiresOrigin === true);
  ok(
    "classify: which is why an ordinary chapter is only a suspicion too",
    classifyVaultFile("Manuscript/Chapter 7.md").requiresOrigin === true,
  );
  check(
    "classify: and it loads as a note once nothing corroborates it",
    partitionVaultFiles([{ path: "Manuscript/Chapter 7.md" }]).notes.length,
    1,
  );

  /* ---- and now the half that matters more: leaving prose alone ---- */

  check("classify: a character sheet", classifyVaultFile("Codex/Characters/Wren-Calloway.md").kind, "note");
  // "FINAL" is five uppercase characters, which a loose OneDrive rule
  // would have swallowed whole.
  check("classify: a chapter called FINAL", classifyVaultFile("Act 2-FINAL.md").kind, "note");
  check("classify: a hyphenated title", classifyVaultFile("The Compass-That-Lies.md").kind, "note");
  // A number too big to be a copy index is a year in a title.
  check("classify: a year in the name", classifyVaultFile("Halden 1892.md").kind, "note");
  // "1" is never a conflict index — the first copy is "2".
  check("classify: chapter one", classifyVaultFile("Chapter 1.md").kind, "note");
  // A name that is nothing BUT the suffix is not a copy of anything.
  check("classify: bare number", classifyVaultFile("2.md").kind, "note");
  check("classify: bare drive suffix", classifyVaultFile("(1).md").kind, "note");
}

/* ============================================================
   D3, in context: an ambiguous name is only junk when the file it
   claims to be a copy of is actually sitting next to it.
   ============================================================ */

{
  const paths = (list: string[]) => list.map((path) => ({ path }));
  const names = (list: { path: string }[]) => list.map((f) => f.path);

  {
    const out = partitionVaultFiles(paths(["Manuscript/Chapter 7.md", "Manuscript/Chapter 7 (1).md"]));
    check("partition: drive copy beside its origin is flagged", names(out.conflicts.map((c) => c.file)), [
      "Manuscript/Chapter 7 (1).md",
    ]);
    check("partition: the original still loads", names(out.notes), ["Manuscript/Chapter 7.md"]);
  }

  {
    // No "Chapter 7.md" anywhere, so "(1)" is just a name someone chose.
    const out = partitionVaultFiles(paths(["Manuscript/Chapter 7 (1).md"]));
    check("partition: orphan drive-shaped name loads as a note", names(out.notes), [
      "Manuscript/Chapter 7 (1).md",
    ]);
    check("partition: and is not flagged", out.conflicts.length, 0);
  }

  {
    // The disaster case. A writer with Act.md plus Act 2..Act 5 is using
    // numbers, not losing a sync fight, and flagging four of their acts
    // would be a catastrophe dressed as a safety feature.
    const out = partitionVaultFiles(
      paths(["Act.md", "Act 2.md", "Act 3.md", "Act 4.md", "Act 5.md"]),
    );
    check("partition: a numbered series is left alone", out.conflicts.length, 0);
    check("partition: all five load", out.notes.length, 5);
  }

  {
    // Below the escape threshold, with the origin present, it IS treated
    // as a copy — two files is what an iCloud conflict looks like.
    const out = partitionVaultFiles(paths(["Act.md", "Act 2.md"]));
    check("partition: a lone numbered sibling is flagged", names(out.conflicts.map((c) => c.file)), ["Act 2.md"]);
  }

  ok("partition: the escape threshold is documented as 3", SERIES_ESCAPE === 3);

  {
    // Parenthesised Drive names get no series escape — nobody numbers
    // their chapters "(1)", "(2)", "(3)".
    const out = partitionVaultFiles(
      paths(["Chapter 7.md", "Chapter 7 (1).md", "Chapter 7 (2).md", "Chapter 7 (3).md"]),
    );
    check("partition: three drive copies are all flagged", out.conflicts.length, 3);
  }

  {
    // Confident patterns never need an origin: Dropbox junk is junk even
    // if the original was moved away.
    const out = partitionVaultFiles(paths(["Chapter 7 (Drew's conflicted copy 2026-08-19).md"]));
    check("partition: dropbox junk flagged without its origin", out.conflicts.length, 1);
  }

  {
    const out = partitionVaultFiles(
      paths(["Chapter 7.md", tempPathFor("Chapter 7.md", "abc"), ".gitignore"]),
    );
    check("partition: noise is skipped, not flagged", out.conflicts.length, 0);
    check("partition: noise is skipped, not loaded", names(out.notes), ["Chapter 7.md"]);
    check("partition: and it is accounted for", out.skipped.length, 2);
  }

  {
    // Windows and macOS filesystems are case-insensitive; a rule that
    // only fires on Linux is worse than no rule.
    const out = partitionVaultFiles(paths(["Manuscript/chapter 7.md", "Manuscript/Chapter 7 (1).md"]));
    check("partition: origin match ignores case", out.conflicts.length, 1);
  }

  {
    // Same name, different folders. The copy belongs to ITS folder's
    // original, not to a same-named file somewhere else in the book.
    const out = partitionVaultFiles(paths(["Act-1/Chapter 7.md", "Act-2/Chapter 7 (1).md"]));
    check("partition: origin must be in the same folder", out.conflicts.length, 0);
    check("partition: so the stray loads as a note", out.notes.length, 2);
  }

  {
    check("partition: nothing in, nothing out", partitionVaultFiles([]).notes.length, 0);
  }
}

/* ============================================================
   Through the real store, against the memory adapter

   Two claims that a pure test cannot make:

     • A conflict copy never reaches the index, so it can never evict
       the chapter it is a copy of.
     • The browser and memory adapters are no worse off than before —
       no mtime, no rename, no stat, and saving still works.
   ============================================================ */

const CHAPTER = "Manuscript/Chapter 7.md";
const COPY = "Manuscript/Chapter 7 (Drew's conflicted copy 2026-08-19).md";

async function storeTests(): Promise<void> {
  const mem = storage();
  check("store: node falls back to the memory adapter", mem.kind, "memory");

  // Both files carry the SAME frontmatter id, which is exactly what a
  // sync client produces: it copies the bytes, id included.
  await mem.write("", CHAPTER, "---\ntype: chapter\nid: chapter-7\nname: Chapter 7\n---\nThe fog folded over the harbor.");
  await mem.write("", COPY, "---\ntype: chapter\nid: chapter-7\nname: Chapter 7\n---\nThe fog closed over the harbor.");

  ok("store: reload succeeds", await store.reloadFromStorage());

  const flagged = store.conflictCopies();
  check("store: the copy is flagged", flagged.map((f) => f.file.path), [COPY]);
  check("store: and named as Dropbox's doing", flagged[0]?.info.service, "dropbox");

  const seven = store.vault.get("chapter-7");
  ok("store: the real chapter survived the copy", seven !== undefined);
  check("store: with its own prose", seven?.body, "The fog folded over the harbor.");
  check("store: and its own path", seven?.path, CHAPTER);
  check("store: links still resolve to it", store.vault.resolveLink("Chapter 7")?.id, "chapter-7");

  /* ---- keeping it ---- */

  const keptId = await store.adoptConflictCopy(COPY);
  ok("store: adopting returns a new id", typeof keptId === "string");
  const kept = keptId ? store.vault.get(keptId) : undefined;
  ok("store: the copy is now a note", kept !== undefined);
  check("store: under a readable name", kept?.path, "Manuscript/Chapter 7 (from another device).md");
  ok("store: with an id of its own", kept?.id !== "chapter-7");
  ok("store: and a title that steals no links", store.vault.resolveLink("Chapter 7")?.id === "chapter-7");
  check("store: its prose came across intact", kept?.body, "The fog closed over the harbor.");
  check("store: nothing is left flagged", store.conflictCopies().length, 0);

  const onDisk = (await mem.readAll("")).map((f) => f.path);
  ok("store: the renamed file was written", onDisk.includes("Manuscript/Chapter 7 (from another device).md"));
  ok("store: the sync client's file is gone", !onDisk.includes(COPY));
  ok("store: the original chapter is untouched", onDisk.includes(CHAPTER));

  /* ---- the browser/memory degradation path ---- */

  check("store: nothing left unsaved", store.dirtyCount(), 0);
  check("store: and no error was raised", store.error(), null);
  check("store: no conflicts are possible without mtimes", store.conflictCount(), 0);

  store.setBody("chapter-7", "The fog folded over the harbor, thick as wool.");
  check("store: an edit marks the note dirty", store.dirtyCount(), 1);
  await store.saveAll();
  check("store: and a plain save still lands", store.dirtyCount(), 0);
  check("store: with no guard error", store.error(), null);
  const saved = (await mem.readAll("")).find((f) => f.path === CHAPTER);
  ok("store: the words reached the adapter", saved?.contents.includes("thick as wool") === true);

  /* ---- leaving one alone ---- */

  await mem.write("", COPY, "---\ntype: chapter\nid: chapter-7\nname: Chapter 7\n---\nA third version.");
  await store.reloadFromStorage();
  check("store: flagged again on the next open", store.conflictCopies().length, 1);
  store.forgetConflictCopy(COPY);
  check("store: 'leave it alone' clears the prompt", store.conflictCopies().length, 0);
  const stillThere = (await mem.readAll("")).map((f) => f.path);
  ok("store: and never touches the file", stillThere.includes(COPY));

  /* ---- staging one for the trash ---- */

  await store.reloadFromStorage();
  const staged = store.stageConflictCopyForTrash(COPY);
  ok("store: staging yields a note", staged !== null);
  ok("store: with an id that evicts nothing", staged?.id !== "chapter-7");
  ok("store: and a title that hijacks no links", store.vault.resolveLink("Chapter 7")?.id === "chapter-7");
  // Staged, deliberately, NOT dirty: an autosave firing between here and
  // the trash write would otherwise save it straight back out.
  ok("store: staged copies are never queued for saving", staged !== null && !store.isDirty(staged.id));
  check("store: and it leaves the flagged list", store.conflictCopies().length, 0);
}

/* ---------- report ---------- */

void (async () => {
  await tempIsInvisible();
  await storeTests();

  if (failures > 0) {
    console.error(`\n${failures} of ${checks} checks FAILED`);
    process.exit(1);
  }
  console.log(`storage tests: ${checks} checks passed`);
})();
