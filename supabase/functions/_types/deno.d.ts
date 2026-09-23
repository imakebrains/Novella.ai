/* Just enough of Deno's globals for `npm run typecheck:functions` to
   check the edge functions from node, against the same SDK versions
   the functions import. Never deployed; nothing imports it. */
declare namespace Deno {
  const env: { get(name: string): string | undefined };
  function serve(handler: (req: Request) => Response | Promise<Response>): void;
}
