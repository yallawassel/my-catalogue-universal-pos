/* My Catalogue POS — sales history & returns, online orders, customers & debts, cash & expenses, shift Z report, settings. */
(() => {
  const P = window.POS, $ = P.$, esc = P.esc, sb = P.sb;
  const day = d => { const s = new Date(d + 'T00:00:00'); const e = new Date(s); e.setDate(e.getDate() + 1); return [s.toISOString(), e.toISOString()]; };
  const pill = s => s.kind === 'return' ? '<span class="pill warn">Return</span>' : s.status === 'refunded' ? '<span class="pill bad">Refunded</span>' : s.status === 'partially_refunded' ? '<span class="pill warn">Part returned</span>' : '<span class="pill ok">Paid</span>';
  const methodTxt = m => ({ cash: 'Cash', card: 'Card', credit: 'Debt', mixed: 'Mixed' }[m] || m || '');

  /* ================= SALES ================= */
  let sales = [];
  async function loadSales() {
    const d = $('salesDate').value || P.today(); $('salesDate').value = d;
    const [from, to] = day(d);
    try {
      const r = await MC.fetchAll(() => sb.from('mc_saas_pos_sales').select('*').eq('business_id', P.biz.id).gte('created_at', from).lt('created_at', to).order('created_at', { ascending: false }));
      if (r.error) throw r.error; sales = r.data || [];
    } catch (e) { if (!P.isNetErr(e)) P.err(e); sales = (P.recent || []).filter(s => (s.created_at || '').slice(0, 10) === d); }
    drawSales();
  }
  function drawSales() {
    const q = $('salesSearch').value.trim().toLowerCase();
    const pend = P.queue.filter(x => x.type === 'sale').map(x => ({ ...x.payload, invoice_label: 'OFFLINE-' + x.payload.client_uuid.slice(0, 6).toUpperCase(), pending: true, error: x.error, total: (x.payload.items || []).reduce((s, i) => s + i.qty * i.price - (i.discount || 0), 0) - (x.payload.discount || 0) }));
    const list = [...pend, ...sales].filter(s => !q || [s.invoice_label, s.customer_name, s.cashier_name, ...(s.items || []).map(i => i.name)].join(' ').toLowerCase().includes(q));
    const g = 'grid-template-columns:130px 1fr 1fr 110px 90px 110px';
    $('salesList').innerHTML = `<div class="tr th" style="${g}"><span>Invoice</span><span>Customer</span><span>Cashier · time</span><span>Payment</span><span>Status</span><span class="r">Total</span></div>` +
      (list.map((s, i) => `<div class="tr click" style="${g}" data-si="${i}"><b>${esc(s.invoice_label)}</b><span>${esc(s.customer_name || '—')}</span><span class="muted">${esc(s.cashier_name || '')} · ${P.dt(s.created_at)}</span><span>${methodTxt(s.payment_method)}</span><span>${s.pending ? `<span class="pill ${s.error ? 'bad' : 'info'}">${s.error ? 'Sync error' : 'Waiting sync'}</span>` : pill(s)}</span><b class="r">${P.fmt(s.total)}</b></div>`).join('') || '<div class="empty">No sales on this day.</div>');
    $('salesList').onclick = e => { const r = e.target.closest('[data-si]'); if (r) saleDetail(list[Number(r.dataset.si)]); };
  }
  function saleDetail(s) {
    const items = (s.items || []).map(i => `<div class="tr" style="grid-template-columns:1fr 80px 90px;min-width:0"><span>${esc(i.name)} <small class="muted">${esc(i.unit || '')}</small></span><span class="r">${P.r2(i.qty)} × ${P.fmt(i.price)}</span><b class="r">${P.fmt(i.line_total ?? i.qty * i.price)}</b></div>`).join('');
    const b = P.modal(s.invoice_label, `<p class="muted">${P.dt(s.created_at)} · ${esc(s.cashier_name || '')}${s.customer_name ? ' · ' + esc(s.customer_name) : ''} ${s.pending ? '' : pill(s)}</p>
      ${s.error ? `<p class="pill bad">${esc(s.error)}</p>` : ''}
      <div class="table">${items}</div>
      <div class="totals" style="padding:10px 0"><div><span>Subtotal</span><b>${P.fmt(s.subtotal ?? s.total)}</b></div>${s.discount ? `<div><span>Discount</span><b>−${P.fmt(s.discount)}</b></div>` : ''}${s.tax ? `<div><span>Tax</span><b>${P.fmt(s.tax)}</b></div>` : ''}<div class="grand"><span>Total</span><b>${P.fmt(s.total)}</b></div></div>
      <div class="sheet-foot"><button class="btn" type="button" data-pr="80">🧾 80mm</button><button class="btn" type="button" data-pr="58">58mm</button><button class="btn" type="button" data-pr="a4">📄 A4</button><button class="btn" type="button" id="sdShare">📤 PDF / share</button>
      ${s.kind === 'sale' && !s.pending && s.status !== 'refunded' ? '<button class="btn danger" type="button" id="sdReturn">↩ Return items</button>' : ''}${s.pending && s.error ? '<button class="btn danger" type="button" id="sdDrop">Delete from device</button>' : ''}</div>`, { wide: true, noFocus: true });
    b.onclick = async e => {
      const pr = e.target.closest('[data-pr]'); if (pr) return P.printSale(s, pr.dataset.pr);
      if (e.target.id === 'sdShare') { try { await P.shareFile(await P.salePdf(s), s.invoice_label + '.pdf', 'Invoice ' + s.invoice_label, P.biz.company_name + ' — ' + s.invoice_label); } catch (er) { P.err(er); } }
      if (e.target.id === 'sdReturn') returnFlow(s);
      if (e.target.id === 'sdDrop' && await P.confirm('Delete this offline sale?', 'It could not be saved online: ' + esc(s.error) + '. Delete it from this device?', 'Delete')) { P.queue = P.queue.filter(x => x.payload.client_uuid !== s.client_uuid); P.save('queue', P.queue); P.netUI(); loadSales(); }
    };
  }
  async function returnFlow(s) {
    // how much was already returned per line
    let back = {};
    try {
      const r = await sb.from('mc_saas_pos_sales').select('items').eq('ref_sale_id', s.id).eq('kind', 'return');
      (r.data || []).forEach(x => (x.items || []).forEach(i => { back[i.line] = (back[i.line] || 0) + Number(i.qty); }));
    } catch (_) { }
    const needPin = P.cashier && P.cashier.role !== 'manager' && P.cashiers.some(c => c.is_active && c.role === 'manager');
    const b = P.modal('Return — ' + s.invoice_label, `<p class="muted">Choose how many of each item come back.</p>
      ${(s.items || []).map((i, k) => { const left = P.r2(Number(i.qty) - (back[k] || 0)); return `<div class="ret-line"><span>${esc(i.name)} <small class="muted">${esc(i.unit || '')} · sold ${P.r2(i.qty)}${back[k] ? `, returned ${back[k]}` : ''}</small></span><input type="number" min="0" max="${left}" step="any" value="0" data-line="${k}" ${left <= 0 ? 'disabled' : ''} aria-label="Quantity to return"></div>`; }).join('')}
      <div class="row2"><div><label for="rtMethod">Refund</label><select id="rtMethod"><option value="cash_usd">Cash USD</option><option value="cash_lbp">Cash LBP</option><option value="card">Card</option>${s.customer_id ? '<option value="credit">Reduce customer debt</option>' : ''}</select></div>
      <label class="check"><input type="checkbox" id="rtRestock" checked> Put items back in stock</label></div>
      <label for="rtReason">Reason</label><input id="rtReason" placeholder="e.g. damaged, wrong size">
      ${needPin ? '<label for="rtPin">Manager PIN</label><input id="rtPin" type="password" inputmode="numeric" maxlength="8">' : ''}
      <div class="sheet-foot"><button class="btn danger" type="button" id="rtGo">Make the return</button></div>`, { wide: true });
    b.querySelector('#rtGo').onclick = async () => {
      const items = [...b.querySelectorAll('[data-line]')].map(i => ({ line: Number(i.dataset.line), qty: P.num(i.value) })).filter(x => x.qty > 0);
      if (!items.length) return P.toast('Choose at least one item.', true);
      try {
        const payload = { client_uuid: P.uuid(), sale_id: s.id, shift_id: P.shift?.id || null, cashier_id: P.cashier ? P.cashier.id : null, items, rate: P.rate(), refund_method: b.querySelector('#rtMethod').value, restock: b.querySelector('#rtRestock').checked, reason: b.querySelector('#rtReason').value.trim(), manager_pin: b.querySelector('#rtPin')?.value || '' };
        const r = await sb.rpc('mc_saas_pos_record_return', { p_business_id: P.biz.id, p_return: payload });
        if (r.error) throw r.error;
        P.close();
        const d = r.data; P.toast(`✅ Return ${d.invoice_label}: refund ${d.refund_lbp ? P.fmtL(d.refund_lbp) : P.fmt(d.refund_usd)}`);
        if (payload.refund_method === 'credit') { const c = P.customers.find(x => x.id === s.customer_id); if (c) c.balance = P.r2(c.balance - d.refund_usd); }
        loadSales(); P.refreshStock();
        const rr = await sb.from('mc_saas_pos_sales').select('*').eq('id', d.id).single();
        if (!rr.error && await P.confirm('Print the return slip?', 'Print a receipt for ' + d.invoice_label + '?', 'Print')) P.printSale(rr.data);
      } catch (e) { P.err(e); }
    };
  }
  $('salesSearch').oninput = drawSales; $('salesDate').onchange = loadSales; $('salesRefresh').onclick = () => { P.sync(); loadSales(); };
  P.hooks.tab_sales = loadSales;

  /* ================= ONLINE ORDERS ================= */
  async function loadOrders() {
    try {
      const r = await sb.from('mc_saas_orders').select('*').eq('business_id', P.biz.id).in('order_status', ['new', 'confirmed', 'preparing', 'out_for_delivery']).order('created_at', { ascending: false }).limit(100);
      if (r.error) throw r.error;
      const list = r.data || [];
      $('ordersBadge').hidden = !list.length; $('ordersBadge').textContent = list.length;
      $('ordersList').innerHTML = list.map((o, i) => `<div class="card"><div style="display:flex;justify-content:space-between;gap:8px"><b>#${o.order_number || ''} · ${esc(o.customer_name || '')}</b><span class="pill info">${esc(o.order_status)}</span></div>
        <p class="muted small">${P.dt(o.created_at)} · ${esc(o.customer_phone || '')}${o.delivery_address ? ' · ' + esc(o.delivery_address) : ''}</p>
        <div class="small">${(o.items || []).map(it => `${P.r2(it.quantity)} × ${esc(it.name)} <span class="muted">(${esc(it.unit || '')})</span> ${it.price_on_request || it.unit_price == null ? '<span class="pill warn">price?</span>' : P.fmt(it.line_total)}`).join('<br>')}</div>
        <p><b>${P.fmt(o.total)}</b>${(o.items || []).some(it => it.price_on_request) ? ' + prices to confirm' : ''}</p>
        <div class="sheet-foot" style="justify-content:flex-start"><button class="btn primary" type="button" data-charge="${i}">Charge in POS</button><button class="btn" type="button" data-cancel="${i}">Cancel order</button></div></div>`).join('') || '<div class="empty">No open online orders.</div>';
      $('ordersList').onclick = async e => {
        const c = e.target.closest('[data-charge]'); if (c) return P.loadOrder(list[Number(c.dataset.charge)]);
        const x = e.target.closest('[data-cancel]');
        if (x && await P.confirm('Cancel this order?', 'The customer\'s held stock is released.', 'Cancel order')) {
          const r2 = await sb.from('mc_saas_orders').update({ order_status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', list[Number(x.dataset.cancel)].id);
          if (r2.error) P.err(r2.error); else { P.toast('Order cancelled.'); loadOrders(); }
        }
      };
    } catch (e) { if (!P.isNetErr(e)) P.err(e); else $('ordersList').innerHTML = '<div class="empty">Online orders need the internet.</div>'; }
  }
  $('ordersRefresh').onclick = loadOrders;
  P.hooks.tab_orders = loadOrders;
  P.enterHooks(() => { loadOrders(); setInterval(() => { if (P.online && !$('vApp').hidden) loadOrders(); }, 60000); });

  /* ================= CUSTOMERS ================= */
  async function loadCustomers() {
    try { const r = await MC.fetchAll(() => sb.from('mc_saas_pos_customers').select('*').eq('business_id', P.biz.id).order('name')); if (!r.error) { P.customers = r.data || []; P.save('customers', P.customers); } } catch (_) { }
    drawCustomers();
  }
  function drawCustomers() {
    const q = $('custSearch').value.trim().toLowerCase(), f = $('custFilter').value;
    const list = P.customers.filter(c => (!q || (c.name + ' ' + (c.phone || '')).toLowerCase().includes(q)) && (f === 'all' || Number(c.balance) > 0.009));
    const owed = P.customers.reduce((s, c) => s + Math.max(0, Number(c.balance)), 0);
    $('custKpis').innerHTML = `<div class="kpi"><small>Customers</small><b>${P.customers.length}</b></div><div class="kpi bad"><small>Total debts to collect</small><b>${P.fmt(owed)}</b></div><div class="kpi"><small>Customers with debt</small><b>${P.customers.filter(c => Number(c.balance) > 0.009).length}</b></div>`;
    const g = 'grid-template-columns:1.4fr 1fr 1fr 110px 290px';
    $('custList').innerHTML = `<div class="tr th" style="${g}"><span>Name</span><span>Phone</span><span>Credit limit</span><span class="r">Debt</span><span></span></div>` + (list.map(c => `<div class="tr" style="${g}"><b>${esc(c.name)}</b><span>${esc(c.phone || '')}</span><span class="muted">${c.credit_limit != null ? P.fmt(c.credit_limit) : '—'}</span><b class="r" style="color:${Number(c.balance) > 0 ? 'var(--bad)' : 'var(--ok)'}">${P.fmt(c.balance)}</b><span style="display:flex;gap:6px;justify-content:flex-end"><button class="btn sm" type="button" data-cpay="${c.id}">💵 Receive</button><button class="btn sm" type="button" data-cst="${c.id}">Statement</button><button class="btn sm" type="button" data-ced="${c.id}">✎</button></span></div>`).join('') || '<div class="empty">No customers.</div>');
  }
  $('custList').onclick = e => {
    const p = e.target.closest('[data-cpay]'); if (p) return receivePayment(P.customers.find(c => c.id === p.dataset.cpay));
    const s = e.target.closest('[data-cst]'); if (s) return statement(P.customers.find(c => c.id === s.dataset.cst));
    const d = e.target.closest('[data-ced]'); if (d) return editCustomer(P.customers.find(c => c.id === d.dataset.ced));
  };
  function editCustomer(c) {
    const b = P.modal(c ? 'Edit customer' : 'New customer', `<div class="row2"><div><label for="ecName">Name</label><input id="ecName" value="${esc(c?.name || '')}"></div><div><label for="ecPhone">Phone</label><input id="ecPhone" value="${esc(c?.phone || '')}" inputmode="tel"></div></div>
      <div class="row2"><div><label for="ecEmail">Email</label><input id="ecEmail" type="email" value="${esc(c?.email || '')}"></div><div><label for="ecLimit">Credit limit USD (empty = no limit)</label><input id="ecLimit" type="number" min="0" step="0.01" value="${c?.credit_limit ?? ''}" ${P.isManager() ? '' : 'disabled'}></div></div>
      <label for="ecAddr">Address</label><input id="ecAddr" value="${esc(c?.address || '')}"><label for="ecNote">Note</label><input id="ecNote" value="${esc(c?.note || '')}">
      <div class="sheet-foot"><button class="btn primary" type="button" id="ecOk">Save</button></div>`);
    b.querySelector('#ecOk').onclick = async () => {
      const data = { name: b.querySelector('#ecName').value.trim(), phone: b.querySelector('#ecPhone').value.trim(), email: b.querySelector('#ecEmail').value.trim(), address: b.querySelector('#ecAddr').value.trim(), note: b.querySelector('#ecNote').value.trim() };
      if (P.isManager()) { const l = b.querySelector('#ecLimit').value; data.credit_limit = l === '' ? null : P.num(l); }
      if (!data.name) return P.toast('Name is required.', true);
      try {
        if (c) { const r = await sb.from('mc_saas_pos_customers').update({ ...data, updated_at: new Date().toISOString() }).eq('id', c.id); if (r.error) throw r.error; Object.assign(c, data); }
        else await P.createCustomer(data);
        P.close(); drawCustomers(); P.toast('✅ Customer saved.');
      } catch (e) { P.err(e); }
    };
  }
  $('custAdd').onclick = () => editCustomer(null);
  $('custSearch').oninput = drawCustomers; $('custFilter').onchange = drawCustomers;
  function receivePayment(c) {
    const b = P.modal('Receive payment — ' + c.name, `<div class="pay-top"><div><small>Debt</small><b style="color:var(--bad)">${P.fmt(c.balance)}</b></div><div><small>in LBP</small><b>${P.fmtL(P.ceilLbp(Math.max(0, c.balance)))}</b></div></div>
      <div class="row4"><div><label for="rpUsd">Cash USD</label><input id="rpUsd" type="number" min="0" step="0.01" inputmode="decimal"></div><div><label for="rpLbp">Cash LBP</label><input id="rpLbp" type="number" min="0" step="1000" inputmode="numeric"></div><div><label for="rpCard">Card USD</label><input id="rpCard" type="number" min="0" step="0.01" inputmode="decimal"></div><div><label>&nbsp;</label><button class="btn" type="button" id="rpAll">Pay all in USD</button></div></div>
      <label for="rpNote">Note</label><input id="rpNote"><p class="pay-status ok" id="rpSt">Enter the amount received.</p>
      <div class="sheet-foot"><button class="btn primary" type="button" id="rpOk">Save payment</button></div>`);
    const g = id => b.querySelector(id);
    const calc = () => { const v = P.num(g('#rpUsd').value) + P.num(g('#rpLbp').value) / P.rate() + P.num(g('#rpCard').value); g('#rpSt').innerHTML = `<span>Received ${P.fmt(v)}</span><span>New balance ${P.fmt(c.balance - v)}</span>`; };
    b.querySelectorAll('input').forEach(i => i.oninput = calc);
    g('#rpAll').onclick = () => { g('#rpUsd').value = P.r2(Math.max(0, c.balance)); calc(); };
    g('#rpOk').onclick = async () => {
      const payload = { client_uuid: P.uuid(), customer_id: c.id, shift_id: P.shift?.id || null, cashier_id: P.cashier ? P.cashier.id : null, paid_usd: P.num(g('#rpUsd').value), paid_lbp: P.num(g('#rpLbp').value), paid_card: P.num(g('#rpCard').value), rate: P.rate(), note: g('#rpNote').value.trim() };
      const amt = P.r2(payload.paid_usd + payload.paid_lbp / payload.rate + payload.paid_card);
      if (amt <= 0) return P.toast('Enter the amount received.', true);
      try {
        const r = await P.submit('pay', payload);
        c.balance = P.r2(c.balance - amt); P.save('customers', P.customers); P.close(); drawCustomers();
        P.toast(`✅ Payment ${P.fmt(amt)} saved${r.offline ? ' on this device' : ''}. New balance ${P.fmt(c.balance)}.`);
        if (await P.confirm('Print a receipt?', 'Print a payment receipt for ' + esc(c.name) + '?', 'Print')) P.printHtml(paymentReceipt(c, payload, amt));
      } catch (e) { P.err(e); }
    };
  }
  function paymentReceipt(c, p, amt) {
    const s = { kind: 'sale', invoice_label: 'PAYMENT', created_at: new Date().toISOString(), cashier_name: P.cashier ? P.cashier.name : 'Owner', customer_name: c.name, items: [{ name: 'Payment on account', qty: 1, price: amt, line_total: amt }], subtotal: amt, total: amt, rate: p.rate, paid_usd: p.paid_usd, paid_lbp: p.paid_lbp, paid_card: p.paid_card, customer_balance: c.balance };
    return P.receiptHtml(s, P.device.paper === '58' ? '58' : '80');
  }
  async function statement(c) {
    try {
      const [s, p] = await Promise.all([
        MC.fetchAll(() => sb.from('mc_saas_pos_sales').select('created_at,invoice_label,kind,total,credit_amount').eq('business_id', P.biz.id).eq('customer_id', c.id).order('created_at')),
        MC.fetchAll(() => sb.from('mc_saas_pos_payments').select('created_at,amount_usd,note').eq('business_id', P.biz.id).eq('customer_id', c.id).order('created_at'))
      ]);
      const rows = [...(s.data || []).filter(x => Number(x.credit_amount) !== 0).map(x => ({ d: x.created_at, t: (x.kind === 'return' ? 'Return ' : 'Sale on account ') + x.invoice_label, a: Number(x.credit_amount) })),
        ...(p.data || []).map(x => ({ d: x.created_at, t: 'Payment' + (x.note ? ' — ' + x.note : ''), a: -Number(x.amount_usd) }))].sort((a, b) => a.d.localeCompare(b.d));
      let bal = 0;
      const html = `<h2 style="margin:0">${esc(P.biz.company_name)}</h2><p>Account statement — <b>${esc(c.name)}</b> ${esc(c.phone || '')}<br><small>${new Date().toLocaleDateString()}</small></p>
        <table style="width:100%;border-collapse:collapse;font-size:13px"><tr style="background:#f3f2f8"><th style="text-align:left;padding:6px">Date</th><th style="text-align:left;padding:6px">Description</th><th style="text-align:right;padding:6px">Debit</th><th style="text-align:right;padding:6px">Credit</th><th style="text-align:right;padding:6px">Balance</th></tr>
        ${rows.map(r => { bal += r.a; return `<tr><td style="padding:6px;border-bottom:1px solid #eee">${new Date(r.d).toLocaleDateString()}</td><td style="padding:6px;border-bottom:1px solid #eee">${esc(r.t)}</td><td style="padding:6px;border-bottom:1px solid #eee;text-align:right">${r.a > 0 ? P.fmt(r.a) : ''}</td><td style="padding:6px;border-bottom:1px solid #eee;text-align:right">${r.a < 0 ? P.fmt(-r.a) : ''}</td><td style="padding:6px;border-bottom:1px solid #eee;text-align:right">${P.fmt(bal)}</td></tr>`; }).join('')}
        <tr><td colspan="4" style="padding:8px;text-align:right"><b>Balance due</b></td><td style="padding:8px;text-align:right"><b>${P.fmt(c.balance)}</b></td></tr></table>`;
      const b = P.modal('Statement — ' + c.name, `<div class="report" id="stBox">${html}</div><div class="sheet-foot"><button class="btn" type="button" id="stPrint">🖨️ Print</button><button class="btn" type="button" id="stShare">📤 PDF / share</button>${c.email ? '<button class="btn" type="button" id="stMail">✉️ Email</button>' : ''}</div>`, { wide: true, noFocus: true });
      b.querySelector('#stPrint').onclick = () => P.printHtml(`<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:Arial;padding:14mm}</style></head><body>${html}</body></html>`);
      b.querySelector('#stShare').onclick = async () => { try { await P.shareFile(await P.pdfBlob(`<div style="font-family:Arial;color:#111">${html}</div>`, 'statement.pdf'), `Statement-${c.name}.pdf`, 'Statement', `${P.biz.company_name} — balance due ${P.fmt(c.balance)}`); } catch (e) { P.err(e); } };
      if (b.querySelector('#stMail')) b.querySelector('#stMail').onclick = () => P.email(c.email, `${P.biz.company_name} — account statement`, `Dear ${c.name},\n\nYour current balance is ${P.fmt(c.balance)}.\n\nThank you,\n${P.biz.company_name}`);
    } catch (e) { P.err(e); }
  }
  P.hooks.tab_customers = loadCustomers;

  /* ================= CASH & EXPENSES ================= */
  let ceKind = 'expense';
  const CATS = { expense: ['Rent', 'Electricity', 'Generator', 'Salaries', 'Internet', 'Transport', 'Supplies', 'Maintenance', 'Purchases', 'Other'], income: ['Delivery fees', 'Services', 'Other'], cash_in: ['Owner deposit', 'Change float'], cash_out: ['Owner withdrawal', 'Bank deposit'] };
  $('ceKind').onclick = e => { const b = e.target.closest('[data-v]'); if (!b) return; ceKind = b.dataset.v; $('ceKind').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); $('ceCats').innerHTML = CATS[ceKind].map(c => `<option value="${esc(c)}">`).join(''); };
  $('ceSave').onclick = async () => {
    const payload = { client_uuid: P.uuid(), kind: ceKind, category: $('ceCat').value.trim() || CATS[ceKind][0], paid_usd: P.num($('ceUsd').value), paid_lbp: P.num($('ceLbp').value), rate: P.rate(), from_drawer: $('ceDrawer').checked, entry_date: $('ceDate').value || P.today(), shift_id: P.shift?.id || null, cashier_id: P.cashier ? P.cashier.id : null, note: $('ceNote').value.trim() };
    if (payload.paid_usd + payload.paid_lbp <= 0) return P.toast('Enter an amount.', true);
    try { const r = await P.submit('entry', payload); ['ceUsd', 'ceLbp', 'ceNote'].forEach(id => $(id).value = ''); P.toast(r.offline ? 'Saved on this device.' : '✅ Saved.'); loadCash(); } catch (e) { P.err(e); }
  };
  async function loadCash() {
    if (!$('cashFrom').value) { const d = new Date(); $('cashFrom').value = new Date(d.getFullYear(), d.getMonth(), 1).toLocaleDateString('en-CA'); $('cashTo').value = P.today(); }
    if (!$('ceDate').value) $('ceDate').value = P.today();
    $('ceCats').innerHTML = CATS[ceKind].map(c => `<option value="${esc(c)}">`).join('');
    try {
      const r = await MC.fetchAll(() => sb.from('mc_saas_pos_cash_entries').select('*').eq('business_id', P.biz.id).gte('entry_date', $('cashFrom').value).lte('entry_date', $('cashTo').value).order('entry_date', { ascending: false }).order('created_at', { ascending: false }));
      if (r.error) throw r.error;
      const list = r.data || [], sum = k => list.filter(x => x.kind === k).reduce((s, x) => s + Number(x.amount_usd), 0);
      $('cashKpis').innerHTML = `<div class="kpi bad"><small>Expenses</small><b>${P.fmt(sum('expense'))}</b></div><div class="kpi good"><small>Other income</small><b>${P.fmt(sum('income'))}</b></div><div class="kpi"><small>Cash in</small><b>${P.fmt(sum('cash_in'))}</b></div><div class="kpi"><small>Cash out</small><b>${P.fmt(sum('cash_out'))}</b></div>`;
      const g = 'grid-template-columns:100px 120px 1fr 1fr 110px 120px';
      const lbl = { expense: '<span class="pill bad">Expense</span>', income: '<span class="pill ok">Income</span>', cash_in: '<span class="pill info">Cash in</span>', cash_out: '<span class="pill warn">Cash out</span>' };
      $('cashList').innerHTML = `<div class="tr th" style="${g}"><span>Date</span><span>Type</span><span>Category</span><span>Note · by</span><span class="r">Paid</span><span class="r">Amount USD</span></div>` + (list.map(x => `<div class="tr" style="${g}"><span>${esc(x.entry_date)}</span><span>${lbl[x.kind]}</span><b>${esc(x.category)}</b><span class="muted">${esc(x.note || '')} · ${esc(x.cashier_name || '')}</span><span class="r muted">${x.paid_usd ? P.fmt(x.paid_usd) : ''}${x.paid_lbp ? ' ' + P.fmtL(x.paid_lbp) : ''}</span><b class="r">${P.fmt(x.amount_usd)}</b></div>`).join('') || '<div class="empty">Nothing in this period.</div>');
    } catch (e) { if (!P.isNetErr(e)) P.err(e); }
  }
  $('cashRefresh').onclick = loadCash; $('cashFrom').onchange = loadCash; $('cashTo').onchange = loadCash;
  P.hooks.tab_cash = loadCash;

  /* ================= SHIFT / Z REPORT ================= */
  const zHtml = (z, sh) => `<table class="pl"><tr><td>Opened</td><td>${P.dt(sh.opened_at)} · ${esc(sh.cashier_name)}</td></tr>${sh.closed_at ? `<tr><td>Closed</td><td>${P.dt(sh.closed_at)}</td></tr>` : ''}
    <tr><td>Sales (${z.sales_count})</td><td>${P.fmt(z.sales_total)}</td></tr><tr><td>Returns</td><td>−${P.fmt(z.returns_total)}</td></tr><tr><td>Discounts given</td><td>${P.fmt(z.discounts)}</td></tr>
    <tr><td>Card</td><td>${P.fmt(z.card)}</td></tr><tr><td>Sold on account (debt)</td><td>${P.fmt(z.credit)}</td></tr><tr><td>Debt payments received</td><td>${P.fmt(z.debt_payments_total)}</td></tr>
    <tr><td>Expenses</td><td>${P.fmt(z.expenses)}</td></tr><tr><td>Other income</td><td>${P.fmt(z.income)}</td></tr>
    <tr><td>Opening cash</td><td>${P.fmt(z.opening_usd)} + ${P.fmtL(z.opening_lbp)}</td></tr>
    <tr class="total"><td>Cash expected in drawer</td><td>${P.fmt(z.expected_usd)} + ${P.fmtL(z.expected_lbp)}</td></tr>
    ${z.counted_usd != null ? `<tr><td>Counted</td><td>${P.fmt(z.counted_usd)} + ${P.fmtL(z.counted_lbp)}</td></tr><tr class="total"><td>Difference</td><td style="color:${Math.abs(z.difference_usd) < 0.01 && Math.abs(z.difference_lbp) < 1 ? 'var(--ok)' : 'var(--bad)'}">${P.fmt(z.difference_usd)} · ${P.fmtL(z.difference_lbp)}</td></tr>` : ''}</table>`;
  P.zHtml = zHtml;
  async function loadShift() {
    if (!P.shift) { $('shiftBox').innerHTML = '<p class="muted">No open shift.</p>'; return; }
    try {
      const r = await sb.rpc('mc_saas_pos_shift_summary', { p_shift_id: P.shift.id }); if (r.error) throw r.error;
      const z = r.data;
      $('shiftBox').innerHTML = `<div class="card"><h3>Current shift</h3>${zHtml(z, P.shift)}
        <div class="row2" style="max-width:520px"><div><label for="zUsd">Counted cash USD</label><input id="zUsd" type="number" min="0" step="0.01" inputmode="decimal"></div><div><label for="zLbp">Counted cash LBP</label><input id="zLbp" type="number" min="0" step="1000" inputmode="numeric"></div></div>
        <label for="zNote">Note</label><input id="zNote" style="max-width:520px"><div class="sheet-foot" style="justify-content:flex-start"><button class="btn" type="button" id="zPrintX">🖨️ Print X report</button><button class="btn danger" type="button" id="zClose">Close shift (Z report)</button></div></div>`;
      $('zPrintX').onclick = () => printZ(z, P.shift, 'X REPORT');
      $('zClose').onclick = async () => {
        if (!await P.confirm('Close the shift?', 'Count the drawer first. After closing, a new shift is needed to sell.', 'Close shift')) return;
        try {
          const c = await sb.rpc('mc_saas_pos_close_shift', { p_shift_id: P.shift.id, p_counted_usd: P.num($('zUsd').value), p_counted_lbp: P.num($('zLbp').value), p_note: $('zNote').value });
          if (c.error) throw c.error;
          const closed = { ...P.shift, closed_at: new Date().toISOString() };
          printZ(c.data, closed, 'Z REPORT');
          P.shift = null; P.save('shift', null); P.toast('✅ Shift closed.'); P.afterCashier();
        } catch (e) { P.err(e); }
      };
    } catch (e) { $('shiftBox').innerHTML = '<p class="muted">The shift report needs the internet.</p>'; }
    try {
      const r = await sb.from('mc_saas_pos_shifts').select('*').eq('business_id', P.biz.id).eq('status', 'closed').order('closed_at', { ascending: false }).limit(30);
      const g = 'grid-template-columns:1fr 1fr 1fr 1fr 120px';
      $('shiftList').innerHTML = `<div class="tr th" style="${g}"><span>Closed</span><span>Cashier</span><span class="r">Sales</span><span class="r">Difference</span><span></span></div>` + ((r.data || []).map((s, i) => `<div class="tr" style="${g}"><span>${P.dt(s.closed_at)}</span><span>${esc(s.cashier_name)}</span><span class="r">${P.fmt(s.totals?.sales_total || 0)}</span><span class="r" style="color:${Math.abs(s.totals?.difference_usd || 0) < 0.01 ? 'var(--ok)' : 'var(--bad)'}">${P.fmt(s.totals?.difference_usd || 0)} · ${P.fmtL(s.totals?.difference_lbp || 0)}</span><span><button class="btn sm" type="button" data-z="${i}">🖨️ Z</button></span></div>`).join('') || '<div class="empty">No closed shifts yet.</div>');
      $('shiftList').onclick = e => { const b = e.target.closest('[data-z]'); if (b) { const s = r.data[Number(b.dataset.z)]; printZ(s.totals, s, 'Z REPORT'); } };
    } catch (_) { }
  }
  function printZ(z, sh, title) {
    const w = P.device.paper === '58' ? 58 : 80;
    P.printHtml(`<!doctype html><html><head><meta charset="utf-8"><style>@page{size:${w}mm auto;margin:2mm}body{margin:0;width:${w - 4}mm;font:11px/1.4 'Courier New',monospace}table{width:100%;border-collapse:collapse}td{padding:2px 0}td:last-child{text-align:right}.total td{font-weight:700;border-top:1px dashed #000}h3{text-align:center;margin:4px 0}</style></head><body><h3>${esc(P.biz.company_name)}<br>${title}</h3>${zHtml(z, sh)}</body></html>`);
  }
  P.hooks.tab_shift = loadShift;

  /* ================= SETTINGS ================= */
  function fillSettings() {
    const s = P.settings || {};
    $('stRate').value = s.lbp_rate || ''; $('stRound').value = String(s.round_lbp || 1000); $('stTax').value = s.tax_rate || ''; $('stVatMode').value = s.vat_mode || 'off'; $('stVatIncl').checked = !!s.prices_include_vat; $('stVatNo').value = s.vat_number || ''; $('stPrefix').value = s.invoice_prefix || 'INV';
    $('stHeader').value = s.receipt_header || ''; $('stFooter').value = s.receipt_footer || ''; $('stPaper').value = P.device.paper || '80'; $('stAutoPrint').checked = !!P.device.autoPrint;
    drawCashiers();
  }
  $('stSave').onclick = async () => {
    if ($('stVatMode').value !== 'off' && !(P.num($('stTax').value) > 0)) return P.toast('Enter the VAT rate (for example 11).', true);
    const row = { business_id: P.biz.id, lbp_rate: P.num($('stRate').value) || 89500, round_lbp: Number($('stRound').value), tax_rate: P.num($('stTax').value), vat_mode: $('stVatMode').value, prices_include_vat: $('stVatIncl').checked, vat_number: $('stVatNo').value.trim(), invoice_prefix: $('stPrefix').value.trim().slice(0, 10) || 'INV', receipt_header: $('stHeader').value.trim(), receipt_footer: $('stFooter').value.trim(), updated_at: new Date().toISOString() };
    P.device = { paper: $('stPaper').value, autoPrint: $('stAutoPrint').checked }; P.save('device', P.device);
    const r = await sb.from('mc_saas_pos_settings').upsert(row, { onConflict: 'business_id' });
    if (r.error) return P.err(r.error);
    Object.assign(P.settings, row); P.save('settings', P.settings); $('rateVal').textContent = P.rate().toLocaleString('en-US');
    P.hooks.renderCart && P.hooks.renderCart(); P.toast('✅ Settings saved.');
  };
  function drawCashiers() {
    $('cashierList').innerHTML = P.cashiers.map(c => `<button type="button" data-ca="${c.id}"><span class="logo-dot sm">${esc(c.name[0])}</span><b style="flex:1">${esc(c.name)}</b><span class="pill ${c.role === 'manager' ? 'info' : ''}">${c.role}</span>${c.is_active ? '' : '<span class="pill bad">disabled</span>'}</button>`).join('') || '<p class="muted small">No cashiers yet — the owner sells without a PIN.</p>';
  }
  $('cashierList').onclick = e => {
    const t = e.target.closest('[data-ca]'); if (!t) return;
    const c = P.cashiers.find(x => x.id === t.dataset.ca);
    $('caId').value = c.id; $('caName').value = c.name; $('caPin').value = ''; $('caRole').value = c.role; $('caSave').textContent = 'Save cashier (PIN empty = keep)';
    if (!document.getElementById('caToggle')) $('caSave').insertAdjacentHTML('afterend', '<button class="btn danger" type="button" id="caToggle" style="margin-top:6px"></button>');
    $('caToggle').textContent = c.is_active ? 'Disable' : 'Enable';
    $('caToggle').onclick = () => saveCashier(!c.is_active);
  };
  async function saveCashier(active) {
    const id = $('caId').value || null, name = $('caName').value.trim();
    if (!name) return P.toast('Type the cashier name.', true);
    try {
      const r = await sb.rpc('mc_saas_pos_save_cashier', { p_business_id: P.biz.id, p_id: id, p_name: name, p_pin: $('caPin').value.trim(), p_role: $('caRole').value, p_active: active ?? true });
      if (r.error) throw r.error;
      const l = await sb.from('mc_saas_pos_cashiers').select('id,name,role,is_active').eq('business_id', P.biz.id).order('name');
      P.cashiers = l.data || []; P.save('cashiers', P.cashiers);
      $('caId').value = ''; $('caName').value = ''; $('caPin').value = ''; $('caSave').textContent = 'Add cashier'; document.getElementById('caToggle')?.remove();
      drawCashiers(); P.toast('✅ Cashier saved.');
    } catch (e) { P.err(e); }
  }
  $('caSave').onclick = () => saveCashier(true);
  P.hooks.tab_settings = fillSettings;
})();
