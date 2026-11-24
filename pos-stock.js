/* My Catalogue POS — Items & stock (add/edit items, units, cost, stock count, adjustments, movement history, inventory value)
   and Suppliers & purchases (supplier list, purchase invoices that add stock + update cost, supplier payments). v29 */
(() => {
  const P = window.POS, $ = P.$, esc = P.esc, sb = P.sb;
  const PAGE = 80;
  let items = [], units = [], stock = new Map(), lowDefault = 0, shown = PAGE, loaded = false;
  const sel = new Set();
  const nice = v => Math.round(Number(v) * 1000) / 1000;
  const money = v => v == null || v === '' ? '—' : P.fmt(v);

  /* ---------------- data ---------------- */
  async function loadItems(force) {
    if (loaded && !force) return draw();
    $('itList').innerHTML = '<div class="empty">Loading…</div>';
    try {
      const id = P.biz.id;
      const [pr, un, st, ss] = await Promise.all([
        MC.fetchAll(() => sb.from('mc_saas_products').select('id,name,category,barcode,sku,label1,price1,pieces1,label2,price2,pieces2,cost_price,reorder_level,is_active,image,sort_order,wholesale_price1,wholesale_price2').eq('business_id', id).order('name').order('id')),
        MC.fetchAll(() => sb.from('mc_saas_product_units').select('id,product_id,unit_name,conversion_to_base,is_base_unit,conversion_configured,is_active,barcode').eq('business_id', id).eq('is_active', true).order('id')),
        MC.fetchAll(() => sb.from('mc_saas_product_stock').select('product_id,physical_qty_base,stock_initialized').eq('business_id', id).order('product_id')),
        sb.from('mc_saas_stock_settings').select('low_stock_threshold').eq('business_id', id).maybeSingle()
      ]);
      for (const r of [pr, un, st]) if (r.error) throw r.error;
      items = pr.data || []; units = un.data || [];
      stock = new Map((st.data || []).filter(x => x.stock_initialized).map(x => [x.product_id, Number(x.physical_qty_base)]));
      lowDefault = Number(ss.data?.low_stock_threshold || 0);
      loaded = true; draw();
    } catch (e) { $('itList').innerHTML = '<div class="empty">Items need the internet.</div>'; if (!P.isNetErr(e)) P.err(e); }
  }
  // units an item can be counted / bought in: main unit (size 1) + units with a known size, biggest first
  function unitsOf(p) {
    const list = units.filter(u => u.product_id === p.id && (u.is_base_unit || u.conversion_configured)).map(u => ({ name: u.unit_name, f: Number(u.conversion_to_base) || 1, base: u.is_base_unit }));
    if (!list.some(u => u.base)) list.push({ name: 'Piece', f: 1, base: true });
    return list.sort((a, b) => b.f - a.f);
  }
  const baseName = p => (unitsOf(p).find(u => u.base) || { name: 'Piece' }).name;
  const factor = (p, name) => { const u = unitsOf(p).find(x => x.name.trim().toLowerCase() === String(name || '').trim().toLowerCase()); return u ? u.f : null; };
  const baseCost = p => p.cost_price == null ? null : Number(p.cost_price) / (factor(p, p.label1) || 1);
  function breakdown(p, q) {
    if (q == null) return '<span class="muted">not counted</span>';
    const us = unitsOf(p); if (us.length < 2) return `${nice(q)} ${esc(us[0].name)}`;
    let rest = Number(q); const parts = [];
    us.forEach((u, i) => { const n = i === us.length - 1 ? nice(rest / u.f) : Math.floor(rest / u.f + 1e-9); if (n) parts.push(`${n} ${esc(u.name)}`); rest = nice(rest - n * u.f); });
    return parts.join(' + ') || `0 ${esc(us[us.length - 1].name)}`;
  }
  const reorderAt = p => p.reorder_level != null ? Number(p.reorder_level) : lowDefault;
  function state(p) {
    const q = stock.get(p.id);
    if (q == null) return 'untracked';
    if (q <= 0) return 'out';
    return reorderAt(p) > 0 && q <= reorderAt(p) ? 'low' : 'ok';
  }

  /* ---------------- list ---------------- */
  function filtered() {
    const q = $('itSearch').value.trim().toLowerCase(), f = $('itFilter').value;
    return items.filter(p => (!q || [p.name, p.barcode, p.sku, p.category].join(' ').toLowerCase().includes(q)) && (
      f === 'all' ? true : f === 'hidden' ? p.is_active === false : f === 'nocost' ? p.cost_price == null : f === 'low' ? ['low', 'out'].includes(state(p)) : state(p) === f));
  }
  function draw() {
    let value = 0, valued = 0, low = 0, out = 0;
    items.forEach(p => { const q = stock.get(p.id), c = baseCost(p); if (q > 0 && c != null) { value += q * c; valued++; } const s = state(p); if (s === 'low') low++; if (s === 'out') out++; });
    const sc = P.can('see_cost');
    $('itKpis').innerHTML = `<div class="kpi"><small>Items</small><b>${items.length}</b></div>${sc ? `<div class="kpi good"><small>Stock value at cost</small><b>${P.fmt(value)}</b></div>` : ''}
      <div class="kpi bad"><small>Low stock (reorder)</small><b>${low}</b></div><div class="kpi bad"><small>Out of stock</small><b>${out}</b></div>${sc ? `<div class="kpi"><small>Without cost price</small><b>${items.filter(p => p.cost_price == null).length}</b></div>` : ''}`;
    const list = filtered(), g = sc ? 'grid-template-columns:34px 2fr 1.3fr 90px 1.4fr 100px 150px' : 'grid-template-columns:34px 2fr 1.3fr 1.4fr 150px';
    const st = { ok: '', low: '<span class="pill warn">Low</span>', out: '<span class="pill bad">Out</span>', untracked: '' };
    $('itList').innerHTML = `<div class="tr th" style="${g}"><span><input type="checkbox" id="itAll" aria-label="Select all shown"></span><span>Item</span><span>Prices</span>${sc ? '<span class="r">Cost</span>' : ''}<span>In stock</span>${sc ? '<span class="r">Value</span>' : ''}<span></span></div>` + (list.slice(0, shown).map(p => {
      const q = stock.get(p.id), c = baseCost(p);
      return `<div class="tr" style="${g}"><span><input type="checkbox" data-it-sel="${p.id}" ${sel.has(p.id) ? 'checked' : ''} aria-label="Select"></span><span><b>${esc(p.name)}</b>${p.is_active === false ? ' <span class="pill">Hidden</span>' : ''}<br><small class="muted">${esc(p.category || '')}${p.barcode ? ' · ' + esc(p.barcode) : ''}</small></span>
        <span><small>${esc(p.label1 || 'Unit')} ${money(p.price1)}${p.wholesale_price1 != null ? ` <span class="muted">· W ${P.fmt(p.wholesale_price1)}</span>` : ''}${p.label2 ? `<br>${esc(p.label2)} ${money(p.price2)}${p.wholesale_price2 != null ? ` <span class="muted">· W ${P.fmt(p.wholesale_price2)}</span>` : ''}` : ''}</small></span>
        ${sc ? `<span class="r">${p.cost_price != null ? `<small>${P.fmt(p.cost_price)}<br><span class="muted">/${esc(p.label1 || 'unit')}</span></small>` : '<small class="muted">—</small>'}</span>` : ''}
        <span>${st[state(p)]} ${breakdown(p, q)}</span>${sc ? `<span class="r">${q > 0 && c != null ? P.fmt(q * c) : '—'}</span>` : ''}
        <span class="r"><button class="btn sm" type="button" data-it-stock="${p.id}">Stock</button> <button class="btn sm" type="button" data-it-edit="${p.id}">Edit</button></span></div>`;
    }).join('') || '<div class="empty">No items found.</div>');
    $('itMore').hidden = list.length <= shown;
    selUI();
  }
  function selUI() { $('itLabels').textContent = sel.size ? `🏷️ Labels (${sel.size})` : '🏷️ Labels'; }
  $('itSearch').oninput = () => { shown = PAGE; draw(); };
  $('itFilter').onchange = () => { shown = PAGE; draw(); };
  $('itMore').onclick = () => { shown += PAGE; draw(); };
  $('itAdd').onclick = () => editItem(null);
  $('itList').onchange = e => {
    if (e.target.id === 'itAll') { filtered().slice(0, shown).forEach(p => e.target.checked ? sel.add(p.id) : sel.delete(p.id)); draw(); return; }
    const t = e.target.closest('[data-it-sel]'); if (t) { t.checked ? sel.add(t.dataset.itSel) : sel.delete(t.dataset.itSel); selUI(); }
  };
  $('itList').onclick = e => {
    const ed = e.target.closest('[data-it-edit]'); if (ed) return editItem(items.find(p => p.id === ed.dataset.itEdit));
    const sk = e.target.closest('[data-it-stock]'); if (sk) return stockSheet(items.find(p => p.id === sk.dataset.itStock));
  };

  /* ---------------- add / edit item ---------------- */
  function editItem(p) {
    const cats = [...new Set(items.map(x => x.category).filter(Boolean))].sort();
    const v = (k, d = '') => esc(p && p[k] != null ? p[k] : d);
    const b = P.modal(p ? 'Edit item' : 'New item', `
      <label for="eiName">Name</label><input id="eiName" value="${v('name')}" maxlength="200">
      <div class="row2"><div><label for="eiCat">Category</label><input id="eiCat" list="eiCats" value="${v('category', 'Products')}"><datalist id="eiCats">${cats.map(c => `<option value="${esc(c)}">`).join('')}</datalist></div>
      <div><label for="eiBarcode">Barcode</label><input id="eiBarcode" value="${v('barcode')}" autocomplete="off"></div></div>
      <div class="row2"><div><label for="eiSku">SKU / item code</label><input id="eiSku" value="${v('sku')}"></div><div><label for="eiReorder">Reorder when stock is at or below (${esc(p ? baseName(p) : 'pieces')})</label><input id="eiReorder" type="number" min="0" step="any" value="${v('reorder_level')}" placeholder="${lowDefault || ''}"></div></div>
      <h4 style="margin:12px 0 4px">First unit (sold most)</h4>
      <div class="row4"><div><label for="eiL1">Unit name</label><input id="eiL1" value="${v('label1', 'Piece')}" placeholder="Piece, Packet, Box, Kg"></div><div><label for="eiP1">Price USD</label><input id="eiP1" type="number" min="0" step="0.01" value="${v('price1')}"></div>
      <div><label for="eiN1">Pieces in it</label><input id="eiN1" type="number" min="0" step="any" value="${v('pieces1')}" placeholder="1 if it is a piece"></div><div><label for="eiW1">Wholesale price</label><input id="eiW1" type="number" min="0" step="0.01" value="${v('wholesale_price1')}" placeholder="optional"></div></div>
      ${P.can('see_cost') ? `<div class="row4"><div><label for="eiCost">Cost of the first unit</label><input id="eiCost" type="number" min="0" step="0.0001" value="${v('cost_price')}"></div><div></div><div></div><div></div></div>` : ''}
      <h4 style="margin:12px 0 4px">Second unit (optional)</h4>
      <div class="row4"><div><label for="eiL2">Unit name</label><input id="eiL2" value="${v('label2')}" placeholder="e.g. Box"></div><div><label for="eiP2">Price USD</label><input id="eiP2" type="number" min="0" step="0.01" value="${v('price2')}"></div>
      <div><label for="eiN2">Pieces in it</label><input id="eiN2" type="number" min="0" step="any" value="${v('pieces2')}" placeholder="e.g. 450"></div><div><label for="eiW2">Wholesale price</label><input id="eiW2" type="number" min="0" step="0.01" value="${v('wholesale_price2')}" placeholder="optional"></div></div>
      <label class="check"><input type="checkbox" id="eiActive" ${!p || p.is_active !== false ? 'checked' : ''}> Show on the catalogue and in the till</label>
      <p class="muted small">Stock is counted in pieces (the main unit). "Pieces in it" lets a sale of 1 box take the right amount out of stock.</p>
      <div class="sheet-foot">${p ? '<button class="btn" type="button" id="eiStock">Stock…</button>' : ''}<button class="btn primary" type="button" id="eiOk">${p ? 'Save' : 'Add item'}</button></div>`, { wide: true });
    const g = id => b.querySelector(id), numOrNull = x => { const s = g(x).value.trim(); return s === '' ? null : P.num(s); };
    if (p) g('#eiStock').onclick = () => { P.close(); stockSheet(p); };
    g('#eiOk').onclick = async () => {
      const row = {
        name: g('#eiName').value.trim(), category: g('#eiCat').value.trim() || 'Products', barcode: g('#eiBarcode').value.trim(), sku: g('#eiSku').value.trim(),
        label1: g('#eiL1').value.trim() || 'Piece', price1: numOrNull('#eiP1'), pieces1: numOrNull('#eiN1'), wholesale_price1: numOrNull('#eiW1'),
        label2: g('#eiL2').value.trim(), price2: g('#eiL2').value.trim() ? numOrNull('#eiP2') : null, pieces2: g('#eiL2').value.trim() ? numOrNull('#eiN2') : null, wholesale_price2: g('#eiL2').value.trim() ? numOrNull('#eiW2') : null,
        reorder_level: numOrNull('#eiReorder'), is_active: g('#eiActive').checked, updated_at: new Date().toISOString()
      };
      if (g('#eiCost')) row.cost_price = numOrNull('#eiCost');
      if (!row.name) return P.toast('Name is required.', true);
      if ([row.pieces1, row.pieces2].some(x => x !== null && x <= 0)) return P.toast('"Pieces in it" must be more than 0.', true);
      try {
        if (row.barcode) {
          const dup = items.find(x => x.id !== p?.id && x.barcode && x.barcode.trim() === row.barcode);
          if (dup && !(await P.confirm('Barcode already used', `${esc(dup.name)} already has this barcode. Save anyway?`, 'Save anyway'))) return;
        }
        if (p) {
          const r = await sb.from('mc_saas_products').update(row).eq('id', p.id).eq('business_id', P.biz.id); if (r.error) throw r.error;
          Object.assign(p, row);
        } else {
          const maxSort = items.reduce((m, x) => Math.max(m, Number(x.sort_order) || 0), 0);
          const r = await sb.from('mc_saas_products').insert({ ...row, business_id: P.biz.id, sort_order: maxSort + 1 }).select('id,name,category,barcode,sku,label1,price1,pieces1,label2,price2,pieces2,cost_price,reorder_level,is_active,image,sort_order,wholesale_price1,wholesale_price2').single();
          if (r.error) throw r.error; items.push(r.data); p = r.data;
        }
        P.close(); await loadItems(true); await P.loadData().catch(() => { }); P.toast('✅ Item saved.');
      } catch (e) { P.err(e); }
    };
  }

  /* ---------------- stock: count, add/remove, history ---------------- */
  async function stockSheet(p) {
    const us = unitsOf(p), q = stock.get(p.id), bn = baseName(p);
    const b = P.modal('Stock — ' + p.name, `
      <div class="pay-top"><div><small>In stock now</small><b>${breakdown(p, q)}</b></div><div><small>in ${esc(bn)}</small><b>${q == null ? '—' : nice(q)}</b></div></div>
      <div class="seg" id="skMode" role="radiogroup" aria-label="Action"><button type="button" data-v="count" class="on">🔢 Count (set the real stock)</button><button type="button" data-v="add">➕ Add</button><button type="button" data-v="remove">➖ Remove (damaged, lost…)</button></div>
      <div class="row4" style="margin-top:10px">${us.map((u, i) => `<div><label for="skU${i}">${esc(u.name)}${u.f !== 1 ? ` <small class="muted">(${nice(u.f)} ${esc(bn)})</small>` : ''}</label><input id="skU${i}" data-f="${u.f}" type="number" min="0" step="any" inputmode="decimal" placeholder="0"></div>`).join('')}</div>
      <div id="skReasonWrap" hidden><label for="skReason">Reason</label><select id="skReason"><option>Damaged</option><option>Expired</option><option>Lost / stolen</option><option>Used in the shop</option><option>Found / extra</option><option>Gift / sample</option><option>Other</option></select></div>
      <label for="skNote">Note</label><input id="skNote" placeholder="Optional">
      <p class="pay-status ok" id="skSum"></p>
      <div class="sheet-foot"><button class="btn primary" type="button" id="skOk">Save stock</button></div>
      <h4 style="margin:16px 0 6px">History</h4><div id="skHist" class="table"><div class="empty">Loading…</div></div>`, { wide: true });
    const g = id => b.querySelector(id);
    let mode = 'count';
    const total = () => [...b.querySelectorAll('[data-f]')].reduce((s, i) => s + P.num(i.value) * Number(i.dataset.f), 0);
    const sum = () => {
      const t = total();
      g('#skSum').innerHTML = mode === 'count' ? `<span>New stock: ${breakdown(p, t)}</span><span>${q != null ? (t - q >= 0 ? '+' : '') + nice(t - q) + ' ' + esc(bn) : ''}</span>`
        : `<span>${mode === 'add' ? 'Add' : 'Remove'} ${nice(t)} ${esc(bn)}</span><span>After: ${breakdown(p, Math.max(0, (q || 0) + (mode === 'add' ? t : -t)))}</span>`;
    };
    g('#skMode').onclick = e => { const x = e.target.closest('[data-v]'); if (!x) return; mode = x.dataset.v; g('#skMode').querySelectorAll('button').forEach(y => y.classList.toggle('on', y === x)); g('#skReasonWrap').hidden = mode !== 'remove'; sum(); };
    b.querySelectorAll('[data-f]').forEach(i => i.oninput = sum); sum();
    g('#skOk').onclick = async () => {
      const t = nice(total()), note = g('#skNote').value.trim();
      try {
        let r;
        if (mode === 'count') r = await sb.rpc('mc_saas_set_stock_count', { p_business_id: P.biz.id, p_product_id: p.id, p_quantity_base: t, p_note: note || null });
        else {
          if (t <= 0) return P.toast('Enter how many to ' + (mode === 'add' ? 'add.' : 'remove.'), true);
          r = await sb.rpc('mc_saas_adjust_stock', { p_business_id: P.biz.id, p_product_id: p.id, p_delta_base: mode === 'add' ? t : -t, p_reason: (mode === 'remove' ? g('#skReason').value + (note ? ' — ' + note : '') : (note || 'Added by hand')) });
        }
        if (r.error) throw r.error;
        stock.set(p.id, Number(r.data)); P.close(); draw(); P.refreshStock && P.refreshStock();
        P.toast(`✅ ${p.name}: ${breakdown(p, Number(r.data)).replace(/<[^>]+>/g, '')} in stock.`);
      } catch (e) { P.err(e); }
    };
    try {
      const h = await sb.from('mc_saas_stock_movements').select('created_at,movement_type,quantity_base,note').eq('business_id', P.biz.id).eq('product_id', p.id).order('created_at', { ascending: false }).limit(40);
      if (h.error) throw h.error;
      const T = { purchase: '🚚 Purchase', pos_sale: '🛒 Sale', online_sale: '🌐 Online order', return: '↩️ Return', adjustment: '✏️ Adjustment', opening_balance: '📋 Opening stock', pos_snapshot: '🔌 From your POS' };
      const gg = 'grid-template-columns:130px 150px 110px 1fr';
      g('#skHist').innerHTML = (h.data || []).length ? `<div class="tr th" style="${gg}"><span>When</span><span>What</span><span class="r">${esc(bn)}</span><span>Note</span></div>` + h.data.map(m => `<div class="tr" style="${gg}"><span>${P.dt(m.created_at)}</span><span>${T[m.movement_type] || esc(m.movement_type)}</span><span class="r" style="color:${Number(m.quantity_base) < 0 ? 'var(--bad)' : 'var(--ok)'}">${Number(m.quantity_base) > 0 ? '+' : ''}${nice(m.quantity_base)}</span><span class="muted small">${esc(m.note || '')}</span></div>`).join('') : '<div class="empty">No stock movements yet.</div>';
    } catch (_) { g('#skHist').innerHTML = '<div class="empty">History needs the internet.</div>'; }
  }

  /* ---------------- inventory Excel ---------------- */
  $('itXlsx').onclick = async () => {
    try {
      if (!loaded) await loadItems(true);
      const X = await P.loadXlsx(), wb = X.utils.book_new();
      const sc = P.can('see_cost'); const rows = items.map(p => { const q = stock.get(p.id), c = sc ? baseCost(p) : null; return [p.name, p.category || '', p.barcode || '', p.sku || '', p.label1 || '', p.price1 ?? '', p.label2 || '', p.price2 ?? '', sc ? (p.cost_price ?? '') : '', q == null ? '' : nice(q), baseName(p), breakdown(p, q).replace(/<[^>]+>/g, ''), q > 0 && c != null ? P.r2(q * c) : '', reorderAt(p) || '', { ok: 'OK', low: 'REORDER', out: 'OUT', untracked: 'not counted' }[state(p)], p.is_active === false ? 'hidden' : '']; });
      X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([['Item', 'Category', 'Barcode', 'SKU', 'Unit 1', 'Price 1', 'Unit 2', 'Price 2', 'Cost (unit 1)', 'Stock (main unit)', 'Main unit', 'Stock', 'Value at cost', 'Reorder at', 'Status', 'Shown'], ...rows]), 'Inventory');
      const re = items.filter(p => ['low', 'out'].includes(state(p))).map(p => [p.name, p.category || '', breakdown(p, stock.get(p.id)).replace(/<[^>]+>/g, ''), reorderAt(p) || '', sc ? (p.cost_price ?? '') : '']);
      X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([['Item', 'Category', 'In stock', 'Reorder at', 'Last cost (unit 1)'], ...re]), 'To reorder');
      X.writeFile(wb, `${P.biz.slug || 'shop'}-inventory-${P.today()}.xlsx`);
    } catch (e) { P.err(e); }
  };

  /* ================= STOCK COUNT (stocktake) ================= */
  // A count can take days: it is kept on this device until you apply it.
  const DKEY = () => 'stocktake';
  function countDraft() { return P.load(DKEY(), null) || { started: new Date().toISOString(), lines: {} }; }
  function saveDraft(d) { P.save(DKEY(), d); }
  const byCode = code => {
    const c = String(code || '').trim().toLowerCase(); if (!c) return null;
    const u = units.find(x => x.barcode && x.barcode.trim().toLowerCase() === c);
    if (u) { const p = items.find(x => x.id === u.product_id); if (p) return { p, f: Number(u.conversion_to_base) || 1, unit: u.unit_name }; }
    const p = items.find(x => (x.barcode && x.barcode.trim().toLowerCase() === c) || (x.sku && x.sku.trim().toLowerCase() === c));
    return p ? { p, f: factor(p, p.label1) || 1, unit: p.label1 } : null;
  };
  async function stocktake() {
    if (!P.can('stocktake')) return P.toast('You are not allowed to do a stock count.', true);
    if (!loaded) await loadItems(true);
    const d = countDraft();
    const cats = [...new Set(items.map(x => x.category).filter(Boolean))].sort();
    const b = P.modal('🔢 Stock count', `
      <p class="muted small">Scan each item on the shelf (every scan adds 1), or search and type the quantity. Your count is kept on this device until you press <b>Apply</b>. Started ${P.dt(d.started)}.</p>
      <div class="row2"><div><label for="stScan">Scan or search</label><input id="stScan" type="search" autocomplete="off" placeholder="Scan a barcode or type a name…"></div>
      <div><label for="stCat">Or add a whole category to count</label><select id="stCat"><option value="">— choose —</option>${cats.map(c => `<option>${esc(c)}</option>`).join('')}</select></div></div>
      <div id="stHits" class="list"></div>
      <div class="kpis" id="stKpis"></div>
      <div class="table" id="stLines"></div>
      <label class="check"><input type="checkbox" id="stZero"> Items I did not count are <b>zero</b> (only for a full shop count)</label>
      <div class="sheet-foot"><button class="btn danger" type="button" id="stClear">Start over</button><button class="btn" type="button" id="stXlsx">📗 Excel</button><button class="btn primary" type="button" id="stApply">Apply the count</button></div>`, { wide: true });
    const g = id => b.querySelector(id), sc = P.can('see_cost');
    const counted = id => { const l = d.lines[id]; return l ? Object.entries(l.u || {}).reduce((t, [name, n]) => t + P.num(n) * (factor(items.find(x => x.id === id), name) || 1), 0) : 0; };
    function addQty(p, unitName, n) {
      const l = d.lines[p.id] || (d.lines[p.id] = { u: {}, at: Date.now() });
      l.u[unitName] = P.r2(P.num(l.u[unitName]) + n); l.at = Date.now(); saveDraft(d); drawCount();
    }
    function drawCount() {
      const ids = Object.keys(d.lines).sort((a, b) => d.lines[b].at - d.lines[a].at);
      let diffVal = 0, plus = 0, minus = 0;
      const rows = ids.map(id => {
        const p = items.find(x => x.id === id); if (!p) return '';
        const sys = stock.get(id) ?? 0, cnt = counted(id), diff = nice(cnt - sys), c = baseCost(p);
        if (diff > 0) plus++; if (diff < 0) minus++; if (c != null) diffVal += diff * c;
        return `<div class="tr" style="${gl}"><span><b>${esc(p.name)}</b><br><small class="muted">system: ${breakdown(p, stock.get(id))}</small></span>
          <span class="st-units">${unitsOf(p).map(u => `<label><small>${esc(u.name)}</small><input type="number" min="0" step="any" data-st-id="${id}" data-st-u="${esc(u.name)}" value="${d.lines[id].u[u.name] ?? ''}" placeholder="0"></label>`).join('')}</span>
          <span class="r"><b>${breakdown(p, cnt)}</b></span><span class="r" style="color:${diff < 0 ? 'var(--bad)' : diff > 0 ? 'var(--ok)' : 'inherit'}">${diff > 0 ? '+' : ''}${diff}</span>${sc ? `<span class="r">${c != null && diff ? P.fmt(diff * c) : '—'}</span>` : ''}
          <span><button class="icon-btn" type="button" data-st-rm="${id}" aria-label="Remove">✕</button></span></div>`;
      }).join('');
      g('#stKpis').innerHTML = `<div class="kpi"><small>Items counted</small><b>${ids.length}</b></div><div class="kpi good"><small>More than system</small><b>${plus}</b></div><div class="kpi bad"><small>Less than system</small><b>${minus}</b></div>${sc ? `<div class="kpi ${diffVal < 0 ? 'bad' : 'good'}"><small>Difference at cost</small><b>${P.fmt(diffVal)}</b></div>` : ''}`;
      g('#stLines').innerHTML = ids.length ? `<div class="tr th" style="${gl}"><span>Item</span><span>Counted</span><span class="r">Total</span><span class="r">Difference</span>${sc ? '<span class="r">Value</span>' : ''}<span></span></div>` + rows : '<div class="empty">Scan your first item.</div>';
    }
    const gl = sc ? 'grid-template-columns:1.5fr 1.6fr 110px 90px 90px 36px' : 'grid-template-columns:1.6fr 1.8fr 120px 100px 36px';
    g('#stScan').onkeydown = e => {
      if (e.key !== 'Enter') return; e.preventDefault();
      const hit = byCode(g('#stScan').value);
      if (hit) { addQty(hit.p, hit.unit || unitsOf(hit.p)[unitsOf(hit.p).length - 1].name, 1); P.toast('+1 ' + (hit.unit || '') + ' · ' + hit.p.name); g('#stScan').value = ''; g('#stHits').innerHTML = ''; }
      else { const h = g('#stHits').querySelector('[data-st-add]'); if (h) h.click(); else P.toast('No item with this barcode.', true); }
    };
    g('#stScan').oninput = () => {
      const q = g('#stScan').value.trim().toLowerCase(); if (q.length < 2 || /^\d{6,}$/.test(q)) { g('#stHits').innerHTML = ''; return; }
      g('#stHits').innerHTML = items.filter(p => [p.name, p.sku].join(' ').toLowerCase().includes(q)).slice(0, 8).map(p => `<button type="button" data-st-add="${p.id}">${esc(p.name)}</button>`).join('');
    };
    g('#stHits').onclick = e => { const t = e.target.closest('[data-st-add]'); if (!t) return; const p = items.find(x => x.id === t.dataset.stAdd); if (!d.lines[p.id]) { d.lines[p.id] = { u: {}, at: Date.now() }; saveDraft(d); } g('#stScan').value = ''; g('#stHits').innerHTML = ''; drawCount(); const inp = g(`[data-st-id="${p.id}"]`); if (inp) inp.focus(); };
    g('#stCat').onchange = () => { const c = g('#stCat').value; if (!c) return; items.filter(p => p.category === c && p.is_active !== false).forEach(p => { if (!d.lines[p.id]) d.lines[p.id] = { u: {}, at: 0 }; }); saveDraft(d); g('#stCat').value = ''; drawCount(); };
    g('#stLines').oninput = e => { const t = e.target.closest('[data-st-id]'); if (!t) return; d.lines[t.dataset.stId].u[t.dataset.stU] = t.value; saveDraft(d); };
    g('#stLines').onchange = e => { if (e.target.closest('[data-st-id]')) drawCount(); };
    g('#stLines').onclick = e => { const t = e.target.closest('[data-st-rm]'); if (t) { delete d.lines[t.dataset.stRm]; saveDraft(d); drawCount(); } };
    g('#stClear').onclick = async () => { if (await P.confirm('Start over?', 'This deletes the count on this device.', 'Delete the count')) { P.save(DKEY(), null); stocktake(); } };
    g('#stXlsx').onclick = async () => {
      try {
        const X = await P.loadXlsx(), wb = X.utils.book_new();
        const rows = Object.keys(d.lines).map(id => { const p = items.find(x => x.id === id); if (!p) return null; const sys = stock.get(id) ?? 0, cnt = counted(id), c = baseCost(p); return [p.name, p.category || '', p.barcode || '', nice(sys), nice(cnt), nice(cnt - sys), baseName(p), sc && c != null ? P.r2((cnt - sys) * c) : '']; }).filter(Boolean);
        X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([['Item', 'Category', 'Barcode', 'System', 'Counted', 'Difference', 'Unit', 'Difference at cost'], ...rows]), 'Stock count');
        X.writeFile(wb, `${P.biz.slug || 'shop'}-stock-count-${P.today()}.xlsx`);
      } catch (e) { P.err(e); }
    };
    g('#stApply').onclick = async () => {
      const ids = Object.keys(d.lines);
      const lines = ids.map(id => ({ product_id: id, counted: nice(counted(id)) }));
      if (g('#stZero').checked) items.filter(p => !d.lines[p.id] && (stock.get(p.id) || 0) > 0).forEach(p => lines.push({ product_id: p.id, counted: 0 }));
      if (!lines.length) return P.toast('Nothing counted yet.', true);
      const zeroed = lines.length - ids.length;
      if (!(await P.confirm('Apply the count?', `Stock will be set to what you counted for <b>${ids.length}</b> item(s)${zeroed ? ` and to <b>zero</b> for ${zeroed} item(s) you did not count` : ''}. Every change is kept in each item's history.`, 'Apply'))) return;
      try {
        let done = 0;
        for (let i = 0; i < lines.length; i += 500) {
          const r = await sb.rpc('mc_saas_apply_stocktake', { p_business_id: P.biz.id, p_lines: lines.slice(i, i + 500), p_note: 'Stock count ' + P.today() });
          if (r.error) throw r.error; done += r.data.items;
        }
        P.save(DKEY(), null); loaded = false; await loadItems(true); P.refreshStock && P.refreshStock();
        P.toast(`✅ Stock count applied to ${done} item(s).`);
      } catch (e) { P.err(e); }
    };
    drawCount(); g('#stScan').focus();
  }
  $('itCount').onclick = () => stocktake();

  /* ================= BARCODE & PRICE LABELS ================= */
  const loadJsBarcode = () => window.JsBarcode ? Promise.resolve() : new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js'; s.onload = res; s.onerror = () => rej(new Error('Could not load the barcode tool. Check the internet.')); document.head.appendChild(s); });
  const ean13 = body12 => { const d = body12.split('').map(Number); const sum = d.reduce((t, x, i) => t + x * (i % 2 ? 3 : 1), 0); return body12 + ((10 - sum % 10) % 10); };
  function newCode() {
    // in-store EAN-13 starting with 2 (reserved for shop use, never clashes with factory barcodes)
    const used = new Set(items.map(p => (p.barcode || '').trim()));
    for (let i = 0; i < 50; i++) { const c = ean13('2' + String(Date.now()).slice(-7) + String(Math.floor(Math.random() * 1e4)).padStart(4, '0')); if (!used.has(c)) return c; }
    return ean13('2' + String(Math.floor(Math.random() * 1e11)).padStart(11, '0'));
  }
  const SIZES = { '38x25': { w: 38, h: 25, name: 'Small label 38 × 25 mm' }, '50x30': { w: 50, h: 30, name: 'Label 50 × 30 mm' }, '58x40': { w: 58, h: 40, name: 'Big label 58 × 40 mm' }, 'a4': { w: 63.5, h: 38.1, name: 'A4 sheet — 21 labels (3 × 7)' } };
  async function labels() {
    if (!loaded) await loadItems(true);
    let list = sel.size ? items.filter(p => sel.has(p.id)) : filtered();
    if (!list.length) return P.toast('Select the items to print (tick them in the list).', true);
    if (list.length > 300) list = list.slice(0, 300);
    const noCode = list.filter(p => !(p.barcode || '').trim());
    const pref = P.load('label-prefs', { size: '50x30', name: true, price: '1', shop: true, copies: '1' });
    const b = P.modal('🏷️ Print barcode labels', `<p class="muted small">${list.length} item(s)${sel.size ? ' selected' : ' in the list'}.${noCode.length ? ` <b>${noCode.length}</b> have no barcode yet.` : ''}</p>
      ${noCode.length ? `<button class="btn" type="button" id="lbGen">Create barcodes for the ${noCode.length} item(s) without one</button>` : ''}
      <div class="row4"><div><label for="lbSize">Label</label><select id="lbSize">${Object.entries(SIZES).map(([k, v]) => `<option value="${k}" ${pref.size === k ? 'selected' : ''}>${v.name}</option>`).join('')}</select></div>
      <div><label for="lbPrice">Price on the label</label><select id="lbPrice"><option value="1" ${pref.price === '1' ? 'selected' : ''}>First unit price</option><option value="2" ${pref.price === '2' ? 'selected' : ''}>Second unit price</option><option value="both" ${pref.price === 'both' ? 'selected' : ''}>Both prices</option><option value="0" ${pref.price === '0' ? 'selected' : ''}>No price</option></select></div>
      <div><label for="lbCopies">Copies of each</label><select id="lbCopies"><option value="1">1</option><option value="2">2</option><option value="5">5</option><option value="10">10</option><option value="stock">= stock in first unit</option></select></div><div></div></div>
      <label class="check"><input type="checkbox" id="lbName" ${pref.name ? 'checked' : ''}> Item name</label><label class="check"><input type="checkbox" id="lbShop" ${pref.shop ? 'checked' : ''}> Shop name</label>
      <div id="lbPreview" class="lb-preview"></div>
      <div class="sheet-foot"><button class="btn primary" type="button" id="lbPrint">🖨️ Print labels</button></div>`, { wide: true });
    const g = id => b.querySelector(id);
    g('#lbCopies').value = pref.copies || '1';
    if (g('#lbGen')) g('#lbGen').onclick = async () => {
      try {
        for (const p of noCode) { const code = newCode(); const r = await sb.from('mc_saas_products').update({ barcode: code, updated_at: new Date().toISOString() }).eq('id', p.id).eq('business_id', P.biz.id); if (r.error) throw r.error; p.barcode = code; }
        P.toast(`✅ ${noCode.length} barcode(s) created and saved.`); P.loadData().catch(() => { }); P.close(); labels();
      } catch (e) { P.err(e); }
    };
    const opts = () => ({ size: g('#lbSize').value, price: g('#lbPrice').value, copies: g('#lbCopies').value, name: g('#lbName').checked, shop: g('#lbShop').checked });
    async function labelHtml(p, o) {
      await loadJsBarcode();
      const code = (p.barcode || '').trim(), S = SIZES[o.size];
      let svg = '';
      if (code) {
        const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        try { JsBarcode(el, code, { format: /^\d{13}$/.test(code) ? 'EAN13' : /^\d{8}$/.test(code) ? 'EAN8' : 'CODE128', displayValue: true, fontSize: 14, height: 40, margin: 0, width: 1.6 }); }
        catch (_) { JsBarcode(el, code, { format: 'CODE128', displayValue: true, fontSize: 14, height: 40, margin: 0, width: 1.6 }); }
        el.setAttribute('preserveAspectRatio', 'xMidYMid meet'); el.removeAttribute('width'); el.removeAttribute('height'); svg = el.outerHTML;
      }
      const pr = [o.price === '1' || o.price === 'both' ? (p.price1 != null ? `${P.fmt(p.price1)}${o.price === 'both' ? ' / ' + esc(p.label1 || '') : ''}` : '') : '', o.price === '2' || o.price === 'both' ? (p.price2 != null ? `${P.fmt(p.price2)}${o.price === 'both' ? ' / ' + esc(p.label2 || '') : ''}` : '') : ''].filter(Boolean).join(' · ');
      return `<div class="lb" style="width:${S.w}mm;height:${S.h}mm">${o.shop ? `<div class="lb-shop">${esc(P.biz.company_name)}</div>` : ''}${o.name ? `<div class="lb-name">${esc(p.name)}</div>` : ''}${svg ? `<div class="lb-code">${svg}</div>` : '<div class="lb-code lb-none">no barcode</div>'}${pr ? `<div class="lb-price">${pr}</div>` : ''}</div>`;
    }
    const css = S => `*{box-sizing:border-box;margin:0}body{font-family:Arial,Helvetica,sans-serif;color:#000}.lb{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:1.2mm 1.5mm;overflow:hidden;page-break-inside:avoid;text-align:center}
      .lb-shop{font-size:6.5pt;font-weight:700;letter-spacing:.2px}.lb-name{font-size:7.5pt;line-height:1.1;max-height:2.3em;overflow:hidden;width:100%}.lb-code{flex:1;width:100%;min-height:0;display:flex;align-items:center;justify-content:center}.lb-code svg{width:100%;height:100%;max-height:100%}
      .lb-price{font-size:11pt;font-weight:800}.lb-none{font-size:7pt;color:#888}`;
    async function build(o) {
      const S = SIZES[o.size], out = [];
      for (const p of list) { const n = o.copies === 'stock' ? Math.max(0, Math.min(200, Math.floor((stock.get(p.id) || 0) / (factor(p, p.label1) || 1)))) : Number(o.copies) || 1; const h = await labelHtml(p, o); for (let i = 0; i < n; i++) out.push(h); }
      const page = o.size === 'a4' ? `@page{size:A4;margin:10.7mm 7.2mm}.sheet{display:grid;grid-template-columns:repeat(3,${S.w}mm);grid-auto-rows:${S.h}mm;column-gap:2.5mm}` : `@page{size:${S.w}mm ${S.h}mm;margin:0}.lb{page-break-after:always}`;
      return { html: `<!doctype html><html><head><meta charset="utf-8"><style>${css(S)}${page}</style></head><body>${o.size === 'a4' ? `<div class="sheet">${out.join('')}</div>` : out.join('')}</body></html>`, count: out.length };
    }
    async function preview() { try { const o = opts(); const h = await labelHtml(list[0], o); g('#lbPreview').innerHTML = `<style>${css(SIZES[o.size])}</style><p class="muted small">Preview</p><div class="lb-frame">${h}</div>`; } catch (e) { g('#lbPreview').textContent = e.message; } }
    b.querySelectorAll('select,input').forEach(i => i.addEventListener('change', preview)); preview();
    g('#lbPrint').onclick = async () => {
      const o = opts(); P.save('label-prefs', o);
      try { const r = await build(o); if (!r.count) return P.toast('Nothing to print (copies = 0).', true); P.printHtml(r.html); P.toast(`🖨️ ${r.count} label(s) sent to the printer.`); } catch (e) { P.err(e); }
    };
  }
  $('itLabels').onclick = () => labels();

  /* ================= SUPPLIERS & PURCHASES ================= */
  let suppliers = [], purchases = [];
  async function loadPurchases() {
    $('supList').innerHTML = '<div class="empty">Loading…</div>';
    try {
      if (!loaded) await loadItems(true);
      const [s, p] = await Promise.all([
        MC.fetchAll(() => sb.from('mc_saas_suppliers').select('*').eq('business_id', P.biz.id).order('name').order('id')),
        sb.from('mc_saas_purchases').select('*').eq('business_id', P.biz.id).order('created_at', { ascending: false }).limit(100)
      ]);
      if (s.error) throw s.error; if (p.error) throw p.error;
      suppliers = s.data || []; purchases = p.data || []; drawPurchases();
    } catch (e) { $('supList').innerHTML = '<div class="empty">Suppliers need the internet. If this is new, run the v29 database update.</div>'; if (!P.isNetErr(e)) P.err(e); }
  }
  function drawPurchases() {
    const owed = suppliers.reduce((t, x) => t + Math.max(0, Number(x.balance)), 0);
    const m0 = P.today().slice(0, 7), month = purchases.filter(x => String(x.purchase_date).slice(0, 7) === m0).reduce((t, x) => t + Number(x.total), 0);
    $('puKpis').innerHTML = `<div class="kpi bad"><small>You owe suppliers</small><b>${P.fmt(owed)}</b></div><div class="kpi"><small>Purchases this month</small><b>${P.fmt(month)}</b></div><div class="kpi"><small>Suppliers</small><b>${suppliers.length}</b></div>`;
    const g = 'grid-template-columns:1.6fr 1fr 110px 260px';
    $('supList').innerHTML = `<div class="tr th" style="${g}"><span>Supplier</span><span>Phone</span><span class="r">You owe</span><span></span></div>` + (suppliers.map(x => `<div class="tr" style="${g}"><b>${esc(x.name)}</b><span>${esc(x.phone || '')}</span><span class="r" style="color:${Number(x.balance) > 0.009 ? 'var(--bad)' : 'inherit'}">${P.fmt(x.balance)}</span>
      <span class="r"><button class="btn sm" type="button" data-sp-pay="${x.id}">💵 Pay</button> <button class="btn sm" type="button" data-sp-buy="${x.id}">🚚 Buy</button> <button class="btn sm" type="button" data-sp-st="${x.id}">History</button> <button class="btn sm" type="button" data-sp-ed="${x.id}">Edit</button></span></div>`).join('') || '<div class="empty">No suppliers yet. Add your first supplier.</div>');
    const gp = 'grid-template-columns:110px 90px 1.4fr 1fr 110px 110px 80px';
    $('puList').innerHTML = `<div class="tr th" style="${gp}"><span>Date</span><span>No.</span><span>Supplier</span><span>Their invoice</span><span class="r">Total</span><span class="r">Paid</span><span></span></div>` + (purchases.map(x => `<div class="tr" style="${gp}"><span>${esc(x.purchase_date)}</span><span>P-${String(x.purchase_no).padStart(5, '0')}</span><span>${esc(x.supplier_name || '')}</span><span>${esc(x.ref_no || '')}</span><span class="r">${P.fmt(x.total)}</span><span class="r">${P.fmt(x.paid)}</span><span class="r"><button class="btn sm" type="button" data-pu-view="${x.id}">View</button></span></div>`).join('') || '<div class="empty">No purchases yet.</div>');
  }
  $('puRefresh').onclick = loadPurchases;
  $('supAdd').onclick = () => editSupplier(null);
  $('puNew').onclick = () => newPurchase(null);
  $('supList').onclick = e => {
    const f = (a, k) => { const t = e.target.closest(`[${a}]`); return t && suppliers.find(x => x.id === t.getAttribute(a)); };
    let s;
    if ((s = f('data-sp-pay'))) return paySupplier(s);
    if ((s = f('data-sp-buy'))) return newPurchase(s);
    if ((s = f('data-sp-st'))) return supplierHistory(s);
    if ((s = f('data-sp-ed'))) return editSupplier(s);
  };
  $('puList').onclick = e => { const t = e.target.closest('[data-pu-view]'); if (t) viewPurchase(purchases.find(x => x.id === t.dataset.puView)); };

  function editSupplier(s, after) {
    const b = P.modal(s ? 'Edit supplier' : 'New supplier', `<div class="row2"><div><label for="esName">Name</label><input id="esName" value="${esc(s?.name || '')}"></div><div><label for="esPhone">Phone</label><input id="esPhone" value="${esc(s?.phone || '')}" inputmode="tel"></div></div>
      <label for="esNote">Note</label><input id="esNote" value="${esc(s?.note || '')}"><div class="sheet-foot"><button class="btn primary" type="button" id="esOk">Save</button></div>`);
    b.querySelector('#esOk').onclick = async () => {
      const name = b.querySelector('#esName').value.trim(); if (!name) return P.toast('Name is required.', true);
      try {
        const r = await sb.rpc('mc_saas_save_supplier', { p_business_id: P.biz.id, p_id: s ? s.id : null, p_name: name, p_phone: b.querySelector('#esPhone').value.trim(), p_note: b.querySelector('#esNote').value.trim(), p_active: true });
        if (r.error) throw r.error;
        P.close(); await loadPurchases(); P.toast('✅ Supplier saved.');
        if (after) after(suppliers.find(x => x.id === r.data));
      } catch (e) { P.err(e); }
    };
  }
  function paySupplier(s) {
    const b = P.modal('Pay supplier — ' + s.name, `<div class="pay-top"><div><small>You owe</small><b style="color:var(--bad)">${P.fmt(s.balance)}</b></div><div><small>in LBP</small><b>${P.fmtL(P.toLbp(Math.max(0, s.balance)))}</b></div></div>
      <div class="row4"><div><label for="spUsd">USD</label><input id="spUsd" type="number" min="0" step="0.01" inputmode="decimal"></div><div><label for="spLbp">LBP</label><input id="spLbp" type="number" min="0" step="1000" inputmode="numeric"></div>
      <div><label for="spMethod">Paid by</label><select id="spMethod"><option value="cash">Cash</option><option value="bank">Bank transfer</option><option value="cheque">Cheque</option><option value="card">Card</option></select></div><div><label>&nbsp;</label><button class="btn" type="button" id="spAll">Pay all</button></div></div>
      <label class="check"><input type="checkbox" id="spDrawer" checked> Taken from the cash drawer</label><label for="spNote">Note</label><input id="spNote">
      <p class="pay-status ok" id="spSt">Enter the amount paid.</p><div class="sheet-foot"><button class="btn primary" type="button" id="spOk">Save payment</button></div>`);
    const g = id => b.querySelector(id);
    const calc = () => { const v = P.num(g('#spUsd').value) + P.num(g('#spLbp').value) / P.rate(); g('#spSt').innerHTML = `<span>Paid ${P.fmt(v)}</span><span>Still owed ${P.fmt(s.balance - v)}</span>`; };
    b.querySelectorAll('input').forEach(i => i.oninput = calc);
    g('#spMethod').onchange = () => { g('#spDrawer').checked = g('#spMethod').value === 'cash'; };
    g('#spAll').onclick = () => { g('#spUsd').value = P.r2(Math.max(0, s.balance)); calc(); };
    g('#spOk').onclick = async () => {
      try {
        const r = await sb.rpc('mc_saas_supplier_payment', { p_business_id: P.biz.id, p_pay: { client_uuid: P.uuid(), supplier_id: s.id, paid_usd: P.num(g('#spUsd').value), paid_lbp: P.num(g('#spLbp').value), rate: P.rate(), method: g('#spMethod').value, from_drawer: g('#spDrawer').checked, note: g('#spNote').value.trim(), shift_id: P.shift?.id || null, cashier_id: P.cashier ? P.cashier.id : null } });
        if (r.error) throw r.error;
        P.close(); await loadPurchases(); P.toast(`✅ Paid ${P.fmt(r.data.amount)} to ${s.name}. Still owed ${P.fmt(r.data.balance)}.`);
      } catch (e) { P.err(e); }
    };
  }
  async function supplierHistory(s) {
    try {
      const [p, y] = await Promise.all([
        MC.fetchAll(() => sb.from('mc_saas_purchases').select('created_at,purchase_no,ref_no,total,paid').eq('business_id', P.biz.id).eq('supplier_id', s.id).order('created_at')),
        MC.fetchAll(() => sb.from('mc_saas_supplier_payments').select('created_at,amount_usd,method,note,purchase_id').eq('business_id', P.biz.id).eq('supplier_id', s.id).order('created_at'))
      ]);
      const rows = [...(p.data || []).map(x => ({ d: x.created_at, t: 'Purchase P-' + String(x.purchase_no).padStart(5, '0') + (x.ref_no ? ' (' + x.ref_no + ')' : ''), a: Number(x.total) })),
        ...(y.data || []).map(x => ({ d: x.created_at, t: 'Payment · ' + x.method + (x.note ? ' · ' + x.note : ''), a: -Number(x.amount_usd) }))].sort((a, b) => a.d.localeCompare(b.d));
      let bal = 0; const g = 'grid-template-columns:130px 1fr 110px 110px';
      P.modal('History — ' + s.name, `<div class="table"><div class="tr th" style="${g}"><span>Date</span><span>What</span><span class="r">Amount</span><span class="r">You owe</span></div>${rows.map(r => { bal += r.a; return `<div class="tr" style="${g}"><span>${P.dt(r.d)}</span><span>${esc(r.t)}</span><span class="r">${P.fmt(r.a)}</span><span class="r">${P.fmt(bal)}</span></div>`; }).join('') || '<div class="empty">Nothing yet.</div>'}</div>`, { wide: true });
    } catch (e) { P.err(e); }
  }
  function viewPurchase(x) {
    const g = 'grid-template-columns:1.6fr 90px 90px 110px 110px';
    P.modal(`Purchase P-${String(x.purchase_no).padStart(5, '0')}`, `<p class="muted">${esc(x.purchase_date)} · ${esc(x.supplier_name || '')}${x.ref_no ? ' · their invoice ' + esc(x.ref_no) : ''}${x.cashier_name ? ' · by ' + esc(x.cashier_name) : ''}</p>
      <div class="table"><div class="tr th" style="${g}"><span>Item</span><span>Unit</span><span class="r">Qty</span><span class="r">Cost</span><span class="r">Total</span></div>${(x.items || []).map(i => `<div class="tr" style="${g}"><span>${esc(i.name)}</span><span>${esc(i.unit)}</span><span class="r">${nice(i.qty)}</span><span class="r">${P.fmt(i.unit_cost)}</span><span class="r">${P.fmt(i.line_total)}</span></div>`).join('')}</div>
      <table class="pl"><tr><td>Subtotal</td><td>${P.fmt(x.subtotal)}</td></tr>${Number(x.discount) ? `<tr><td>Discount</td><td>−${P.fmt(x.discount)}</td></tr>` : ''}<tr class="total"><td>Total</td><td>${P.fmt(x.total)}</td></tr><tr><td>Paid</td><td>${P.fmt(x.paid)}</td></tr><tr><td>Added to what you owe</td><td>${P.fmt(x.total - x.paid)}</td></tr></table>${x.note ? `<p class="muted">${esc(x.note)}</p>` : ''}`, { wide: true });
  }

  /* ---------------- new purchase ---------------- */
  function newPurchase(sup) {
    if (!P.online) return P.toast('Purchases need the internet.', true);
    let lines = [];
    const b = P.modal('New purchase', `
      <div class="row4"><div><label for="npSup">Supplier</label><select id="npSup"><option value="">— choose —</option>${suppliers.map(s => `<option value="${s.id}" ${sup && sup.id === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}<option value="__new">＋ New supplier…</option></select></div>
      <div><label for="npRef">Their invoice no.</label><input id="npRef"></div><div><label for="npDate">Date</label><input id="npDate" type="date" value="${P.today()}"></div><div></div></div>
      <label for="npSearch">Add items — scan a barcode or type a name</label><input id="npSearch" type="search" autocomplete="off" placeholder="Scan or search…"><div id="npHits" class="list"></div>
      <div class="table" id="npLines"></div>
      <div class="row4"><div><label for="npDisc">Discount USD</label><input id="npDisc" type="number" min="0" step="0.01"></div><div><label for="npPaidUsd">Paid now USD</label><input id="npPaidUsd" type="number" min="0" step="0.01"></div>
      <div><label for="npPaidLbp">Paid now LBP</label><input id="npPaidLbp" type="number" min="0" step="1000"></div><div><label for="npMethod">Paid by</label><select id="npMethod"><option value="cash">Cash (from drawer)</option><option value="bank">Bank transfer</option><option value="cheque">Cheque</option><option value="card">Card</option></select></div></div>
      <label class="check"><input type="checkbox" id="npCost" checked> Update cost prices from this purchase</label>
      <label for="npNote">Note</label><input id="npNote">
      <p class="pay-status ok" id="npSum"></p>
      <div class="sheet-foot"><button class="btn primary" type="button" id="npOk">Save purchase — add to stock</button></div>`, { wide: true });
    const g = id => b.querySelector(id);
    g('#npSup').onchange = () => { if (g('#npSup').value === '__new') { P.close(); editSupplier(null, s => newPurchase(s)); } };
    const unitCost = (p, u) => { const c = baseCost(p); return c == null || !u ? '' : Math.round(c * u.f * 10000) / 10000; };
    function add(p) {
      const us = unitsOf(p), first = us.find(u => u.name.toLowerCase() === String(p.label2 || '').toLowerCase()) || us[0];
      const ex = lines.find(l => l.p.id === p.id && l.u === first.name);
      if (ex) ex.qty += 1; else lines.push({ p, u: first.name, qty: 1, cost: unitCost(p, first) });
      g('#npSearch').value = ''; g('#npHits').innerHTML = ''; drawLines(); g('#npSearch').focus();
    }
    g('#npSearch').oninput = () => {
      const q = g('#npSearch').value.trim().toLowerCase(); if (q.length < 2) { g('#npHits').innerHTML = ''; return; }
      const hits = items.filter(p => [p.name, p.barcode, p.sku].join(' ').toLowerCase().includes(q)).slice(0, 8);
      g('#npHits').innerHTML = hits.map(p => `<button type="button" data-np-add="${p.id}">${esc(p.name)} <small class="muted">${esc(p.barcode || '')}</small></button>`).join('') || '<p class="muted small">No item found. Add it first in Items &amp; stock.</p>';
    };
    g('#npSearch').onkeydown = e => { if (e.key !== 'Enter') return; e.preventDefault(); const q = g('#npSearch').value.trim(); const p = items.find(x => x.barcode && x.barcode.trim() === q) || items.find(x => x.sku && x.sku.trim() === q); if (p) add(p); else { const h = g('#npHits').querySelector('[data-np-add]'); if (h) h.click(); } };
    g('#npHits').onclick = e => { const t = e.target.closest('[data-np-add]'); if (t) add(items.find(p => p.id === t.dataset.npAdd)); };
    function drawLines() {
      const gl = 'grid-template-columns:1.6fr 140px 90px 110px 100px 40px';
      g('#npLines').innerHTML = lines.length ? `<div class="tr th" style="${gl}"><span>Item</span><span>Unit</span><span class="r">Qty</span><span class="r">Cost / unit</span><span class="r">Total</span><span></span></div>` + lines.map((l, i) => `<div class="tr" style="${gl}"><span>${esc(l.p.name)}</span>
        <span><select data-l="${i}" data-k="u">${unitsOf(l.p).map(u => `<option ${u.name === l.u ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}</select></span>
        <span><input data-l="${i}" data-k="qty" type="number" min="0" step="any" value="${l.qty}" style="text-align:right"></span>
        <span><input data-l="${i}" data-k="cost" type="number" min="0" step="0.0001" value="${l.cost}" style="text-align:right" placeholder="cost"></span>
        <span class="r">${P.fmt(P.num(l.qty) * P.num(l.cost))}</span><span><button class="icon-btn" type="button" data-rm="${i}" aria-label="Remove">✕</button></span></div>`).join('') : '<div class="empty">No items yet.</div>';
      sumUp();
    }
    g('#npLines').oninput = e => { const t = e.target.closest('[data-l]'); if (!t || t.dataset.k === 'u') return; lines[t.dataset.l][t.dataset.k] = t.value; const row = t.closest('.tr'), l = lines[t.dataset.l]; row.querySelector('.r:nth-last-child(2)').textContent = P.fmt(P.num(l.qty) * P.num(l.cost)); sumUp(); };
    g('#npLines').onchange = e => { const t = e.target.closest('[data-k="u"]'); if (!t) return; const l = lines[t.dataset.l]; l.u = t.value; const u = unitsOf(l.p).find(x => x.name === l.u); l.cost = unitCost(l.p, u); drawLines(); };
    g('#npLines').onclick = e => { const t = e.target.closest('[data-rm]'); if (t) { lines.splice(Number(t.dataset.rm), 1); drawLines(); } };
    const totals = () => { const sub = lines.reduce((s, l) => s + P.r2(P.num(l.qty) * P.num(l.cost)), 0), disc = Math.min(P.num(g('#npDisc').value), sub), tot = P.r2(sub - disc), paid = Math.min(P.r2(P.num(g('#npPaidUsd').value) + P.num(g('#npPaidLbp').value) / P.rate()), tot); return { sub, disc, tot, paid }; };
    function sumUp() { const t = totals(); g('#npSum').innerHTML = `<span>Total ${P.fmt(t.tot)}${t.disc ? ` (after ${P.fmt(t.disc)} discount)` : ''}</span><span>Paid ${P.fmt(t.paid)} · Owed ${P.fmt(t.tot - t.paid)}</span>`; }
    ['#npDisc', '#npPaidUsd', '#npPaidLbp'].forEach(id => g(id).oninput = sumUp);
    drawLines();
    g('#npOk').onclick = async () => {
      if (!lines.length) return P.toast('Add at least one item.', true);
      if (lines.some(l => P.num(l.qty) <= 0)) return P.toast('Every line needs a quantity.', true);
      if (lines.some(l => String(l.cost).trim() === '' || P.num(l.cost) < 0)) return P.toast('Every line needs a cost.', true);
      const supId = g('#npSup').value && g('#npSup').value !== '__new' ? g('#npSup').value : null, t = totals();
      if (!supId && t.paid + 0.01 < t.tot) return P.toast('Choose a supplier, or pay the full amount now.', true);
      const btn = g('#npOk'); btn.disabled = true;
      try {
        const method = g('#npMethod').value;
        const r = await sb.rpc('mc_saas_record_purchase', { p_business_id: P.biz.id, p_purchase: {
          client_uuid: P.uuid(), supplier_id: supId, ref_no: g('#npRef').value.trim(), purchase_date: g('#npDate').value, discount: t.disc,
          items: lines.map(l => ({ product_id: l.p.id, unit: l.u, qty: P.num(l.qty), unit_cost: P.num(l.cost) })),
          paid_usd: P.num(g('#npPaidUsd').value), paid_lbp: P.num(g('#npPaidLbp').value), rate: P.rate(), method, from_drawer: method === 'cash',
          update_cost: g('#npCost').checked, note: g('#npNote').value.trim(), shift_id: P.shift?.id || null, cashier_id: P.cashier ? P.cashier.id : null } });
        if (r.error) throw r.error;
        P.close(); loaded = false; await loadItems(true); await loadPurchases(); P.refreshStock && P.refreshStock();
        P.toast(`✅ Purchase P-${String(r.data.purchase_no).padStart(5, '0')} saved: ${lines.length} item(s) added to stock.${r.data.owed > 0 ? ' You owe ' + P.fmt(r.data.owed) + '.' : ''}`);
      } catch (e) { btn.disabled = false; P.err(e); }
    };
  }

  P.hooks.tab_items = () => loadItems();
  P.hooks.tab_purchases = () => loadPurchases();
})();
