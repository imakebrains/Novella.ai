import { isTauri } from "./storage";

/* Diagnostics that need to escape the WebView.

   In the browser, console.log is readable. Inside the Tauri window it is
   not, without opening devtools by hand — so on desktop these go through
   a Rust command and land in the `tauri dev` terminal output. */

export function desktopLog(message: string): void {
  if (!isTauri()) {
    console.log("[novella]", message);
    return;
  }
  void import("@tauri-apps/api/core")
    .then(({ invoke }) => invoke("debug_log", { message }))
    .catch(() => {
      /* diagnostics must never break the app */
    });
}
