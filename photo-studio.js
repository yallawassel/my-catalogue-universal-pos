/* My Catalogue PRO — Photo Studio engine (runs 100% in the browser, no API cost).
   MCStudio.process(source, options) -> { canvas, blob, bgRemoved }
   MCStudio.brandCard(product, options) -> { canvas, blob }
*/
(() => {
  const OUT = 1200;

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      if (src instanceof HTMLImageElement && src.complete && src.naturalWidth) return resolve(src);
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.decoding = 'async';
      let url = null;
      img.onload = () => { if (url) URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { if (url) URL.revokeObjectURL(url); reject(new Error('Could not load this photo (it may block editing or be damaged).')); };
      if (src instanceof Blob) { url = URL.createObjectURL(src); img.src = url; }
      else img.src = String(src) + (String(src).startsWith('http') ? (String(src).includes('?') ? '&' : '?') + 'studio=1' : '');
    });
  }

  const dist = (r1, g1, b1, r2, g2, b2) => {
    const dr = r1 - r2, dg = g1 - g2, db = b1 - b2;
    return Math.sqrt((2 * dr * dr + 4 * dg * dg + 3 * db * db) / 9);
  };

  function median(arr) { const a = Array.from(arr).sort((x, y) => x - y); return a[Math.floor(a.length / 2)] || 0; }

  function analyseBorder(d, w, h) {
    const band = Math.max(2, Math.round(Math.min(w, h) * 0.02));
    const rs = [], gs = [], bs = [];
    const push = (x, y) => { const i = (y * w + x) * 4; rs.push(d[i]); gs.push(d[i + 1]); bs.push(d[i + 2]); };
    const step = Math.max(1, Math.floor(Math.max(w, h) / 400));
    for (let x = 0; x < w; x += step) for (let k = 0; k < band; k++) { push(x, k); push(x, h - 1 - k); }
    for (let y = 0; y < h; y += step) for (let k = 0; k < band; k++) { push(k, y); push(w - 1 - k, y); }
    const bg = [median(rs), median(gs), median(bs)];
    let close = 0;
    for (let i = 0; i < rs.length; i++) if (dist(rs[i], gs[i], bs[i], bg[0], bg[1], bg[2]) < 30) close++;
    return { bg, uniformity: close / rs.length };
  }

  // Flood fill the background from every border pixel. Interior areas that happen to
  // match the background colour (e.g. a white label) are NOT removed because they are
  // not connected to the border.
  function backgroundMask(d, w, h, bg, tol) {
    const n = w * h, mask = new Uint8Array(n); // 1 = background
    const queue = new Int32Array(n); let qh = 0, qt = 0;
    const ok = (p, from) => {
      const i = p * 4;
      const toBg = dist(d[i], d[i + 1], d[i + 2], bg[0], bg[1], bg[2]);
      if (toBg < tol) return true;
      if (from < 0 || toBg > tol * 2.1) return false;
      const j = from * 4; // follow gentle gradients (wall shading, soft shadows)
      return dist(d[i], d[i + 1], d[i + 2], d[j], d[j + 1], d[j + 2]) < Math.max(5, tol * 0.18);
    };
    const seed = p => { if (!mask[p] && ok(p, -1)) { mask[p] = 1; queue[qt++] = p; } };
    for (let x = 0; x < w; x++) { seed(x); seed((h - 1) * w + x); }
    for (let y = 0; y < h; y++) { seed(y * w); seed(y * w + w - 1); }
    while (qh < qt) {
      const p = queue[qh++], x = p % w, y = (p / w) | 0;
      if (x > 0) { const q = p - 1; if (!mask[q] && ok(q, p)) { mask[q] = 1; queue[qt++] = q; } }
      if (x < w - 1) { const q = p + 1; if (!mask[q] && ok(q, p)) { mask[q] = 1; queue[qt++] = q; } }
      if (y > 0) { const q = p - w; if (!mask[q] && ok(q, p)) { mask[q] = 1; queue[qt++] = q; } }
      if (y < h - 1) { const q = p + w; if (!mask[q] && ok(q, p)) { mask[q] = 1; queue[qt++] = q; } }
    }
    return mask;
  }

  function foregroundBox(mask, w, h) {
    const rows = new Uint32Array(h), cols = new Uint32Array(w);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (!mask[y * w + x]) { rows[y]++; cols[x]++; }
    const minRow = Math.max(2, w * 0.004), minCol = Math.max(2, h * 0.004);
    let top = 0, bottom = h - 1, left = 0, right = w - 1;
    while (top < h && rows[top] < minRow) top++;
    while (bottom > top && rows[bottom] < minRow) bottom--;
    while (left < w && cols[left] < minCol) left++;
    while (right > left && cols[right] < minCol) right--;
    if (bottom - top < h * 0.05 || right - left < w * 0.05) return null;
    return { x: left, y: top, w: right - left + 1, h: bottom - top + 1 };
  }

  function featherAlpha(alpha, w, h, passes) {
    let src = alpha;
    for (let p = 0; p < passes; p++) {
      const out = new Float32Array(src.length);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        let s = 0, c = 0;
        for (let dy = -1; dy <= 1; dy++) { const yy = y + dy; if (yy < 0 || yy >= h) continue; for (let dx = -1; dx <= 1; dx++) { const xx = x + dx; if (xx < 0 || xx >= w) continue; s += src[yy * w + xx]; c++; } }
        out[y * w + x] = s / c;
      }
      src = out;
    }
    return src;
  }

  function enhance(d, alpha, mode) {
    if (mode === 'none') return;
    const hist = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];
    let count = 0;
    for (let p = 0, i = 0; i < d.length; p++, i += 4) if (!alpha || alpha[p] > 0.5) { hist[0][d[i]]++; hist[1][d[i + 1]]++; hist[2][d[i + 2]]++; count++; }
    if (!count) return;
    const pct = (h, q) => { let acc = 0; const target = count * q; for (let v = 0; v < 256; v++) { acc += h[v]; if (acc >= target) return v; } return 255; };
    const lo = [], hi = [];
    for (let c = 0; c < 3; c++) { lo[c] = pct(hist[c], 0.008); hi[c] = pct(hist[c], 0.992); }
    // Use a shared stretch to avoid colour casts, but keep it gentle.
    const L = Math.min(...lo), H = Math.max(...hi);
    const range = Math.max(40, H - L), gain = Math.min(1.45, 255 / range), off = L;
    const sat = mode === 'vivid' ? 1.22 : 1.08, contrast = mode === 'vivid' ? 1.08 : 1.03;
    for (let p = 0, i = 0; i < d.length; p++, i += 4) {
      let r = (d[i] - off) * gain, g = (d[i + 1] - off) * gain, b = (d[i + 2] - off) * gain;
      const l = 0.299 * r + 0.587 * g + 0.114 * b;
      r = l + (r - l) * sat; g = l + (g - l) * sat; b = l + (b - l) * sat;
      r = (r - 128) * contrast + 128 + 3; g = (g - 128) * contrast + 128 + 3; b = (b - 128) * contrast + 128 + 3;
      d[i] = r < 0 ? 0 : r > 255 ? 255 : r; d[i + 1] = g < 0 ? 0 : g > 255 ? 255 : g; d[i + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
    }
  }

  function hexToRgb(hex) { const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return [124, 58, 237]; const n = parseInt(m[1], 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  function mix(rgb, t) { return `rgb(${rgb.map(v => Math.round(v + (255 - v) * t)).join(',')})`; }

  function paintBackground(ctx, style, brand, edgeColor) {
    const S = OUT;
    if (style === 'light') { ctx.fillStyle = '#f2f2f5'; ctx.fillRect(0, 0, S, S); return; }
    if (style === 'warm') { ctx.fillStyle = '#fbf5ec'; ctx.fillRect(0, 0, S, S); return; }
    if (style === 'studio') { const g = ctx.createRadialGradient(S / 2, S * 0.42, S * 0.05, S / 2, S * 0.5, S * 0.75); g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#e4e4ec'); ctx.fillStyle = g; ctx.fillRect(0, 0, S, S); return; }
    if (style === 'brand') { const rgb = hexToRgb(brand); const g = ctx.createLinearGradient(0, 0, S, S); g.addColorStop(0, mix(rgb, 0.9)); g.addColorStop(1, mix(rgb, 0.96)); ctx.fillStyle = g; ctx.fillRect(0, 0, S, S); return; }
    if (style === 'keep' && edgeColor) { ctx.fillStyle = `rgb(${edgeColor.join(',')})`; ctx.fillRect(0, 0, S, S); return; }
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, S, S);
  }

  async function toBlob(canvas) {
    let blob = await new Promise(r => canvas.toBlob(r, 'image/webp', 0.9));
    if (!blob || blob.type !== 'image/webp') blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.9));
    if (!blob) throw new Error('This browser could not export the photo.');
    return blob;
  }

  async function process(source, opts = {}) {
    const o = Object.assign({ background: 'white', fill: 0.82, tolerance: 34, shadow: 'soft', enhance: 'auto', brand: '#7c3aed' }, opts);
    const img = await loadImage(source);
    const scale = Math.min(1, 900 / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale)), h = Math.max(1, Math.round(img.naturalHeight * scale));
    const work = document.createElement('canvas'); work.width = w; work.height = h;
    const wctx = work.getContext('2d', { willReadFrequently: true });
    wctx.drawImage(img, 0, 0, w, h);
    let data;
    try { data = wctx.getImageData(0, 0, w, h); } catch (e) { throw new Error('This photo is stored on a server that blocks editing. Upload the original file instead.'); }
    const d = data.data;
    const { bg, uniformity } = analyseBorder(d, w, h);
    let alpha = null, box = { x: 0, y: 0, w, h }, bgRemoved = false;
    if (o.background !== 'keep' && uniformity > 0.5) {
      const mask = backgroundMask(d, w, h, bg, Number(o.tolerance) || 34);
      const fb = foregroundBox(mask, w, h);
      let bgShare = 0; for (let i = 0; i < mask.length; i++) bgShare += mask[i];
      bgShare /= mask.length;
      if (fb && bgShare > 0.06 && bgShare < 0.97) {
        alpha = new Float32Array(w * h);
        for (let i = 0; i < alpha.length; i++) alpha[i] = mask[i] ? 0 : 1;
        alpha = featherAlpha(alpha, w, h, 2);
        box = fb; bgRemoved = true;
      }
    }
    enhance(d, alpha, o.enhance);
    if (alpha) for (let p = 0, i = 3; p < alpha.length; p++, i += 4) d[i] = Math.round(alpha[p] * 255);
    wctx.putImageData(data, 0, 0);

    const out = document.createElement('canvas'); out.width = out.height = OUT;
    const ctx = out.getContext('2d');
    paintBackground(ctx, bgRemoved ? o.background : (o.background === 'keep' ? 'keep' : o.background), o.brand, bg);
    const fill = Math.min(0.95, Math.max(0.5, Number(o.fill) || 0.82));
    const s = Math.min((OUT * fill) / box.w, (OUT * fill) / box.h);
    const dw = box.w * s, dh = box.h * s;
    const dx = (OUT - dw) / 2;
    const floor = bgRemoved && o.shadow === 'soft';
    const dy = floor ? Math.min(OUT - dh - OUT * 0.07, (OUT - dh) / 2 + OUT * 0.03) : (OUT - dh) / 2;
    if (bgRemoved && o.shadow === 'soft') {
      const cx = OUT / 2, cy = dy + dh - dh * 0.01, rx = dw * 0.48, ry = Math.max(14, dw * 0.06);
      ctx.save(); ctx.translate(cx, cy); ctx.scale(1, ry / rx);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
      g.addColorStop(0, 'rgba(20,16,50,0.30)'); g.addColorStop(0.55, 'rgba(20,16,50,0.12)'); g.addColorStop(1, 'rgba(20,16,50,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, rx, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
    ctx.save();
    if (bgRemoved && o.shadow === 'drop') { ctx.shadowColor = 'rgba(20,16,50,0.22)'; ctx.shadowBlur = 46; ctx.shadowOffsetY = 22; }
    ctx.imageSmoothingQuality = 'high';
    if (!bgRemoved && o.background !== 'keep') {
      // Busy background: keep the photo, frame it neatly with rounded corners.
      const r = 28; ctx.beginPath(); ctx.moveTo(dx + r, dy); ctx.arcTo(dx + dw, dy, dx + dw, dy + dh, r); ctx.arcTo(dx + dw, dy + dh, dx, dy + dh, r); ctx.arcTo(dx, dy + dh, dx, dy, r); ctx.arcTo(dx, dy, dx + dw, dy, r); ctx.closePath();
      ctx.shadowColor = 'rgba(20,16,50,0.16)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 16; ctx.fillStyle = '#fff'; ctx.fill(); ctx.shadowColor = 'transparent'; ctx.clip();
    }
    ctx.drawImage(work, box.x, box.y, box.w, box.h, dx, dy, dw, dh);
    ctx.restore();
    return { canvas: out, blob: await toBlob(out), bgRemoved };
  }

  const EMOJI = [
    [/coffee|cafe|espresso|tea/, '☕'], [/cake|bakery|bread|pastry|croissant/, '🥐'], [/choco|sweet|candy|dessert/, '🍫'],
    [/fruit|apple|banana|orange/, '🍎'], [/vegetable|salad|green/, '🥗'], [/drink|juice|water|soda|bottle/, '🥤'],
    [/cup|glass|mug/, '🥛'], [/plate|bowl|dish|container|tray/, '🍽️'], [/bag|nylon|plastic/, '🛍️'], [/box|carton|kraft|paper|pack/, '📦'],
    [/clean|soap|deterg|wash|sanit/, '🧴'], [/cosmetic|beauty|cream|perfume/, '💄'], [/phone|mobile|electronic|cable|charger/, '📱'],
    [/shoe|sneaker/, '👟'], [/shirt|cloth|fashion|dress|wear/, '👕'], [/toy|kid|baby/, '🧸'], [/tool|hardware|screw/, '🛠️'],
    [/medic|pharma|health/, '💊'], [/gift|christmas|party/, '🎁'], [/meat|chicken|beef/, '🍗'], [/pizza|food|snack/, '🍕'], [/book|station|pen/, '✏️']
  ];
  function emojiFor(p) { const t = `${p.category || ''} ${p.name || ''}`.toLowerCase(); for (const [re, e] of EMOJI) if (re.test(t)) return e; return '🏷️'; }

  function wrapText(ctx, text, maxW) {
    const words = String(text || '').split(/\s+/).filter(Boolean), lines = []; let line = '';
    for (const word of words) { const t = line ? line + ' ' + word : word; if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = word; } else line = t; }
    if (line) lines.push(line); return lines;
  }

  async function brandCard(p, opts = {}) {
    const brand = hexToRgb(opts.brand || '#7c3aed');
    const c = document.createElement('canvas'); c.width = c.height = OUT; const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, OUT, OUT);
    g.addColorStop(0, mix(brand, 0.82)); g.addColorStop(1, mix(brand, 0.95));
    ctx.fillStyle = g; ctx.fillRect(0, 0, OUT, OUT);
    ctx.fillStyle = `rgba(${brand.join(',')},0.10)`; ctx.beginPath(); ctx.arc(OUT * 0.92, OUT * 0.08, OUT * 0.32, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(OUT * 0.05, OUT * 0.98, OUT * 0.26, 0, Math.PI * 2); ctx.fill();
    // emoji badge
    ctx.save(); ctx.shadowColor = 'rgba(20,16,50,0.18)'; ctx.shadowBlur = 50; ctx.shadowOffsetY = 20;
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(OUT / 2, OUT * 0.4, OUT * 0.19, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    ctx.font = `${Math.round(OUT * 0.17)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(emojiFor(p), OUT / 2, OUT * 0.41);
    // name
    ctx.fillStyle = `rgb(${brand.map(v => Math.round(v * 0.45)).join(',')})`;
    let size = 74; ctx.font = `800 ${size}px "Plus Jakarta Sans",system-ui,sans-serif`;
    let lines = wrapText(ctx, p.name, OUT * 0.8);
    while (lines.length > 3 && size > 44) { size -= 6; ctx.font = `800 ${size}px "Plus Jakarta Sans",system-ui,sans-serif`; lines = wrapText(ctx, p.name, OUT * 0.8); }
    lines = lines.slice(0, 3);
    let y = OUT * 0.7 - (lines.length - 1) * size * 0.6;
    for (const l of lines) { ctx.fillText(l, OUT / 2, y); y += size * 1.18; }
    if (p.category) {
      ctx.font = `700 34px "Plus Jakarta Sans",system-ui,sans-serif`;
      const label = String(p.category).toUpperCase(), tw = ctx.measureText(label).width + 56;
      ctx.fillStyle = `rgba(${brand.join(',')},0.14)`; const bx = OUT / 2 - tw / 2, by = OUT * 0.88;
      ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(bx, by - 30, tw, 60, 30); else ctx.rect(bx, by - 30, tw, 60); ctx.fill();
      ctx.fillStyle = `rgb(${brand.map(v => Math.round(v * 0.55)).join(',')})`; ctx.fillText(label, OUT / 2, by + 1);
    }
    return { canvas: c, blob: await toBlob(c) };
  }

  window.MCStudio = { process, brandCard, loadImage };
})();
