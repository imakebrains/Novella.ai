/* ============================================================
   The desktop's SecretStore: the OS keychain

   The same three Rust commands the plugin host uses for API keys
   (src/plugins/runtime.ts), shaped as the SecretStore that
   splitSessionStorage wants. Only the refresh-token half of a session
   ever comes through here — Windows Credential Manager refuses secrets
   over 2,560 bytes, which is why the session is split at all (see
   sessionStorage.ts).

   Desktop only. In a browser `invoke` does not exist, and auth.ts
   never builds this store there.
   ============================================================ */

import type { SecretStore } from "./sessionStorage";

export function keychainSecrets(): SecretStore {
  return {
    async get(name) {
      const { invoke } = await import("@tauri-apps/api/core");
      return ((await invoke("secret_get", { name })) as string | null) ?? null;
    },
    async set(name, value) {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("secret_set", { name, value });
    },
    async remove(name) {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("secret_delete", { name });
    },
  };
}
