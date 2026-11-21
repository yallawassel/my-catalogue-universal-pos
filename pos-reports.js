/* My Catalogue POS — financial reports: sales, profit & loss, payments, cashiers, categories, products, expenses, debts. Excel / PDF / share / email. */
(() => {
  const P = window.POS, $ = P.$, esc = P.esc, sb = P.sb;
  let R = null; // last report data
  const iso = d => d.toLocaleDateString('en-CA');
  function preset(v) {
    const d = new Date(), y = d.getFullYear(), m = d.getMonth();
    const map = {
      today: [d, d], yesterday: [new Date(y, m, d.getDate() - 1), new Date(y, m, d.getDate() - 1)],
      week: [new Date(y, m, d.getDate() - ((d.getDay() + 6) % 7)), d], month: [new Date(y, m, 1), d],
      lastmonth: [new Date(y, m - 1, 1), new Date(y, m, 0)], year: [new Date(y, 0, 1), d]
    };
    if (map[v]) { $('rpFrom').value = iso(map[v][0]); $('rpTo').value = iso(map[v][1]); }
  }
  $('rpPreset').onchange = () => { preset($('rpPreset').value); if ($('rpPreset').value !== 'custom') run(); };
  ['rpFrom', 'rpTo'].forEach(id => $(id).onchange = () => { $('rpPreset').value = 'custom'; });
  $('rpRun').onclick = () => run();

  async function run() {
    if (!$('rpFrom').value) preset('month');
    const from = $('rpFrom').value, to = $('rpTo').value, cashier = $('rpCashier').value;
    const s = new Date(from + 'T00:00:00').toISOString(), e = new Date(new Date(to + 'T00:00:00').getTime() + 864e5).toISOString();
    $('report').innerHTML = '<p class="muted">Loading…</p>';
    try {
      const id = P.biz.id;
      let qs = () => { let q = sb.from('mc_saas_pos_sales').select('*').eq('business_id', id).gte('created_at', s).lt('created_at', e).order('created_at'); return cashier ? (cashier === 'owner' ? q.is('cashier_id', null) : q.eq('cashier_id', cashier)) : q; };
      const [sa, pa, ce, cu, sh] = await Promise.all([
        MC.fetchAll(qs),
        MC.fetchAll(() => sb.from('mc_saas_pos_payments').select('*').eq('business_id', id).gte('created_at', s).lt('created_at', e)),
        MC.fetchAll(() => sb.from('mc_saas_pos_cash_entries').select('*').eq('business_id', id).gte('entry_date', from).lte('entry_date', to)),
        MC.fetchAll(() => sb.from('mc_saas_pos_customers').select('id,name,phone,balance').eq('business_id', id)),
        sb.from('mc_saas_pos_shifts').select('*').eq('business_id', id).gte('opened_at', s).lt('opened_at', e).order('opened_at')
      ]);
      for (const r of [sa, pa, ce, cu, sh]) if (r.error) throw r.error;
      R = compute(sa.data || [], pa.data || [], ce.data || [], cu.data || [], sh.data || [], from, to);
      draw();
    } catch (er) { $('report').innerHTML = '<p class="muted">Reports need the internet.</p>'; if (!P.isNetErr(er)) P.err(er); }
  }

  function compute(sales, pays, entries, customers, shifts, from, to) {
    const sum = (a, f) => a.reduce((s, x) => s + (Number(f(x)) || 0), 0);
    const S = sales.filter(x => x.kind === 'sale'), Rt = sales.filter(x => x.kind === 'return');
    const gross = sum(S, x => x.subtotal), disc = sum(S, x => x.discount), tax = sum(sales, x => x.tax);
    const returns = -sum(Rt, x => x.total), net = sum(sales, x => x.total) - tax;
    const costKnown = sales.filter(x => x.cost_total != null), cost = sum(costKnown, x => x.cost_total);
    const costCover = sales.length ? costKnown.length / sales.length : 1;
    const netCost = sum(costKnown, x => x.total) - sum(costKnown, x => x.tax);
    const gp = netCost - cost;
    const exp = entries.filter(x => x.kind === 'expense'), inc = entries.filter(x => x.kind === 'income');
    const expenses = sum(exp, x => x.amount_usd), income = sum(inc, x => x.amount_usd);
    const group = (arr, key, val) => { const m = new Map(); arr.forEach(x => { const k = key(x); const o = m.get(k) || { k, n: 0, v: 0, q: 0, c: 0, cost: 0 }; val(o, x); m.set(k, o); }); return [...m.values()]; };
    const byDay = group(sales, x => x.created_at.slice(0, 10), (o, x) => { o.v += Number(x.total); if (x.kind === 'sale') o.n++; }).sort((a, b) => a.k.localeCompare(b.k));
    const byPay = [
      { k: 'Cash USD (net of change)', v: sum(sales, x => x.paid_usd - x.change_usd) },
      { k: 'Cash LBP (net of change)', v: sum(sales, x => x.paid_lbp - x.change_lbp), lbp: true },
      { k: 'Card', v: sum(sales, x => x.paid_card) },
      { k: 'Sold on account (debt)', v: sum(sales, x => x.credit_amount) },
      { k: 'Debt payments received', v: sum(pays, x => x.amount_usd) }
    ];
    const byCashier = group(sales, x => x.cashier_name || 'Owner', (o, x) => { o.v += Number(x.total); if (x.kind === 'sale') o.n++; if (x.kind === 'return') o.c += -Number(x.total); }).sort((a, b) => b.v - a.v);
    const lines = sales.flatMap(x => (x.items || []).map(i => ({ ...i, ratio: x.subtotal ? x.total / x.subtotal : 1, ret: x.kind === 'return' })));
    const lineNet = i => i.ret ? Number(i.line_total) : Number(i.line_total) * i.ratio;
    const byCat = group(lines, i => i.category || productCat(i.product_id), (o, i) => { o.v += lineNet(i); o.q += i.ret ? -Number(i.qty) : Number(i.qty); if (i.cost != null) o.cost += (i.ret ? -1 : 1) * Number(i.cost) * Number(i.qty); }).sort((a, b) => b.v - a.v);
    const byProd = group(lines, i => i.name, (o, i) => { o.v += lineNet(i); o.q += i.ret ? -Number(i.qty) : Number(i.qty); if (i.cost != null) o.cost += (i.ret ? -1 : 1) * Number(i.cost) * Number(i.qty); else o.nocost = true; }).sort((a, b) => b.v - a.v);
    const byExp = group(exp, x => x.category, (o, x) => { o.v += Number(x.amount_usd); o.n++; }).sort((a, b) => b.v - a.v);
    const debtors = customers.filter(c => Number(c.balance) > 0.009).sort((a, b) => b.balance - a.balance);
    return { from, to, count: S.length, gross, disc, tax, returns, net, cost, costCover, gp, expenses, income, profit: gp - expenses + income, avg: S.length ? sum(S, x => x.total) / S.length : 0,
      byDay, byPay, byCashier, byCat, byProd, byExp, debtors, debtTotal: sum(debtors, x => x.balance), shifts, sales, entries, pays };
  }
  const productCat = id => (P.products.find(p => p.id === id) || {}).category || 'Other';

  function draw() {
    const r = R, f = P.fmt, pct = (a, b) => b ? (a / b * 100).toFixed(1) + '%' : '—';
    const max = Math.max(1, ...r.byDay.map(d => d.v));
    const table = (head, rows, foot) => `<table><thead><tr>${head.map((h, i) => `<th class="${i ? 'r' : ''}">${h}</th>`).join('')}</tr></thead><tbody>${rows.join('') || `<tr><td colspan="${head.length}" class="muted">Nothing in this period.</td></tr>`}</tbody>${foot ? `<tfoot><tr>${foot.map((x, i) => `<td class="${i ? 'r' : ''}">${x}</td>`).join('')}</tr></tfoot>` : ''}</table>`;
    const tr = cells => `<tr>${cells.map((c, i) => `<td class="${i ? 'r' : ''}">${c}</td>`).join('')}</tr>`;
    $('report').innerHTML = `<div class="rp-head"><div><h2>${esc(P.biz.company_name)} — Financial report</h2><p class="muted">${r.from} → ${r.to}${$('rpCashier').value ? ' · ' + esc($('rpCashier').selectedOptions[0].textContent) : ''}</p></div><p class="muted small">Printed ${new Date().toLocaleString()}</p></div>
      <div class="kpis">
        <div class="kpi"><small>Net sales</small><b>${f(r.net)}</b></div><div class="kpi"><small>Number of sales</small><b>${r.count}</b></div><div class="kpi"><small>Average sale</small><b>${f(r.avg)}</b></div>
        <div class="kpi good"><small>Gross profit</small><b>${f(r.gp)}</b></div><div class="kpi bad"><small>Expenses</small><b>${f(r.expenses)}</b></div><div class="kpi ${r.profit >= 0 ? 'good' : 'bad'}"><small>Net profit</small><b>${f(r.profit)}</b></div>
        <div class="kpi"><small>Returns</small><b>${f(r.returns)}</b></div><div class="kpi bad"><small>Debts to collect (all time)</small><b>${f(r.debtTotal)}</b></div>
      </div>
      <h3>Profit &amp; loss</h3>
      <table class="pl"><tr><td>Gross sales</td><td>${f(r.gross)}</td></tr><tr><td>− Discounts</td><td>${f(r.disc)}</td></tr><tr><td>− Returns</td><td>${f(r.returns)}</td></tr>
        <tr class="total"><td>Net sales</td><td>${f(r.net)}</td></tr><tr><td>− Cost of goods sold</td><td>${f(r.cost)}</td></tr>
        <tr class="total"><td>Gross profit <small class="muted">(margin ${pct(r.gp, r.net)})</small></td><td>${f(r.gp)}</td></tr><tr><td>− Expenses</td><td>${f(r.expenses)}</td></tr><tr><td>+ Other income</td><td>${f(r.income)}</td></tr>
        <tr class="total"><td>Net profit</td><td style="color:${r.profit >= 0 ? 'var(--ok)' : 'var(--bad)'}">${f(r.profit)}</td></tr><tr><td class="muted">Tax collected</td><td class="muted">${f(r.tax)}</td></tr></table>
      ${r.costCover < 0.999 ? `<p class="pill warn">Cost price is missing for some products (${Math.round((1 - r.costCover) * 100)}% of sales), so profit only counts sales where the cost is known. Add cost prices in the catalogue admin.</p>` : ''}
      <h3>Sales by day</h3><div class="bars">${r.byDay.map(d => `<div style="height:${Math.max(2, d.v / max * 100)}%" title="${d.k}: ${f(d.v)}"><span>${d.k.slice(5)}</span></div>`).join('')}</div><div style="height:22px"></div>
      ${table(['Day', 'Sales', 'Total'], r.byDay.map(d => tr([d.k, d.n, f(d.v)])), ['Total', r.count, f(r.net + r.tax)])}
      <h3>Money received</h3>${table(['Payment', 'Amount'], r.byPay.map(p => tr([p.k, p.lbp ? P.fmtL(p.v) : f(p.v)])))}
      <h3>By cashier</h3>${table(['Cashier', 'Sales', 'Returns', 'Net total'], r.byCashier.map(c => tr([esc(c.k), c.n, f(c.c), f(c.v)])))}
      <h3>By category</h3>${table(['Category', 'Qty', 'Sales', 'Profit'], r.byCat.map(c => tr([esc(c.k), P.r2(c.q), f(c.v), c.cost ? f(c.v - c.cost) : '—'])))}
      <h3>Products</h3>${table(['Product', 'Qty', 'Sales', 'Profit'], r.byProd.slice(0, 100).map(c => tr([esc(c.k), P.r2(c.q), f(c.v), c.nocost ? '—' : f(c.v - c.cost)])))}
      <h3>Expenses by category</h3>${table(['Category', 'Entries', 'Amount'], r.byExp.map(c => tr([esc(c.k), c.n, f(c.v)])), ['Total', '', f(r.expenses)])}
      <h3>Customers who owe money</h3>${table(['Customer', 'Phone', 'Debt'], r.debtors.map(c => tr([esc(c.name), esc(c.phone || ''), f(c.balance)])), ['Total', '', f(r.debtTotal)])}
      <h3>Shifts</h3>${table(['Opened', 'Cashier', 'Status', 'Sales', 'Cash difference'], r.shifts.map(s => tr([P.dt(s.opened_at), esc(s.cashier_name), s.status, f(s.totals?.sales_total || 0), s.totals ? f(s.totals.difference_usd) + ' · ' + P.fmtL(s.totals.difference_lbp) : '—'])))}`;
  }

  /* ---------- exports ---------- */
  const fileBase = () => `${(P.biz.slug || 'report')}-report-${R.from}_${R.to}`;
  $('rpXlsx').onclick = async () => {
    if (!R) return P.toast('Show a report first.', true);
    try {
      const X = await P.loadXlsx(), wb = X.utils.book_new(), r = R;
      const add = (name, rows) => X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(rows), name.slice(0, 31));
      add('Summary', [[P.biz.company_name + ' — Financial report'], ['From', r.from, 'To', r.to], [], ['Gross sales', r.gross], ['Discounts', r.disc], ['Returns', r.returns], ['Net sales', r.net], ['Cost of goods sold', r.cost], ['Gross profit', r.gp], ['Expenses', r.expenses], ['Other income', r.income], ['Net profit', r.profit], ['Tax collected', r.tax], ['Number of sales', r.count], ['Average sale', r.avg], ['Debts to collect', r.debtTotal]]);
      add('Sales by day', [['Day', 'Sales', 'Total USD'], ...r.byDay.map(d => [d.k, d.n, P.r2(d.v)])]);
      add('Payments', [['Payment', 'Amount'], ...r.byPay.map(p => [p.k, P.r2(p.v)])]);
      add('Cashiers', [['Cashier', 'Sales', 'Returns USD', 'Net USD'], ...r.byCashier.map(c => [c.k, c.n, P.r2(c.c), P.r2(c.v)])]);
      add('Categories', [['Category', 'Qty', 'Sales USD', 'Profit USD'], ...r.byCat.map(c => [c.k, P.r2(c.q), P.r2(c.v), c.cost ? P.r2(c.v - c.cost) : ''])]);
      add('Products', [['Product', 'Qty', 'Sales USD', 'Profit USD'], ...r.byProd.map(c => [c.k, P.r2(c.q), P.r2(c.v), c.nocost ? '' : P.r2(c.v - c.cost)])]);
      add('Invoices', [['Date', 'Invoice', 'Type', 'Customer', 'Cashier', 'Payment', 'Subtotal', 'Discount', 'Tax', 'Total USD', 'Cash USD', 'Cash LBP', 'Card', 'Debt', 'Change USD', 'Change LBP', 'Rate'], ...r.sales.map(s => [new Date(s.created_at).toLocaleString(), s.invoice_label, s.kind, s.customer_name || '', s.cashier_name || '', s.payment_method, +s.subtotal, +s.discount, +s.tax, +s.total, +s.paid_usd, +s.paid_lbp, +s.paid_card, +s.credit_amount, +s.change_usd, +s.change_lbp, +s.rate])]);
      add('Expenses & income', [['Date', 'Type', 'Category', 'Amount USD', 'Paid USD', 'Paid LBP', 'Note', 'By'], ...r.entries.map(x => [x.entry_date, x.kind, x.category, +x.amount_usd, +x.paid_usd, +x.paid_lbp, x.note || '', x.cashier_name || ''])]);
      add('Debts', [['Customer', 'Phone', 'Debt USD'], ...r.debtors.map(c => [c.name, c.phone || '', +c.balance])]);
      X.writeFile(wb, fileBase() + '.xlsx');
    } catch (e) { P.err(e); }
  };
  const reportPdf = () => P.pdfBlob(`<style>${[...document.styleSheets].length ? '' : ''}.report{font-family:Arial;color:#111}.report table{width:100%;border-collapse:collapse;font-size:11px;margin-bottom:8px}.report th,.report td{padding:5px;border-bottom:1px solid #ddd;text-align:left}.report td.r,.report th.r,.pl td:last-child{text-align:right}.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}.kpi{border:1px solid #ddd;border-radius:8px;padding:6px}.kpi small{display:block;color:#666;font-size:10px}.kpi b{font-size:14px}.bars{display:flex;align-items:flex-end;gap:3px;height:90px}.bars div{flex:1;background:#6d28d9}.bars span{display:none}h3{border-bottom:2px solid #111;padding-bottom:4px;page-break-after:avoid}table{page-break-inside:auto}tr{page-break-inside:avoid}</style><div class="report">${$('report').innerHTML}</div>`, fileBase() + '.pdf');
  $('rpPdf').onclick = async () => { if (!R) return P.toast('Show a report first.', true); try { P.download(await reportPdf(), fileBase() + '.pdf'); } catch (e) { P.err(e); } };
  $('rpShare').onclick = async () => { if (!R) return P.toast('Show a report first.', true); try { await P.shareFile(await reportPdf(), fileBase() + '.pdf', 'Report', `${P.biz.company_name} — report ${R.from} → ${R.to}`); } catch (e) { P.err(e); } };
  $('rpEmail').onclick = async () => {
    if (!R) return P.toast('Show a report first.', true);
    const to = await P.ask('Email the report', 'Send to (email address)', { type: 'email', value: P.load('report-email', '') });
    if (to === null) return; P.save('report-email', to);
    try { P.download(await reportPdf(), fileBase() + '.pdf'); } catch (_) { }
    const r = R, f = P.fmt;
    P.email(to, `${P.biz.company_name} — report ${r.from} to ${r.to}`, `${P.biz.company_name} — report ${r.from} to ${r.to}\n\nNet sales: ${f(r.net)} (${r.count} sales)\nGross profit: ${f(r.gp)}\nExpenses: ${f(r.expenses)}\nOther income: ${f(r.income)}\nNet profit: ${f(r.profit)}\nDebts to collect: ${f(r.debtTotal)}\n\nThe full PDF report was downloaded on the device — attach it to this email.`);
  };
  $('rpPrint').onclick = () => { if (!R) return P.toast('Show a report first.', true); P.printHtml(`<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="${new URL('pos.css', location.href)}"><style>@page{size:A4;margin:10mm}body{background:#fff;height:auto}.report{border:0;padding:0}</style></head><body><div class="report">${$('report').innerHTML}</div></body></html>`); };

  P.hooks.tab_reports = () => {
    $('rpCashier').innerHTML = '<option value="">All cashiers</option><option value="owner">Owner</option>' + P.cashiers.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
    if (!$('rpFrom').value) preset($('rpPreset').value);
    run();
  };
})();
