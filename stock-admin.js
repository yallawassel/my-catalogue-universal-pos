/* My Catalogue — "Stock on your catalogue": sold-out switches, quick counts, display settings. v15 */
(() => {
  const $ = id => document.getElementById(id);
  if (!$('avCard')) return;
  const A = () => window.MCAdmin || {};
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = (m, e) => (A().setStatus ? A().setStatus(m, e) : alert(m));
  const PAGE = 60;
  let stock = new Map(), settings = null, shown = PAGE, sel = new Set(), loadedFor = '', units = [];
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
    const un = await MC.fetchAll(() => MC.sb.from('mc_saas_product_units').select('id,product_id,unit_name,conversion_to_base,is_base_unit,conversion_configured').eq('business_id', b.id).eq('is_active', true));
    units = un.data || [];
    $('avAuto').checked = !!settings.reservations_enabled;
    $('avShow').checked = !!settings.show_on_catalogue; $('avHide').checked = !!settings.hide_out_of_stock;
    $('avBlock').checked = settings.block_out_of_stock_orders !== false; $('avQty').checked = !!settings.show_quantity;
    $('avLow').value = Number(settings.low_stock_threshold || 0);
    render();
  }
  function rows() {
    const q = $('avSearch').value.trim().toLowerCase(), f = $('avFilter').value;
    return (A().products || []).filter(p => (!q || [p.name, p.category, p.sku, p.barcode].join(' ').toLowerCase().includes(q)) && (f === 'all' || status(p) === f));
  }
  function renderUnits() {
    const prods = new Map((A().products || []).map(p => [p.id, p]));
    const base = new Map(units.filter(u => u.is_base_unit).map(u => [u.product_id, u.unit_name]));
    const todo = units.filter(u => !u.is_base_unit && !u.conversion_configured && prods.has(u.product_id));
    if (!todo.length) { $('avUnits').innerHTML = $('avAuto').checked ? '<p class="av-ok">✅ All selling units are ready — online orders reduce stock correctly.</p>' : ''; return; }
    $('avUnits').innerHTML = `<div class="av-units"><b>⚠️ ${todo.length} product${todo.length === 1 ? ' has' : 's have'} a second unit without a size</b><p class="hint" style="margin:2px 0 8px">Tell us how they relate so orders in that unit reduce the right amount. Orders in the main unit already work.</p>${todo.slice(0, 50).map(u => { const p = prods.get(u.product_id), bn = base.get(u.product_id) || p.label1 || 'unit'; return `<div class="av-unit" data-un="${esc(u.id)}"><span class="av-un-name">${esc(p.name)}</span><span>1 ${esc(bn)} =</span><input type="number" min="0" step="any" data-un-a placeholder="?" aria-label="How many ${esc(u.unit_name)} in 1 ${esc(bn)}"><span>${esc(u.unit_name)}</span><span class="hint">or</span><span>1 ${esc(u.unit_name)} =</span><input type="number" min="0" step="any" data-un-b placeholder="?" aria-label="How many ${esc(bn)} in 1 ${esc(u.unit_name)}"><span>${esc(bn)}</span><button type="button" class="btn" data-un-save="${esc(u.id)}">Save</button></div>`; }).join('')}</div>`;
  }
  // units a product can be counted in: base unit (factor 1) + second units with a known size, biggest first
  function unitsOf(p) {
    const list = units.filter(u => u.product_id === p.id && (u.is_base_unit || u.conversion_configured)).map(u => ({ id: u.id, name: u.unit_name, f: Number(u.conversion_to_base) || 1, base: u.is_base_unit }));
    if (!list.some(u => u.base)) list.unshift({ id: 'base', name: p.label1 || 'Unit', f: 1, base: true });
    return list.sort((a, b) => b.f - a.f);
  }
  const nice = v => Math.round(v * 1000) / 1000;
  function breakdown(p, q) {
    const us = unitsOf(p); if (us.length < 2) return `${nice(q)} ${esc(us[0].name)}`;
    let rest = q; const parts = [];
    us.forEach((u, i) => { const n = i === us.length - 1 ? nice(rest / u.f) : Math.floor(rest / u.f + 1e-9); if (n) parts.push(`${n} ${esc(u.name)}`); rest = nice(rest - n * u.f); });
    return parts.join(' + ') || `0 ${esc(us[0].name)}`;
  }
  function countCell(p, s) {
    const us = unitsOf(p), missing = units.some(u => u.product_id === p.id && !u.is_base_unit && !u.conversion_configured);
    const now = s && s.stock_initialized ? `<small class="av-now">Now: <b>${breakdown(p, Number(s.physical_qty_base))}</b></small>` : '<small class="av-now">Not counted yet</small>';
    return `${now}<div class="av-units-in">${us.map(u => `<label class="av-uin"><input type="number" min="0" step="any" placeholder="0" data-av-q="${esc(p.id)}" data-f="${u.f}" aria-label="${esc(u.name)}"><span>${esc(u.name)}</span></label>`).join('<span class="av-plus">+</span>')}</div>
      <div class="av-acts"><button type="button" class="btn" data-av-save="${esc(p.id)}" title="Replace the stock with this count">Set count</button><button type="button" class="btn" data-av-recv="${esc(p.id)}" title="Add goods received to the stock">＋ Received</button></div>${missing ? '<small class="av-miss">A unit has no size yet — set it above to count in it</small>' : ''}`;
  }
  function render() {
    renderUnits();
    const all = A().products || [], list = rows();
    const counts = all.reduce((m, p) => (m[status(p)] = (m[status(p)] || 0) + 1, m), {});
    $('avSum').innerHTML = ['out_of_stock', 'low_stock', 'in_stock', 'unknown'].filter(k => counts[k]).map(k => `<span class="av-chip ${k}">${LBL[k]} ${counts[k]}</span>`).join('');
    $('avTable').innerHTML = list.length ? `<div class="av-row av-head"><label><input type="checkbox" id="avAll" aria-label="Select all shown"></label><span>Product</span><span>Stock count</span><span>On the catalogue</span></div>` + list.slice(0, shown).map(p => {
      const s = stock.get(p.id), st = status(p), av = p.availability || 'auto';
      const qty = s && s.stock_initialized ? Number(s.physical_qty_base) : '';
      const res = s && Number(s.reserved_qty_base) > 0 ? `<small>${Number(s.reserved_qty_base)} reserved by orders</small>` : (s && s.last_pos_sync_at ? `<small>POS ${new Date(s.last_pos_sync_at).toLocaleDateString()}</small>` : '');
      return `<div class="av-row ${st}" data-av-id="${esc(p.id)}"><label><input type="checkbox" data-av-sel="${esc(p.id)}" ${sel.has(p.id) ? 'checked' : ''} aria-label="Select ${esc(p.name)}"></label>
        <div class="av-prod">${p.image ? `<img src="${esc(p.image)}" alt="" loading="lazy">` : '<span class="ph"></span>'}<div><b>${esc(p.name)}</b><small>${esc(p.category || '')} · <span class="av-chip ${st}">${LBL[st]}</span></small></div></div>
        <div class="av-count">${countCell(p, s)}${res}</div>
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
  function enteredBase(id) {
    const ins = [...document.querySelectorAll(`[data-av-q="${CSS.escape(id)}"]`)];
    if (!ins.some(i => i.value.trim() !== '')) return null;
    let q = 0;
    for (const i of ins) { const v = i.value.trim() === '' ? 0 : Number(i.value); if (!Number.isFinite(v) || v < 0) throw Error('Quantities must be zero or more.'); q += v * Number(i.dataset.f); }
    return Math.round(q * 1e6) / 1e6;
  }
  async function saveCount(id, receive) {
    const p = (A().products || []).find(x => x.id === id);
    const q = enteredBase(id);
    if (q === null) return toast(receive ? 'Type how many you received (in any unit), then press ＋ Received.' : 'Type how many you have (in any unit), then press Set count.', true);
    if (receive && q <= 0) return toast('Received quantity must be more than zero.', true);
    const r = receive
      ? await MC.sb.rpc('mc_saas_receive_stock', { p_business_id: A().biz.id, p_product_id: id, p_quantity_base: q, p_note: null })
      : await MC.sb.rpc('mc_saas_set_stock_count', { p_business_id: A().biz.id, p_product_id: id, p_quantity_base: q, p_note: null });
    if (r.error) throw r.error;
    const s = stock.get(id) || { product_id: id, reserved_qty_base: 0 };
    const newQ = receive ? Number(r.data) : q;
    s.physical_qty_base = newQ; s.stock_initialized = true; s.available_qty_base = Math.max(0, newQ - Number(s.reserved_qty_base || 0)); stock.set(id, s);
    render(); toast(`✅ ${receive ? 'Received ' + breakdown(p, q) + '. ' : ''}Stock now: ${breakdown(p, newQ)}.${newQ === 0 ? ' This product now shows as sold out.' : ''}`);
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
    const rv = e.target.closest('[data-av-recv]'); if (rv) return saveCount(rv.dataset.avRecv, true);
  }));
  $('avTable').addEventListener('keydown', guard(async e => { const i = e.target.closest('[data-av-q]'); if (i && e.key === 'Enter') { e.preventDefault(); await saveCount(i.dataset.avQ); } }));
  $('avTable').addEventListener('change', e => {
    if (e.target.id === 'avAll') { rows().slice(0, shown).forEach(p => e.target.checked ? sel.add(p.id) : sel.delete(p.id)); render(); return; }
    const c = e.target.closest('[data-av-sel]'); if (c) { c.checked ? sel.add(c.dataset.avSel) : sel.delete(c.dataset.avSel); $('avBulk').hidden = !sel.size; $('avSelCount').textContent = sel.size + ' selected'; }
  });
  $('avAuto').addEventListener('change', guard(async () => {
    const on = $('avAuto').checked;
    const r = await MC.sb.rpc('mc_saas_set_auto_stock', { p_business_id: A().biz.id, p_enabled: on });
    if (r.error) { $('avAuto').checked = !on; throw r.error; }
    settings.reservations_enabled = on; render();
    toast(on ? `✅ Online orders now reduce stock.${r.data ? ' ' + r.data + ' open order(s) are now holding stock.' : ''}` : 'Automatic stock reduction is off.');
  }));
  $('avUnits').addEventListener('click', guard(async e => {
    const b = e.target.closest('[data-un-save]'); if (!b) return;
    const row = b.closest('[data-un]'), a = Number(row.querySelector('[data-un-a]').value), c = Number(row.querySelector('[data-un-b]').value);
    const conv = c > 0 ? c : a > 0 ? 1 / a : NaN;
    if (!(conv > 0)) throw Error('Type one of the two numbers, e.g. 1 Box = 12 Packet.');
    const r = await MC.sb.rpc('mc_saas_set_unit_conversion', { p_business_id: A().biz.id, p_unit_id: b.dataset.unSave, p_conversion_to_base: conv });
    if (r.error) throw r.error;
    const u = units.find(x => x.id === b.dataset.unSave); if (u) { u.conversion_configured = true; u.conversion_to_base = conv; }
    render(); toast('✅ Unit size saved.');
  }));
  $('avBulk').addEventListener('click', guard(async e => { const b = e.target.closest('[data-av-bulk]'); if (!b) return; const ids = [...sel]; await setAvail(ids, b.dataset.avBulk); sel.clear(); render(); }));

  const prev = window.mcPageHooks && window.mcPageHooks.stock;
  if (window.mcPageHooks) window.mcPageHooks.stock = (...a) => { if (prev) prev(...a); load(false).catch(e => toast(e.message, true)); };
  document.addEventListener('mc:ready', () => { loadedFor = ''; if (location.hash === '#stock') load(true); });
  if (A().biz && location.hash === '#stock') load(true);
})();
