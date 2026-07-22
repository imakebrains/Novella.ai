import { isTauri } from "./storage";
import { desktopLog } from "./debug";
import { listOllamaModels, ollamaReachable } from "./plugins/providers/ollama";

/* Startup diagnostic for the local AI setup.

   Returns its findings as well as logging them. The first version only
   logged, which meant the only way to read it was to force a fresh mount
   and scrape the `tauri dev` output file — slow, and impossible from the
   browser build. Returning a value makes it callable from anywhere,
   including the dev console via window.__novella.probe(). */

export interface SetupReport {
  tauri: boolean;
  /** Whether the app's own process can find the ollama binary. Distinct
      from apiReachable: a GUI process can inherit a narrower PATH. */
  ollamaOnPath: boolean | null;
  wingetAvailable: boolean | null;
  apiReachable: boolean;
  models: string[];
  probeError: string | null;
}

export async function probeSetup(): Promise<SetupReport> {
  const report: SetupReport = {
    tauri: isTauri(),
    ollamaOnPath: null,
    wingetAvailable: null,
    apiReachable: false,
    models: [],
    probeError: null,
  };

  if (report.tauri) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      report.ollamaOnPath = await invoke<boolean>("ollama_installed");
      report.wingetAvailable = await invoke<boolean>("winget_available");
    } catch (err) {
      report.probeError = err instanceof Error ? err.message : String(err);
    }
  }

  report.apiReachable = await ollamaReachable();
  if (report.apiReachable) {
    try {
      report.models = (await listOllamaModels()).map((m) => m.name);
    } catch {
      report.probeError = report.probeError ?? "could not list models";
    }
  }

  desktopLog(
    `setup: tauri=${report.tauri} ollamaOnPath=${report.ollamaOnPath} ` +
      `winget=${report.wingetAvailable} apiReachable=${report.apiReachable} ` +
      `models=[${report.models.join(", ")}]` +
      (report.probeError ? ` error=${report.probeError}` : ""),
  );

  return report;
}
