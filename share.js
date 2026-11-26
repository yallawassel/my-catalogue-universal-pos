/* Raffi — share kit (v1).
   One sheet used by the public catalogue and by the shop admin:
   • native share (Instagram, Facebook, WhatsApp, TikTok, Telegram… whatever apps the phone has)
   • quick links: WhatsApp, Facebook, Telegram, copy link
   • ready images: Story 1080×1920 and Post 1080×1350 for a product or the whole shop (with QR code)
   • QR poster to print for the counter or the door
   Needs qr.js (window.MCQR). Never sends data anywhere except the share targets the user picks. */
(function () {
  'use strict';
  const AR = {
    'Share': 'شارك', 'Share the catalogue': 'شارك الكتالوج', 'Share this product': 'شارك هالمنتج',
    'Share…': 'شارك…', 'Copy link': 'انسخ الرابط', 'Link copied': 'انتسخ الرابط',
    'Story image': 'صورة ستوري', 'Post image': 'صورة بوست', 'QR poster': 'بوستر QR',
    'Instagram · TikTok · Status': 'إنستغرام · تيك توك · ستاتوس', 'Instagram · Facebook': 'إنستغرام · فيسبوك', 'Print for the shop': 'للطباعة بالمحل',
    'Making the image…': 'عم نجهّز الصورة…', 'Share image': 'شارك الصورة', 'Download': 'نزّل',
    'Close': 'سكّر', 'Order here': 'اطلب من هون', 'Scan to see all our products': 'امسح الكود وشوف كل منتجاتنا',
    'See all our products': 'شوف كل منتجاتنا', 'Scan & order': 'امسح واطلب',
    'Tip: in an Instagram story tap the sticker icon → “Link” and paste — the link is already copied.': 'نصيحة: بستوري إنستغرام كبوس على الستيكر ← «Link» والصق الرابط — الرابط منسوخ أصلاً.',
    'On TikTok and Instagram put the link in your bio.': 'على تيك توك وإنستغرام حطّ الرابط بالـbio.',
    'Long-press the image to save it.': 'كبوس مطوّل عالصورة لتحفظها.',
    'Some photos could not be added (they are on another website).': 'في صور ما انضافت (موجودة على موقع تاني).',
    'Price on request': 'السعر عند الطلب', 'Print': 'اطبع'
  };
  const rtl = () => document.documentElement.dir === 'rtl' || document.documentElement.lang === 'ar';
  const t = s => (rtl() && AR[s]) || s;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const PLATFORM = ['myraffi.com', 'www.myraffi.com'];

  /* Short public link for a shop: myraffi.com/s/<slug>/ shows the shop's name, logo and photo when shared. */
  function shopUrl(biz) {
    const slug = encodeURIComponent((biz && biz.slug) || '');
    if (PLATFORM.includes(location.hostname)) return 'https://myraffi.com/s/' + slug + '/';
    const isPlatform = ['localhost', '127.0.0.1', ''].includes(location.hostname) || location.hostname.endsWith('.github.io');
    if (!isPlatform) return location.origin + '/';
    const u = new URL('index.html', location.href); return u.origin + u.pathname + '?shop=' + slug;
  }

  /* ---------- drawing helpers ---------- */
  function loadImg(src) {
    return new Promise(res => {
      if (!src) return res(null);
      const im = new Image(); im.crossOrigin = 'anonymous'; im.decoding = 'async';
      const done = ok => { clearTimeout(tm); res(ok ? im : null); };
      const tm = setTimeout(() => done(false), 12000);
      im.onload = () => done(true); im.onerror = () => done(false); im.src = src;
    });
  }
  function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function contain(ctx, im, x, y, w, h) { const s = Math.min(w / im.naturalWidth, h / im.naturalHeight); const dw = im.naturalWidth * s, dh = im.naturalHeight * s; ctx.drawImage(im, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh); }
  const hasAr = s => /[؀-ۿ]/.test(s);
  const FONT = '"Segoe UI",Tahoma,"Noto Sans Arabic","Noto Sans",Arial,sans-serif';
  function text(ctx, s, x, y, size, opt = {}) {
    s = String(s || ''); ctx.save();
    ctx.font = `${opt.weight || 800} ${size}px ${FONT}`; ctx.fillStyle = opt.color || '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.direction = hasAr(s) ? 'rtl' : 'ltr';
    const maxW = opt.maxW || 960, lines = [];
    const words = s.split(/\s+/); let line = '';
    for (const w of words) { const test = line ? line + ' ' + w : w; if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test; }
    if (line) lines.push(line);
    const max = opt.lines || 2; if (lines.length > max) { lines.length = max; let l = lines[max - 1]; while (l && ctx.measureText(l + '…').width > maxW) l = l.slice(0, -1); lines[max - 1] = l + '…'; }
    const lh = size * 1.22, top = y - (lines.length - 1) * lh / 2;
    lines.forEach((l, i) => ctx.fillText(l, x, top + i * lh));
    ctx.restore(); return lines.length * lh;
  }
  function shade(hex, f) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim()); if (!m) return null;
    const n = parseInt(m[1], 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    const k = v => Math.max(0, Math.min(255, Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f)));
    return '#' + [k(r), k(g), k(b)].map(v => v.toString(16).padStart(2, '0')).join('');
  }
  function bg(ctx, W, H, brand) {
    const c1 = shade(brand, 0.08) || '#14b8a6', c2 = shade(brand, -0.55) || '#0b2725';
    const g = ctx.createLinearGradient(0, 0, W * 0.4, H); g.addColorStop(0, c1); g.addColorStop(1, c2); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.save(); ctx.globalAlpha = 0.08; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(W * 0.92, H * 0.06, W * 0.32, 0, 7); ctx.fill(); ctx.beginPath(); ctx.arc(W * 0.02, H * 0.97, W * 0.4, 0, 7); ctx.fill(); ctx.restore();
  }
  async function header(ctx, W, y, biz, logoSize) {
    const logo = await loadImg(biz.logo_url);
    const name = biz.company_name || '';
    if (logo) { ctx.save(); ctx.beginPath(); ctx.arc(W / 2, y + logoSize / 2, logoSize / 2, 0, 7); ctx.fillStyle = '#fff'; ctx.fill(); ctx.clip(); contain(ctx, logo, W / 2 - logoSize * 0.42, y + logoSize * 0.08, logoSize * 0.84, logoSize * 0.84); ctx.restore(); y += logoSize + 26; }
    text(ctx, name, W / 2, y + 34, 58, { lines: 1, maxW: W - 120 }); return { y: y + 80, logoOk: !!logo || !biz.logo_url };
  }
  function qrBlock(ctx, url, x, y, size, label) {
    ctx.save(); ctx.fillStyle = '#fff'; rr(ctx, x, y, size, size, 26); ctx.fill(); ctx.restore();
    if (window.MCQR) MCQR.draw(ctx, url, x + 14, y + 14, size - 28, { level: 'M', quiet: 1 });
    if (label) text(ctx, label, x + size / 2, y + size + 40, 34, { lines: 1 });
  }
  function footer(ctx, W, H, url) {
    text(ctx, url.replace(/^https?:\/\//, '').replace(/\/$/, ''), W / 2, H - 92, 32, { weight: 700, color: '#fde68a', lines: 1, maxW: W - 80 });
    text(ctx, 'Raffi | رفّي', W / 2, H - 44, 24, { weight: 700, color: 'rgba(255,255,255,.7)', lines: 1 });
  }
  function priceText(o) { return o.price || t('Price on request'); }

  /* Product image: story (1080×1920) or post (1080×1350). */
  async function productImage(o, kind) {
    const W = 1080, H = kind === 'post' ? 1350 : 1920, c = document.createElement('canvas'); c.width = W; c.height = H; const ctx = c.getContext('2d');
    bg(ctx, W, H, o.biz.primary_color);
    const story = kind !== 'post';
    const hd = await header(ctx, W, story ? 90 : 46, o.biz, story ? 150 : 96);
    const card = story ? { x: 90, y: hd.y + 10, w: 900, h: 900 } : { x: 170, y: hd.y, w: 740, h: 640 };
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 50; ctx.shadowOffsetY = 18; ctx.fillStyle = '#fff'; rr(ctx, card.x, card.y, card.w, card.h, 48); ctx.fill(); ctx.restore();
    const im = await loadImg(o.product.image);
    if (im) contain(ctx, im, card.x + 40, card.y + 40, card.w - 80, card.h - 80);
    else text(ctx, (o.product.name || '?').slice(0, 1), card.x + card.w / 2, card.y + card.h / 2, 260, { color: '#cbd5e1', lines: 1 });
    let y = card.y + card.h + (story ? 90 : 60);
    y += text(ctx, o.product.name, W / 2, y, story ? 64 : 52, { lines: 2, maxW: W - 140 }) / 2 + (story ? 60 : 40);
    const pt = priceText(o); ctx.save(); ctx.font = `900 ${story ? 66 : 54}px ${FONT}`; const pw = Math.min(W - 160, ctx.measureText(pt).width + 90), ph = story ? 110 : 90; ctx.fillStyle = '#fbbf24'; rr(ctx, (W - pw) / 2, y - ph / 2, pw, ph, ph / 2); ctx.fill(); ctx.restore();
    text(ctx, pt, W / 2, y, story ? 66 : 54, { color: '#0b2725', weight: 900, lines: 1, maxW: pw - 40 });
    if (story) { const qs = 280; qrBlock(ctx, o.url, (W - qs) / 2, Math.min(H - 500, y + 110), qs, t('Order here')); }
    footer(ctx, W, H, o.url);
    return { canvas: c, missing: !im && !!o.product.image || !hd.logoOk };
  }
  /* Whole shop: logo, name, 2×2 product photos, QR. */
  async function shopImage(o, kind) {
    const W = 1080, H = kind === 'post' ? 1350 : 1920, c = document.createElement('canvas'); c.width = W; c.height = H; const ctx = c.getContext('2d');
    bg(ctx, W, H, o.biz.primary_color);
    const story = kind !== 'post';
    const hd = await header(ctx, W, story ? 100 : 50, o.biz, story ? 170 : 110);
    const picks = (o.products || []).filter(p => p.image).slice(0, 4);
    const ims = await Promise.all(picks.map(p => loadImg(p.image)));
    const cell = story ? 420 : 330, gap = 30, gx = (W - cell * 2 - gap) / 2, gy = hd.y + 10;
    let missing = !hd.logoOk;
    for (let i = 0; i < 4; i++) {
      const x = gx + (i % 2) * (cell + gap), y = gy + Math.floor(i / 2) * (cell + gap);
      ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.3)'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 10; ctx.fillStyle = '#fff'; rr(ctx, x, y, cell, cell, 36); ctx.fill(); ctx.restore();
      if (ims[i]) contain(ctx, ims[i], x + 24, y + 24, cell - 48, cell - 48); else { if (picks[i]) missing = true; text(ctx, '🛍️', x + cell / 2, y + cell / 2, 120, { lines: 1 }); }
    }
    let y = gy + cell * 2 + gap + (story ? 90 : 70);
    text(ctx, rtl() ? 'شوف كل منتجاتنا واطلب أونلاين' : 'See all our products & order online', W / 2, y, story ? 54 : 46, { lines: 2, maxW: W - 140 });
    if (story) { const qs = 300; qrBlock(ctx, o.url, (W - qs) / 2, Math.min(H - 520, y + 90), qs, t('Scan & order')); }
    footer(ctx, W, H, o.url);
    return { canvas: c, missing };
  }
  /* Printable A4 poster (150 dpi) with a big QR code. */
  async function posterImage(o) {
    const W = 1240, H = 1754, c = document.createElement('canvas'); c.width = W; c.height = H; const ctx = c.getContext('2d');
    bg(ctx, W, H, o.biz.primary_color);
    const hd = await header(ctx, W, 110, o.biz, 200);
    text(ctx, 'امسح الكود وشوف كل منتجاتنا', W / 2, hd.y + 50, 70, { lines: 2, maxW: W - 160 });
    text(ctx, 'Scan to see all our products & order', W / 2, hd.y + 150, 44, { weight: 700, color: '#fde68a', lines: 2, maxW: W - 160 });
    const qs = 720; qrBlock(ctx, o.url, (W - qs) / 2, hd.y + 230, qs, '');
    text(ctx, 'اطلب أونلاين بسهولة · Order online easily', W / 2, hd.y + 230 + qs + 80, 44, { lines: 1 });
    footer(ctx, W, H, o.url);
    return { canvas: c, missing: !hd.logoOk };
  }
  const toBlob = c => new Promise(r => c.toBlob(r, 'image/jpeg', 0.92));

  /* ---------- the sheet ---------- */
  function css() {
    if (document.getElementById('mcShareCss')) return;
    const s = document.createElement('style'); s.id = 'mcShareCss';
    s.textContent = `.mcsh{position:fixed;inset:0;z-index:2147483000;background:rgba(15,23,42,.55);display:flex;align-items:flex-end;justify-content:center}
.mcsh-b{background:#fff;color:#0f172a;width:100%;max-width:520px;max-height:92vh;overflow:auto;border-radius:22px 22px 0 0;padding:16px 16px calc(18px + env(safe-area-inset-bottom));font-family:inherit;box-shadow:0 -10px 40px rgba(0,0,0,.25)}
.mcsh-h{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}.mcsh-h b{font-size:18px}.mcsh-x{border:0;background:#f1f5f9;border-radius:999px;width:36px;height:36px;font-size:18px;cursor:pointer}
.mcsh-main{width:100%;border:0;border-radius:14px;padding:14px;font-size:17px;font-weight:800;background:#0f766e;color:#fff;cursor:pointer;margin-bottom:10px}
.mcsh-row{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:12px}.mcsh-row a,.mcsh-row button{display:flex;flex-direction:column;align-items:center;gap:4px;border:1px solid #e2e8f0;background:#f8fafc;border-radius:14px;padding:10px 4px;font-size:12px;font-weight:700;color:#0f172a;text-decoration:none;cursor:pointer}
.mcsh-row i{font-style:normal;font-size:24px;line-height:1}
.mcsh-img{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.mcsh-img button{border:0;border-radius:14px;padding:12px 6px;background:linear-gradient(135deg,#14b8a6,#0f766e);color:#fff;font-weight:800;font-size:14px;cursor:pointer}.mcsh-img button small{display:block;font-weight:600;font-size:11px;opacity:.85;margin-top:3px}
.mcsh-img button.alt{background:linear-gradient(135deg,#fbbf24,#f97316);color:#1f2937}.mcsh-img button.qr{background:#0f172a}
.mcsh-pv{margin-top:12px;text-align:center}.mcsh-pv img{max-width:100%;max-height:52vh;border-radius:14px;box-shadow:0 6px 24px rgba(0,0,0,.2)}.mcsh-pv .acts{display:flex;gap:8px;margin-top:10px}.mcsh-pv .acts button,.mcsh-pv .acts a{flex:1;border:0;border-radius:12px;padding:12px;font-weight:800;font-size:15px;background:#0f766e;color:#fff;text-decoration:none;cursor:pointer}.mcsh-pv .acts .sec{background:#e2e8f0;color:#0f172a}
.mcsh-tip{font-size:13px;color:#475569;margin:8px 0 0;line-height:1.5}.mcsh-link{direction:ltr;font-size:12px;color:#64748b;word-break:break-all;margin:-4px 0 10px;text-align:center}`;
    document.head.appendChild(s);
  }
  async function copy(s) { try { await navigator.clipboard.writeText(s); return true; } catch (_) { try { const ta = document.createElement('textarea'); ta.value = s; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); return ok; } catch (__) { return false; } } }
  function toast(msg) { const el = document.createElement('div'); el.textContent = msg; el.style.cssText = 'position:fixed;left:50%;bottom:90px;transform:translateX(-50%);background:#0f172a;color:#fff;padding:10px 16px;border-radius:999px;font-weight:700;z-index:2147483001;font-size:14px'; document.body.appendChild(el); setTimeout(() => el.remove(), 1800); }

  /* o = { biz, url?, product?: {name,image,id}, price?: 'Piece $0.50', products?: [...] } */
  function open(o) {
    css();
    o = Object.assign({}, o); o.url = o.url || shopUrl(o.biz);
    const isP = !!o.product;
    const title = isP ? o.product.name : (o.biz.company_name || '');
    const msg = isP ? `${o.product.name}${o.price ? ' — ' + o.price : ''}\n${o.url}` : `${o.biz.company_name || ''} — ${rtl() ? 'شوف منتجاتنا واطلب من هون' : 'see our products and order here'}:\n${o.url}`;
    const old = document.getElementById('mcShare'); if (old) old.remove();
    const w = document.createElement('div'); w.className = 'mcsh'; w.id = 'mcShare'; w.dir = rtl() ? 'rtl' : 'ltr';
    w.innerHTML = `<div class="mcsh-b" role="dialog" aria-modal="true"><div class="mcsh-h"><b>${esc(t(isP ? 'Share this product' : 'Share the catalogue'))}</b><button class="mcsh-x" data-a="close" aria-label="${esc(t('Close'))}">✕</button></div>
      <div class="mcsh-link">${esc(o.url)}</div>
      ${navigator.share ? `<button class="mcsh-main" data-a="native">📤 ${esc(t('Share…'))}</button>` : ''}
      <div class="mcsh-row">
        <a target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(msg)}"><i>💬</i>WhatsApp</a>
        <a target="_blank" rel="noopener" href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(o.url)}"><i>📘</i>Facebook</a>
        <a target="_blank" rel="noopener" href="https://t.me/share/url?url=${encodeURIComponent(o.url)}&text=${encodeURIComponent(title)}"><i>✈️</i>Telegram</a>
        <button type="button" data-a="copy"><i>🔗</i>${esc(t('Copy link'))}</button>
      </div>
      <div class="mcsh-img">
        <button type="button" data-a="story">📸 ${esc(t('Story image'))}<small>${esc(t('Instagram · TikTok · Status'))}</small></button>
        <button type="button" class="alt" data-a="post">🖼 ${esc(t('Post image'))}<small>${esc(t('Instagram · Facebook'))}</small></button>
        <button type="button" class="qr" data-a="poster">▦ ${esc(t('QR poster'))}<small>${esc(t('Print for the shop'))}</small></button>
      </div>
      <div class="mcsh-pv" id="mcShPv"></div></div>`;
    document.body.appendChild(w);
    const close = () => { w.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = e => { if (e.key === 'Escape') close(); }; document.addEventListener('keydown', onKey);
    w.addEventListener('click', async e => {
      if (e.target === w) return close();
      const b = e.target.closest('[data-a]'); if (!b) return;
      const a = b.dataset.a;
      if (a === 'close') return close();
      if (a === 'copy') { if (await copy(o.url)) toast(t('Link copied')); return; }
      if (a === 'native') { try { await navigator.share({ title, text: msg.replace(o.url, '').trim(), url: o.url }); } catch (_) {} return; }
      if (a === 'story' || a === 'post' || a === 'poster') {
        const pv = w.querySelector('#mcShPv'); pv.innerHTML = `<p class="mcsh-tip">⏳ ${esc(t('Making the image…'))}</p>`;
        let r; try { r = a === 'poster' ? await posterImage(o) : isP ? await productImage(o, a) : await shopImage(o, a); } catch (err) { pv.innerHTML = `<p class="mcsh-tip">⚠️ ${esc(err && err.message || err)}</p>`; return; }
        let blob = null; try { blob = await toBlob(r.canvas); } catch (_) {}
        const name = ((o.biz.slug || 'raffi') + '-' + (isP ? (o.product.id || 'product') : 'catalogue') + '-' + a + '.jpg').replace(/[^\w.-]+/g, '-');
        const src = blob ? URL.createObjectURL(blob) : r.canvas.toDataURL('image/jpeg', 0.9);
        const file = blob && typeof File === 'function' ? new File([blob], name, { type: 'image/jpeg' }) : null;
        const canFile = !!(file && navigator.canShare && navigator.canShare({ files: [file] }));
        if (a !== 'poster') copy(o.url);
        pv.innerHTML = `<img src="${src}" alt="">
          <div class="acts">${a === 'poster' ? `<button type="button" data-a="print">🖨 ${esc(t('Print'))}</button>` : canFile ? `<button type="button" data-a="sharefile">📤 ${esc(t('Share image'))}</button>` : ''}<a class="sec" href="${src}" download="${esc(name)}">⬇️ ${esc(t('Download'))}</a></div>
          ${a === 'story' ? `<p class="mcsh-tip">💡 ${esc(t('Tip: in an Instagram story tap the sticker icon → “Link” and paste — the link is already copied.'))}<br>${esc(t('On TikTok and Instagram put the link in your bio.'))}</p>` : ''}
          ${!canFile && a !== 'poster' ? `<p class="mcsh-tip">${esc(t('Long-press the image to save it.'))}</p>` : ''}
          ${r.missing ? `<p class="mcsh-tip">⚠️ ${esc(t('Some photos could not be added (they are on another website).'))}</p>` : ''}`;
        pv._file = file; pv._src = src; pv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        return;
      }
      if (a === 'sharefile') { const f = w.querySelector('#mcShPv')._file; try { await navigator.share({ files: [f], title, text: msg }); } catch (_) {} return; }
      if (a === 'print') { const src = w.querySelector('#mcShPv')._src; const pw = window.open('', '_blank'); if (!pw) return; pw.document.write(`<!doctype html><title>QR</title><style>@page{size:A4;margin:0}html,body{margin:0}img{width:100%;height:auto;display:block}</style><img src="${src}" onload="setTimeout(()=>print(),300)">`); pw.document.close(); return; }
    });
    return w;
  }
  window.MCShare = { open, shopUrl, productImage, shopImage, posterImage };
})();
