/* My Catalogue — stock on the storefront (v15).
   Reads only what the business chose to show (mc_saas_public_stock), marks products
   out of stock / low stock, disables "Add" for sold-out items, or hides them. */
(function () {
  let settings = { show_on_catalogue: true, hide_out_of_stock: false, block_out_of_stock_orders: true };
  async function load(biz, products) {
    if (!window.MC || !MC.sb || !biz) return products;
    try {
      const [st, rows] = await Promise.all([
        MC.sb.rpc('mc_saas_public_stock_settings', { p_business_id: biz.id }),
        (MC.fetchAll ? MC.fetchAll(() => MC.sb.rpc('mc_saas_public_stock', { p_business_id: biz.id }).order('product_id')) : MC.sb.rpc('mc_saas_public_stock', { p_business_id: biz.id }))
      ]);
      if (!st.error && st.data && st.data[0]) settings = st.data[0];
      if (rows.error) return products;
      const map = new Map((rows.data || []).map(r => [String(r.product_id), r]));
      products.forEach(p => {
        const r = map.get(String(p.id));
        p.stockStatus = r ? r.status : 'unknown';
        p.stockQty = r && r.qty !== null && r.qty !== undefined ? Number(r.qty) : null;
        p.soldOut = p.stockStatus === 'out_of_stock';
      });
      return settings.hide_out_of_stock ? products.filter(p => !p.soldOut) : products;
    } catch (_) { return products; }
  }
  function label(p) {
    if (p.soldOut) return 'Out of stock';
    if (p.stockStatus === 'low_stock') return p.stockQty !== null ? `Only ${p.stockQty} left` : 'Low stock';
    if (p.stockStatus === 'in_stock' && p.stockQty !== null) return `${p.stockQty} in stock`;
    return '';
  }
  function decorate(root, products) {
    if (!root) return;
    const byId = new Map((products || []).filter(p => p.soldOut || p.stockStatus === 'low_stock' || p.stockQty !== null).map(p => [String(p.id), p]));
    if (!byId.size) return;
    root.querySelectorAll('.product').forEach(card => {
      if (card.dataset.mcStock) return;
      const key = card.querySelector('[data-add],[data-unit],[data-id]');
      const p = key && byId.get(String(key.dataset.add || key.dataset.id)); if (!p) return;
      card.dataset.mcStock = '1';
      const text = label(p); if (!text) return;
      if (p.soldOut) {
        card.classList.add('mc-out');
        card.querySelectorAll('[data-add]').forEach(b => { b.removeAttribute('data-add'); b.disabled = true; b.classList.add('mc-out-btn'); b.innerHTML = 'Out of stock'; b.setAttribute('aria-disabled', 'true'); });
        card.querySelectorAll('.qtybtn').forEach(b => { b.disabled = true; });
        const pic = card.querySelector('.L-pic') || card.querySelector('img,.placeholder')?.parentElement || card;
        const tag = document.createElement('span'); tag.className = 'mc-stock-tag out'; tag.textContent = 'Sold out';
        if (pic === card) { card.prepend(tag); const im = card.querySelector('img,.placeholder'); if (im) requestAnimationFrame(() => { tag.style.top = (im.offsetTop + im.offsetHeight / 2) + 'px'; }); } else { pic.style.position = pic.style.position || 'relative'; pic.appendChild(tag); }
      }
      const name = card.querySelector('.name');
      if (name) name.insertAdjacentHTML('afterend', `<div class="mc-stock-line ${p.soldOut ? 'out' : p.stockStatus === 'low_stock' ? 'low' : 'ok'}">${text}</div>`);
    });
    // aisle previews (supermarket) and banner slides
    root.querySelectorAll('[data-sale-id],[data-mcb-id]').forEach(el => {
      const p = byId.get(String(el.dataset.saleId || el.dataset.mcbId)); if (!p || !p.soldOut || el.dataset.mcStock) return;
      el.dataset.mcStock = '1'; (el.closest('.mcb-slide') || el).classList.add('mc-out');
    });
  }
  window.MCStock = { load, decorate, get settings() { return settings; } };
})();
