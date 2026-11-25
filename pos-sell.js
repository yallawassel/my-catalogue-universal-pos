/* My Catalogue POS — sell screen: products, barcode, cart, discounts, customer, payment (USD + LBP), receipt. */
(() => {
  const P = window.POS, $ = P.$, esc = P.esc;
  const PAGE = 120;
  let cat = '', shown = PAGE;
  P.cart = { lines: [], discount: 0, discountPct: null, customer: null, order_id: null, order_label: '', note: '' };
  P.ceilLbp = usd => { const r = Number(P.settings?.round_lbp || 1000); return Math.ceil(usd * P.rate() / r - 1e-9) * r; };
  P.floorLbp = usd => { const r = Number(P.settings?.round_lbp || 1000); return Math.floor(usd * P.rate() / r + 1e-9) * r; };
  const saveCart = () => P.save('cart', P.cart);

  /* ---------------- products grid ---------------- */
  function stockBadge(p) {
    if (!P.stock.has(p.id)) return '';
    const q = P.stock.get(p.id);
    return q <= 0 ? '<span class="stk out">Out</span>' : `<span class="stk ${q <= 5 ? 'low' : ''}" title="Pieces in stock">${Math.floor(q)} pc</span>`;
  }
  function priceTxt(p) {
    if (p.p1 != null) return P.fmt(p.p1) + (p.was1 ? `<s>${P.fmt(p.was1)}</s>` : '');
    if (p.p2 != null) return P.fmt(p.p2) + (p.was2 ? `<s>${P.fmt(p.was2)}</s>` : '');
    return '<span style="color:#e11d48">Price?</span>';
  }
  function filtered() {
    const q = $('scan').value.trim().toLowerCase();
    return P.products.filter(p => (!cat || (p.category || 'Products') === cat) && (!q || [p.name, p.barcode, p.sku, p.category].join(' ').toLowerCase().includes(q)));
  }
  function renderCats() {
    $('cats').innerHTML = `<button type="button" class="${cat ? '' : 'on'}" data-cat="">All</button>` + P.cats.map(c => `<button type="button" class="${c === cat ? 'on' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('');
  }
  function renderGrid() {
    const list = filtered();
    $('grid').innerHTML = list.slice(0, shown).map(p => {
      const out = P.stock.has(p.id) && P.stock.get(p.id) <= 0;
      return `<button type="button" class="tile ${out ? 'out' : ''}" data-pid="${p.id}">${p.was1 || p.was2 ? '<span class="sale">SALE</span>' : ''}${stockBadge(p)}<div class="pic">${p.image ? `<img src="${esc(p.image)}" alt="" loading="lazy">` : esc((p.name || '?')[0])}</div><b>${esc(p.name)}</b><span class="pr">${priceTxt(p)}</span></button>`;
    }).join('') || `<div class="empty">No products found.${P.products.length ? '' : ' Add products in the catalogue admin first.'}</div>`;
    $('moreProducts').hidden = list.length <= shown;
  }
  P.hooks.renderGrid = renderGrid;
  $('cats').onclick = e => { const b = e.target.closest('[data-cat]'); if (!b) return; cat = b.dataset.cat; shown = PAGE; renderCats(); renderGrid(); };
  $('moreProducts').onclick = () => { shown += PAGE; renderGrid(); };
  $('grid').onclick = e => { const t = e.target.closest('[data-pid]'); if (t) addProduct(P.products.find(p => p.id === t.dataset.pid)); };
  // barcode / SKU match: ignores spaces, letter case and leading zeros (EAN-13 vs UPC-A); a product may hold several codes "123, 456"
  const normCode = v => String(v ?? '').replace(/\s+/g, '').replace(/^0+(?=\d)/, '').toUpperCase();
  function byCode(code) {
    const n = normCode(code); if (!n) return null;
    const has = v => String(v ?? '').split(/[,;|/]+/).some(x => x.trim() && normCode(x) === n);
    return P.products.find(x => has(x.barcode)) || P.products.find(x => has(x.sku)) || null;
  }
  P.byCode = byCode;
  $('scanCam').onclick = () => {
    if (!window.MCScan) return P.toast('Scanner not loaded — check the internet and reload.', true);
    MCScan.open({
      title: 'Scan items', hint: 'Each barcode adds one to the bill. Scan the next item, then press ✕ when you finish.',
      onCode: (code, typed) => {
        let p = byCode(code);
        if (!p && typed) { const q = String(code).toLowerCase(); const l = P.products.filter(x => (x.name || '').toLowerCase().includes(q)); if (l.length === 1) p = l[0]; }
        if (!p) return false;
        addProduct(p); MCScan.msg('✓ ' + p.name + ' added', 'ok'); return true;
      },
      onClose: () => { renderGrid(); P.hooks.focusScan && P.hooks.focusScan(); }
    });
  };
  let scanT;
  $('scan').addEventListener('input', () => { clearTimeout(scanT); scanT = setTimeout(() => { shown = PAGE; renderGrid(); }, 120); });
  $('scan').addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const code = $('scan').value.trim(); if (!code) return;
    let p = byCode(code);
    if (!p) { const l = filtered(); if (l.length === 1) p = l[0]; }
    if (p) { addProduct(p); $('scan').value = ''; renderGrid(); }
    else P.toast('No product with this barcode: ' + code, true);
  });
  // a barcode scanner types fast anywhere: send it to the scan box
  document.addEventListener('keydown', e => {
    if ($('vApp').hidden || !$('modal').hidden || !document.getElementById('tab-sell').classList.contains('on')) return;
    const a = document.activeElement; if (a && /INPUT|TEXTAREA|SELECT/.test(a.tagName)) return;
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) $('scan').focus();
  });
  P.hooks.focusScan = () => { if (window.matchMedia('(min-width: 901px)').matches && document.getElementById('tab-sell').classList.contains('on')) $('scan').focus(); };

  /* ---------------- cart ---------------- */
  // wholesale customers (or the Wholesale switch) get the wholesale price when the item has one
  const priceFor = (p, u) => { const w = u === 1 ? p.w1 : p.w2; return P.cart.wholesale && w != null ? w : (u === 1 ? p.p1 : p.p2); };
  P.priceFor = priceFor;
  function repriceCart() { P.cart.lines.forEach(l => { if (l.manual || !l.product_id) return; const p = P.products.find(x => x.id === l.product_id); if (p) { const v = priceFor(p, l.unit_index); if (v != null) l.price = v; } }); }
  async function addProduct(p, unitIndex) {
    if (!p) return;
    let u = unitIndex || (p.p1 != null ? 1 : p.p2 != null ? 2 : 1);
    let price = priceFor(p, u);
    if (price == null) {
      const v = await P.ask('Price for ' + p.name, 'This product has no price yet. Price in USD:', { type: 'number', inputmode: 'decimal' });
      if (v === null || v === '') return; price = P.num(v);
    }
    if (P.stock.has(p.id) && P.stock.get(p.id) <= 0) P.toast(`⚠️ ${p.name} shows 0 in stock — sold anyway.`, true);
    const unit = (u === 1 ? p.label1 : p.label2) || (u === 1 ? 'Piece' : 'Box');
    const ex = P.cart.lines.find(l => l.product_id === p.id && l.unit_index === u && l.price === price && !l.discount && !l.manual);
    if (ex) ex.qty = P.r2(ex.qty + 1);
    else P.cart.lines.push({ key: P.uuid(), product_id: p.id, name: p.name, unit, unit_index: u, qty: 1, price, discount: 0, barcode: p.barcode || '', category: p.category || '', image: p.image || '' });
    renderCart(true);
  }
  P.addProduct = addProduct;
  P.vatOn = () => { const st = P.settings || {}, rate = Number(st.tax_rate || 0); if (!rate) return false; return st.vat_mode === 'always' || (st.vat_mode === 'optional' && !!P.cart.vat); };
  function totals() {
    const sub = P.r2(P.cart.lines.reduce((s, l) => s + Math.max(0, l.qty * l.price - (l.discount || 0)), 0));
    const disc = P.r2(Math.min(sub, P.cart.discountPct != null ? sub * P.cart.discountPct / 100 : (P.cart.discount || 0)));
    const rate = Number(P.settings?.tax_rate || 0), vat = P.vatOn(), incl = !!P.settings?.prices_include_vat;
    if (!vat) return { sub, disc, tax: 0, total: P.r2(sub - disc), vat: false, rate: 0 };
    if (incl) { const total = P.r2(sub - disc); return { sub, disc, tax: P.r2(total - total / (1 + rate / 100)), total, vat: true, rate, incl }; }
    const tax = P.r2((sub - disc) * rate / 100);
    return { sub, disc, tax, total: P.r2(sub - disc + tax), vat: true, rate, incl };
  }
  P.totals = totals;
  function renderCart(bump) {
    const t = totals(), c = P.cart;
    $('lines').innerHTML = c.lines.map(l => {
      const p = P.products.find(x => x.id === l.product_id), two = p && p.label2 && (p.p2 != null) && (p.p1 != null);
      return `<div class="line" data-key="${l.key}"><div class="nm">${esc(l.name)}</div><b class="lt">${P.fmt(Math.max(0, l.qty * l.price - (l.discount || 0)))}</b>
      <div class="meta">${P.fmt(l.price)} / ${esc(l.unit)}${c.wholesale && p && (l.unit_index === 1 ? p.w1 : p.w2) != null && !l.manual ? ' <span class="pill info">wholesale</span>' : ''}${two ? `<button type="button" class="unit-sw" data-sw="${l.key}">⇄ ${esc(l.unit_index === 1 ? p.label2 : p.label1)}</button>` : ''}${l.discount ? ` · <span class="q">−${P.fmt(l.discount)}</span>` : ''}</div>
      <div class="qty"><button type="button" data-q="-1" data-k="${l.key}" aria-label="Less">−</button><b>${P.r2(l.qty)}</b><button type="button" data-q="1" data-k="${l.key}" aria-label="More">+</button></div></div>`;
    }).join('');
    if (bump) { const last = $('lines').lastElementChild; if (last) last.scrollIntoView({ block: 'nearest' }); }
    $('tSub').textContent = P.fmt(t.sub);
    $('tDisc').textContent = t.disc ? '−' + P.fmt(t.disc) + (c.discountPct != null ? ` (${c.discountPct}%)` : '') : '—';
    const vm = P.settings?.vat_mode, vr = Number(P.settings?.tax_rate || 0);
    $('vatToggle').hidden = !(vm === 'optional' && vr > 0); $('vatOn').checked = !!c.vat;
    $('tTaxRow').hidden = !t.vat; $('tTax').textContent = P.fmt(t.tax); $('tTaxLbl').textContent = `VAT ${vr}%${t.incl ? ' (included)' : ''}`;
    $('tTotal').textContent = P.fmt(t.total); $('tTotalLbp').textContent = P.fmtL(P.ceilLbp(t.total));
    $('wsToggle').hidden = !P.products.some(p => p.w1 != null || p.w2 != null) || !P.can('wholesale'); $('wsOn').checked = !!c.wholesale;
    $('payBtn').disabled = !c.lines.length; $('payBtn').textContent = c.lines.length ? 'Pay ' + P.fmt(t.total) : 'Pay';
    $('custName').textContent = c.customer ? c.customer.name : 'Walk-in customer';
    const cust = c.customer && P.customers.find(x => x.id === c.customer.id);
    $('custBal').textContent = cust && Number(cust.balance) > 0 ? 'owes ' + P.fmt(cust.balance) : '';
    $('orderTag').hidden = !c.order_id; $('orderTag').innerHTML = c.order_id ? `<span>📥 ${esc(c.order_label)}</span><button class="link" type="button" id="unlinkOrder">unlink</button>` : '';
    const n = c.lines.reduce((s, l) => s + l.qty, 0);
    $('fabCount').textContent = P.r2(n); $('fabTotal').textContent = P.fmt(t.total);
    saveCart();
  }
  P.hooks.renderCart = renderCart;
  $('lines').onclick = e => {
    const q = e.target.closest('[data-q]');
    if (q) { const l = P.cart.lines.find(x => x.key === q.dataset.k); l.qty = P.r2(l.qty + Number(q.dataset.q)); if (l.qty <= 0) P.cart.lines = P.cart.lines.filter(x => x !== l); renderCart(); return; }
    const sw = e.target.closest('[data-sw]');
    if (sw) { const l = P.cart.lines.find(x => x.key === sw.dataset.sw), p = P.products.find(x => x.id === l.product_id); l.unit_index = l.unit_index === 1 ? 2 : 1; l.unit = l.unit_index === 1 ? p.label1 : p.label2; l.price = priceFor(p, l.unit_index); l.manual = false; renderCart(); return; }
    const ln = e.target.closest('[data-key]'); if (ln) editLine(ln.dataset.key);
  };
  document.addEventListener('click', e => { if (e.target.id === 'unlinkOrder') { P.cart.order_id = null; P.cart.order_label = ''; renderCart(); } });
  function editLine(key) {
    const l = P.cart.lines.find(x => x.key === key); if (!l) return;
    const b = P.modal(l.name, `<div class="row2"><div><label for="leQty">Quantity (${esc(l.unit)})</label><input id="leQty" type="number" step="any" min="0" value="${l.qty}" inputmode="decimal"></div>
      <div><label for="lePrice">Price USD</label><input id="lePrice" type="number" step="0.01" min="0" value="${l.price}" inputmode="decimal"></div></div>
      <div class="row2"><div><label for="leDisc">Line discount USD</label><input id="leDisc" type="number" step="0.01" min="0" value="${l.discount || 0}" inputmode="decimal"></div>
      <div><label for="lePct">or discount %</label><input id="lePct" type="number" step="1" min="0" max="100" placeholder="%" inputmode="numeric"></div></div>
      <div class="sheet-foot"><button class="btn danger" type="button" id="leDel">Remove</button><button class="btn primary" type="button" id="leOk">Save</button></div>`);
    b.querySelector('#leDel').onclick = () => { P.cart.lines = P.cart.lines.filter(x => x !== l); P.close(); renderCart(); };
    b.querySelector('#leOk').onclick = () => {
      const qty = P.num(b.querySelector('#leQty').value), price = P.num(b.querySelector('#lePrice').value), pct = b.querySelector('#lePct').value;
      if (qty <= 0) { P.cart.lines = P.cart.lines.filter(x => x !== l); P.close(); renderCart(); return; }
      if (price < 0) return P.toast('Price cannot be negative.', true);
      if (price !== l.price && price < l.price && !P.can('change_price')) return P.toast('You are not allowed to lower a price. Ask a manager.', true);
      if (price !== l.price) l.manual = true;
      l.qty = P.r2(qty); l.price = P.r2(price);
      l.discount = P.r2(pct !== '' ? l.qty * l.price * P.num(pct) / 100 : P.num(b.querySelector('#leDisc').value));
      if (l.discount > l.qty * l.price) return P.toast('Discount is bigger than the line.', true);
      if (l.discount && !P.can('discount')) return P.toast('You are not allowed to give discounts. Ask a manager.', true);
      if (l.discount && !P.can('big_discount') && l.discount > l.qty * l.price * 0.2) return P.toast('Discounts above 20% need a manager.', true);
      P.close(); renderCart();
    };
  }
  $('discBtn').onclick = () => {
    const t = totals();
    const b = P.modal('Discount on the whole sale', `<div class="row2"><div><label for="dAmt">Amount USD</label><input id="dAmt" type="number" min="0" step="0.01" value="${P.cart.discountPct == null ? (P.cart.discount || '') : ''}" inputmode="decimal"></div><div><label for="dPct">or %</label><input id="dPct" type="number" min="0" max="100" step="1" value="${P.cart.discountPct ?? ''}" inputmode="numeric"></div></div>
      <div class="quick">${[5, 10, 15, 20, 25, 50].map(x => `<button type="button" data-dp="${x}">${x}%</button>`).join('')}</div>
      <p class="muted small">Subtotal ${P.fmt(t.sub)}</p><div class="sheet-foot"><button class="btn" type="button" id="dNone">No discount</button><button class="btn primary" type="button" id="dOk">Apply</button></div>`);
    b.querySelector('.quick').onclick = e => { const x = e.target.closest('[data-dp]'); if (x) { b.querySelector('#dPct').value = x.dataset.dp; b.querySelector('#dAmt').value = ''; } };
    b.querySelector('#dNone').onclick = () => { P.cart.discount = 0; P.cart.discountPct = null; P.close(); renderCart(); };
    b.querySelector('#dOk').onclick = () => {
      const pct = b.querySelector('#dPct').value, amt = P.num(b.querySelector('#dAmt').value);
      const value = pct !== '' ? t.sub * P.num(pct) / 100 : amt;
      if (value > 0 && !P.can('discount')) return P.toast('You are not allowed to give discounts. Ask a manager.', true);
      if (!P.can('big_discount') && value > t.sub * 0.2) return P.toast('Discounts above 20% need a manager.', true);
      if (pct !== '') { P.cart.discountPct = Math.min(100, Math.max(0, P.num(pct))); P.cart.discount = 0; } else { P.cart.discountPct = null; P.cart.discount = Math.max(0, amt); }
      P.close(); renderCart();
    };
  };
  $('clearCart').onclick = async () => { if (!P.cart.lines.length || await P.confirm('Clear the cart?', 'Remove all items from this sale?', 'Clear')) { resetCart(); } };
  function resetCart() { P.cart = { lines: [], discount: 0, discountPct: null, customer: null, order_id: null, order_label: '', note: '', vat: false, wholesale: false }; renderCart(); }
  P.resetCart = resetCart;
  $('customItem').onclick = () => {
    const b = P.modal('Add an item', `<label for="ciName">Item name</label><input id="ciName" placeholder="e.g. Service, Delivery"><div class="row2"><div><label for="ciPrice">Price USD</label><input id="ciPrice" type="number" step="0.01" min="0" inputmode="decimal"></div><div><label for="ciQty">Quantity</label><input id="ciQty" type="number" step="any" min="0" value="1" inputmode="decimal"></div></div><div class="sheet-foot"><button class="btn primary" type="button" id="ciOk">Add</button></div>`);
    b.querySelector('#ciOk').onclick = () => {
      const name = b.querySelector('#ciName').value.trim(), price = P.num(b.querySelector('#ciPrice').value), qty = P.num(b.querySelector('#ciQty').value) || 1;
      if (!name) return P.toast('Type the item name.', true);
      P.cart.lines.push({ key: P.uuid(), product_id: null, name, unit: 'Unit', unit_index: 1, qty, price, discount: 0 }); P.close(); renderCart(true);
    };
  };
  $('vatOn').onchange = () => { P.cart.vat = $('vatOn').checked; renderCart(); };
  $('cartFab').onclick = () => $('cart').classList.add('open');
  $('cartBack').onclick = () => $('cart').classList.remove('open');

  /* ---------------- customer picker ---------------- */
  P.pickCustomer = (onPick) => {
    const b = P.modal('Customer', `<input id="cpSearch" type="search" placeholder="Search name or phone" autocomplete="off"><div class="list" id="cpList"></div>
      <details><summary class="link" style="margin-top:6px">＋ New customer</summary><div class="row2"><div><label for="cpName">Name</label><input id="cpName"></div><div><label for="cpPhone">Phone</label><input id="cpPhone" inputmode="tel"></div></div><button class="btn primary" type="button" id="cpAdd" style="margin-top:10px">Save customer</button></details>
      <div class="sheet-foot"><button class="btn" type="button" id="cpWalk">Walk-in (no customer)</button></div>`);
    const draw = () => {
      const q = b.querySelector('#cpSearch').value.trim().toLowerCase();
      b.querySelector('#cpList').innerHTML = P.customers.filter(c => !q || (c.name + ' ' + (c.phone || '')).toLowerCase().includes(q)).slice(0, 40)
        .map(c => `<button type="button" data-cid="${c.id}"><b style="flex:1">${esc(c.name)}</b><small class="muted">${esc(c.phone || '')}</small>${Number(c.balance) > 0 ? `<span class="pill bad">owes ${P.fmt(c.balance)}</span>` : ''}</button>`).join('') || '<p class="muted">No customers yet.</p>';
    };
    draw();
    b.querySelector('#cpSearch').oninput = draw;
    b.querySelector('#cpList').onclick = e => { const t = e.target.closest('[data-cid]'); if (!t) return; const c = P.customers.find(x => x.id === t.dataset.cid); P.close(); onPick(c); };
    b.querySelector('#cpWalk').onclick = () => { P.close(); onPick(null); };
    b.querySelector('#cpAdd').onclick = async () => {
      const name = b.querySelector('#cpName').value.trim(); if (!name) return P.toast('Type the customer name.', true);
      try { const c = await P.createCustomer({ name, phone: b.querySelector('#cpPhone').value.trim() }); P.close(); onPick(c); } catch (e) { P.err(e); }
    };
  };
  P.createCustomer = async data => {
    const r = await P.sb.from('mc_saas_pos_customers').insert({ business_id: P.biz.id, ...data }).select('*').single();
    if (r.error) throw r.error;
    P.customers.push(r.data); P.customers.sort((a, b) => a.name.localeCompare(b.name)); P.save('customers', P.customers);
    return r.data;
  };
  $('custBtn').onclick = () => P.pickCustomer(c => {
    P.cart.customer = c ? { id: c.id, name: c.name } : null;
    const ws = !!(c && c.price_list === 'wholesale');
    if (ws !== !!P.cart.wholesale) { P.cart.wholesale = ws; repriceCart(); if (ws) P.toast('🏷️ Wholesale customer: wholesale prices applied.'); }
    renderCart();
  });
  $('wsOn').onchange = () => { if (!P.can('wholesale')) { $('wsOn').checked = !!P.cart.wholesale; return P.toast('You are not allowed to use wholesale prices.', true); } P.cart.wholesale = $('wsOn').checked; repriceCart(); renderCart(); };

  /* ---------------- payment ---------------- */
  $('payBtn').onclick = () => openPay();
  function openPay() {
    const t = totals(); if (!P.cart.lines.length) return;
    if (!P.shift) return P.toast('Open a shift first.', true);
    const rate = P.rate(), hasCust = !!P.cart.customer && P.can('credit');
    const b = P.modal('Payment', `
      <div class="pay-top"><div><small>Total USD</small><b>${P.fmt(t.total)}</b></div><div class="c2-only"><small>Total LBP</small><b>${P.fmtL(P.ceilLbp(t.total))}</b></div></div>
      <div class="pay-grid">
        <div><label for="pyUsd">Cash USD</label><input id="pyUsd" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0"><div class="quick" data-add="usd">${[1, 5, 10, 20, 50, 100].map(x => `<button type="button" data-v="${x}">+$${x}</button>`).join('')}<button type="button" data-exact="usd">Exact</button></div></div>
        <div><label for="pyLbp">Cash LBP</label><input id="pyLbp" type="number" min="0" step="1000" inputmode="numeric" placeholder="0"><div class="quick" data-add="lbp">${(['LBP', 'IQD', 'SYP'].includes(P.c2()) ? [100000, 500000, 1000000, 5000000] : ['EGP', 'TRY', 'DZD'].includes(P.c2()) ? [100, 200, 500, 1000] : [5, 10, 50, 100]).map(x => `<button type="button" data-v="${x}">+${x >= 1e6 ? x / 1e6 + 'M' : x >= 1e3 ? x / 1e3 + 'k' : x}</button>`).join('')}<button type="button" data-exact="lbp">Exact</button></div></div>
        <div><label for="pyCard">Card USD</label><input id="pyCard" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0"><div class="quick"><button type="button" data-exact="card">All by card</button></div></div>
        <div><label for="pyDebt">On account (debt) USD</label><input id="pyDebt" type="number" min="0" step="0.01" inputmode="decimal" placeholder="${hasCust ? '0' : P.can('credit') ? 'Choose a customer first' : 'Not allowed for you'}" ${hasCust ? '' : 'disabled'}><div class="quick">${hasCust ? '<button type="button" data-exact="debt">Rest on account</button>' : P.can('credit') ? '<button type="button" id="pyPickCust">Choose customer</button>' : ''}</div></div>
      </div>
      <div class="pay-status due" id="pyStatus"></div>
      <div class="chg-mode" id="pyChgMode" hidden>Give change in: <label class="check" style="margin:0"><input type="radio" name="chg" value="usd" checked> USD</label><label class="check" style="margin:0"><input type="radio" name="chg" value="lbp"> LBP</label><label class="check" style="margin:0"><input type="radio" name="chg" value="mix"> $ + LBP</label></div>
      <label for="pyNote">Note (optional)</label><input id="pyNote" value="${esc(P.cart.note || '')}">
      <div class="sheet-foot"><button class="btn" type="button" id="pyCancel">Back</button><button class="btn pay" style="margin:0" type="button" id="pyDone" disabled>Complete sale</button></div>`, { wide: true });
    const g = id => b.querySelector(id);
    let chg = { usd: 0, lbp: 0 };
    const calc = () => {
      const pu = P.num(g('#pyUsd').value), pl = P.num(g('#pyLbp').value), pc = P.num(g('#pyCard').value), pd = P.num(g('#pyDebt').value);
      const paid = pu + pl / rate + pc + pd, due = P.r2(t.total - paid), st = g('#pyStatus');
      g('#pyChgMode').hidden = true; chg = { usd: 0, lbp: 0 };
      if (due > 0.009) { st.className = 'pay-status due'; st.innerHTML = `<span>Still to pay</span><span>${P.fmt(due)} · ${P.fmtL(P.ceilLbp(due))}</span>`; g('#pyDone').disabled = true; return; }
      let change = P.r2(-due);
      if (pl > 0 && change <= Number(P.settings?.round_lbp || 1000) / rate + 0.005) change = 0; // LBP rounding only
      if (pc > t.total + 0.009) { st.className = 'pay-status due'; st.textContent = 'Card amount is more than the total.'; g('#pyDone').disabled = true; return; }
      g('#pyDone').disabled = false;
      if (change < 0.01 || (pu === 0 && pl === 0)) { st.className = 'pay-status ok'; st.innerHTML = '<span>Paid in full</span><span>✓</span>'; return; }
      g('#pyChgMode').hidden = false;
      const mode = (b.querySelector('input[name=chg]:checked') || {}).value || 'usd';
      if (mode === 'usd') chg = { usd: change, lbp: 0 };
      else if (mode === 'lbp') chg = { usd: 0, lbp: P.floorLbp(change) };
      else { const whole = Math.floor(change + 1e-9); chg = { usd: whole, lbp: P.floorLbp(change - whole) }; }
      st.className = 'pay-status chg'; st.innerHTML = `<span>Change to give</span><span>${[chg.usd ? P.fmt(chg.usd) : '', chg.lbp ? P.fmtL(chg.lbp) : ''].filter(Boolean).join(' + ') || P.fmt(0)}</span>`;
    };
    b.querySelectorAll('input').forEach(i => i.addEventListener('input', calc));
    b.addEventListener('change', e => { if (e.target.name === 'chg') calc(); });
    b.addEventListener('click', e => {
      const add = e.target.closest('.quick[data-add] [data-v]');
      if (add) { const inp = add.closest('[data-add]').dataset.add === 'usd' ? g('#pyUsd') : g('#pyLbp'); inp.value = P.num(inp.value) + Number(add.dataset.v); calc(); return; }
      const ex = e.target.closest('[data-exact]'); if (!ex) return;
      const k = ex.dataset.exact;
      const others = id => ['#pyUsd', '#pyLbp', '#pyCard', '#pyDebt'].filter(x => x !== id).reduce((s, x) => s + (x === '#pyLbp' ? P.num(g(x).value) / rate : P.num(g(x).value)), 0);
      if (k === 'usd') { g('#pyUsd').value = P.r2(Math.max(0, t.total - others('#pyUsd'))); }
      if (k === 'lbp') { g('#pyLbp').value = P.ceilLbp(Math.max(0, t.total - others('#pyLbp'))); }
      if (k === 'card') { ['#pyUsd', '#pyLbp', '#pyDebt'].forEach(x => { if (!g(x).disabled) g(x).value = ''; }); g('#pyCard').value = t.total; }
      if (k === 'debt') { g('#pyDebt').value = P.r2(Math.max(0, t.total - others('#pyDebt'))); }
      calc();
    });
    if (g('#pyPickCust')) g('#pyPickCust').onclick = () => P.pickCustomer(c => { P.cart.customer = c ? { id: c.id, name: c.name } : null; const ws = !!(c && c.price_list === 'wholesale'); if (ws !== !!P.cart.wholesale) { P.cart.wholesale = ws; repriceCart(); } renderCart(); openPay(); });
    g('#pyCancel').onclick = P.close;
    g('#pyDone').onclick = async () => {
      g('#pyDone').disabled = true; g('#pyDone').textContent = 'Saving…';
      try { await complete({ pu: P.num(g('#pyUsd').value), pl: P.num(g('#pyLbp').value), pc: P.num(g('#pyCard').value), pd: P.num(g('#pyDebt').value), chg, note: g('#pyNote').value.trim() }); }
      catch (e) { P.err(e); g('#pyDone').disabled = false; g('#pyDone').textContent = 'Complete sale'; }
    };
    b.addEventListener('keydown', e => { if (e.key === 'Enter' && !g('#pyDone').disabled && e.target.id !== 'pyNote') { e.preventDefault(); g('#pyDone').click(); } });
    calc();
    setTimeout(() => g('#pyUsd').focus(), 80);
  }

  async function complete(pay) {
    const t = totals(), c = P.cart;
    const payload = {
      client_uuid: P.uuid(), shift_id: P.shift?.id || null, cashier_id: P.cashier ? P.cashier.id : null, customer_id: c.customer ? c.customer.id : null,
      order_id: c.order_id || null, rate: P.rate(), discount: t.disc, vat: t.vat, paid_usd: pay.pu, paid_lbp: pay.pl, paid_card: pay.pc, credit_amount: pay.pd,
      change_lbp: pay.chg.lbp, note: pay.note || (c.order_label ? c.order_label : ''), created_at: new Date().toISOString(),
      items: c.lines.map(l => ({ product_id: l.product_id, name: l.name, unit: l.unit, unit_index: l.unit_index, qty: l.qty, price: l.price, discount: l.discount || 0, barcode: l.barcode || '', category: l.category || '' }))
    };
    const res = await P.submit('sale', payload);
    const cust = c.customer && P.customers.find(x => x.id === c.customer.id);
    if (cust && pay.pd) { cust.balance = P.r2(Number(cust.balance) + pay.pd); P.save('customers', P.customers); }
    // local stock view
    const sale = {
      ...payload, kind: 'sale', invoice_label: res.data.invoice_label, offline: !!res.offline, cashier_name: P.cashier ? P.cashier.name : 'Owner',
      customer_name: c.customer ? c.customer.name : '', subtotal: t.sub, tax: t.tax, vat_rate: t.vat ? t.rate : 0, prices_include_vat: !!t.incl, total: t.total, change_usd: pay.chg.usd,
      customer_balance: cust ? cust.balance : null, payment_method: pay.pd && !(pay.pu || pay.pl || pay.pc) ? 'credit' : pay.pc && !(pay.pu || pay.pl) && !pay.pd ? 'card' : 'cash',
      items: payload.items.map(i => ({ ...i, line_total: P.r2(i.qty * i.price - i.discount) })), id: res.data.id
    };
    P.recent = [sale, ...(P.recent || [])].slice(0, 30);
    resetCart(); $('cart').classList.remove('open');
    if (P.device.autoPrint) P.printSale(sale);
    done(sale, res.offline);
    P.refreshStock && !res.offline && setTimeout(P.refreshStock, 800);
  }
  function done(s, offline) {
    const changeTxt = [s.change_usd ? P.fmt(s.change_usd) : '', s.change_lbp ? P.fmtL(s.change_lbp) : ''].filter(Boolean).join(' + ');
    const b = P.modal('Sale complete', `<div class="done-box"><div class="big">✅</div><b>${esc(s.invoice_label)}</b> · ${P.fmt(s.total)}${changeTxt ? `<div class="muted" style="margin-top:8px">Change</div><div class="chg">${changeTxt}</div>` : ''}
      ${offline ? '<p class="pill warn">Saved on this device — it will sync when the internet is back.</p>' : ''}</div>
      <div class="sheet-foot" style="justify-content:center"><button class="btn" type="button" data-pr="80">🧾 Receipt 80mm</button><button class="btn" type="button" data-pr="58">58mm</button><button class="btn" type="button" data-pr="a4">📄 A4 invoice</button><button class="btn" type="button" id="dnShare">📤 PDF / share</button><button class="btn primary" type="button" id="dnNew">New sale ⏎</button></div>`, { noFocus: true });
    b.onclick = async e => {
      const pr = e.target.closest('[data-pr]'); if (pr) return P.printSale(s, pr.dataset.pr);
      if (e.target.id === 'dnShare') { try { const blob = await P.salePdf(s); await P.shareFile(blob, s.invoice_label + '.pdf', 'Invoice ' + s.invoice_label, P.biz.company_name + ' — invoice ' + s.invoice_label + ' — ' + P.fmt(s.total)); } catch (er) { P.err(er); } }
      if (e.target.id === 'dnNew') P.close();
    };
    setTimeout(() => b.querySelector('#dnNew').focus(), 60);
  }

  /* ---------------- online order into the cart ---------------- */
  P.loadOrder = o => {
    P.cart = { lines: [], discount: 0, discountPct: null, customer: null, order_id: o.id, order_label: `Online order #${o.order_number || ''} — ${o.customer_name || ''} ${o.customer_phone || ''}`.trim(), note: '' };
    (o.items || []).forEach(i => {
      const p = P.products.find(x => x.id === i.product_id);
      P.cart.lines.push({ key: P.uuid(), product_id: i.product_id || null, name: i.name || p?.name || 'Item', unit: i.unit || p?.label1 || 'Unit', unit_index: Number(i.unit_index) || 1, qty: Number(i.quantity) || 1, price: i.unit_price != null ? Number(i.unit_price) : 0, discount: 0, barcode: p?.barcode || '', category: p?.category || '' });
    });
    const phone = String(o.customer_phone || '').replace(/\D/g, '');
    const match = phone && P.customers.find(c => String(c.phone || '').replace(/\D/g, '').endsWith(phone.slice(-8)));
    if (match) P.cart.customer = { id: match.id, name: match.name };
    P.tab('sell'); renderCart();
    if ((o.items || []).some(i => i.price_on_request || i.unit_price == null)) P.toast('Some items had no price — tap them to set the price.', true);
  };

  P.enterHooks(() => {
    const saved = P.load('cart', null); if (saved && Array.isArray(saved.lines)) P.cart = saved;
    cat = ''; renderCats(); renderGrid(); renderCart(); P.hooks.focusScan();
  });
  P.hooks.tab_sell = () => { renderGrid(); P.hooks.focusScan(); };
})();
