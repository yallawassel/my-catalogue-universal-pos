/* My Catalogue — "Special price" box in the admin product form. v14 */
(() => {
  const $ = id => document.getElementById(id);
  if (!$('spBox')) return;
  const num = v => { const s = String(v ?? '').trim().replace(',', '.'); return s === '' ? null : Number(s); };
  const money = v => (window.MC && MC.money) ? MC.money(v, (window.MCAdmin && MCAdmin.biz && MCAdmin.biz.currency) || 'USD') : '$' + Number(v).toFixed(2);
  const round = v => Math.round(v * 100) / 100;

  function refresh() {
    const on = $('spOn').checked;
    $('spFields').classList.toggle('hidden', !on);
    $('spBox').classList.toggle('on', on);
    const l1 = $('pLabel1').value.trim() || 'Box', l2 = $('pLabel2').value.trim();
    const r1 = num($('pPrice1').value), r2 = l2 ? num($('pPrice2').value) : null;
    $('spL1').textContent = l1; $('spL2').textContent = l2;
    $('spCol2').classList.toggle('hidden', !l2 || r2 === null);
    $('spOld1').textContent = r1 !== null ? `Old price ${money(r1)} will be shown crossed out` : 'Enter the first price above first';
    $('spOld2').textContent = r2 !== null ? `Old price ${money(r2)} will be shown crossed out` : '';
    const rows = [[l1, r1, num($('pSale1').value)], [l2, r2, num($('pSale2').value)]].filter(x => x[0] && x[1] !== null && x[2] !== null);
    $('spPreview').innerHTML = on && rows.length ? 'Customers will see: ' + rows.map(([l, r, s]) => s < r
      ? `<span class="sp-chip"><b>${l}</b> <s>${money(r)}</s> <b class="sp-new">${money(s)}</b> <em>−${Math.round((1 - s / r) * 100)}%</em></span>`
      : `<span class="sp-chip bad"><b>${l}</b> new price must be lower than ${money(r)}</span>`).join(' ') : '';
  }
  window.mcSaleFill = p => {
    const has = p && (p.sale_price1 != null || p.sale_price2 != null);
    $('spOn').checked = !!has;
    $('pSale1').value = p && p.sale_price1 != null ? p.sale_price1 : '';
    $('pSale2').value = p && p.sale_price2 != null ? p.sale_price2 : '';
    $('pSaleEnds').value = p && p.sale_ends_at ? new Date(p.sale_ends_at).toLocaleDateString('en-CA') : '';
    refresh();
  };
  window.mcSalePayload = () => {
    if (!$('spOn').checked) return { sale_price1: null, sale_price2: null, sale_ends_at: null };
    const r1 = num($('pPrice1').value), r2 = $('pLabel2').value.trim() ? num($('pPrice2').value) : null;
    const s1 = num($('pSale1').value), s2 = r2 !== null ? num($('pSale2').value) : null;
    if (s1 === null && s2 === null) throw Error('Special price: enter at least one new price, or untick Special price.');
    [[s1, r1, $('pLabel1').value || 'first unit'], [s2, r2, $('pLabel2').value || 'second unit']].forEach(([s, r, l]) => {
      if (s === null) return;
      if (!Number.isFinite(s) || s < 0) throw Error(`Special price for ${l} must be a number of zero or more.`);
      if (r === null) throw Error(`Enter the normal price for ${l} before adding a special price.`);
      if (s >= r) throw Error(`Special price for ${l} (${s}) must be lower than the normal price (${r}).`);
    });
    let ends = null;
    if ($('pSaleEnds').value) {
      const d = new Date($('pSaleEnds').value + 'T23:59:59');
      if (d.getTime() < Date.now()) throw Error('The offer end date is in the past.');
      ends = d.toISOString();
    }
    return { sale_price1: s1, sale_price2: s2, sale_ends_at: ends };
  };

  $('spOn').addEventListener('change', refresh);
  ['pSale1', 'pSale2', 'pPrice1', 'pPrice2', 'pLabel1', 'pLabel2', 'pSaleEnds'].forEach(id => $(id) && $(id).addEventListener('input', refresh));
  $('spPct').addEventListener('click', e => {
    const b = e.target.closest('[data-sp-pct]'); if (!b) return;
    const k = 1 - Number(b.dataset.spPct) / 100;
    const r1 = num($('pPrice1').value), r2 = $('pLabel2').value.trim() ? num($('pPrice2').value) : null;
    if (r1 !== null) $('pSale1').value = round(r1 * k);
    if (r2 !== null) $('pSale2').value = round(r2 * k);
    refresh();
  });
  refresh();
})();
