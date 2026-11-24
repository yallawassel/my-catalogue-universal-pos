/* My Catalogue — storefront extras (v20).
   Arabic / English with right-to-left layout, product pages (gallery, options, related, share, SEO),
   checkout with delivery areas, pickup, discount codes and payment methods, order tracking links,
   and visitor analytics. index.html exposes window.MCShop (biz, products, cart, add, fmt…). */
(function () {
  const AR = {
    'Search products…': 'ابحث عن المنتجات…', 'Search products': 'ابحث عن المنتجات', 'Shop by category': 'تسوّق حسب الفئة', 'Products': 'المنتجات',
    '← Back to all categories': '→ العودة إلى كل الفئات', '← Clear search': '→ مسح البحث', 'Loading catalogue…': 'جارٍ تحميل الكتالوج…',
    'Install App': 'تثبيت التطبيق', 'Business catalogue': 'كتالوج المتجر', 'Your order': 'طلبك', 'Total:': 'المجموع:', 'Your name': 'الاسم',
    'Phone number': 'رقم الهاتف', 'Delivery address': 'عنوان التوصيل', '📍 Share my delivery location': '📍 شارك موقع التوصيل',
    'Location sharing is optional.': 'مشاركة الموقع اختيارية.', 'Order notes': 'ملاحظات الطلب', 'Optional details': 'تفاصيل اختيارية',
    'Send order to WhatsApp': 'أرسل الطلب على واتساب', 'Remove': 'إزالة', 'Your cart is empty.': 'سلّتك فارغة.', '🛒 Cart': '🛒 السلة', 'Cart': 'السلة',
    '＋ Add to cart': '＋ أضف إلى السلة', 'Add to cart': 'أضف إلى السلة', 'Add to bag': 'أضف إلى الحقيبة', 'Add to my box': 'أضف إلى علبتي', 'Add': 'أضف',
    'Price on request': 'السعر عند الطلب', 'Price on request — contact us for a quotation.': 'السعر عند الطلب — تواصل معنا لعرض سعر.',
    'Price on request — contact us.': 'السعر عند الطلب — تواصل معنا.', 'Ask on WhatsApp': 'اسأل على واتساب', 'Packet': 'علبة', 'Box': 'كرتونة', 'Piece': 'قطعة',
    'No products in this category match your search.': 'لا توجد منتجات مطابقة في هذه الفئة.', 'No products match your search.': 'لا توجد منتجات مطابقة لبحثك.',
    'This catalogue has no products yet.': 'لا توجد منتجات في هذا الكتالوج بعد.', 'Add at least one priced item first.': 'أضف منتجًا واحدًا على الأقل أولًا.',
    'Enter your name and phone number.': 'أدخل اسمك ورقم هاتفك.', 'Saving order and preparing WhatsApp message…': 'جارٍ حفظ الطلب وتجهيز رسالة واتساب…',
    'Order saved. Opening WhatsApp…': 'تم حفظ الطلب. جارٍ فتح واتساب…', 'Requesting location permission…': 'جارٍ طلب إذن الموقع…',
    'Could not get location. You can still enter the delivery address.': 'تعذّر تحديد الموقع. يمكنك كتابة العنوان.',
    'Location is not supported on this device.': 'تحديد الموقع غير مدعوم على هذا الجهاز.', 'Your order was prepared. Press': 'تم تجهيز طلبك. اضغط',
    'Send': 'إرسال', 'in WhatsApp to deliver it to': 'في واتساب لإيصاله إلى', 'This item has no price. Please contact the business.': 'هذا المنتج بلا سعر. تواصل مع المتجر.',
    'Out of stock': 'نفد من المخزون', 'Sold out': 'نفد', 'Low stock': 'كمية محدودة', 'Shop now': 'تسوّق الآن', 'Discover': 'اكتشف', 'Categories': 'الفئات',
    'Menu': 'القائمة', 'Our menu': 'قائمتنا', 'Aisles': 'الأقسام', 'Shop all aisles': 'كل الأقسام', 'Our collections': 'مجموعاتنا', 'The collections': 'المجموعات',
    'Browse the latest products': 'تصفّح أحدث المنتجات', 'Welcome to': 'أهلًا بك في', 'Wholesale price list': 'لائحة أسعار الجملة', 'Product': 'المنتج', 'Qty': 'الكمية',
    'Delivery': 'التوصيل', 'Choose your area…': 'اختر منطقتك…', 'Pickup from the store': 'استلام من المحل', 'Home delivery': 'توصيل إلى المنزل',
    'Discount code': 'رمز الخصم', 'Apply': 'تطبيق', 'Payment': 'الدفع', 'Cash on delivery': 'الدفع عند الاستلام', 'Subtotal': 'المجموع الفرعي',
    'Delivery fee': 'رسوم التوصيل', 'Free': 'مجاني', 'Discount': 'الخصم', 'Track my order': 'تتبّع طلبي', 'Pay online now': 'ادفع أونلاين الآن',
    'Options': 'الخيارات', 'Choose…': 'اختر…', 'You may also like': 'قد يعجبك أيضًا', 'Share': 'مشاركة', 'Link copied': 'تم نسخ الرابط', 'Back': 'رجوع',
    'Please choose': 'يرجى اختيار',
    'Send my order by': 'أرسل طلبي عبر', 'WhatsApp': 'واتساب', 'Phone call': 'اتصال هاتفي', 'Telegram': 'تيليغرام', 'Here, on this page': 'هنا من الصفحة',
    'Send order': 'أرسل الطلب', 'Send order by Telegram': 'أرسل الطلب على تيليغرام', 'Send order, then call': 'أرسل الطلب ثم اتصل',
    'Order received!': 'تم استلام طلبك!', 'Order number': 'رقم الطلب', 'will contact you on': 'سيتواصل معك على', 'Call the shop now': 'اتصل بالمحل الآن',
    'Your order is copied. Paste it in the Telegram chat with': 'تم نسخ طلبك. الصقه في محادثة تيليغرام مع', 'and press Send.': 'واضغط إرسال.',
    'Open Telegram': 'افتح تيليغرام', 'Copy my order again': 'انسخ طلبي مرة ثانية', 'Saving your order…': 'جارٍ حفظ طلبك…', 'Please choose your delivery area.': 'يرجى اختيار منطقة التوصيل.', 'Order status': 'حالة الطلب',
    'New': 'جديد', 'Confirmed': 'مؤكد', 'Preparing': 'قيد التحضير', 'On the way': 'في الطريق', 'Delivered': 'تم التسليم', 'Cancelled': 'ملغى',
    'Order not found. Check the link you received.': 'الطلب غير موجود. تحقّق من الرابط.', 'Back to the catalogue': 'العودة إلى الكتالوج',
    'Sold out': 'نفد', 'from': 'ابتداءً من', 'Menu': 'القائمة', 'Delivery': 'التوصيل', 'Pickup available': 'استلام من المحل', 'Free delivery': 'توصيل مجاني', 'Order on WhatsApp': 'اطلب على واتساب',
    'Bank transfer': 'تحويل مصرفي', 'Card / online payment': 'بطاقة / دفع أونلاين', 'Whish Money': 'Whish Money', 'OMT': 'OMT', 'Quantity': 'الكمية'
  };
  const RX = [
    [/^(\d+) products?$/, m => m[1] + ' منتج'], [/^(\d+) items?$/, m => m[1] + ' قطعة'],
    [/^Results for “(.*)”$/, m => 'نتائج «' + m[1] + '»'], [/^✓ (\d+) items? added to cart$/, m => '✓ أُضيف ' + m[1] + ' إلى السلة'],
    [/^Only (\d+) left$/, m => 'بقي ' + m[1] + ' فقط'], [/^Offer until (.*)$/, m => 'العرض حتى ' + m[1]], [/^Prices in (.*)$/, m => 'الأسعار بـ ' + m[1]],
    [/^See all (.*)$/, m => 'عرض الكل ' + m[1]], [/^Shop (.*)$/, m => 'تسوّق ' + m[1]], [/^Discover (.*)$/, m => 'اكتشف ' + m[1]],
    [/^(.*) \+ prices to confirm$/, m => m[1] + ' + أسعار للتأكيد'], [/^Location added\. Accuracy about (\d+) m\.$/, m => 'تمت إضافة الموقع. الدقة حوالي ' + m[1] + ' م.']
  ];
  const STATUS = ['new', 'confirmed', 'preparing', 'out_for_delivery', 'delivered'];
  const STATUS_LABEL = { new: 'New', confirmed: 'Confirmed', preparing: 'Preparing', out_for_delivery: 'On the way', delivered: 'Delivered', cancelled: 'Cancelled' };
  let lang = 'en', zones = [], disc = null, pay = 'cash', chan = '', zone = '', session = '', lastTitle = '', ready = false;
  const $ = id => document.getElementById(id);
  const S = () => window.MCShop;
  const t = s => (lang === 'ar' && AR[s]) || s;
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }));
  const store = { get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (_) {} } };

  /* ---------- language ---------- */
  function trText(s) {
    const k = s.trim(); if (!k) return null;
    if (AR[k]) return s.replace(k, AR[k]);
    for (const [re, f] of RX) { const m = k.match(re); if (m) return s.replace(k, f(m)); }
    return null;
  }
  function translate(root) {
    if (lang !== 'ar' || !root) return;
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: n => n.parentElement && !n.parentElement.closest('script,style,[data-no-tr]') ? 1 : 2 });
    const list = []; while (w.nextNode()) list.push(w.currentNode);
    list.forEach(n => { const r = trText(n.nodeValue); if (r !== null && r !== n.nodeValue) n.nodeValue = r; });
    (root.querySelectorAll ? root.querySelectorAll('[placeholder],[aria-label]') : []).forEach(el => {
      ['placeholder', 'aria-label'].forEach(a => { const v = el.getAttribute(a); if (v && AR[v.trim()]) el.setAttribute(a, AR[v.trim()]); });
    });
  }
  function startTranslator() {
    if (lang !== 'ar') return;
    translate(document.body);
    new MutationObserver(ms => ms.forEach(m => {
      if (m.type === 'characterData') { const r = trText(m.target.nodeValue); if (r !== null && r !== m.target.nodeValue) m.target.nodeValue = r; }
      else m.addedNodes.forEach(n => n.nodeType === 3 ? (() => { const r = trText(n.nodeValue); if (r !== null && r !== n.nodeValue) n.nodeValue = r; })() : translate(n));
    })).observe(document.body, { childList: true, subtree: true, characterData: true });
  }
  function chooseLang(biz) {
    const q = new URLSearchParams(location.search).get('lang');
    lang = (q === 'ar' || q === 'en') ? q : (store.get('mc-lang-' + biz.id) || biz.default_language || 'en');
    if (lang !== 'ar') lang = 'en';
    document.documentElement.lang = lang; document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.body.classList.toggle('mc-rtl', lang === 'ar');
  }
  function langButton(biz) {
    if ($('mcLang')) return;
    const b = document.createElement('button'); b.id = 'mcLang'; b.type = 'button'; b.className = 'mc-lang'; b.dataset.noTr = '1';
    b.textContent = lang === 'ar' ? 'English' : 'عربي';
    b.onclick = () => { store.set('mc-lang-' + biz.id, lang === 'ar' ? 'en' : 'ar'); const u = new URL(location.href); u.searchParams.delete('lang'); location.href = u.href; };
    const brand = document.querySelector('header .brand'); if (brand) brand.appendChild(b);
  }
  // swap in Arabic names before the catalogue is drawn (index.html calls this)
  function localize(products, cats) {
    const biz = S() && S().biz; if (!biz) return;
    chooseLang(biz);
    if (lang !== 'ar') return;
    const map = {};
    (cats || []).forEach(c => { if (c.name_ar && c.name_ar.trim()) { map[c.name] = c.name_ar.trim(); c.name = c.name_ar.trim(); } });
    (products || []).forEach(p => {
      p.name_en = p.name_en || p.name;
      if (p.name_ar && p.name_ar.trim()) p.name = p.name_ar.trim();
      if (p.description_ar && p.description_ar.trim()) p.description = p.description_ar.trim();
      if (map[p.category]) p.category = map[p.category];
      ['label1', 'label2'].forEach(k => { if (p[k] && AR[p[k]]) p[k] = AR[p[k]]; });
    });
  }

  /* ---------- analytics ---------- */
  function ev(kind, productId, ref) {
    const biz = S() && S().biz; if (!biz || !window.MC || new URLSearchParams(location.search).get('mcpreview') === '1') return;
    try { MC.sb.rpc('mc_saas_track', { p_business_id: biz.id, p_kind: kind, p_product_id: productId || null, p_session: session, p_ref: ref || null }).then(() => {}, () => {}); } catch (_) {}
  }
  function visitRef() {
    const q = new URLSearchParams(location.search), u = q.get('utm_source') || q.get('ref');
    if (u) return u.slice(0, 60);
    try { const h = document.referrer && new URL(document.referrer).hostname; if (h && h !== location.hostname) return h.replace(/^www\./, '').replace(/^l\.|^lm\.|^m\./, ''); } catch (_) {}
    return null;
  }

  /* ---------- product page ---------- */
  function gallery(p) { return [...new Set([p.image, ...(Array.isArray(p.images) ? p.images : [])].filter(Boolean))]; }
  function optionList(p) { return (Array.isArray(p.options) ? p.options : []).filter(o => o && o.name && Array.isArray(o.values) && o.values.length); }
  function needsOptions(p) { return optionList(p).length > 0; }
  function meta(attr, key, val) {
    let m = document.querySelector(`meta[${attr}="${key}"]`);
    if (!m) { m = document.createElement('meta'); m.setAttribute(attr, key); document.head.appendChild(m); }
    m.setAttribute('content', val || '');
  }
  function productUrl(p) { const u = new URL(location.href); u.search = ''; u.hash = ''; u.searchParams.set('shop', S().biz.slug); u.searchParams.set('p', p.id); return u.href; }
  function seo(p) {
    const biz = S().biz, imgs = gallery(p);
    if (!lastTitle) lastTitle = document.title;
    document.title = p.name + ' · ' + biz.company_name;
    const d = (p.description || (p.name + ' — ' + biz.company_name)).slice(0, 160);
    meta('name', 'description', d); meta('property', 'og:title', p.name); meta('property', 'og:description', d); meta('property', 'og:type', 'product');
    if (imgs[0]) meta('property', 'og:image', imgs[0]); meta('property', 'og:url', productUrl(p));
    let ld = $('mcLd'); if (!ld) { ld = document.createElement('script'); ld.type = 'application/ld+json'; ld.id = 'mcLd'; document.head.appendChild(ld); }
    const price = [p.price1, p.price2].map(Number).find(Number.isFinite);
    ld.textContent = JSON.stringify({ '@context': 'https://schema.org', '@type': 'Product', name: p.name, description: p.description || undefined, image: imgs, sku: p.sku || undefined, gtin: p.barcode || undefined,
      brand: { '@type': 'Brand', name: biz.company_name }, offers: price === undefined ? undefined : { '@type': 'Offer', price, priceCurrency: biz.currency === 'LBP' ? 'LBP' : 'USD', url: productUrl(p),
        availability: p.soldOut ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock' } });
  }
  function unseo() { if (lastTitle) document.title = lastTitle; const ld = $('mcLd'); if (ld) ld.remove(); }
  function ensurePdp() {
    let el = $('mcPdp'); if (el) return el;
    el = document.createElement('section'); el.id = 'mcPdp'; el.className = 'mc-pdp'; el.hidden = true; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
    document.body.appendChild(el);
    el.addEventListener('click', onPdpClick); el.addEventListener('change', e => { if (e.target.matches('.mc-opt select')) e.target.classList.remove('bad'); });
    return el;
  }
  let cur = null, curUnit = 1, curQty = 1;
  function open(id, push = true) {
    const p = (S().products || []).find(x => String(x.id) === String(id)); if (!p) return false;
    cur = p; curQty = 1; curUnit = p.price1 != null ? 1 : (p.price2 != null ? 2 : 1);
    if (push) { const u = new URL(location.href); u.searchParams.set('p', p.id); u.searchParams.delete('order'); u.searchParams.delete('t'); history.pushState({ ...(history.state || {}), mcOverlay: 'pdp', pid: p.id }, '', u.href); }
    const el = ensurePdp(); draw(); el.hidden = false; el.scrollTop = 0; document.body.classList.add('mc-noscroll');
    seo(p); ev('product_view', p.id); return true;
  }
  function closePdp() { const el = $('mcPdp'); if (el) el.hidden = true; document.body.classList.remove('mc-noscroll'); cur = null; unseo(); }
  function draw() {
    const p = cur, { fmt } = S(), biz = S().biz, imgs = gallery(p);
    const units = [[p.label1 || 'Packet', p.price1, 1, p.was1], [p.label2 || 'Box', p.price2, 2, p.was2]].filter(x => x[1] != null && String(x[1]).trim() !== '');
    const opts = optionList(p);
    const rel = (S().products || []).filter(x => x.id !== p.id && x.category === p.category).slice(0, 8);
    const quote = !units.length;
    const wa = String(biz.whatsapp || '').replace(/\D/g, '');
    $('mcPdp').innerHTML = `<div class="mc-pdp-top"><button type="button" class="mc-pdp-close" data-pdp="close">${lang === 'ar' ? '→' : '←'} ${t('Back')}</button><button type="button" class="mc-pdp-share" data-pdp="share">⤴ ${t('Share')}</button></div>
      <div class="mc-pdp-body"><div class="mc-pdp-gal">${imgs.length ? `<img id="mcPdpMain" src="${esc(imgs[0])}" alt="${esc(p.name)}">` : `<div class="mc-pdp-ph">${esc(p.name.slice(0, 1))}</div>`}
      ${imgs.length > 1 ? `<div class="mc-pdp-thumbs">${imgs.map((s, i) => `<button type="button" data-img="${esc(s)}" class="${i ? '' : 'on'}"><img src="${esc(s)}" alt="" loading="lazy"></button>`).join('')}</div>` : ''}</div>
      <div class="mc-pdp-info"><div class="mc-pdp-cat">${esc(p.category || '')}</div><h2>${esc(p.name)}</h2>
      ${p.soldOut ? `<div class="mc-pdp-out">${t('Out of stock')}</div>` : (p.stockStatus === 'low_stock' ? `<div class="mc-pdp-low">${t('Low stock')}</div>` : '')}
      ${units.length ? `<div class="mc-pdp-units">${units.map(([l, v, u, was]) => `<button type="button" data-unit-pdp="${u}" class="${curUnit === u ? 'on' : ''}"><span>${esc(l)}</span><b>${fmt(v)}</b>${was ? `<s>${fmt(was)}</s>` : ''}</button>`).join('')}</div>` : `<p class="mc-pdp-quote">${t('Price on request')}</p>`}
      ${opts.map((o, i) => `<label class="mc-opt"><span>${esc(o.name)}</span><select data-opt="${i}"><option value="">${t('Choose…')}</option>${o.values.map(v => `<option>${esc(v)}</option>`).join('')}</select></label>`).join('')}
      ${p.soldOut ? '' : `<div class="mc-pdp-buy"><div class="mc-pdp-qty"><button type="button" data-q="-1">−</button><b id="mcPdpQty">${curQty}</b><button type="button" data-q="1">+</button></div>
        <button type="button" class="mc-pdp-add" data-pdp="add">${quote ? t('Ask on WhatsApp') : t('＋ Add to cart')}</button></div>`}
      ${p.description ? `<div class="mc-pdp-desc">${esc(p.description).replace(/\n/g, '<br>')}</div>` : ''}
      ${p.sku ? `<div class="mc-pdp-meta">SKU: ${esc(p.sku)}</div>` : ''}
      ${wa ? `<a class="mc-pdp-wa" target="_blank" rel="noopener" href="https://wa.me/${wa}?text=${encodeURIComponent((lang === 'ar' ? 'مرحبا، عندي سؤال عن: ' : 'Hello, I have a question about: ') + p.name + '\n' + productUrl(p))}">💬 ${t('Ask on WhatsApp')}</a>` : ''}
      </div></div>
      ${rel.length ? `<h3 class="mc-pdp-rel-t">${t('You may also like')}</h3><div class="mc-pdp-rel">${rel.map(r => `<button type="button" data-open="${esc(r.id)}">${r.image ? `<img src="${esc(r.image)}" alt="" loading="lazy">` : `<span class="mc-pdp-ph">${esc(r.name.slice(0, 1))}</span>`}<b>${esc(r.name)}</b><small>${[r.price1, r.price2].map(Number).find(Number.isFinite) !== undefined ? fmt([r.price1, r.price2].map(Number).find(Number.isFinite)) : t('Price on request')}</small></button>`).join('')}</div>` : ''}`;
  }
  function onPdpClick(e) {
    const b = e.target.closest('button,[data-open]'); if (!b) return;
    const p = cur; if (!p) return;
    if (b.dataset.pdp === 'close') { if (history.state && history.state.mcOverlay === 'pdp') history.back(); else closePdp(); return; }
    if (b.dataset.img) { $('mcPdpMain').src = b.dataset.img; $('mcPdp').querySelectorAll('.mc-pdp-thumbs button').forEach(x => x.classList.toggle('on', x === b)); return; }
    if (b.dataset.unitPdp) { curUnit = Number(b.dataset.unitPdp); $('mcPdp').querySelectorAll('[data-unit-pdp]').forEach(x => x.classList.toggle('on', x === b)); return; }
    if (b.dataset.q) { curQty = Math.max(1, Math.min(999, curQty + Number(b.dataset.q))); $('mcPdpQty').textContent = curQty; return; }
    if (b.dataset.open) { open(b.dataset.open, false); history.replaceState({ ...(history.state || {}), mcOverlay: 'pdp', pid: b.dataset.open }, '', productUrl(cur)); $('mcPdp').scrollTop = 0; return; }
    if (b.dataset.pdp === 'share') {
      const url = productUrl(p);
      if (navigator.share) navigator.share({ title: p.name, url }).catch(() => {});
      else { try { navigator.clipboard.writeText(url); } catch (_) {} S().toast(t('Link copied')); }
      return;
    }
    if (b.dataset.pdp === 'add') {
      const opts = optionList(p), picked = [];
      for (const sel of $('mcPdp').querySelectorAll('select[data-opt]')) {
        const o = opts[Number(sel.dataset.opt)];
        if (!sel.value) { sel.classList.add('bad'); sel.focus(); S().toast(t('Please choose') + ' ' + o.name); return; }
        picked.push(o.name + ': ' + sel.value);
      }
      if (S().add(p, curUnit, curQty, picked.join(', '))) { if (history.state && history.state.mcOverlay === 'pdp') history.back(); else closePdp(); }
    }
  }

  /* ---------- checkout ---------- */
  function payMethods() {
    const pm = (S().biz.pay_methods && typeof S().biz.pay_methods === 'object') ? S().biz.pay_methods : {};
    const list = [['cash', t('Cash on delivery'), '']];
    if (pm.whish) list.push(['whish', 'Whish Money', pm.whish]);
    if (pm.omt) list.push(['omt', 'OMT', pm.omt]);
    if (pm.bank) list.push(['bank', t('Bank transfer'), pm.bank]);
    if (pm.link) list.push(['card', t('Card / online payment'), '']);
    return list;
  }
  function subtotal() { return (S().cart || []).reduce((s, x) => s + (x.quote ? 0 : x.qty * x.price), 0); }
  function calc() {
    const sub = subtotal(), z = zones.find(x => x.id === zone);
    let fee = z ? ((z.free_over != null && sub >= Number(z.free_over)) ? 0 : Number(z.fee || 0)) : 0, d = 0;
    if (disc) { if (disc.kind === 'percent') d = Math.round(sub * Math.min(100, Number(disc.value)) ) / 100; else if (disc.kind === 'amount') d = Math.min(Number(disc.value), sub); else fee = 0; }
    return { sub, fee, d, total: Math.round((sub - d + fee) * 100) / 100, z };
  }
  // How the customer sends the order: chosen by the shop in admin (WhatsApp stays the default).
  function channels() {
    const b = S().biz, oc = (b.order_channels && typeof b.order_channels === 'object') ? b.order_channels : { whatsapp: true }, out = [];
    if (oc.whatsapp !== false && String(b.whatsapp || '').replace(/\D/g, '')) out.push('whatsapp');
    if (oc.call && oc.phone) out.push('call');
    if (oc.telegram) out.push('telegram');
    if (oc.inapp) out.push('inapp');
    return out.length ? out : ['inapp'];
  }
  const CH_LABEL = { whatsapp: '💬 WhatsApp', call: '📞 Phone call', telegram: '✈️ Telegram', inapp: '🛎️ Here, on this page' };
  const CH_BTN = { whatsapp: 'Send order to WhatsApp', call: 'Send order, then call', telegram: 'Send order by Telegram', inapp: 'Send order' };
  function chLabel(c) { const [ic, ...rest] = CH_LABEL[c].split(' '); return ic + ' ' + t(rest.join(' ')); }
  function setSendLabel() { const btn = $('sendOrder'); if (btn) btn.textContent = t(CH_BTN[channel()]); }
  function channel() { const l = channels(); return l.includes(chan) ? chan : l[0]; }
  function buildCheckout() {
    const box = document.querySelector('#cartModal .checkout'); if (!box || $('mcCo')) return;
    const biz = S().biz, pickup = biz.pickup_enabled !== false;
    const div = document.createElement('div'); div.id = 'mcCo'; div.className = 'mc-co';
    const zoneOpts = zones.length ? `<option value="">${t('Choose your area…')}</option>` + zones.map(z => `<option value="${esc(z.id)}">${esc(lang === 'ar' && z.name_ar ? z.name_ar : z.name)} — ${Number(z.fee) ? S().fmt(z.fee) : t('Free')}${z.eta ? ' · ' + esc(z.eta) : ''}</option>`).join('') : `<option value="delivery">${t('Home delivery')}</option>`;
    const pms = payMethods();
    div.innerHTML = `<label>${t('Delivery')}<select id="mcZone">${zoneOpts}${pickup ? `<option value="pickup">${t('Pickup from the store')}</option>` : ''}</select></label><div id="mcZoneHint" class="desc"></div>
      <div class="mc-code"><input id="mcCode" placeholder="${t('Discount code')}" autocomplete="off" autocapitalize="characters"><button type="button" id="mcCodeBtn">${t('Apply')}</button></div><div id="mcCodeMsg" class="desc"></div>
      ${pms.length > 1 ? `<div class="mc-pay"><b>${t('Payment')}</b>${pms.map(([v, l, info], i) => `<label class="mc-pay-opt"><input type="radio" name="mcPay" value="${v}" ${i ? '' : 'checked'}> <span>${esc(l)}${info ? `<small>${esc(info)}</small>` : ''}</span></label>`).join('')}</div>` : ''}
      <div id="mcSum" class="mc-sum"></div>`;
    box.prepend(div);
    zone = zones.length ? '' : 'delivery';
    $('mcZone').onchange = e => { zone = e.target.value; $('mcZoneHint').textContent = zone === 'pickup' && biz.pickup_address ? '📍 ' + biz.pickup_address : ''; const addr = $('address'); if (addr) addr.closest('label').style.display = zone === 'pickup' ? 'none' : ''; totals(); };
    $('mcCodeBtn').onclick = applyCode; $('mcCode').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); applyCode(); } };
    div.addEventListener('change', e => { if (e.target.name === 'mcPay') pay = e.target.value; if (e.target.name === 'mcChan') { chan = e.target.value; setSendLabel(); } });
    const chs = channels(); chan = chs[0];
    if (chs.length > 1) $('mcSum').insertAdjacentHTML('beforebegin', `<div class="mc-pay mc-chan"><b>${t('Send my order by')}</b>${chs.map((c, i) => `<label class="mc-pay-opt"><input type="radio" name="mcChan" value="${c}" ${i ? '' : 'checked'}> <span>${esc(chLabel(c))}</span></label>`).join('')}</div>`);
    setSendLabel();
    totals();
  }
  async function applyCode() {
    const code = $('mcCode').value.trim().toUpperCase(); if (!code) { disc = null; $('mcCodeMsg').textContent = ''; totals(); return; }
    $('mcCodeMsg').textContent = '…';
    const r = await MC.sb.rpc('mc_saas_check_discount', { p_business_id: S().biz.id, p_code: code, p_subtotal: subtotal() });
    const j = r.data || {};
    if (r.error || !j.ok) { disc = null; $('mcCodeMsg').textContent = '⚠️ ' + (j.message || (r.error && r.error.message) || 'Not valid'); }
    else { disc = j; $('mcCodeMsg').textContent = '✓ ' + j.code + (j.kind === 'percent' ? ' −' + Number(j.value) + '%' : j.kind === 'amount' ? ' −' + S().fmt(j.value) : ' · ' + t('Delivery fee') + ': ' + t('Free')); }
    totals();
  }
  function totals() {
    const sum = $('mcSum'); if (!sum || !S()) return;
    const c = calc(), f = S().fmt;
    sum.innerHTML = `<div><span>${t('Subtotal')}</span><b>${f(c.sub)}</b></div>${zone && zone !== 'pickup' && zone !== 'delivery' ? `<div><span>${t('Delivery fee')}</span><b>${c.fee ? f(c.fee) : t('Free')}</b></div>` : ''}${c.d ? `<div class="mc-sum-d"><span>${t('Discount')}</span><b>−${f(c.d)}</b></div>` : ''}`;
    const tot = $('cartTotal'); if (tot) tot.textContent = f(c.total) + ((S().cart || []).some(x => x.quote) ? (lang === 'ar' ? ' + أسعار للتأكيد' : ' + prices to confirm') : '');
  }
  // called by index.html when the customer presses Send (must stay synchronous)
  function orderExtras() {
    if ($('mcZone') && !zone) { $('mcZone').focus(); return { error: t('Please choose your delivery area.') }; }
    const c = calc(), id = uuid(), token = uuid(), biz = S().biz;
    const pm = payMethods().find(x => x[0] === pay) || ['cash', t('Cash on delivery'), ''];
    const u = new URL(location.href); u.search = ''; u.hash = ''; u.searchParams.set('shop', biz.slug); u.searchParams.set('order', id); u.searchParams.set('t', token);
    ev('checkout');
    return { payload: { id, public_token: token, delivery_zone_id: c.z ? c.z.id : null, discount_code: disc ? disc.code : null, payment_method: zone === 'pickup' ? pm[0] + ' · pickup' : pm[0], language: lang },
      total: c.total, trackUrl: u.href, pay: pm, calc: c };
  }
  function waLines(x, saved) {
    if (!x || !x.calc) return [];
    const f = S().fmt, c = x.calc, ar = lang === 'ar', out = [''];
    if (zone === 'pickup') out.push(ar ? 'استلام من المحل' : 'Pickup from the store');
    else if (c.z) out.push((ar ? 'التوصيل: ' : 'Delivery: ') + c.z.name + ' — ' + (c.fee ? f(c.fee) : (ar ? 'مجاني' : 'free')));
    if (c.d) out.push((ar ? 'الخصم' : 'Discount') + ' (' + disc.code + '): −' + f(c.d));
    else if (disc && disc.kind === 'free_delivery') out.push((ar ? 'رمز الخصم: ' : 'Discount code: ') + disc.code);
    out.push((ar ? 'الدفع: ' : 'Payment: ') + x.pay[1] + (x.pay[2] ? ' — ' + x.pay[2] : ''));
    if (saved) out.push((ar ? 'تتبّع الطلب: ' : 'Track order: ') + x.trackUrl);
    return out;
  }
  function done(x, saved) {
    if (!x) return;
    if (saved) {
      ev('order');
      const link = (S().biz.pay_methods || {}).link;
      const st = $('orderStatus'), box = st && st.querySelector('.mc-success');
      if (box) box.insertAdjacentHTML('beforeend', `<div class="mc-after">${x.pay[0] === 'card' && link ? `<a class="mc-paylink" target="_blank" rel="noopener" href="${esc(link)}">💳 ${t('Pay online now')}</a>` : ''}<a class="mc-tracklink" href="${esc(x.trackUrl)}">📦 ${t('Track my order')}</a></div>`);
    }
    disc = null; if ($('mcCode')) { $('mcCode').value = ''; $('mcCodeMsg').textContent = ''; }
  }

  /* ---------- order tracking ---------- */
  async function showTrack(id, token) {
    const el = ensurePdp(); el.hidden = false; document.body.classList.add('mc-noscroll'); el.innerHTML = '<p class="empty">…</p>';
    const r = await MC.sb.rpc('mc_saas_track_order', { p_order_id: id, p_token: token });
    const o = r.data, f = S().fmt, home = (() => { const u = new URL(location.href); u.search = ''; u.searchParams.set('shop', S().biz.slug); return u.href; })();
    if (!o) { el.innerHTML = `<div class="mc-track"><p>${t('Order not found. Check the link you received.')}</p><a class="mc-tracklink" href="${esc(home)}">${t('Back to the catalogue')}</a></div>`; return; }
    const i = STATUS.indexOf(o.status), cancelled = o.status === 'cancelled';
    el.innerHTML = `<div class="mc-track"><div class="mc-track-biz">${S().biz.logo_url ? `<img src="${esc(S().biz.logo_url)}" alt="">` : ''}<b>${esc(S().biz.company_name)}</b></div><h2>${t('Order status')} · #${esc(o.order_number || '')}</h2>
      ${cancelled ? `<div class="mc-pdp-out">${t('Cancelled')}</div>` : `<ol class="mc-steps">${STATUS.map((s, k) => `<li class="${k < i ? 'done' : k === i ? 'now' : ''}">${t(STATUS_LABEL[s])}</li>`).join('')}</ol>`}
      <div class="mc-track-items">${(o.items || []).map(x => `<div><span>${esc(x.quantity)} × ${esc(x.name)} <small>${esc(x.unit || '')}${x.options ? ' · ' + esc(x.options) : ''}</small></span><b>${x.line_total != null ? f(x.line_total) : t('Price on request')}</b></div>`).join('')}</div>
      <div class="mc-sum"><div><span>${t('Subtotal')}</span><b>${f(o.subtotal)}</b></div>${Number(o.delivery_fee) ? `<div><span>${t('Delivery fee')}${o.delivery_zone ? ' · ' + esc(o.delivery_zone) : ''}</span><b>${f(o.delivery_fee)}</b></div>` : ''}${Number(o.discount_amount) ? `<div class="mc-sum-d"><span>${t('Discount')}</span><b>−${f(o.discount_amount)}</b></div>` : ''}<div class="mc-sum-t"><span>${t('Total:')}</span><b>${f(o.total)}</b></div></div>
      <small class="desc">${new Date(o.created_at).toLocaleString(lang === 'ar' ? 'ar-LB' : undefined)}</small>
      <a class="mc-tracklink" href="${esc(home)}">${t('Back to the catalogue')}</a></div>`;
  }

  /* ---------- wiring ---------- */
  window.addEventListener('popstate', e => {
    const st = e.state || {};
    if (st.mcOverlay === 'pdp' && st.pid) open(st.pid, false); else if ($('mcPdp') && !$('mcPdp').hidden && !new URLSearchParams(location.search).get('order')) closePdp();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('mcPdp') && !$('mcPdp').hidden && !(history.state && history.state.mcOverlay === 'pdp')) closePdp(); });
  document.addEventListener('mc:ready', async () => {
    if (ready) return; ready = true;
    const biz = S().biz;
    session = store.get('mc-sid') || (Math.random().toString(36).slice(2) + Date.now().toString(36)); store.set('mc-sid', session);
    langButton(biz); startTranslator();
    if (lang === 'ar' && biz.description_ar) { meta('name', 'description', biz.description_ar.slice(0, 160)); const sub = $('subtitle'); if (sub && biz.description) sub.textContent = biz.description_ar; }
    ev('visit', null, visitRef());
    let st; $('search') && $('search').addEventListener('input', () => { clearTimeout(st); st = setTimeout(() => { const q = $('search').value.trim(); if (q.length > 1) ev('search', null, q.slice(0, 60)); }, 1500); });
    try { const r = await MC.sb.from('mc_saas_delivery_zones').select('id,name,name_ar,fee,free_over,min_order,eta,sort_order').eq('business_id', biz.id).eq('is_active', true).order('sort_order').order('name'); zones = r.data || []; } catch (_) { zones = []; }
    buildCheckout(); translate($('cartModal')); document.dispatchEvent(new CustomEvent('mc:zones', { detail: zones }));
    const q = new URLSearchParams(location.search);
    if (q.get('order') && q.get('t')) showTrack(q.get('order'), q.get('t'));
    else if (q.get('p')) { history.replaceState({ mcView: 'home' }, '', (() => { const u = new URL(location.href); u.searchParams.delete('p'); return u.href; })()); open(q.get('p'), true); }
  });
  window.MCShopPlus = { get zones() { return zones; }, localize, open, needsOptions, ev, totals, orderExtras, waLines, done, t, channel, channels, setSendLabel, get lang() { return lang; } };
})();
