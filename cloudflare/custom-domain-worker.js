/* My Catalogue — Cloudflare Worker for client custom domains.
   Serves the catalogue app (hosted on GitHub Pages) under the client's own domain,
   e.g. https://petitbon.store keeps "petitbon.store" in the address bar.
   The app reads the hostname and opens the matching catalogue (mc_saas_custom_domains, verified + active).

   Setup (once per Cloudflare account):
   1. Cloudflare dashboard → Workers & Pages → Create → Create Worker → name it "my-catalogue-domains" → Deploy.
   2. Edit code → replace everything with this file → Deploy.
   3. For each client domain (DNS must be on Cloudflare):
        - DNS: add record  A  @  192.0.2.1  (Proxied, orange cloud)   and  CNAME  www  <domain>  (Proxied)
        - Worker → Settings → Domains & Routes → Add → Route:  <domain>/*   and   www.<domain>/*
   4. Ask the platform admin to activate the domain (verified = true, active = true).
*/
const ORIGIN = 'https://yallawassel.github.io';
const BASE = '/my-catalogue-universal-pos';
// Only the public catalogue is served on client domains; the admin and POS stay on the platform address.
const BLOCKED = /^\/(admin|platform-admin|pos|orders|driver-tracking)\.html$/i;

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.hostname.startsWith('www.')) {
      url.hostname = url.hostname.slice(4);
      return Response.redirect(url.toString(), 301);
    }
    let path = url.pathname === '/' ? '/index.html' : url.pathname;
    if (BLOCKED.test(path)) return Response.redirect(ORIGIN + BASE + path + url.search, 302);
    if (path === '/robots.txt') return new Response('User-agent: *\nAllow: /\n', { headers: { 'content-type': 'text/plain' } });
    const upstream = await fetch(ORIGIN + BASE + path + url.search, {
      method: request.method === 'HEAD' ? 'HEAD' : 'GET',
      headers: { 'accept': request.headers.get('accept') || '*/*', 'accept-encoding': request.headers.get('accept-encoding') || '' },
      cf: { cacheTtl: 300, cacheEverything: true }
    });
    const headers = new Headers(upstream.headers);
    headers.delete('x-github-request-id');
    headers.set('x-served-by', 'my-catalogue');
    if (path.endsWith('.html')) headers.set('cache-control', 'public, max-age=60');
    return new Response(upstream.body, { status: upstream.status, headers });
  }
};
