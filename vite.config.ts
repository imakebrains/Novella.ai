import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { version } from "./package.json";

/* One config, two targets: the Tauri desktop bundle and the hosted web
   build (`--mode web`, deployed to GitHub Pages).

   `base: "./"` matters more than it looks. Root-absolute asset URLs 404
   under a project subpath like /Novella.ai/, and hard-coding that subpath
   would break the day a real domain shows up. Relative paths work at the
   subpath, at a domain root, AND under Tauri's custom protocol — one
   setting, all three homes. Safe here because there's no client-side
   router, a single HTML entry, and no url() references in the CSS. */

/* The desktop build gets its CSP from tauri.conf.json. A hosted page gets
   nothing — GitHub Pages can't set response headers — so the web build
   carries its own in a meta tag. Same policy minus the Tauri-only bits
   (ipc:, http://ipc.localhost), and mode-gated so it never lands in the
   desktop bundle and collides with Tauri's own header. */
const WEB_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  // The writer's own AI provider is reached directly from the page; a
  // local Ollama lives on localhost. No Novella server exists to talk to.
  "connect-src 'self' https: http://localhost:* http://127.0.0.1:*",
  "frame-src https://open.spotify.com https://www.youtube-nocookie.com https://w.soundcloud.com https://embed.music.apple.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join("; ");

export default defineConfig(({ mode }) => ({
  base: "./",
  plugins: [
    react(),
    ...(mode === "web"
      ? [
          {
            name: "novella-web-csp",
            transformIndexHtml(html: string) {
              return html.replace(
                "</title>",
                `</title>\n    <meta http-equiv="Content-Security-Policy" content="${WEB_CSP}" />`,
              );
            },
          },
        ]
      : []),
  ],
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
      //
      // writing-skills/ is reference material vendored into the repo, and it
      // contains a self-referential symlink:
      //   vendor/story-skills/plugins/story-skills -> ..
      // The watcher follows that forever, building a path out of repeated
      // "plugins/story-skills" until the stat call fails and takes the whole
      // dev server down with it. Nothing in there is app source, so the fix
      // is simply not to look.
      ignored: ["**/src-tauri/**", "**/writing-skills/**"],
    },
  },
}));
