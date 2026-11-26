/* Raffi — no duplicate products (v1).
   In “Add / edit product”: as soon as a barcode is typed or scanned, check it against every product
   (and every extra unit barcode) of this shop. If it already exists, show which product it is with an
   “Open it” button, and block saving a second product with the same barcode.
   A product with exactly the same name gets a gentle warning only. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const ar = () => document.documentElement.dir === 'rtl' || document.documentElement.lang === 'ar';
  const L = (en, a) => (ar() ? a : en);
  const norm = v => String(v ?? '').replace(/\s+/g, '').replace(/^0+(?=\d)/, '').toUpperCase();
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const A = () => window.MCAdmin;
  let hit = null, seq = 0, tm = null;

  function box(id, after) {
    let b = $(id); if (b) return b;
    b = document.createElement('div'); b.id = id; b.hidden = true;
    b.style.cssText = 'margin:8px 0 4px;padding:10px 12px;border-radius:12px;font-size:14px;line-height:1.45';
    const anchor = after.closest('.mcsf') || after; anchor.insertAdjacentElement('afterend', b); return b;
  }
  function openProduct(pid) {
    const list = $('productList'); if (!list) return;
    const t = document.createElement('button'); t.type = 'button'; t.dataset.edit = pid; t.hidden = true;
    list.appendChild(t); t.click(); t.remove();
    setTimeout(() => { const n = $('pName'); if (n) { n.scrollIntoView({ behavior: 'smooth', block: 'center' }); } }, 150);
  }
  function show(p, unit) {
    const inp = $('pBarcode'), b = box('mcDupBarcode', inp);
    if (!p) { b.hidden = true; inp.style.borderColor = ''; inp.style.boxShadow = ''; return; }
    const A_ = A(), price = p.price1 != null && A_ && A_.biz ? (p.label1 ? p.label1 + ' ' : '') + MC.money(Number(p.price1), A_.biz.currency || 'USD') : '';
    b.style.background = '#fef2f2'; b.style.border = '2px solid #ef4444'; b.style.color = '#7f1d1d';
    b.innerHTML = `<b>⚠️ ${esc(L('This barcode is already in your catalogue:', 'هيدا الباركود موجود أصلاً بالكتالوج:'))}</b>
      <div style="display:flex;gap:10px;align-items:center;margin:8px 0">${p.image ? `<img src="${esc(p.image)}" alt="" style="width:48px;height:48px;object-fit:contain;background:#fff;border-radius:8px">` : ''}<div><b>${esc(p.name)}</b>${unit ? ` <small>(${esc(L('unit', 'وحدة'))}: ${esc(unit)})</small>` : ''}<br><small>${esc(p.category || '')}${price ? ' · ' + esc(price) : ''}</small></div></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="btn" data-dup-open>✏️ ${esc(L('Open it to edit', 'افتحه وعدّل عليه'))}</button><button type="button" class="btn ghost" data-dup-clear>${esc(L('Clear the barcode', 'امسح الباركود'))}</button></div>`;
    b.hidden = false; inp.style.borderColor = '#ef4444'; inp.style.boxShadow = '0 0 0 3px rgba(239,68,68,.2)';
    b.querySelector('[data-dup-open]').onclick = () => { show(null); hit = null; openProduct(p.id); };
    b.querySelector('[data-dup-clear]').onclick = () => { inp.value = ''; hit = null; show(null); inp.focus(); };
  }
  async function check() {
    const inp = $('pBarcode'), a = A(); if (!inp || !a || !a.biz) return null;
    const my = ($('productId') || {}).value || '', code = norm(inp.value), n = ++seq;
    if (!code) { hit = null; show(null); return null; }
    const ps = a.products || [];
    let p = ps.find(x => x.id !== my && norm(x.barcode) === code), unit = '';
    const SB = (window.MC && MC.sb) || null;
    if (!p && SB) {
      try {
        const raw = inp.value.trim(), vals = [...new Set([raw, raw.replace(/\s+/g, ''), code])];
        const r = await SB.from('mc_saas_product_units').select('product_id,unit_name,barcode').eq('business_id', a.biz.id).in('barcode', vals).limit(5);
        const u = (r.data || []).find(x => x.product_id !== my && norm(x.barcode) === code);
        if (u) { p = ps.find(x => x.id === u.product_id) || { id: u.product_id, name: L('Another product', 'منتج تاني') }; unit = u.unit_name || ''; }
      } catch (_) { /* offline: product list check only */ }
    }
    if (n !== seq) return hit;
    hit = p || null; show(hit, unit); return hit;
  }
  function nameCheck() {
    const inp = $('pName'), a = A(); if (!inp || !a) return;
    const my = ($('productId') || {}).value || '', v = inp.value.trim().toLowerCase().replace(/\s+/g, ' ');
    const b = box('mcDupName', inp);
    const p = v && (a.products || []).find(x => x.id !== my && String(x.name || '').trim().toLowerCase().replace(/\s+/g, ' ') === v);
    if (!p) { b.hidden = true; return; }
    b.style.background = '#fffbeb'; b.style.border = '1px solid #f59e0b'; b.style.color = '#78350f';
    b.innerHTML = `ℹ️ ${esc(L('A product with this exact name already exists', 'في منتج بنفس هالاسم بالزبط'))}${p.barcode ? ' (' + esc(p.barcode) + ')' : ''}. <a href="#" data-dup-open style="font-weight:800">${esc(L('Open it', 'افتحه'))}</a>`;
    b.hidden = false; b.querySelector('[data-dup-open]').onclick = e => { e.preventDefault(); b.hidden = true; openProduct(p.id); };
  }
  function wire() {
    const inp = $('pBarcode'), nm = $('pName'); if (!inp || inp.dataset.dupWired) return !!inp;
    inp.dataset.dupWired = '1';
    const later = () => { clearTimeout(tm); tm = setTimeout(check, 350); };
    inp.addEventListener('input', later); inp.addEventListener('change', check); inp.addEventListener('blur', check);
    if (nm) { nm.addEventListener('blur', nameCheck); nm.addEventListener('input', () => { const b = $('mcDupName'); if (b) b.hidden = true; }); }
    // When a product is opened / the form is reset, clear old warnings.
    const pid = $('productId'); if (pid) new MutationObserver(() => { hit = null; show(null); const b = $('mcDupName'); if (b) b.hidden = true; }).observe(pid, { attributes: true });
    // Block saving a duplicate (capture phase runs before the Save button's own handler).
    let ok = false;
    document.addEventListener('click', async e => {
      if (!e.target.closest('#saveProduct') || ok) return;
      if (!$('pBarcode').value.trim()) return;
      e.preventDefault(); e.stopImmediatePropagation();
      const p = await check();
      if (p) { $('pBarcode').scrollIntoView({ behavior: 'smooth', block: 'center' }); if (A() && A().setStatus) A().setStatus(L('Not saved: this barcode already belongs to “' + p.name + '”.', 'ما انحفظ: هيدا الباركود إلو لـ«' + p.name + '».'), true); return; }
      ok = true; try { $('saveProduct').click(); } finally { ok = false; }
    }, true);
    return true;
  }
  // productId is a hidden input whose .value changes don't fire events — watch the form fields instead.
  document.addEventListener('click', e => { if (e.target.closest('[data-edit],#resetProduct,#cancelEdit')) setTimeout(() => { hit = null; show(null); const b = $('mcDupName'); if (b) b.hidden = true; }, 50); }, true);
  const t0 = setInterval(() => { if (wire()) clearInterval(t0); }, 600);
  window.MCDupGuard = { check };
})();
