/// <reference types="vite/client" />

/** Injected by Vite's `define` from package.json at build time. */
declare const __APP_VERSION__: string;

/** Assets imported with ?inline arrive as data URLs — used for the
    intro art so a flaky fetch can never blank an image. */
declare module "*?inline" {
  const src: string;
  export default src;
}
