/* My Catalogue — "Ask for the price" for products without a price (v16).
   Adds a "Request price" button (goes in the cart and the order, the business confirms the price)
   and a direct "Ask on WhatsApp" link. Sold-out products are left alone. */
(function () {
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function wa(biz, p) {
    const to = String(biz && biz.whatsapp || '').replace(/\D/g, '');
    if (!to) return '';
    const text = `Hello ${biz.company_name || ''}, what is the price of: ${p.name}${p.sku ? ' (' + p.sku + ')' : ''}?`;
    return 'https://wa.me/' + to + '?text=' + encodeURIComponent(text);
  }
  function decorate(root, products, biz) {
    if (!root) return;
    const byId = new Map((products || []).filter(p => p.price1 == null && p.price2 == null && !p.soldOut).map(p => [String(p.id), p]));
    if (!byId.size) return;
    root.querySelectorAll('.product').forEach(card => {
      if (card.dataset.mcQuote) return;
      const key = card.querySelector('[data-add],[data-unit],[data-id]');
      const p = key && byId.get(String(key.dataset.add || key.dataset.id)); if (!p) return;
      card.dataset.mcQuote = '1'; card.classList.add('mc-quote-card');
      card.querySelectorAll('.desc').forEach(d => { if (/price on request/i.test(d.textContent)) d.outerHTML = '<div class="mc-quote-note">💬 Price on request</div>'; });
      const link = wa(biz, p);
      const html = `<button class="addbtn mc-quote-btn" data-add="${esc(p.id)}">＋ Request price</button>${link ? `<a class="mc-ask" href="${esc(link)}" target="_blank" rel="noopener">Ask on WhatsApp</a>` : ''}`;
      const host = card.querySelector('.body') || card.querySelector('.L-ws-name')?.parentElement || card;
      const row = host.querySelector('.qtyrow');
      if (card.classList.contains('L-ws-row')) card.insertAdjacentHTML('beforeend', `<div class="mc-quote-acts">${html}</div>`);
      else if (row && row.parentElement.classList.contains('L-row')) row.parentElement.insertAdjacentHTML('afterend', `<div class="mc-quote-acts">${html}</div>`);
      else if (row) row.insertAdjacentHTML('afterend', `<div class="mc-quote-acts">${html}</div>`);
      else host.insertAdjacentHTML('beforeend', `<div class="mc-quote-acts">${html}</div>`);
    });
  }
  window.MCQuote = { decorate };
})();
