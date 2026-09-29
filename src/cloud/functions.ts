/* ============================================================
   Calling our own edge functions

   One request shape for all of them — the same headers the Novella AI
   provider sends (hostedAi.ts): the session token proves who is
   asking, and the publishable key is what Supabase's gateway wants
   before it will route the call at all.

   Nothing here touches supabase-js or a window, and fetch is
   injectable, so test-account.ts proves the request and the reply
   handling without a network.
   ============================================================ */

import type { HostedAccess } from "./hostedAi";
import { handoffUrl, readFunctionReply } from "./authCore";

export interface FunctionResponse {
  status: number;
  body: unknown;
}

const OFFLINE = "Couldn't reach the cloud. Check the connection and try again.";

export async function callFunction(
  access: HostedAccess,
  name: string,
  body: unknown,
  fetchImpl: typeof fetch = (...args) => fetch(...args),
): Promise<FunctionResponse> {
  let res: Response;
  try {
    res = await fetchImpl(`${access.url}/functions/v1/${name}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${access.token}`,
        apikey: access.anonKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error(OFFLINE);
  }
  let parsed: unknown = null;
  try {
    parsed = await res.json();
  } catch {
    // A gateway error page, or nothing; readFunctionReply falls back.
  }
  return { status: res.status, body: parsed };
}

/** Ask create-checkout for a page to send the writer to, and get back
    either an https URL or the sentence explaining why not. */
export async function requestHandoff(
  access: HostedAccess,
  body: unknown,
  fallback: string,
  fetchImpl?: typeof fetch,
): Promise<string> {
  const res = await callFunction(access, "create-checkout", body, fetchImpl);
  const url = handoffUrl(readFunctionReply(res.status, res.body, fallback), fallback);
  if (!url.ok) throw new Error(url.message);
  return url.url;
}
