/* My Catalogue — AI credits shop + AI Pro photos (bulk phone photo → catalogue photo). v10 */
(() => {
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const A = () => window.MCAdmin || {};
  const sb = () => window.MC && MC.sb;
  const toast = (m, err = false) => (A().setStatus ? A().setStatus(m, err) : alert(m));
  const catOf = p => String(p.category || 'Products').trim() || 'Products';
  const on = (id, fn) => { const el = $(id); if (el) el.addEventListener('click', async () => { try { await fn(); } catch (e) { toast(e.message || String(e), true); } }); };
  if (!$('apCreditsCard')) return;

  /* ---------------------------- credits shop ---------------------------- */
  let balance = 0, packs = [], chosenPack = null;
  const METHOD = { whish: 'Whish Money', omt: 'OMT', cash: 'Cash', bank: 'Bank transfer', other: 'Other' };
  async function loadBalance() {
    const biz = A().biz; if (!biz) return;
    const r = await sb().rpc('mc_saas_ai_get_wallet', { p_business_id: biz.id });
    if (!r.error) { const row = Array.isArray(r.data) ? r.data[0] : r.data; balance = Number(row?.credits_balance ?? row?.balance ?? 0); }
    $('apBalance').textContent = balance.toLocaleString() + ' credits';
    estimate();
  }
  function renderPacks() {
    $('apPacks').innerHTML = packs.map(p => {
      const per = p.credits ? (Number(p.price_usd) / p.credits * 100).toFixed(1) : '';
      return `<button type="button" class="mc-tile" data-ap-pack="${esc(p.pack_key)}" style="--c:#0f766e;${chosenPack === p.pack_key ? 'outline:3px solid #0f766e;outline-offset:2px' : ''}"><span class="t-ic">💎</span><strong>${esc(p.display_name)}</strong><small><b style="font-size:20px;color:var(--ink)">$${Number(p.price_usd).toFixed(2)}</b><br>${p.credits} credits · ${per}¢ per photo</small></button>`;
    }).join('') || '<div class="mc-empty">No credit packs are available right now.</div>';
    const p = packs.find(x => x.pack_key === chosenPack);
    const btn = $('apRequest'); btn.disabled = !p; btn.textContent = p ? `Request ${p.display_name} · $${Number(p.price_usd).toFixed(2)}` : 'Choose a pack above';
  }
  async function loadShop() {
    const biz = A().biz; if (!biz) return;
    const [pk, st, od] = await Promise.all([
      sb().from('mc_saas_ai_credit_packs').select('*').eq('active', true).order('sort_order'),
      sb().from('mc_saas_platform_settings').select('value').eq('key', 'credit_payment_instructions').maybeSingle(),
      sb().from('mc_saas_ai_credit_orders').select('*').eq('business_id', biz.id).order('created_at', { ascending: false }).limit(10)
    ]);
    if (pk.error) { $('apPacks').innerHTML = `<div class="mc-empty">Credit packs are not installed yet (run sql/V10_AI_CREDITS_SHOP.sql). ${esc(pk.error.message)}</div>`; return; }
    packs = pk.data || []; renderPacks();
    $('apPayInfo').innerHTML = '<b>💸 How to pay</b>\n' + esc(st.data?.value || 'Contact the platform owner to pay for credits.');
    const orders = od.data || [];
    const pill = s => s === 'paid' ? '<span class="pill ok">Paid · credits added</span>' : s === 'cancelled' ? '<span class="pill bad">Cancelled</span>' : '<span class="pill warn">Waiting for payment confirmation</span>';
    $('apOrders').innerHTML = orders.length ? `<h4 style="margin:6px 0">My requests</h4><div style="overflow-x:auto"><table class="mc-table"><tr><th>Date</th><th>Pack</th><th>Price</th><th>Paid by</th><th>Status</th><th></th></tr>${orders.map(o => `<tr><td>${new Date(o.created_at).toLocaleDateString()}</td><td>${esc(o.pack_name)}</td><td>$${Number(o.price_usd).toFixed(2)}</td><td>${esc(METHOD[o.payment_method] || o.payment_method)}${o.payment_reference ? '<div class="hint" style="font-size:12px">' + esc(o.payment_reference) + '</div>' : ''}</td><td>${pill(o.status)}</td><td>${o.status === 'pending' ? `<button class="btn ghost" type="button" data-ap-cancel="${esc(o.id)}">Cancel</button>` : ''}</td></tr>`).join('')}</table></div>` : '';
  }
  $('apPacks').addEventListener('click', e => { const b = e.target.closest('[data-ap-pack]'); if (!b) return; chosenPack = b.dataset.apPack; renderPacks(); });
  on('apRequest', async () => {
    const p = packs.find(x => x.pack_key === chosenPack); if (!p) return;
    const r = await sb().rpc('mc_saas_ai_request_credits', { p_business_id: A().biz.id, p_pack_key: p.pack_key, p_payment_method: $('apPayMethod').value, p_reference: $('apPayRef').value.trim() });
    if (r.error) throw r.error;
    $('apPayRef').value = ''; chosenPack = null; await loadShop();
    toast(`✅ Request sent: ${p.display_name} for $${Number(p.price_usd).toFixed(2)}. Pay as shown, and your credits are added as soon as the payment is confirmed.`);
  });
  $('apOrders').addEventListener('click', async e => {
    const b = e.target.closest('[data-ap-cancel]'); if (!b) return;
    if (!confirm('Cancel this credit request?')) return;
    const r = await sb().rpc('mc_saas_ai_cancel_credit_request', { p_order_id: b.dataset.apCancel });
    if (r.error) toast(r.error.message, true); else { toast('Request cancelled.'); loadShop(); }
  });
  document.addEventListener('mc:ai-wallet', e => { balance = Number(e.detail?.balance || 0); $('apBalance').textContent = balance.toLocaleString() + ' credits'; estimate(); });

  /* ---------------------------- AI Pro photos ---------------------------- */
  const ap = { rows: [], stop: false, busy: false };
  const creditsPer = () => ($('apQuality').value === 'high' ? 2 : 1);
  function estimate() {
    const n = ap.rows.filter(r => !r.done && !r.result).length;
    const need = n * creditsPer();
    $('apEstimate').innerHTML = !ap.rows.length ? `You have <b>${balance}</b> credits. Choose photos, then press <b>Prepare list</b>.` :
      `${n} photo${n === 1 ? '' : 's'} × ${creditsPer()} credit = <b>${need} credits</b> · you have <b style="color:${balance >= need ? '#047857' : '#be123c'}">${balance}</b>${balance < need ? ' — buy a credit pack above, or remove some photos.' : ''}`;
  }
  $('apQuality').addEventListener('change', estimate);
  $('apSource').addEventListener('change', () => {
    const up = $('apSource').value === 'upload';
    $('apUploadBox').classList.toggle('hidden', !up); $('apCatBox').classList.toggle('hidden', up);
    if (!up) { const cats = [...new Set((A().products || []).map(catOf))].sort(); $('apCategory').innerHTML = '<option value="">All categories</option>' + cats.map(c => `<option>${esc(c)}</option>`).join(''); }
  });
  function prodOptions(sel) {
    const ps = (A().products || []).slice().sort((a, b) => a.name.localeCompare(b.name));
    return '<option value="">— no product (download only) —</option>' + ps.map(p => `<option value="${esc(p.id)}" ${p.id === sel ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
  }
  function render() {
    $('apGrid').innerHTML = ap.rows.map((r, i) => {
      const tag = r.saved ? ['Saved ✓', '#16302c'] : r.result ? ['AI pro ✨', '#059669'] : r.error ? ['Failed · refunded', '#be123c'] : r.working ? ['Working…', '#0f766e'] : ['Ready', '#627a76'];
      const before = r.file ? MCMatch.thumb(r.file) : r.srcUrl;
      return `<div class="mc-studio-card"><label class="sel"><input type="checkbox" data-ap-sel="${i}" ${r.selected ? 'checked' : ''} ${r.result && !r.saved ? '' : 'disabled'}></label><span class="tag" style="background:${tag[1]}">${esc(tag[0])}</span>
        <div class="ba"><img src="${esc(before)}" alt="before" title="Before">${r.result ? `<img src="${esc(r.result)}" alt="after" title="After">` : '<div style="display:grid;place-items:center;background:#fff;color:var(--muted);font-size:12px;aspect-ratio:1">after</div>'}</div>
        <div class="meta">${r.fixedProduct ? `<b>${esc(r.productName)}</b>` : `<select data-ap-prod="${i}" style="font-size:12px;padding:6px!important" ${r.saved ? 'disabled' : ''}>${prodOptions(r.productId)}</select>`}
        ${r.error ? `<div class="hint" style="font-size:11.5px;color:#be123c">${esc(r.error)}</div>` : ''}${r.result && !r.productId ? `<a class="hint" style="font-size:12px" href="${esc(r.result)}" target="_blank" download>Download</a>` : ''}</div></div>`;
    }).join('');
    const ready = ap.rows.filter(r => !r.result && !r.done).length, sel = ap.rows.filter(r => r.selected && r.result && !r.saved && r.productId).length;
    $('apRun').disabled = ap.busy || !ready; $('apStop').disabled = !ap.busy;
    $('apSave').disabled = ap.busy || !sel; $('apSave').textContent = `3️⃣ ✅ Save ${sel} to products`;
    estimate();
  }
  $('apGrid').addEventListener('change', e => {
    const s = e.target.closest('[data-ap-sel]'); if (s) { ap.rows[Number(s.dataset.apSel)].selected = s.checked; render(); return; }
    const p = e.target.closest('[data-ap-prod]'); if (p) { const r = ap.rows[Number(p.dataset.apProd)]; r.productId = p.value; r.productName = (A().products.find(x => x.id === p.value) || {}).name || ''; render(); }
  });
  on('apPrepare', () => {
    if (ap.busy) return;
    if ($('apSource').value === 'upload') {
      const files = Array.from($('apFiles').files || []).filter(f => /^image\//.test(f.type) || /\.(jpe?g|png|webp|heic)$/i.test(f.name));
      if (!files.length) throw Error('Choose some photos first.');
      const ps = A().products || [];
      const res = window.MCMatch ? MCMatch.match(ps.map(p => ({ key: p.id, name: p.name, barcode: p.barcode, sku: p.sku, posProductId: p.pos_product_id })), files) : { byItem: new Map() };
      const byFile = new Map(); res.byItem.forEach((m, pid) => byFile.set(m.file, pid));
      ap.rows = files.slice(0, 100).map(f => { const pid = byFile.get(f) || ''; return { file: f, productId: pid, productName: (ps.find(p => p.id === pid) || {}).name || '', selected: false }; });
      toast(`${ap.rows.length} photos ready${files.length > 100 ? ' (first 100)' : ''}. ${ap.rows.filter(r => r.productId).length} were linked to products automatically — check the product under each photo.`);
    } else {
      const cat = $('apCategory').value;
      const ps = (A().products || []).filter(p => p.image && (!cat || catOf(p) === cat));
      if (!ps.length) throw Error('No products with photos in this selection.');
      ap.rows = ps.slice(0, 100).map(p => ({ srcUrl: p.image, productId: p.id, productName: p.name, fixedProduct: true, selected: false }));
      toast(`${ap.rows.length} product photos ready${ps.length > 100 ? ' (first 100)' : ''}.`);
    }
    render();
  });
  async function toJpegBase64(src) {
    const img = await MCStudio.loadImage(src);
    const s = Math.min(1, 1536 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
    const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.9).split(',')[1];
  }
  async function fnError(error, data) {
    if (data && data.error) return data;
    try { if (error && error.context && error.context.json) return await error.context.json(); } catch (_) { }
    return { error: error?.message || 'AI request failed.' };
  }
  on('apRun', async () => {
    const todo = ap.rows.filter(r => !r.result && !r.done);
    const need = todo.length * creditsPer();
    if (balance < creditsPer()) throw Error('You have no AI credits left. Choose a credit pack above.');
    if (!confirm(`Make ${todo.length} AI pro photo(s)? This uses about ${need} credits (you have ${balance}). Failed photos are refunded.`)) return;
    ap.busy = true; ap.stop = false; render();
    let done = 0, ok = 0;
    const worker = async () => {
      while (!ap.stop) {
        const r = todo.find(x => !x.working && !x.result && !x.done); if (!r) return;
        r.working = true; r.error = ''; render();
        try {
          const image_base64 = await toJpegBase64(r.file || r.srcUrl);
          const { data, error } = await sb().functions.invoke('mc-ai-studio', { body: { action: 'pro_photo', business_id: A().biz.id, product_name: r.productName || '', quality: $('apQuality').value, background: $('apBackground').value, image_base64, image_mime: 'image/jpeg' } });
          if (error || !data?.image_url) { const e = await fnError(error, data); if (e.credits_needed) ap.stop = true; throw Error(e.error || 'AI request failed.'); }
          r.result = data.image_url; r.selected = !!r.productId; ok++;
        } catch (e) { r.error = e.message; r.done = true; }
        r.working = false; done++; $('apBar').style.width = Math.round(100 * done / todo.length) + '%'; render();
      }
    };
    await Promise.all([worker(), worker()]);
    ap.busy = false; render(); A().loadAiWallet && A().loadAiWallet();
    toast(`${ok} AI pro photo(s) ready${ap.stop && ok < todo.length ? ' — stopped' : ''}. Review them, untick any you don't like, then press Save.`);
  });
  on('apStop', () => { ap.stop = true; toast('Stopping after the photos in progress…'); });
  on('apSave', async () => {
    const chosen = ap.rows.filter(r => r.selected && r.result && !r.saved && r.productId);
    const replacing = chosen.filter(r => (A().products.find(p => p.id === r.productId) || {}).image).length;
    if (!confirm(`Save ${chosen.length} AI photo(s) to your products?${replacing ? ` ${replacing} will replace the current photo (the old file stays in storage).` : ''}`)) return;
    ap.busy = true; render(); let ok = 0;
    for (const r of chosen) { try { await A().setProductImageUrl(r.productId, r.result); r.saved = true; r.selected = false; ok++; } catch (e) { r.error = 'Save failed: ' + e.message; } render(); }
    ap.busy = false; render(); await A().loadProducts();
    toast(`✅ ${ok} AI pro photo(s) saved to your catalogue.`);
  });

  const start = () => { loadBalance(); loadShop(); };
  document.addEventListener('mc:ready', start);
  if (A().biz) start();
  window.addEventListener('hashchange', () => { if (location.hash === '#ai') start(); });
})();
