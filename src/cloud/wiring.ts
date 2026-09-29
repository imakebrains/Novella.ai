/* ============================================================
   Plugging the one sign-in into everything that needs it

   Three items were built in parallel and each left a seam rather than
   reach into another's module: the sync host takes a CloudAccess, the
   Novella AI connection takes a HostedAccessSource, and auth.ts owns the
   only client. This file is where they meet, so none of the three has
   to import the others, and auth.ts stays the only module that makes
   the client (test-account.ts holds that line).

   Neither seam loads supabase-js on its own: the sync host asks for a
   client only when this device has a book bound to the cloud, and the
   hosted-AI source checks signedIn() first. A writer who never signs in
   downloads none of it. Settings sync is the fourth seam, on the same
   terms: it asks for the client only while someone is signed in.
   ============================================================ */

import { appClient, authStore, hostedAccess } from "./auth";
import { setHostedAccessSource } from "./hostedAccess";
import { myAccount } from "./supabaseRemote";
import { provideCloudAccess } from "./syncHost";
import { installSettingsSync } from "./settingsHost";

export function wireCloud(): void {
  provideCloudAccess({
    client: appClient,
    onAuthChange: (fn) => authStore.subscribe(fn),
  });
  setHostedAccessSource({
    signedIn: () => authStore.getSnapshot().status === "signed-in",
    getHostedAccess: hostedAccess,
    readAccount: async () => {
      const client = await appClient();
      return client ? myAccount(client) : null;
    },
    onChange: (fn) => authStore.subscribe(fn),
  });
  installSettingsSync({
    client: appClient,
    session: () => authStore.getSnapshot(),
    onAuthChange: (fn) => authStore.subscribe(fn),
  });
}
