/* Raffi — send a quotation on WhatsApp with the product photos (v1).
   Draws the quotation as A4 pages (logo, client, photo · product · unit · qty · price · total, totals,
   notes) on a canvas, then shares it as a PDF or as photos through the phone's share sheet → WhatsApp.
   On a computer (no file sharing) it downloads the file and opens WhatsApp Web on the client's number.
   Also adds a floating button: ⬇ to the quotation items / ⬆ back to the top.
   Needs window.MCQuote = { payload, calc, fmt, biz } from quotation.html. Arabic text is drawn RTL. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const W = 1240, H = 1754, M = 70;                       // A4 at 150 dpi
  const FONT = 'Arial,"Segoe UI",Tahoma,"Noto Sans Arabic",sans-serif';
  const hasAr = s => /[؀-ۿ]/.test(String(s || ''));
  const Q = () => window.MCQuote;

  function loadImg(src) {
    return new Promise(res => {
      if (!src) return res(null);
      const im = new Image(); im.crossOrigin = 'anonymous';
      const t = setTimeout(() => res(null), 10000);
      im.onload = () => { clearTimeout(t); res(im); }; im.onerror = () => { clearTimeout(t); res(null); };
      im.src = src;
    });
  }
  function txt(ctx, s, x, y, o = {}) {
    s = String(s ?? ''); ctx.save();
    ctx.font = `${o.w || 400} ${o.size || 22}px ${FONT}`; ctx.fillStyle = o.color || '#172033';
    ctx.textBaseline = o.base || 'alphabetic'; ctx.direction = hasAr(s) ? 'rtl' : 'ltr';
    ctx.textAlign = o.align || 'left';
    if (o.max) { while (s.length > 1 && ctx.measureText(s).width > o.max) s = s.slice(0, -2) + '…'; }
    ctx.fillText(s, x, y); ctx.restore();
  }
  function wrap(ctx, s, max, size, weight, lines) {
    ctx.save(); ctx.font = `${weight || 400} ${size}px ${FONT}`;
    const out = []; let line = '';
    for (const w of String(s || '').split(/\s+/)) { const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > max && line) { out.push(line); line = w; } else line = t; }
    if (line) out.push(line); ctx.restore();
    if (out.length > lines) { out.length = lines; out[lines - 1] += '…'; }
    return out;
  }
  function contain(ctx, im, x, y, w, h) { const k = Math.min(w / im.naturalWidth, h / im.naturalHeight); const dw = im.naturalWidth * k, dh = im.naturalHeight * k; ctx.drawImage(im, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh); }
  function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  const brandColor = b => (/^#[0-9a-f]{6}$/i.test(b && b.primary_color || '') ? b.primary_color : '#173b63');

  async function pages() {
    const q = Q(); if (!q) throw Error('Quotation not ready yet.');
    const p = q.payload(), c = q.calc(), biz = q.biz(), fmt = q.fmt, col = brandColor(biz);
    if (!p.items.length) throw Error('Add at least one product first.');
    const [logo, ...imgs] = await Promise.all([loadImg(biz.logo_url), ...p.items.map(x => loadImg(x.image))]);
    const ROW = 118, out = [];
    const cols = [{ k: 'Photo', x: M, w: 110 }, { k: 'Product', x: M + 120, w: 470 }, { k: 'Unit', x: M + 600, w: 110 }, { k: 'Qty', x: M + 715, w: 90, r: true }, { k: 'Unit price', x: M + 810, w: 160, r: true }, { k: 'Total', x: M + 975, w: W - 2 * M - 975, r: true }];
    let i = 0, page = 0;
    const totalH = 260 + (p.notes ? 40 + 30 * Math.min(8, wrap(document.createElement('canvas').getContext('2d'), p.notes, W - 2 * M, 22, 400, 8).length) : 0);
    while (i < p.items.length || page === 0) {
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const ctx = cv.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = col; ctx.fillRect(0, 0, W, 14);
      let y = 60;
      if (page === 0) {
        let lx = M;
        if (logo) { contain(ctx, logo, M, y, 150, 120); lx = M + 170; }
        txt(ctx, biz.company_name, lx, y + 48, { size: 44, w: 800, color: col, max: 560 });
        wrap(ctx, biz.description || '', 540, 20, 400, 2).forEach((l, k) => txt(ctx, l, lx, y + 82 + k * 26, { size: 20, color: '#5b6577' }));
        if (biz.whatsapp) txt(ctx, '☎ ' + biz.whatsapp, lx, y + 140, { size: 20, color: '#5b6577' });
        txt(ctx, 'QUOTATION', W - M, y + 44, { size: 44, w: 900, align: 'right' });
        txt(ctx, p.quotationNumber, W - M, y + 82, { size: 24, w: 700, align: 'right' });
        txt(ctx, 'Date: ' + (p.date || ''), W - M, y + 112, { size: 20, align: 'right', color: '#5b6577' });
        if (p.validUntil) txt(ctx, 'Valid until: ' + p.validUntil, W - M, y + 140, { size: 20, align: 'right', color: '#5b6577' });
        y += 180; ctx.fillStyle = col; ctx.fillRect(M, y, W - 2 * M, 4); y += 30;
        ctx.fillStyle = '#f4f7fb'; rr(ctx, M, y, W - 2 * M, 150, 16); ctx.fill();
        txt(ctx, 'Prepared for', M + 24, y + 38, { size: 18, w: 700, color: '#5b6577' });
        txt(ctx, p.client.name, M + 24, y + 72, { size: 28, w: 800, max: 520 });
        txt(ctx, [p.client.phone, p.client.contact].filter(Boolean).join(' · '), M + 24, y + 104, { size: 20, color: '#3b4558', max: 520 });
        txt(ctx, p.client.address, M + 24, y + 132, { size: 20, color: '#3b4558', max: 520 });
        if (p.subject) { txt(ctx, 'Subject', W / 2 + 30, y + 38, { size: 18, w: 700, color: '#5b6577' }); wrap(ctx, p.subject, W / 2 - M - 60, 24, 700, 3).forEach((l, k) => txt(ctx, l, W / 2 + 30, y + 72 + k * 30, { size: 24, w: 700 })); }
        y += 180;
      } else {
        txt(ctx, biz.company_name, M, y + 30, { size: 28, w: 800, color: col });
        txt(ctx, 'QUOTATION ' + p.quotationNumber + ' (continued)', W - M, y + 30, { size: 22, w: 700, align: 'right' });
        y += 60;
      }
      // table header
      ctx.fillStyle = col; rr(ctx, M, y, W - 2 * M, 50, 10); ctx.fill();
      cols.forEach(cl => txt(ctx, cl.k, cl.r ? cl.x + cl.w - 12 : cl.x + (cl.k === 'Photo' ? 8 : 0), y + 33, { size: 19, w: 700, color: '#fff', align: cl.r ? 'right' : 'left' }));
      y += 58;
      const bottom = H - 110;
      while (i < p.items.length && y + ROW <= bottom - (i === p.items.length - 1 ? totalH : 0)) {
        const x = p.items[i], im = imgs[i];
        if (i % 2) { ctx.fillStyle = '#fafbfd'; ctx.fillRect(M, y, W - 2 * M, ROW); }
        ctx.fillStyle = '#f1f4f8'; rr(ctx, M + 4, y + 9, 100, 100, 12); ctx.fill();
        if (im) contain(ctx, im, M + 8, y + 13, 92, 92);
        const nl = wrap(ctx, x.name, 460, 23, 700, 2);
        nl.forEach((l, k) => txt(ctx, l, hasAr(l) ? M + 590 : M + 120, y + (nl.length > 1 ? 48 : 64) + k * 30, { size: 23, w: 700, align: hasAr(l) ? 'right' : 'left' }));
        txt(ctx, x.unit, M + 600, y + 64, { size: 21, color: '#3b4558', max: 105 });
        txt(ctx, String(x.qty), M + 793, y + 64, { size: 23, align: 'right' });
        txt(ctx, fmt(x.price), M + 958, y + 64, { size: 23, align: 'right' });
        txt(ctx, fmt(x.qty * x.price), W - M - 12, y + 64, { size: 23, w: 800, align: 'right' });
        ctx.fillStyle = '#e6eaf0'; ctx.fillRect(M, y + ROW - 1, W - 2 * M, 1);
        y += ROW; i++;
      }
      if (i >= p.items.length) {
        y += 24; const bx = W - M - 470;
        const line = (a, b, bold) => { txt(ctx, a, bx + 16, y + 30, { size: 23, color: '#3b4558', w: bold ? 800 : 400 }); txt(ctx, b, W - M - 16, y + 30, { size: 23, align: 'right', w: bold ? 800 : 600 }); y += 42; };
        line('Subtotal', fmt(c.sub));
        if (c.disc) line('Discount (' + p.discountPercent + '%)', '− ' + fmt(c.disc));
        if (c.fee) line('Extra fee / delivery', fmt(c.fee));
        ctx.fillStyle = col; rr(ctx, bx, y + 4, 470, 64, 12); ctx.fill();
        txt(ctx, 'TOTAL', bx + 20, y + 47, { size: 28, w: 900, color: '#fff' }); txt(ctx, fmt(c.total), W - M - 20, y + 47, { size: 30, w: 900, color: '#fff', align: 'right' });
        y += 100;
        if (p.notes) { txt(ctx, 'Notes / terms', M, y, { size: 19, w: 700, color: '#5b6577' }); y += 34; wrap(ctx, p.notes, W - 2 * M, 22, 400, 8).forEach(l => { txt(ctx, l, hasAr(l) ? W - M : M, y, { size: 22, align: hasAr(l) ? 'right' : 'left' }); y += 30; }); }
      }
      out.push(cv); page++;
      if (page > 40) break;
    }
    out.forEach((cv, k) => { const ctx = cv.getContext('2d'); txt(ctx, biz.company_name + ' · ' + p.quotationNumber, M, H - 50, { size: 18, color: '#8a93a3' }); txt(ctx, 'Page ' + (k + 1) + ' / ' + out.length, W - M, H - 50, { size: 18, color: '#8a93a3', align: 'right' }); });
    return { canvases: out, p, biz, c };
  }

  /* minimal PDF: one JPEG per A4 page */
  async function toPdf(canvases) {
    const enc = new TextEncoder(), parts = [], offs = []; let len = 0;
    const push = b => { const u = typeof b === 'string' ? enc.encode(b) : b; parts.push(u); len += u.length; };
    const obj = (n, body) => { offs[n] = len; push(`${n} 0 obj\n`); body(); push('\nendobj\n'); };
    const jpgs = await Promise.all(canvases.map(cv => new Promise(r => cv.toBlob(b => b.arrayBuffer().then(a => r(new Uint8Array(a))), 'image/jpeg', 0.86))));
    const n = canvases.length, kids = []; for (let k = 0; k < n; k++) kids.push(`${3 + k * 3} 0 R`);
    push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
    obj(1, () => push('<< /Type /Catalog /Pages 2 0 R >>'));
    obj(2, () => push(`<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${n} >>`));
    for (let k = 0; k < n; k++) {
      const pg = 3 + k * 3, img = pg + 1, cs = pg + 2, content = 'q 595.28 0 0 841.89 0 0 cm /Im0 Do Q';
      obj(pg, () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /Im0 ${img} 0 R >> >> /Contents ${cs} 0 R >>`));
      obj(img, () => { push(`<< /Type /XObject /Subtype /Image /Width ${W} /Height ${H} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpgs[k].length} >>\nstream\n`); push(jpgs[k]); push('\nendstream'); });
      obj(cs, () => push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`));
    }
    const total = 2 + n * 3, xref = len;
    let x = `xref\n0 ${total + 1}\n0000000000 65535 f \n`; for (let k = 1; k <= total; k++) x += String(offs[k]).padStart(10, '0') + ' 00000 n \n';
    push(x + `trailer\n<< /Size ${total + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
    return new Blob(parts, { type: 'application/pdf' });
  }

  const ar = () => document.documentElement.lang === 'ar';
  function waNumber(s) { let d = String(s || '').replace(/[^\d+]/g, ''); if (d.startsWith('+')) d = d.slice(1); else if (d.startsWith('00')) d = d.slice(2); return d.replace(/\D/g, ''); }
  function download(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }

  async function send(kind) {
    const st = $('saveStatus'), say = t => { if (st) st.textContent = t; };
    say('⏳ Preparing the quotation with photos…');
    const { canvases, p, biz, c } = await pages();
    const base = ('Quotation-' + (p.quotationNumber || 'Q')).replace(/[^\w.-]+/g, '-');
    const msg = `${biz.company_name} — Quotation ${p.quotationNumber}\n${p.client.name ? 'For: ' + p.client.name + '\n' : ''}Total: ${Q().fmt(c.total)}${p.validUntil ? '\nValid until: ' + p.validUntil : ''}`;
    let files;
    if (kind === 'pdf') files = [new File([await toPdf(canvases)], base + '.pdf', { type: 'application/pdf' })];
    else files = await Promise.all(canvases.map((cv, k) => new Promise(r => cv.toBlob(b => r(new File([b], base + (canvases.length > 1 ? '-' + (k + 1) : '') + '.jpg', { type: 'image/jpeg' })), 'image/jpeg', 0.9))));
    if (navigator.canShare && navigator.canShare({ files })) {
      try { await navigator.share({ files, text: msg, title: base }); say('✓ Sent. Choose WhatsApp and the client in the list.'); }
      catch (e) { if (e && e.name !== 'AbortError') throw e; say(''); }
      return;
    }
    files.forEach(f => download(f, f.name));
    const num = waNumber(p.client.phone);
    window.open('https://wa.me/' + (num || '') + '?text=' + encodeURIComponent(msg + '\n(' + (kind === 'pdf' ? 'PDF attached' : 'photos attached') + ')'), '_blank', 'noopener');
    say('✓ The ' + (kind === 'pdf' ? 'PDF was' : 'photos were') + ' downloaded. In WhatsApp, tap 📎 and attach ' + (kind === 'pdf' ? base + '.pdf' : 'the photos') + '.');
  }

  function ui() {
    const pdfBtn = $('pdf'); if (!pdfBtn || $('qsWa')) return;
    const st = document.createElement('style');
    st.textContent = '#qsWa{background:#25d366;color:#fff;border-color:#25d366;font-weight:800}.qsm{position:fixed;inset:0;background:rgba(10,20,35,.55);display:flex;align-items:flex-end;justify-content:center;z-index:9999}.qsm>div{background:#fff;width:100%;max-width:460px;border-radius:20px 20px 0 0;padding:18px 16px calc(18px + env(safe-area-inset-bottom))}.qsm h3{margin:0 0 6px}.qsm p{margin:0 0 12px;color:#5b6577;font-size:14px}.qsm button{display:block;width:100%;margin:8px 0;padding:14px;border-radius:12px;border:1px solid #dfe5ee;background:#f7f9fc;font-size:16px;font-weight:800;text-align:left;cursor:pointer}.qsm button small{display:block;font-weight:400;color:#5b6577;font-size:13px;margin-top:3px}.qsm .x{background:none;border:0;text-align:center;color:#5b6577}' +
      '#qsFloat{position:fixed;right:16px;bottom:calc(18px + env(safe-area-inset-bottom));z-index:9000;border:0;border-radius:999px;padding:14px 18px;font:800 15px Arial;color:#fff;background:#173b63;box-shadow:0 8px 22px rgba(0,0,0,.3);cursor:pointer;display:flex;align-items:center;gap:8px}#qsFloat i{font-style:normal;background:#fbbf24;color:#172033;border-radius:999px;min-width:24px;padding:2px 7px;font-size:13px}@media print{#qsFloat,.qsm{display:none!important}}';
    document.head.appendChild(st);
    const b = document.createElement('button'); b.type = 'button'; b.className = 'btn'; b.id = 'qsWa'; b.textContent = '📤 Send on WhatsApp';
    pdfBtn.insertAdjacentElement('beforebegin', b);
    b.onclick = () => {
      const m = document.createElement('div'); m.className = 'qsm';
      m.innerHTML = `<div><h3>📤 Send on WhatsApp</h3><p>With the product photos, prices and totals. Pick WhatsApp, then the client.</p>
        <button type="button" data-k="pdf">📄 As a PDF file<small>One clean document — best for companies and printing.</small></button>
        <button type="button" data-k="img">🖼 As photos<small>Opens directly in the chat — easiest for the client to see on the phone.</small></button>
        <button type="button" class="x" data-k="x">Cancel</button></div>`;
      document.body.appendChild(m);
      m.onclick = async e => {
        const k = e.target.closest('[data-k]'); if (e.target === m || (k && k.dataset.k === 'x')) return m.remove(); if (!k) return;
        m.remove(); b.disabled = true;
        try { await send(k.dataset.k === 'pdf' ? 'pdf' : 'img'); } catch (err) { const s = $('saveStatus'); if (s) s.textContent = '⚠️ ' + (err.message || err); } finally { b.disabled = false; }
      };
    };
    // floating ⬇ / ⬆
    const f = document.createElement('button'); f.type = 'button'; f.id = 'qsFloat'; document.body.appendChild(f);
    const panel = () => $('quotePanel');
    const draw = () => {
      const qp = panel(); if (!qp) return;
      const n = (Q() && Q().payload().items.length) || 0;
      const below = qp.getBoundingClientRect().top > innerHeight * 0.6;
      f.dataset.dir = below ? 'down' : 'up';
      f.innerHTML = below ? `⬇ Quotation${n ? ` <i>${n}</i>` : ''}` : '⬆ Top';
      f.style.display = (!below && scrollY < 200) ? 'none' : 'flex';
    };
    f.onclick = () => { if (f.dataset.dir === 'down') panel().scrollIntoView({ behavior: 'smooth', block: 'start' }); else scrollTo({ top: 0, behavior: 'smooth' }); };
    addEventListener('scroll', () => requestAnimationFrame(draw), { passive: true }); addEventListener('resize', draw);
    document.addEventListener('click', () => setTimeout(draw, 60)); document.addEventListener('input', () => setTimeout(draw, 60));
    setInterval(draw, 1500); draw();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ui); else ui();
  window.MCQuoteSend = { pages, toPdf, send };
})();
