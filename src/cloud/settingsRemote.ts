/* The user_settings row over Supabase.

   It never creates the client — it takes the one appClient() hands over,
   because only auth.ts knows where the session is allowed to live. RLS
   lets a writer select only their own row, so no filter is needed; the
   write goes through put_settings(), the only path that can change it. */

import type { SupabaseClient } from "@supabase/supabase-js";
import { parsePutReply, parseSettingsRow, type SettingsRemote } from "./settingsSync";

export function supabaseSettings(client: SupabaseClient): SettingsRemote {
  return {
    async read() {
      const { data, error } = await client.from("user_settings").select("doc,version").maybeSingle();
      if (error) throw error;
      return parseSettingsRow(data);
    },
    async put(baseVersion, doc) {
      const { data, error } = await client.rpc("put_settings", { p_base_version: baseVersion, p_doc: doc });
      if (error) throw error;
      return parsePutReply(data);
    },
  };
}
