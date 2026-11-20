/* My Catalogue — page layouts per industry template (v12).
   Each template gets its own home hero, category display and product card,
   modelled on how big stores in that industry present products.
   Every button keeps the data-* attributes the storefront already listens to. */
(function () {
  const IC = {
    cart: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.6 12.4a2 2 0 0 0 2 1.6h7.8a2 2 0 0 0 2-1.6L21 7H6"/></svg>',
    plus: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    heart: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z"/></svg>',
    chat: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-12.3 7.4L3 21l2-5.4A8.4 8.4 0 1 1 21 11.5z"/></svg>'
  };
  const L = {};

  /* ---------- shared pieces ---------- */
  function img(ctx, src, alt, extra) { return src ? `<img src="${ctx.esc(src)}" alt="${ctx.esc(alt)}" loading="lazy" decoding="async" ${extra || ''}>` : ''; }
  function catImg(ctx, c) {
    const i = ctx.categoryImages[c] || (ctx.products.find(p => (p.category || 'Products') === c && p.image) || {}).image;
    return i ? `<img class="category-cover" src="${ctx.esc(i)}" alt="${ctx.esc(c)}" loading="lazy">` : `<div class="category-art" aria-hidden="true">${ctx.art(c)}</div>`;
  }
  function heroImage(ctx) {
    const c = Object.values(ctx.categoryImages || {}).find(Boolean);
    return c || (ctx.products.find(p => p.image) || {}).image || '';
  }
  function minPrice(o) { const v = o.options.map(x => Number(x[1])).filter(Number.isFinite); return v.length ? Math.min(...v) : NaN; }
  function units(ctx, o, cls) {
    if (!o.options.length) return '<div class="desc">Price on request — contact us.</div>';
    return `<div class="priceChoices ${cls || ''}">${o.options.map(([label, value, u]) => `<button class="priceChoice ${o.sel === u ? 'active' : ''}" data-unit="${u}" data-id="${o.p.id}">${ctx.esc(label)}<small>${ctx.fmt(value)}</small></button>`).join('')}</div>`;
  }
  function qty(o, cls) { return `<div class="qtyrow ${cls || ''}"><button class="qtybtn" data-qty="-1" data-id="${o.p.id}" aria-label="Less">−</button><span class="qty" id="qty-${o.p.id}">1</span><button class="qtybtn" data-qty="1" data-id="${o.p.id}" aria-label="More">+</button></div>`; }
  function add(o, label, cls) { return o.options.length ? `<button class="addbtn ${cls || ''}" data-add="${o.p.id}">${label}</button>` : ''; }
  function pic(ctx, o, cls) { const p = o.p; return p.image ? `<div class="L-pic ${cls || ''}"><img src="${ctx.esc(p.image)}" loading="lazy" decoding="async" width="600" height="600" alt="${ctx.esc(p.name)}" data-zoom="${o.ix}"></div>` : `<div class="L-pic ${cls || ''}"><div class="placeholder">${ctx.esc(p.name.slice(0, 1))}</div></div>`; }
  function selPrice(ctx, o) { const x = o.options.find(x => x[2] === o.sel) || o.options[0]; return x ? ctx.fmt(x[1]) : ''; }
  function code(ctx, p) { return p.sku ? `SKU ${ctx.esc(p.sku)}` : (p.barcode ? ctx.esc(p.barcode) : ''); }
  const count = (ctx, c) => { const n = ctx.count(c); return n + ' product' + (n === 1 ? '' : 's'); };

  /* ---------- Chocolate & sweets: story hero, editorial collections, centred gift-style cards ---------- */
  L.chocolate = {
    hero: ctx => { const h = heroImage(ctx); return `<div class="L-choc-hero">${h ? `<img src="${ctx.esc(h)}" alt="" aria-hidden="true">` : ''}<div class="L-in"><span class="L-eyebrow">The collections</span><h2>${ctx.esc(ctx.biz.company_name)}</h2>${ctx.biz.description ? `<p>${ctx.esc(ctx.biz.description)}</p>` : ''}<a href="#categoryGrid" class="L-btn">Discover ${IC.arrow}</a></div></div>`; },
    title: 'Our collections',
    category: (ctx, c, i) => `<button class="category L-choc-col ${i % 2 ? 'alt' : ''}" data-category="${ctx.esc(c)}">${catImg(ctx, c)}<div class="info"><div><span class="L-eyebrow">${count(ctx, c)}</span><div class="name">${ctx.esc(c)}</div><span class="L-link">Discover ${IC.arrow}</span></div></div></button>`,
    product: (ctx, o) => { const m = minPrice(o); return `<article class="product L-choc-card">${pic(ctx, o)}<div class="body"><div class="name">${ctx.esc(o.p.name)}</div>${o.p.description ? `<div class="desc">${ctx.esc(o.p.description)}</div>` : ''}${Number.isFinite(m) ? `<div class="L-from">${o.options.length > 1 ? 'from ' : ''}${ctx.fmt(m)}</div>` : ''}${units(ctx, o, 'L-pills')}${qty(o, 'L-mini')}${add(o, 'Add to my box')}</div></article>`; }
  };

  /* ---------- Luxury: centred maison hero, overlay collection tiles, gallery cards ---------- */
  L.luxury = {
    hero: ctx => `<div class="L-lux-hero">${ctx.biz.logo_url ? `<img src="${ctx.esc(ctx.biz.logo_url)}" alt="">` : ''}<h2>${ctx.esc(ctx.biz.company_name)}</h2><i></i>${ctx.biz.description ? `<p>${ctx.esc(ctx.biz.description)}</p>` : ''}</div>`,
    title: 'The collections',
    category: (ctx, c) => `<button class="category L-lux-col" data-category="${ctx.esc(c)}">${catImg(ctx, c)}<div class="info"><div class="name">${ctx.esc(c)}</div><span class="L-link">Discover</span></div></button>`,
    product: (ctx, o) => `<article class="product L-lux-card">${pic(ctx, o)}<div class="body"><div class="name">${ctx.esc(o.p.name)}</div><div class="L-price">${selPrice(ctx, o)}</div>${units(ctx, o, 'L-text')}${qty(o, 'L-mini')}${add(o, 'Add to bag')}</div></article>`
  };

  /* ---------- Boutique: welcome card, round category highlights, cosy cards ---------- */
  L.boutique = {
    hero: ctx => `<div class="L-bou-hero">${ctx.biz.logo_url ? `<img src="${ctx.esc(ctx.biz.logo_url)}" alt="">` : ''}<div><span class="L-eyebrow">Welcome to</span><h2>${ctx.esc(ctx.biz.company_name)}</h2>${ctx.biz.description ? `<p>${ctx.esc(ctx.biz.description)}</p>` : ''}</div></div>`,
    title: 'Shop by category',
    category: (ctx, c) => `<button class="category L-bou-cat" data-category="${ctx.esc(c)}"><span class="L-ring">${catImg(ctx, c)}</span><div class="info"><div class="name">${ctx.esc(c)}</div><div class="count">${count(ctx, c)}</div></div></button>`,
    product: (ctx, o) => `<article class="product L-bou-card">${pic(ctx, o)}<span class="L-heart" aria-hidden="true">${IC.heart}</span><div class="body"><div class="L-row"><div class="name">${ctx.esc(o.p.name)}</div><b class="L-price">${selPrice(ctx, o)}</b></div>${o.p.description ? `<div class="desc">${ctx.esc(o.p.description)}</div>` : ''}${o.options.length > 1 ? units(ctx, o, 'L-pills') : ''}<div class="L-row">${qty(o, 'L-mini')}${add(o, 'Add to bag', 'L-grow')}</div></div></article>`
  };

  /* ---------- Mini market: quick info strip, grocery icon tiles, price-first cards with + button ---------- */
  L.minimarket = {
    hero: ctx => `<div class="L-mm-hero"><div><b>${ctx.esc(ctx.biz.company_name)}</b><span>${ctx.products.length} products · order on WhatsApp</span></div><span class="L-mm-ic" aria-hidden="true">${IC.cart}</span></div>`,
    title: 'Aisles',
    category: (ctx, c) => `<button class="category L-mm-cat" data-category="${ctx.esc(c)}">${catImg(ctx, c)}<div class="info"><div class="name">${ctx.esc(c)}</div></div></button>`,
    product: (ctx, o) => `<article class="product L-mm-card">${pic(ctx, o)}<div class="body"><div class="L-price">${selPrice(ctx, o)}</div><div class="name">${ctx.esc(o.p.name)}</div>${o.options.length > 1 ? units(ctx, o, 'L-pills') : ''}<div class="L-row">${qty(o, 'L-mini')}${o.options.length ? `<button class="addbtn L-fab" data-add="${o.p.id}" aria-label="Add to cart">${IC.plus}</button>` : ''}</div></div></article>`
  };

  /* ---------- Supermarket: offers banner, aisle strip, product rows per aisle, price-tag cards ---------- */
  L.supermarket = {
    hero: (ctx, cats) => `<div class="L-sm-hero"><div><span class="L-eyebrow">Shop all aisles</span><h2>${ctx.esc(ctx.biz.company_name)}</h2><p>${ctx.products.length} products in ${cats.length} aisles</p></div></div><nav class="L-sm-strip" aria-label="Aisles">${cats.map(c => `<button class="L-sm-aisle" data-category="${ctx.esc(c)}">${catImg(ctx, c)}<span>${ctx.esc(c)}</span></button>`).join('')}</nav>`,
    grid: 'L-sm-rows',
    category: (ctx, c) => { const items = ctx.products.filter(p => (p.category || 'Products') === c).slice(0, 10); return `<section class="L-sm-row"><div class="L-sm-head"><h3>${ctx.esc(c)}</h3><button class="L-link" data-category="${ctx.esc(c)}">See all ${ctx.count(c)} ${IC.arrow}</button></div><div class="L-sm-scroll">${items.map(p => { const v = [p.price1, p.price2].filter(x => x !== null && x !== undefined && String(x).trim() !== '').map(Number).filter(Number.isFinite); return `<button class="L-sm-mini" data-category="${ctx.esc(c)}">${p.image ? img(ctx, p.image, p.name) : `<div class="placeholder">${ctx.esc(p.name.slice(0, 1))}</div>`}${v.length ? `<b class="L-tag">${ctx.fmt(Math.min(...v))}</b>` : ''}<span>${ctx.esc(p.name)}</span></button>`; }).join('')}</div></section>`; },
    product: (ctx, o) => `<article class="product L-sm-card">${pic(ctx, o)}${o.options.length ? `<b class="L-tag">${selPrice(ctx, o)}</b>` : ''}<div class="body"><div class="name">${ctx.esc(o.p.name)}</div>${o.options.length > 1 ? units(ctx, o, 'L-pills') : ''}<div class="L-row">${qty(o, 'L-mini')}${add(o, IC.plus + '<span>Add</span>', 'L-grow')}</div></div></article>`
  };

  /* ---------- Wholesale: price-list header, category rows, product table ---------- */
  L.wholesale = {
    hero: (ctx, cats) => `<div class="L-ws-hero"><div><span class="L-eyebrow">Wholesale price list</span><h2>${ctx.esc(ctx.biz.company_name)}</h2></div><div class="L-ws-stats"><span><b>${ctx.products.length}</b> products</span><span><b>${cats.length}</b> categories</span><span>Prices in <b>${ctx.esc(ctx.biz.currency || 'USD')}</b></span></div></div>`,
    title: 'Categories',
    grid: 'L-ws-list',
    category: (ctx, c) => `<button class="category L-ws-cat" data-category="${ctx.esc(c)}">${catImg(ctx, c)}<div class="info"><div class="name">${ctx.esc(c)}</div><div class="count">${count(ctx, c)}</div></div><span class="L-go">${IC.arrow}</span></button>`,
    productsHead: '<div class="L-ws-th" aria-hidden="true"><span></span><span>Product</span><span>Unit &amp; price</span><span>Qty</span><span></span></div>',
    product: (ctx, o) => `<article class="product L-ws-row">${pic(ctx, o)}<div class="L-ws-name"><div class="name">${ctx.esc(o.p.name)}</div>${code(ctx, o.p) ? `<div class="count">${code(ctx, o.p)}</div>` : ''}</div>${units(ctx, o, 'L-ws-units')}${qty(o, 'L-mini')}${add(o, IC.cart + '<span>Add</span>')}</article>`
  };

  /* ---------- Bakery & café: warm banner, rounded category cards, menu-style rows ---------- */
  L.bakery = {
    hero: ctx => { const h = heroImage(ctx); return `<div class="L-bak-hero"><div><span class="L-eyebrow">Our menu</span><h2>${ctx.esc(ctx.biz.company_name)}</h2>${ctx.biz.description ? `<p>${ctx.esc(ctx.biz.description)}</p>` : ''}</div>${h ? `<img src="${ctx.esc(h)}" alt="">` : ''}</div>`; },
    title: 'Menu',
    category: (ctx, c) => `<button class="category L-bak-cat" data-category="${ctx.esc(c)}">${catImg(ctx, c)}<div class="info"><div class="name">${ctx.esc(c)}</div><div class="count">${count(ctx, c)}</div></div></button>`,
    grid: 'L-bak-menu',
    product: (ctx, o) => `<article class="product L-bak-row">${pic(ctx, o)}<div class="body"><div class="L-row"><div class="name">${ctx.esc(o.p.name)}</div><b class="L-price">${selPrice(ctx, o)}</b></div>${o.p.description ? `<div class="desc">${ctx.esc(o.p.description)}</div>` : ''}${o.options.length > 1 ? units(ctx, o, 'L-pills') : ''}<div class="L-row">${qty(o, 'L-mini')}${o.options.length ? `<button class="addbtn L-fab" data-add="${o.p.id}" aria-label="Add to order">${IC.plus}</button>` : ''}</div></div></article>`
  };

  /* ---------- Fashion: full-bleed campaign hero, lookbook tiles, tall product cards ---------- */
  L.fashion = {
    hero: ctx => { const h = heroImage(ctx); return `<div class="L-fa-hero">${h ? `<img src="${ctx.esc(h)}" alt="">` : ''}<div class="L-in"><h2>${ctx.esc(ctx.biz.company_name)}</h2><a href="#categoryGrid" class="L-btn">Shop now</a></div></div>`; },
    title: 'Shop by category',
    category: (ctx, c) => `<button class="category L-fa-col" data-category="${ctx.esc(c)}">${catImg(ctx, c)}<div class="info"><div class="name">${ctx.esc(c)}</div><span class="L-link">Shop ${IC.arrow}</span></div></button>`,
    product: (ctx, o) => `<article class="product L-fa-card">${pic(ctx, o)}<div class="body"><div class="name">${ctx.esc(o.p.name)}</div><div class="L-price">${selPrice(ctx, o)}</div>${o.options.length > 1 ? units(ctx, o, 'L-sizes') : ''}${qty(o, 'L-mini')}${add(o, 'Add to bag')}</div></article>`
  };

  /* ---------- Electronics: tech hero with badges, neon category tiles, spec cards ---------- */
  L.electronics = {
    hero: (ctx, cats) => `<div class="L-el-hero"><span class="L-eyebrow">${ctx.esc(ctx.biz.company_name)}</span><h2>${ctx.biz.description ? ctx.esc(ctx.biz.description) : 'Browse the latest products'}</h2><div class="L-badges"><span>${ctx.products.length} products</span><span>${cats.length} categories</span><span>${IC.chat} Order on WhatsApp</span></div></div>`,
    title: 'Categories',
    category: (ctx, c) => `<button class="category L-el-cat" data-category="${ctx.esc(c)}">${catImg(ctx, c)}<div class="info"><div class="name">${ctx.esc(c)}</div><div class="count">${count(ctx, c)}</div></div></button>`,
    product: (ctx, o) => `<article class="product L-el-card">${pic(ctx, o)}<div class="body">${code(ctx, o.p) ? `<span class="L-chip">${code(ctx, o.p)}</span>` : ''}<div class="name">${ctx.esc(o.p.name)}</div>${o.p.description ? `<div class="desc">${ctx.esc(o.p.description)}</div>` : ''}<div class="L-price">${selPrice(ctx, o)}</div>${o.options.length > 1 ? units(ctx, o, 'L-pills') : ''}<div class="L-row">${qty(o, 'L-mini')}${add(o, IC.cart + '<span>Add</span>', 'L-grow')}</div></div></article>`
  };

  /* ---------- Beauty & pharmacy: soft hero, round categories, clean cards with category label ---------- */
  L.beauty = {
    hero: ctx => `<div class="L-be-hero"><span class="L-eyebrow">${ctx.esc(ctx.biz.company_name)}</span><h2>${ctx.biz.description ? ctx.esc(ctx.biz.description) : 'Beauty &amp; care'}</h2></div>`,
    title: 'Shop by category',
    category: (ctx, c) => `<button class="category L-bou-cat L-be-cat" data-category="${ctx.esc(c)}"><span class="L-ring">${catImg(ctx, c)}</span><div class="info"><div class="name">${ctx.esc(c)}</div><div class="count">${count(ctx, c)}</div></div></button>`,
    product: (ctx, o) => `<article class="product L-be-card">${pic(ctx, o)}<div class="body"><span class="L-eyebrow">${ctx.esc(o.p.category || '')}</span><div class="name">${ctx.esc(o.p.name)}</div><div class="L-price">${selPrice(ctx, o)}</div>${o.options.length > 1 ? units(ctx, o, 'L-pills') : ''}<div class="L-row">${qty(o, 'L-mini')}${add(o, 'Add to bag', 'L-grow')}</div></div></article>`
  };

  window.MCLayouts = {
    get: key => L[key] || null,
    hero(key, ctx, cats) { const l = L[key]; return l && l.hero ? l.hero(ctx, cats) : ''; },
    categories(key, ctx, cats) { const l = L[key]; return l ? cats.map((c, i) => l.category(ctx, c, i)).join('') : null; },
    product(key, ctx, o) { const l = L[key]; return l ? l.product(ctx, o) : null; }
  };
})();
