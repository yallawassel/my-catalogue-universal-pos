// My Catalogue — public sitemap.xml for a published catalogue (v20).
// GET /functions/v1/mc-sitemap?shop=<slug>[&base=https://example.com/path/]
import { createClient } from "npm:@supabase/supabase-js@2";

const DEFAULT_BASE = "https://myraffi.com/";
const xml = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]!));

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const shop = (url.searchParams.get("shop") || "").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 80);
  let base = url.searchParams.get("base") || DEFAULT_BASE;
  try { const b = new URL(base); if (b.protocol !== "https:") throw 0; base = b.origin + b.pathname.replace(/[^/]*$/, ""); } catch { base = DEFAULT_BASE; }
  if (!shop) return new Response("Add ?shop=your-catalogue-slug", { status: 400 });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const b = await sb.from("mc_saas_businesses").select("id,slug,updated_at").eq("slug", shop).eq("is_published", true).maybeSingle();
  if (!b.data) return new Response("Catalogue not found", { status: 404 });
  const rows: { id: string; updated_at: string | null; image: string | null; name: string }[] = [];
  for (let from = 0; from < 20000; from += 1000) {
    const r = await sb.from("mc_saas_products").select("id,updated_at,image,name").eq("business_id", b.data.id).eq("is_active", true).order("id").range(from, from + 999);
    if (r.error || !r.data?.length) break;
    rows.push(...r.data);
    if (r.data.length < 1000) break;
  }
  const home = `${base}index.html?shop=${encodeURIComponent(b.data.slug)}`;
  const day = (d: string | null) => (d ? new Date(d).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10));
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
<url><loc>${xml(home)}</loc><lastmod>${day(b.data.updated_at)}</lastmod><changefreq>daily</changefreq><priority>1.0</priority></url>
<url><loc>${xml(home + "&lang=ar")}</loc><changefreq>daily</changefreq><priority>0.8</priority></url>
${rows.map((p) => `<url><loc>${xml(home + "&p=" + p.id)}</loc><lastmod>${day(p.updated_at)}</lastmod>${p.image ? `<image:image><image:loc>${xml(p.image)}</image:loc><image:title>${xml(p.name || "")}</image:title></image:image>` : ""}</url>`).join("\n")}
</urlset>`;
  return new Response(body, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600", "access-control-allow-origin": "*" } });
});
