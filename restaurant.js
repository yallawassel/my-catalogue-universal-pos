/* My Catalogue — Restaurant & Delivery template behaviour (v23).
   Quick + on each dish, tap a dish to open its page (choices/options), quantity badges,
   delivery info chips, and menu tabs that stick to the top and follow the scroll. */
(() => {
  const $ = id => document.getElementById(id);
  const S = () => window.MCShop, P = () => window.MCShopPlus;
  const on = () => document.body.classList.contains('template-restaurant');
  const headH = () => { const h = document.querySelector('header'); if (!h) return 0; const cs = getComputedStyle(h); return /sticky|fixed/.test(cs.position) ? Math.max(0, h.getBoundingClientRect().bottom) : 0; };
  const tr = s => (P() && P().t ? P().t(s) : s);

  function prices(p) { return [[p.price1, 1], [p.price2, 2]].filter(x => x[0] !== null && x[0] !== undefined && String(x[0]).trim() !== '' && Number.isFinite(Number(x[0]))); }
  function quickAdd(id) {
    const p = (S().products || []).find(x => String(x.id) === String(id)); if (!p || p.soldOut) return;
    const v = prices(p);
    if (v.length !== 1 || (P() && P().needsOptions(p))) { if (P()) P().open(p.id); return; }
    S().add(p, v[0][1], 1, ''); badges();
  }
  function badges() {
    if (!on() || !S()) return;
    const n = {}; (S().cart || []).forEach(x => { n[x.id] = (n[x.id] || 0) + x.qty; });
    document.querySelectorAll('[data-rs-q]').forEach(el => { const q = n[el.dataset.rsQ] || 0; el.hidden = !q; el.textContent = q; });
  }
  document.addEventListener('click', e => {
    if (!on()) return;
    const a = e.target.closest('[data-rs-add]');
    if (a) { e.preventDefault(); e.stopPropagation(); quickAdd(a.dataset.rsAdd); return; }
    const d = e.target.closest('[data-rs-open]');
    if (d && P()) { e.preventDefault(); e.stopPropagation(); P().open(d.dataset.rsOpen); return; }
    const t = e.target.closest('[data-rs-tab]');
    if (t) { e.preventDefault(); const sec = $(t.dataset.rsTab); if (sec) { const y = sec.getBoundingClientRect().top + scrollY - 64 - headH(); scrollTo({ top: y, behavior: 'smooth' }); } }
    setTimeout(badges, 60);
  }, true);
  document.addEventListener('keydown', e => { if (on() && e.key === 'Enter' && e.target.matches && e.target.matches('[data-rs-open]')) P() && P().open(e.target.dataset.rsOpen); });

  function info() {
    const box = $('rsInfo'); if (!box || !S()) return;
    const b = S().biz, z = (P() && P().zones) || [], f = S().fmt, chips = [];
    if (z.length) {
      const fees = z.map(x => Number(x.fee) || 0), lo = Math.min(...fees), hi = Math.max(...fees);
      chips.push('🛵 ' + tr('Delivery') + ' ' + (hi === 0 ? tr('Free') : lo === hi ? f(lo) : f(lo) + '–' + f(hi)));
      const eta = z.find(x => x.eta); if (eta) chips.push('⏱ ' + eta.eta);
      const mins = z.map(x => Number(x.min_order)).filter(x => x > 0); if (mins.length) chips.push('🧾 Min ' + f(Math.min(...mins)));
      const free = z.map(x => Number(x.free_over)).filter(x => x > 0); if (free.length) chips.push('🎉 ' + tr('Free delivery') + ' ≥ ' + f(Math.min(...free)));
    }
    if (b.pickup_enabled !== false) chips.push('🏬 ' + tr('Pickup available'));
    if (b.whatsapp) chips.push('💬 ' + tr('Order on WhatsApp'));
    box.innerHTML = chips.map(c => `<span>${S().esc(c)}</span>`).join('');
  }

  // sticky tabs that follow the scroll
  let io = null, spy = null;
  function tabs() {
    const nav = $('rsTabs'); if (!nav) return;
    if (io) io.disconnect(); if (spy) spy.disconnect();
    let ghost = $('rsTabsFixed');
    if (!ghost) { ghost = document.createElement('nav'); ghost.id = 'rsTabsFixed'; ghost.className = 'L-rs-tabs L-rs-fixed'; document.body.appendChild(ghost); }
    ghost.innerHTML = nav.innerHTML; ghost.hidden = true;
    io = new IntersectionObserver(([en]) => { ghost.hidden = en.isIntersecting || !on() || !$('categoryView') || $('categoryView').hidden; ghost.style.top = headH() + 'px'; }, { threshold: 0, rootMargin: '-' + Math.round(headH()) + 'px 0px 0px 0px' });
    io.observe(nav);
    const secs = [...document.querySelectorAll('.L-rs-sec')];
    spy = new IntersectionObserver(ents => {
      ents.forEach(en => { if (!en.isIntersecting) return;
        [nav, ghost].forEach(n => n.querySelectorAll('[data-rs-tab]').forEach(a => { const act = a.dataset.rsTab === en.target.id; a.classList.toggle('on', act); if (act && n === ghost && !ghost.hidden) a.scrollIntoView({ block: 'nearest', inline: 'center' }); })); });
    }, { rootMargin: '-80px 0px -70% 0px' });
    secs.forEach(s => spy.observe(s));
  }
  // delivery-app order: restaurant header, then offers banner, then the menu tabs
  function arrange() {
    const hero = $('mcHero'), ban = $('mcBanner'), nav = $('rsTabs'); if (!hero || !ban) return;
    if (on()) { if (hero.nextElementSibling !== ban) hero.after(ban); if (nav) ban.after(nav); }
    else if (ban.nextElementSibling === hero) { /* already original order */ } else if (hero.previousElementSibling !== ban) hero.before(ban);
    document.querySelectorAll('nav.L-rs-tabs:not(#rsTabsFixed)').forEach(n => { if (n !== nav || !on()) n.remove(); });
  }
  function refresh() { arrange(); if (!on()) { const g = $('rsTabsFixed'); if (g) g.hidden = true; return; } info(); tabs(); badges(); }
  // the home grid is redrawn on search / language / template changes
  const watch = () => { const g = $('categoryGrid'); if (!g) return setTimeout(watch, 300); new MutationObserver(() => setTimeout(refresh, 30)).observe(g, { childList: true }); refresh(); };
  document.addEventListener('mc:ready', watch);
  document.addEventListener('mc:zones', info);
  document.addEventListener('mc:template', () => setTimeout(refresh, 50));
  window.MCRestaurant = { refresh };
})();
