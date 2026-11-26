// Builds s/<slug>/index.html for every published catalogue, so a shared link
// (myraffi.com/s/<slug>/) shows the shop's name, description and logo on
// WhatsApp, Facebook, Instagram, Telegram… — crawlers do not run JavaScript.
// Uses only the public (publishable) key and public columns. Run by .github/workflows/share-pages.yml.
import fs from 'node:fs';
import path from 'node:path';

const URL_ = 'https://mkodburhxdrvfacytovb.supabase.co';
const KEY = 'sb_publishable_FEJP96SGoEETQs_gaWjiqg_5LaRjyPw';
const SITE = 'https://myraffi.com/';
const OUT = path.resolve(process.argv[2] || 's');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const okSlug = (s) => /^[a-z0-9][a-z0-9-]{0,79}$/.test(s || '');

async function get(q) {
  const r = await fetch(`${URL_}/rest/v1/${q}`, { headers: { apikey: KEY, authorization: `Bearer ${KEY}` } });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}

export function page(b, cover) {
  const name = b.company_name || 'Catalogue';
  const desc = (b.description || b.description_ar || `${name} — شوف كل منتجاتنا واطلب أونلاين · See all our products and order online`).replace(/\s+/g, ' ').slice(0, 200);
  const img = b.logo_url || cover || SITE + 'icon-512.png';
  const target = `${SITE}index.html?shop=${encodeURIComponent(b.slug)}`;
  const color = /^#[0-9a-f]{6}$/i.test(b.primary_color || '') ? b.primary_color : '#0f766e';
  return `<!doctype html>
<html lang="${b.default_language === 'ar' ? 'ar' : 'en'}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(name)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(target)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(name)}">
<meta property="og:title" content="${esc(name)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(SITE + 's/' + b.slug + '/')}">
<meta property="og:image" content="${esc(img)}">
<meta name="twitter:card" content="summary">
<meta name="theme-color" content="${esc(color)}">
<meta http-equiv="refresh" content="0;url=${esc(target)}">
<script>location.replace(${JSON.stringify(target)}+(location.search?'&'+location.search.slice(1):'')+location.hash)</script>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,Arial,sans-serif;background:${esc(color)};color:#fff;text-align:center}a{color:#fde68a}</style>
</head><body><p>${esc(name)}<br><a href="${esc(target)}">Open the catalogue · افتح الكتالوج</a></p></body></html>
`;
}

async function main() {
  const shops = await get('mc_saas_businesses?select=id,slug,company_name,description,description_ar,logo_url,primary_color,default_language&is_published=eq.true&order=slug&limit=5000');
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  let n = 0;
  for (const b of shops) {
    if (!okSlug(b.slug)) continue;
    let cover = null;
    if (!b.logo_url) {
      try { const p = await get(`mc_saas_products?select=image&business_id=eq.${b.id}&is_active=eq.true&image=not.is.null&image=neq.&limit=1`); cover = p[0]?.image || null; } catch { /* no cover */ }
    }
    fs.mkdirSync(path.join(OUT, b.slug), { recursive: true });
    fs.writeFileSync(path.join(OUT, b.slug, 'index.html'), page(b, cover));
    n++;
  }
  fs.writeFileSync(path.join(OUT, 'index.html'), `<!doctype html><meta http-equiv="refresh" content="0;url=${SITE}"><a href="${SITE}">Raffi</a>\n`);
  console.log(`share pages: ${n}`);
}
if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e); process.exit(1); });
