/* My Catalogue — special prices on the storefront (v14).
   price1/price2 are the regular prices; sale_price1/sale_price2 are the offer prices.
   prepare() swaps in the offer price (so cart, layouts and banner charge it) and keeps
   the regular price as p.was1/p.was2; decorate() adds the crossed-out old price and a badge. */
(function () {
  const num = v => (v === null || v === undefined || String(v).trim() === '') ? NaN : Number(v);
  function active(p) { return !p.sale_ends_at || new Date(p.sale_ends_at).getTime() > Date.now(); }
  function prepare(products) {
    (products || []).forEach(p => {
      if (p.was1 !== undefined || p.was2 !== undefined) return;
      const ok = active(p);
      [1, 2].forEach(u => {
        const reg = num(p['price' + u]), sale = num(p['sale_price' + u]);
        if (ok && Number.isFinite(reg) && Number.isFinite(sale) && sale < reg) { p['was' + u] = reg; p['price' + u] = sale; }
        else p['was' + u] = null;
      });
      const pct = [1, 2].map(u => p['was' + u] ? Math.round((1 - Number(p['price' + u]) / p['was' + u]) * 100) : 0);
      p.salePct = Math.max(...pct);
      p.onSale = p.salePct > 0;
    });
    return products;
  }
  function until(p) {
    if (!p.sale_ends_at) return '';
    const d = new Date(p.sale_ends_at);
    return 'Offer until ' + d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  }
  function old(fmt, v) { return `<s class="mc-was" aria-label="Old price">${fmt(v)}</s>`; }
  function decorate(root, products, fmt) {
    if (!root) return;
    const byId = new Map((products || []).filter(p => p.onSale).map(p => [String(p.id), p]));
    if (!byId.size) return;
    // product cards (every layout keeps data-add / data-unit with the product id)
    root.querySelectorAll('.product').forEach(card => {
      const key = card.querySelector('[data-add],[data-unit],[data-id]');
      const id = key && (key.dataset.add || key.dataset.id); const p = id && byId.get(String(id));
      if (!p || card.dataset.mcSale) return;
      card.dataset.mcSale = '1'; card.classList.add('mc-on-sale');
      const pic = card.querySelector('.L-pic') || card.querySelector('img,.placeholder')?.parentElement || card;
      const badge = document.createElement('span'); badge.className = 'mc-sale-badge'; badge.textContent = '−' + p.salePct + '%';
      if (pic === card) card.prepend(badge); else { pic.style.position = pic.style.position || 'relative'; pic.appendChild(badge); }
      card.querySelectorAll('.priceChoice[data-unit]').forEach(b => { const w = p['was' + b.dataset.unit]; const sm = b.querySelector('small'); if (w && sm && !sm.querySelector('.mc-was')) sm.insertAdjacentHTML('afterbegin', old(fmt, w) + ' '); });
      // single price displays used by some layouts (selected unit, or "from" price)
      const active = card.querySelector('.priceChoice.active') || card.querySelector('.priceChoice');
      const unit = active ? active.dataset.unit : (p.was1 ? '1' : '2');
      const w = p['was' + unit] || p.was1 || p.was2;
      card.querySelectorAll('.L-price,.L-from,.L-tag').forEach(el => { if (!el.querySelector('.mc-was')) el.insertAdjacentHTML('beforeend', ' ' + old(fmt, w)); });
      const t = until(p), name = card.querySelector('.name');
      if (t && name) name.insertAdjacentHTML('afterend', `<div class="mc-sale-until">${t}</div>`);
    });
    root.querySelectorAll('[data-sale-id]').forEach(el => {
      const p = byId.get(String(el.dataset.saleId)); if (!p || el.dataset.mcSale) return;
      el.dataset.mcSale = '1'; el.insertAdjacentHTML('beforeend', `<span class="mc-sale-badge">−${p.salePct}%</span>`);
    });
    // banner slides and supermarket aisle previews
    root.querySelectorAll('[data-mcb-id]').forEach(btn => {
      const p = byId.get(String(btn.dataset.mcbId)); const slide = btn.closest('.mcb-slide'); if (!p || !slide || slide.dataset.mcSale) return;
      slide.dataset.mcSale = '1';
      const pr = slide.querySelector('.mcb-price'); if (pr) pr.insertAdjacentHTML('beforeend', ' ' + old(fmt, p.was1 || p.was2));
      const img = slide.querySelector('.mcb-img'); if (img) img.insertAdjacentHTML('beforeend', `<span class="mc-sale-badge">−${p.salePct}%</span>`);
    });
  }
  window.MCSale = { prepare, decorate, active };
})();
