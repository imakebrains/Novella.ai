import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { version } from "./package.json";

// gray-matter reaches for Node's Buffer; the browser build needs it aliased.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { buffer: "buffer/" },
  },
  define: {
    global: "globalThis",
    // The app's own version, for the update checker.
    __APP_VERSION__: JSON.stringify(version),
  },
  server: {
    port: 5173,
    // Fail loudly instead of silently moving to 5174. A dev server that
    // relocates itself makes every "open the app" instruction wrong and
    // hides the fact that a stale server is still holding the port.
    strictPort: true,
    watch: {
      // Never watch the Rust build tree. Cargo holds locks on the .exe files
      // in target/, and the watcher dies with EBUSY the moment it touches one.
      ignored: ["**/src-tauri/**"],
    },
  },
});
