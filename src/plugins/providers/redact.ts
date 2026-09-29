/* Provider error text reaches the writer word for word on purpose (see
   humanTestError in connections.ts) — the server's own sentence is
   usually the most useful one. But an OpenAI-compatible server is
   anyone's code, and some echo the Authorization value straight back
   ("Incorrect API key provided: sk-…"). That sentence then lands in a
   probe detail, a toast, the Assistant panel. Strip the key first.

   split/join rather than a RegExp: keys carry + . * ( and friends, and
   an escaping step is one more thing to get wrong. Anything under eight
   characters is not a real key and would shred ordinary words. */
export function redactSecret(text: string, secret: string | null | undefined): string {
  const s = (secret ?? "").trim();
  if (s.length < 8) return text;
  return text.split(s).join("[your key]");
}
