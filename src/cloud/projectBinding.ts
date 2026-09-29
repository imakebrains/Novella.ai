/* ============================================================
   Joining a book on this device to a book in the cloud

   Three doors: sync a local book (creates its cloud twin), stop
   syncing (deletes nothing, anywhere), and open a cloud book here
   (makes an empty local book and lets the first round fill it).

   Typechecked only — projects.ts reads localStorage at import time,
   so nothing that imports it can run in node. The pure halves live in
   bindingMap.ts and are tested there.
   ============================================================ */

import { useSyncExternalStore } from "react";
import { storage } from "../storage";
import type { WebStorage } from "../storage/webStorage";
import { store } from "../state/vaultStore";
import { projectStore, type Project } from "../state/projects";
import { createProject, type CloudProject } from "./supabaseRemote";
import {
  BINDINGS_KEY,
  defaultDeviceName,
  localProjectFor,
  readBindings,
  webRootFor,
  withBinding,
  withoutBinding,
  writeBindings,
  type BindingMap,
  type PlainKV,
} from "./bindingMap";
import { bindingsChanged, cloudAccess, subscribeBindings } from "./syncHost";

/** A sentence written here for the writer. Anything else thrown on these
    paths may carry a raw server message, which never reaches the screen
    (wire.ts) — the UI tells the two apart by this class. */
export class BindingError extends Error {}

function kv(): PlainKV {
  return globalThis.localStorage;
}

async function signedInClient() {
  const client = await cloudAccess()?.client();
  if (!client) throw new BindingError("Cloud sync is off in this build.");
  const { data } = await client.auth.getSession();
  if (!data.session) throw new BindingError("Sign in first.");
  return client;
}

function bind(projectId: string, cloudProjectId: string): Promise<void> {
  writeBindings(kv(), withBinding(readBindings(kv()), projectId, { cloudProjectId, deviceName: defaultDeviceName() }));
  return bindingsChanged();
}

/** Create this book's twin in the cloud and start syncing it. On the
    Free plan with a book already synced, createProject throws
    plan_limit:projects — the caller shows describeCloudError(err), so
    the limit is explained at the moment it bites. */
export async function bindProject(project: Project): Promise<void> {
  if (!project.path) throw new BindingError("The demo world lives only in memory. Save it as a book first, then sync that.");
  const client = await signedInClient();
  const cloud = await createProject(client, project.name);
  await bind(project.id, cloud.id);
}

/** Stop syncing. The cloud copy and the folder are both untouched —
    stopping sync is never a way to lose a book. */
export function unbindProject(projectId: string): Promise<void> {
  writeBindings(kv(), withoutBinding(readBindings(kv()), projectId));
  return bindingsChanged();
}

/** Open a cloud book on this device. Returns null when the writer
    cancelled the folder picker. A desktop folder that already holds
    files gets them pushed by the first scan, and paths both sides have
    become conflict copies — nothing is lost, but the section tells the
    writer to pick an empty folder. */
export async function openCloudProject(cloud: CloudProject): Promise<Project | null> {
  const already = localProjectFor(readBindings(kv()), cloud.id);
  if (already) {
    const existing = projectStore.all().find((p) => p.id === already);
    if (existing?.path) {
      await switchTo(existing);
      return existing;
    }
  }
  const backing = storage();
  let root: string | null;
  if (backing.kind === "web") {
    // The same slug rule as ProjectsPanel's createWeb, minus the starter
    // files — the cloud fills the folder. Orphaned IndexedDB roots count
    // as taken too: adopting one would push a forgotten book's files
    // into this one.
    const taken = projectStore.all().map((p) => p.path ?? "");
    const web = backing as WebStorage;
    root = webRootFor(cloud.name, taken);
    while (await web.rootExists(root)) {
      taken.push(root);
      root = webRootFor(cloud.name, taken);
    }
  } else {
    root = await backing.pickFolder();
    if (!root) return null;
  }
  const project = projectStore.add({ name: cloud.name, path: root });
  const ok = await store.openFolderAt(root);
  if (!ok) throw new BindingError(store.error() ?? "Could not open the folder.");
  projectStore.setActive(project.id);
  // Bind after the switch, so the host binds the book on screen: scan
  // finds an empty folder, the first round pulls everything, and the
  // reload that follows shows it.
  await bind(project.id, cloud.id);
  return project;
}

/** The ProjectsPanel switch: open the folder, then make it active. */
export async function switchTo(project: Project): Promise<void> {
  if (!project.path) return;
  const ok = await store.openFolderAt(project.path);
  if (!ok) throw new BindingError(`Could not open ${project.path}. Has the folder moved or been renamed?`);
  projectStore.setActive(project.id);
}

/* ---------------- for React ---------------- */

let snapshot: BindingMap = {};
let snapshotRaw: string | null | undefined;

function readSnapshot(): BindingMap {
  let raw: string | null = null;
  try {
    raw = kv().getItem(BINDINGS_KEY);
  } catch {
    raw = null;
  }
  // Same string, same object: useSyncExternalStore re-renders forever
  // on a snapshot that is a new object every call.
  if (raw !== snapshotRaw) {
    snapshotRaw = raw;
    snapshot = readBindings(kv());
  }
  return snapshot;
}

export function useBindings(): BindingMap {
  return useSyncExternalStore(subscribeBindings, readSnapshot, readSnapshot);
}
