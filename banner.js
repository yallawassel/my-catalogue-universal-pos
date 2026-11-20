/* My Catalogue — moving storefront banner (v13).
   Slides: an optional short video first, then products — picked by hand in admin,
   or chosen automatically (products with photos and a price). Swipe, dots, auto-play. */
(function () {
  let timer = null, sig = '';
  const PLAY = 4500, VIDEO_PLAY = 9000;

  function pickAuto(products) {
    const ok = products.filter(p => p.image && (p.price1 != null || p.price2 != null));
    const pool = ok.length >= 3 ? ok : products.filter(p => p.image);
    // one product per category first, so the banner shows variety, then fill up
    const seen = new Set(), first = [], rest = [];
    pool.forEach(p => { const c = p.category || 'Products'; (seen.has(c) ? rest : first).push(p); seen.add(c); });
    return first.concat(rest).slice(0, 8);
  }
  function slides(biz, products) {
    if (!biz || biz.banner_mode === 'off') return [];
    const byId = new Map(products.map(p => [p.id, p]));
    const chosen = biz.banner_mode === 'manual' ? (biz.banner_product_ids || []).map(id => byId.get(id)).filter(p => p && p.image) : pickAuto(products);
    const list = chosen.map(p => ({ type: 'product', p }));
    if (biz.banner_video_url) list.unshift({ type: 'video', url: biz.banner_video_url });
    return list;
  }
  function priceOf(p) {
    const v = [p.price1, p.price2].filter(x => x !== null && x !== undefined && String(x).trim() !== '').map(Number).filter(Number.isFinite);
    return v.length ? Math.min(...v) : NaN;
  }
  function stop() { if (timer) clearTimeout(timer); timer = null; }

  function render(box, ctx) {
    if (!box) return;
    const list = slides(ctx.biz, ctx.products);
    const s = JSON.stringify([ctx.template, ctx.biz?.banner_headline, list.map(x => x.type === 'video' ? x.url : x.p.id + x.p.image + x.p.price1 + x.p.price2)]);
    if (s === sig && box.childElementCount) return;
    sig = s; stop();
    if (!list.length) { box.innerHTML = ''; return; }
    const { esc, fmt } = ctx, head = ctx.biz.banner_headline ? `<span class="mcb-head">${esc(ctx.biz.banner_headline)}</span>` : '';
    box.innerHTML = `<div class="mcb" role="region" aria-roledescription="carousel" aria-label="Featured products">
      <div class="mcb-track">${list.map((x, i) => x.type === 'video'
        ? `<div class="mcb-slide mcb-video" aria-roledescription="slide" aria-label="${i + 1} of ${list.length}"><video src="${esc(x.url)}" muted loop playsinline autoplay preload="metadata"></video><div class="mcb-cap">${head}<b>${esc(ctx.biz.company_name)}</b></div></div>`
        : (() => { const p = x.p, v = priceOf(p); return `<div class="mcb-slide" aria-roledescription="slide" aria-label="${i + 1} of ${list.length}"><div class="mcb-img"><img src="${esc(p.image)}" alt="${esc(p.name)}" loading="${i < 2 ? 'eager' : 'lazy'}"></div><div class="mcb-cap">${head}<b>${esc(p.name)}</b>${Number.isFinite(v) ? `<span class="mcb-price">${fmt(v)}</span>` : ''}<button type="button" class="mcb-go" data-mcb-cat="${esc(p.category || 'Products')}" data-mcb-id="${esc(p.id)}">Shop now</button></div></div>`; })()).join('')}</div>
      ${list.length > 1 ? `<button type="button" class="mcb-nav prev" aria-label="Previous slide">‹</button><button type="button" class="mcb-nav next" aria-label="Next slide">›</button><div class="mcb-dots">${list.map((_, i) => `<button type="button" class="mcb-dot ${i ? '' : 'on'}" data-mcb-dot="${i}" aria-label="Slide ${i + 1}"></button>`).join('')}</div>` : ''}
    </div>`;
    const root = box.firstElementChild, track = root.querySelector('.mcb-track'), n = list.length;
    let cur = 0, paused = false;
    const go = (i, smooth = true) => { cur = (i + n) % n; track.scrollTo({ left: track.clientWidth * cur, behavior: smooth ? 'smooth' : 'auto' }); };
    const mark = () => {
      root.querySelectorAll('.mcb-dot').forEach((d, k) => d.classList.toggle('on', k === cur));
      root.querySelectorAll('video').forEach(v => { const on = v.closest('.mcb-slide') === track.children[cur]; try { on ? v.play() : v.pause(); } catch (_) { } });
    };
    const next = () => { stop(); if (n < 2) return; timer = setTimeout(() => { if (!paused && document.body.contains(root)) go(cur + 1); next(); }, list[cur].type === 'video' ? VIDEO_PLAY : PLAY); };
    let t = null;
    track.addEventListener('scroll', () => { clearTimeout(t); t = setTimeout(() => { const i = Math.round(track.scrollLeft / Math.max(1, track.clientWidth)); if (i !== cur) { cur = i; } mark(); next(); }, 90); }, { passive: true });
    root.addEventListener('click', e => {
      const d = e.target.closest('[data-mcb-dot]'); if (d) { go(Number(d.dataset.mcbDot)); return; }
      if (e.target.closest('.mcb-nav.prev')) { go(cur - 1); return; }
      if (e.target.closest('.mcb-nav.next')) { go(cur + 1); return; }
      const b = e.target.closest('[data-mcb-cat]'); if (b && ctx.open) ctx.open(b.dataset.mcbCat, b.dataset.mcbId);
    });
    ['pointerenter', 'touchstart', 'focusin'].forEach(ev => root.addEventListener(ev, () => { paused = true; }, { passive: true }));
    ['pointerleave', 'touchend', 'focusout'].forEach(ev => root.addEventListener(ev, () => { paused = false; }, { passive: true }));
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) paused = true;
    mark(); next();
  }
  window.MCBanner = { render, slides, reset() { sig = ''; } };
})();
