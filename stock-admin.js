/* My Catalogue — "Stock on your catalogue": sold-out switches, quick counts, display settings. v15 */
(() => {
  const $ = id => document.getElementById(id);
  if (!$('avCard')) return;
  const A = () => window.MCAdmin || {};
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = (m, e) => (A().setStatus ? A().setStatus(m, e) : alert(m));
  const PAGE = 60;
  let stock = new Map(), settings = null, shown = PAGE, sel = new Set(), loadedFor = '';
  const LBL = { out_of_stock: 'Sold out', low_stock: 'Low stock', in_stock: 'In stock', unknown: 'Not tracked' };

  function status(p) {
    const s = stock.get(p.id), low = Number(settings?.low_stock_threshold || 0), av = p.availability || 'auto';
    if (av === 'out_of_stock') return 'out_of_stock';
    if (av === 'in_stock') return 'in_stock';
    if (!s || !s.stock_initialized || s.available_qty_base === null) return 'unknown';
    const q = Number(s.available_qty_base);
    return q <= 0 ? 'out_of_stock' : (low > 0 && q <= low ? 'low_stock' : 'in_stock');
  }
  async function load(force) {
    const b = A().biz; if (!b) return;
    if (!force && loadedFor === b.id) { render(); return; }
    loadedFor = b.id;
    const [st, av] = await Promise.all([
      MC.sb.from('mc_saas_stock_settings').select('*').eq('business_id', b.id).maybeSingle(),
      MC.fetchAll(() => MC.sb.from('mc_saas_stock_availability').select('product_id,physical_qty_base,stock_initialized,reserved_qty_base,available_qty_base,last_pos_sync_at').eq('business_id', b.id))
    ]);
    settings = st.data || { show_on_catalogue: true, hide_out_of_stock: false, block_out_of_stock_orders: true, low_stock_threshold: 0, show_quantity: false };
    stock = new Map((av.data || []).map(r => [r.product_id, r]));
    $('avShow').checked = !!settings.show_on_catalogue; $('avHide').checked = !!settings.hide_out_of_stock;
    $('avBlock').checked = settings.block_out_of_stock_orders !== false; $('avQty').checked = !!settings.show_quantity;
    $('avLow').value = Number(settings.low_stock_threshold || 0);
    render();
  }
  function rows() {
    const q = $('avSearch').value.trim().toLowerCase(), f = $('avFilter').value;
    return (A().products || []).filter(p => (!q || [p.name, p.category, p.sku, p.barcode].join(' ').toLowerCase().includes(q)) && (f === 'all' || status(p) === f));
  }
  function render() {
    const all = A().products || [], list = rows();
    const counts = all.reduce((m, p) => (m[status(p)] = (m[status(p)] || 0) + 1, m), {});
    $('avSum').innerHTML = ['out_of_stock', 'low_stock', 'in_stock', 'unknown'].filter(k => counts[k]).map(k => `<span class="av-chip ${k}">${LBL[k]} ${counts[k]}</span>`).join('');
    $('avTable').innerHTML = list.length ? `<div class="av-row av-head"><label><input type="checkbox" id="avAll" aria-label="Select all shown"></label><span>Product</span><span>Stock count</span><span>On the catalogue</span></div>` + list.slice(0, shown).map(p => {
      const s = stock.get(p.id), st = status(p), av = p.availability || 'auto';
      const qty = s && s.stock_initialized ? Number(s.physical_qty_base) : '';
      const res = s && Number(s.reserved_qty_base) > 0 ? `<small>${Number(s.reserved_qty_base)} reserved by orders</small>` : (s && s.last_pos_sync_at ? `<small>POS ${new Date(s.last_pos_sync_at).toLocaleDateString()}</small>` : '');
      return `<div class="av-row ${st}" data-av-id="${esc(p.id)}"><label><input type="checkbox" data-av-sel="${esc(p.id)}" ${sel.has(p.id) ? 'checked' : ''} aria-label="Select ${esc(p.name)}"></label>
        <div class="av-prod">${p.image ? `<img src="${esc(p.image)}" alt="" loading="lazy">` : '<span class="ph"></span>'}<div><b>${esc(p.name)}</b><small>${esc(p.category || '')} · <span class="av-chip ${st}">${LBL[st]}</span></small></div></div>
        <div class="av-count"><input type="number" min="0" step="1" value="${qty}" placeholder="—" data-av-count="${esc(p.id)}" aria-label="Stock count for ${esc(p.name)}"><button type="button" class="btn" data-av-save="${esc(p.id)}">Save</button>${res}</div>
        <div class="av-seg" role="group" aria-label="Availability for ${esc(p.name)}">${[['auto', '🔄 Auto'], ['in_stock', '✅ Available'], ['out_of_stock', '⛔ Sold out']].map(([k, t]) => `<button type="button" class="${av === k ? 'on' : ''}" data-av-set="${k}" data-av-pid="${esc(p.id)}" aria-pressed="${av === k}">${t}</button>`).join('')}</div></div>`;
    }).join('') : '<p class="hint">No products match.</p>';
    $('avMore').hidden = list.length <= shown;
    $('avBulk').hidden = !sel.size; $('avSelCount').textContent = sel.size + ' selected';
  }
  async function setAvail(ids, value) {
    const r = await MC.sb.rpc('mc_saas_set_product_availability', { p_business_id: A().biz.id, p_product_ids: ids, p_availability: value });
    if (r.error) throw r.error;
    (A().products || []).forEach(p => { if (ids.includes(p.id)) p.availability = value; });
    render();
    toast(`✅ ${ids.length} product${ids.length === 1 ? '' : 's'}: ${value === 'out_of_stock' ? 'sold out' : value === 'in_stock' ? 'always available' : 'follow stock count'}.`);
  }
  async function saveCount(id) {
    const input = document.querySelector(`[data-av-count="${CSS.escape(id)}"]`); if (!input) return;
    const v = input.value.trim(); if (v === '') return toast('Type the number of pieces you have, then press Save.', true);
    const q = Number(v); if (!Number.isFinite(q) || q < 0) return toast('Stock must be zero or more.', true);
    const r = await MC.sb.rpc('mc_saas_set_stock_count', { p_business_id: A().biz.id, p_product_id: id, p_quantity_base: q, p_note: null });
    if (r.error) throw r.error;
    const s = stock.get(id) || { product_id: id, reserved_qty_base: 0 };
    s.physical_qty_base = q; s.stock_initialized = true; s.available_qty_base = Math.max(0, q - Number(s.reserved_qty_base || 0)); stock.set(id, s);
    render(); toast(`✅ Stock saved: ${q}.${q === 0 ? ' This product now shows as sold out.' : ''}`);
  }
  async function saveSettings() {
    const b = A().biz; if (!b) return;
    const row = { business_id: b.id, show_on_catalogue: $('avShow').checked, hide_out_of_stock: $('avHide').checked, block_out_of_stock_orders: $('avBlock').checked, show_quantity: $('avQty').checked, low_stock_threshold: Math.max(0, Math.floor(Number($('avLow').value) || 0)), updated_at: new Date().toISOString() };
    const r = await MC.sb.from('mc_saas_stock_settings').upsert(row, { onConflict: 'business_id' });
    if (r.error) return toast('Could not save: ' + r.error.message, true);
    settings = { ...settings, ...row }; render(); toast('✅ Catalogue stock settings saved.');
  }
  const guard = fn => async (...a) => { try { await fn(...a); } catch (e) { toast(e.message || String(e), true); } };

  ['avShow', 'avHide', 'avBlock', 'avQty'].forEach(id => $(id).addEventListener('change', guard(saveSettings)));
  $('avLow').addEventListener('change', guard(saveSettings));
  $('avSearch').addEventListener('input', () => { shown = PAGE; render(); });
  $('avFilter').addEventListener('change', () => { shown = PAGE; render(); });
  $('avMore').addEventListener('click', () => { shown += PAGE; render(); });
  $('avRefresh').addEventListener('click', guard(() => load(true)));
  $('avTable').addEventListener('click', guard(async e => {
    const set = e.target.closest('[data-av-set]'); if (set) return setAvail([set.dataset.avPid], set.dataset.avSet);
    const sv = e.target.closest('[data-av-save]'); if (sv) return saveCount(sv.dataset.avSave);
  }));
  $('avTable').addEventListener('keydown', guard(async e => { const i = e.target.closest('[data-av-count]'); if (i && e.key === 'Enter') { e.preventDefault(); await saveCount(i.dataset.avCount); } }));
  $('avTable').addEventListener('change', e => {
    if (e.target.id === 'avAll') { rows().slice(0, shown).forEach(p => e.target.checked ? sel.add(p.id) : sel.delete(p.id)); render(); return; }
    const c = e.target.closest('[data-av-sel]'); if (c) { c.checked ? sel.add(c.dataset.avSel) : sel.delete(c.dataset.avSel); $('avBulk').hidden = !sel.size; $('avSelCount').textContent = sel.size + ' selected'; }
  });
  $('avBulk').addEventListener('click', guard(async e => { const b = e.target.closest('[data-av-bulk]'); if (!b) return; const ids = [...sel]; await setAvail(ids, b.dataset.avBulk); sel.clear(); render(); }));

  const prev = window.mcPageHooks && window.mcPageHooks.stock;
  if (window.mcPageHooks) window.mcPageHooks.stock = (...a) => { if (prev) prev(...a); load(false).catch(e => toast(e.message, true)); };
  document.addEventListener('mc:ready', () => { loadedFor = ''; if (location.hash === '#stock') load(true); });
  if (A().biz && location.hash === '#stock') load(true);
})();
