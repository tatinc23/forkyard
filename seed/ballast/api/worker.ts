// Cloudflare Worker for ballast-type-site: JSON endpoints under /api/*, everything else is the static site.
// Back-end crew: fill the router slots below. Keep each handler small and return JSON via json().

export interface Env {
  ASSETS: Fetcher;
  // slot:worker-env  (bindings such as KV or D1 go here)
}

const json = (data: unknown, status = 200, headers: HeadersInit = {}): Response =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });

// slot:worker-data  (the family list and other constants)

// Newsletter signup. Stub: accepts the request and stores nothing yet.
async function subscribe(_request: Request): Promise<Response> {
  return json({ ok: true, stored: false });
}

// slot:worker-handlers  (one function per endpoint)

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/subscribe" && request.method === "POST") return subscribe(request);
    // slot:worker-routes  (/api/health, /api/families, /api/mosaic)

    if (url.pathname.startsWith("/api/")) return json({ error: "not_found" }, 404);
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
