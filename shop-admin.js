/* My Catalogue — admin for the v20 shop features:
   product extras (Arabic name/description, more photos, options), "Delivery & payments" page
   (language, delivery areas, pickup, payment methods, discount codes, Arabic category names)
   and "Visitors & sales" page (analytics, sitemap link, download all my data). */
(() => {
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const A = () => window.MCAdmin || {};
  const sb = () => window.MC.sb;
  const biz = () => A().biz;
  const say = (m, err) => (A().setStatus ? A().setStatus(m, err) : alert(m));
  const money = v => window.MC.money(v, (biz() && biz().currency) || 'USD');
  const num = v => { const s = String(v ?? '').trim(); return s === '' ? null : Number(s); };

  /* ------------------- product form extras ------------------- */
  let photos = [];
  function extrasBox() {
    const anchor = $('pDescription'); if (!anchor || $('pxBox')) return;
    const box = document.createElement('div'); box.id = 'pxBox'; box.className = 'px-box';
    box.innerHTML = `<details open><summary><b>🌍 Arabic, more photos &amp; options</b><small>Optional — shown on the product page of your catalogue</small></summary>
      <div class="grid"><div><label for="pNameAr">Arabic name</label><input id="pNameAr" dir="rtl" placeholder="اسم المنتج بالعربي"></div>
      <div><label for="pDescAr">Arabic description</label><textarea id="pDescAr" dir="rtl" rows="2" placeholder="الوصف بالعربي"></textarea></div></div>
      <label>More photos (up to 11)</label><div class="px-photos" id="pxPhotos"></div>
      <input id="pxPhotoInput" type="file" accept="image/*" multiple><small class="hint" id="pxPhotoHint">The main photo stays first. Customers swipe through all photos on the product page.</small>
      <label style="margin-top:12px">Options the customer must choose</label><div id="pxOpts"></div>
      <button type="button" class="btn" id="pxAddOpt">＋ Add an option (e.g. Size, Color, Flavor)</button></details>`;
    anchor.insertAdjacentElement('afterend', box);
    $('pxAddOpt').onclick = () => addOpt('', '');
    $('pxOpts').addEventListener('click', e => { const b = e.target.closest('[data-del-opt]'); if (b) b.closest('.px-opt').remove(); });
    $('pxPhotos').addEventListener('click', e => { const b = e.target.closest('[data-del-photo]'); if (b) { photos.splice(Number(b.dataset.delPhoto), 1); drawPhotos(); } });
    $('pxPhotoInput').onchange = upload;
  }
  function addOpt(name, values) {
    const d = document.createElement('div'); d.className = 'px-opt';
    d.innerHTML = `<input data-opt-name placeholder="Option name (Size)" value="${esc(name)}"><input data-opt-values placeholder="Choices, separated by commas (S, M, L)" value="${esc(values)}"><button type="button" class="btn" data-del-opt title="Remove">✕</button>`;
    $('pxOpts').appendChild(d);
  }
  function drawPhotos() { $('pxPhotos').innerHTML = photos.map((u, i) => `<span><img src="${esc(u)}" alt=""><button type="button" data-del-photo="${i}" title="Remove">✕</button></span>`).join('') || '<small class="hint">No extra photos yet.</small>'; }
  async function upload() {
    const files = [...$('pxPhotoInput').files]; if (!files.length) return;
    const b = biz(); if (!b) return;
    $('pxPhotoHint').textContent = 'Uploading ' + files.length + ' photo(s)…';
    try {
      for (const f of files) {
        if (photos.length >= 11) break;
        const o = await window.MC.optimizeImage(f), ext = o.type === 'image/webp' ? 'webp' : 'jpg', path = b.id + '/' + crypto.randomUUID() + '.' + ext;
        const up = await sb().storage.from('mc-saas-images').upload(path, o, { upsert: false, contentType: o.type }); if (up.error) throw up.error;
        photos.push(sb().storage.from('mc-saas-images').getPublicUrl(path).data.publicUrl); drawPhotos();
      }
      $('pxPhotoHint').textContent = '✓ Uploaded. Press Save / Update product to keep them.';
    } catch (e) { $('pxPhotoHint').textContent = '⚠️ ' + e.message; }
    $('pxPhotoInput').value = '';
  }
  window.mcExtrasFill = p => {
    extrasBox(); if (!$('pxBox')) return;
    $('pNameAr').value = (p && p.name_ar) || ''; $('pDescAr').value = (p && p.description_ar) || '';
    photos = (p && Array.isArray(p.images)) ? p.images.slice(0, 11) : []; drawPhotos();
    $('pxOpts').innerHTML = ''; ((p && Array.isArray(p.options)) ? p.options : []).forEach(o => addOpt(o.name, (o.values || []).join(', ')));
    $('pxPhotoHint').textContent = 'The main photo stays first. Customers swipe through all photos on the product page.';
  };
  window.mcExtrasPayload = () => {
    if (!$('pxBox')) return {};
    const options = [...$('pxOpts').querySelectorAll('.px-opt')].map(r => ({ name: r.querySelector('[data-opt-name]').value.trim().slice(0, 40), values: [...new Set(r.querySelector('[data-opt-values]').value.split(/[,،]/).map(s => s.trim()).filter(Boolean))].slice(0, 30) })).filter(o => o.name || o.values.length);
    if (options.some(o => !o.name || !o.values.length)) throw Error('Each option needs a name and at least one choice.');
    return { name_ar: $('pNameAr').value.trim() || null, description_ar: $('pDescAr').value.trim() || null, images: photos.slice(0, 11), options };
  };

  /* ------------------- Delivery & payments page ------------------- */
  let zones = [], codes = [];
  function shopPage() {
    const sec = $('mcShopPage'); if (!sec || !biz()) return;
    const b = biz(), pm = b.pay_methods || {};
    sec.innerHTML = `<h2>🚚 Delivery, discounts &amp; payments</h2>
      <div class="sh-card"><h3>🌍 Catalogue language</h3><p class="hint">Customers can switch between English and Arabic at any time. Choose what they see first.</p>
        <div class="grid"><div><label for="shLang">Language customers see first</label><select id="shLang"><option value="en">English</option><option value="ar">العربية (right to left)</option></select></div>
        <div><label for="shDescAr">Arabic catalogue description</label><input id="shDescAr" dir="rtl" placeholder="وصف المتجر بالعربي"></div></div>
        <label>Arabic names for your categories</label><div id="shCats" class="sh-cats"><small class="hint">Loading…</small></div></div>
      <div class="sh-card"><h3>📍 Delivery areas</h3><p class="hint">The customer picks an area at checkout; its fee is added to the order. Leave the list empty to take orders without delivery fees.</p>
        <div id="shZones"></div><button type="button" class="btn" id="shAddZone">＋ Add a delivery area</button>
        <label class="sh-check"><input type="checkbox" id="shPickup"> Customers can pick up from the store</label><input id="shPickupAddr" placeholder="Pickup address shown to customers (optional)"></div>
      <div class="sh-card"><h3>💳 Payment methods</h3><p class="hint">Cash on delivery is always offered. Fill the ones you accept — they appear at checkout and in the WhatsApp message.</p>
        <div class="grid"><div><label for="shWhish">Whish Money number</label><input id="shWhish" placeholder="+961 70 000 000"></div><div><label for="shOmt">OMT details</label><input id="shOmt" placeholder="Name + phone for OMT transfer"></div>
        <div><label for="shBank">Bank transfer details</label><input id="shBank" placeholder="Bank, account name, IBAN"></div><div><label for="shLink">Online card payment link</label><input id="shLink" placeholder="https://… (Areeba, Stripe, PayPal link)"></div></div>
        <button type="button" class="btn primary" id="shSave">Save language, pickup &amp; payments</button></div>
      <div class="sh-card"><h3>🎟️ Discount codes</h3><p class="hint">Customers type the code at checkout. The discount is checked again by the server, so it cannot be faked.</p>
        <div id="shCodes"></div>
        <div class="grid sh-newcode"><div><label>Code</label><input id="ncCode" placeholder="WELCOME10" style="text-transform:uppercase"></div><div><label>Type</label><select id="ncKind"><option value="percent">% off</option><option value="amount">Fixed amount off</option><option value="free_delivery">Free delivery</option></select></div>
        <div><label>Value</label><input id="ncValue" type="number" min="0" step="0.01" placeholder="10"></div><div><label>Minimum order (optional)</label><input id="ncMin" type="number" min="0" step="0.01"></div>
        <div><label>Ends on (optional)</label><input id="ncEnds" type="date"></div><div><label>Max uses (optional)</label><input id="ncMax" type="number" min="1" step="1"></div></div>
        <button type="button" class="btn primary" id="shAddCode">＋ Create code</button></div>`;
    $('shLang').value = b.default_language === 'ar' ? 'ar' : 'en'; $('shDescAr').value = b.description_ar || '';
    $('shPickup').checked = b.pickup_enabled !== false; $('shPickupAddr').value = b.pickup_address || '';
    $('shWhish').value = pm.whish || ''; $('shOmt').value = pm.omt || ''; $('shBank').value = pm.bank || ''; $('shLink').value = pm.link || '';
    $('shSave').onclick = saveSettings; $('shAddZone').onclick = () => { zones.push({ id: null, name: '', name_ar: '', fee: 0, free_over: null, min_order: null, eta: '', is_active: true }); drawZones(); };
    $('shZones').addEventListener('click', zoneClick); $('shAddCode').onclick = addCode; $('shCodes').addEventListener('click', codeClick);
    $('shCats').addEventListener('change', async e => { const i = e.target.closest('[data-cat]'); if (!i) return; const r = await sb().rpc('mc_saas_set_category_ar', { p_business_id: b.id, p_name: i.dataset.cat, p_name_ar: i.value }); say(r.error ? r.error.message : '✓ Arabic name saved for ' + i.dataset.cat, !!r.error); });
    loadShop();
  }
  async function loadShop() {
    const b = biz();
    const [z, c, cat] = await Promise.all([
      sb().from('mc_saas_delivery_zones').select('*').eq('business_id', b.id).order('sort_order').order('name'),
      sb().from('mc_saas_discount_codes').select('*').eq('business_id', b.id).order('created_at', { ascending: false }),
      sb().from('mc_saas_categories').select('name,name_ar').eq('business_id', b.id)]);
    zones = z.data || []; codes = c.data || []; drawZones(); drawCodes();
    const ar = Object.fromEntries((cat.data || []).map(x => [x.name, x.name_ar || '']));
    const names = [...new Set((A().products || []).map(p => String(p.category || 'Products').trim() || 'Products'))].sort();
    $('shCats').innerHTML = names.length ? names.map(n => `<div><span>${esc(n)}</span><input dir="rtl" data-cat="${esc(n)}" value="${esc(ar[n] || '')}" placeholder="بالعربي"></div>`).join('') : '<small class="hint">Add products first.</small>';
  }
  function drawZones() {
    $('shZones').innerHTML = zones.length ? `<div class="sh-zone sh-head"><span>Area</span><span>Arabic</span><span>Fee</span><span>Free from</span><span>Min. order</span><span>Time</span><span></span></div>` + zones.map((z, i) => `<div class="sh-zone" data-i="${i}">
      <input data-k="name" value="${esc(z.name)}" placeholder="Beirut"><input data-k="name_ar" dir="rtl" value="${esc(z.name_ar || '')}" placeholder="بيروت">
      <input data-k="fee" type="number" min="0" step="0.01" value="${z.fee ?? 0}"><input data-k="free_over" type="number" min="0" step="0.01" value="${z.free_over ?? ''}" placeholder="—">
      <input data-k="min_order" type="number" min="0" step="0.01" value="${z.min_order ?? ''}" placeholder="—"><input data-k="eta" value="${esc(z.eta || '')}" placeholder="Same day">
      <span class="sh-act"><button type="button" class="btn primary" data-zsave="${i}">Save</button><button type="button" class="btn" data-zdel="${i}">✕</button></span></div>`).join('') : '<p class="hint">No delivery areas yet.</p>';
  }
  async function zoneClick(e) {
    const s = e.target.closest('[data-zsave]'), d = e.target.closest('[data-zdel]'); if (!s && !d) return;
    const i = Number((s || d).dataset.zsave ?? (s || d).dataset.zdel), z = zones[i], row = $('shZones').querySelector(`[data-i="${i}"]`), b = biz();
    try {
      if (d) { if (z.id) { if (!confirm('Delete the delivery area "' + z.name + '"?')) return; const r = await sb().from('mc_saas_delivery_zones').delete().eq('id', z.id).eq('business_id', b.id); if (r.error) throw r.error; } zones.splice(i, 1); drawZones(); say('Delivery area removed.'); return; }
      const v = k => row.querySelector(`[data-k="${k}"]`).value;
      const rec = { business_id: b.id, name: v('name').trim(), name_ar: v('name_ar').trim() || null, fee: Math.max(0, Number(v('fee')) || 0), free_over: num(v('free_over')), min_order: num(v('min_order')), eta: v('eta').trim() || null, sort_order: i, is_active: true };
      if (!rec.name) throw Error('Enter the area name.');
      const r = z.id ? await sb().from('mc_saas_delivery_zones').update(rec).eq('id', z.id).eq('business_id', b.id) : await sb().from('mc_saas_delivery_zones').insert(rec).select().single();
      if (r.error) throw r.error; zones[i] = z.id ? { ...z, ...rec } : (r.data || rec); drawZones(); say('✓ Delivery area saved: ' + rec.name);
    } catch (err) { say(err.message, true); }
  }
  function drawCodes() {
    const kind = c => c.kind === 'percent' ? Number(c.value) + '% off' : c.kind === 'amount' ? money(c.value) + ' off' : 'Free delivery';
    $('shCodes').innerHTML = codes.length ? codes.map(c => `<div class="sh-code ${c.is_active ? '' : 'off'}"><b>${esc(c.code)}</b><span>${kind(c)}${c.min_order ? ' · min ' + money(c.min_order) : ''}${c.ends_at ? ' · until ' + new Date(c.ends_at).toLocaleDateString() : ''}</span>
      <span class="hint">Used ${c.used_count}${c.max_uses ? ' / ' + c.max_uses : ''}×</span><span class="sh-act"><button type="button" class="btn" data-ctoggle="${c.id}">${c.is_active ? 'Pause' : 'Activate'}</button><button type="button" class="btn" data-cdel="${c.id}">✕</button></span></div>`).join('') : '<p class="hint">No discount codes yet.</p>';
  }
  async function addCode() {
    const b = biz();
    try {
      const code = $('ncCode').value.trim().toUpperCase().replace(/\s+/g, ''), kind = $('ncKind').value, value = Number($('ncValue').value) || 0;
      if (!/^[A-Z0-9_-]{2,30}$/.test(code)) throw Error('Use 2–30 letters or numbers for the code (no spaces).');
      if (kind !== 'free_delivery' && !(value > 0)) throw Error('Enter the discount value.');
      if (kind === 'percent' && value > 100) throw Error('A percentage cannot be more than 100.');
      const rec = { business_id: b.id, code, kind, value: kind === 'free_delivery' ? 0 : value, min_order: num($('ncMin').value), max_uses: num($('ncMax').value), ends_at: $('ncEnds').value ? new Date($('ncEnds').value + 'T23:59:59').toISOString() : null };
      const r = await sb().from('mc_saas_discount_codes').insert(rec).select().single();
      if (r.error) throw (/duplicate|unique/i.test(r.error.message) ? Error('This code already exists.') : r.error);
      codes.unshift(r.data || { ...rec, used_count: 0, is_active: true }); drawCodes(); ['ncCode', 'ncValue', 'ncMin', 'ncMax', 'ncEnds'].forEach(id => $(id).value = ''); say('✓ Discount code ' + code + ' created.');
    } catch (e) { say(e.message, true); }
  }
  async function codeClick(e) {
    const tg = e.target.closest('[data-ctoggle]'), dl = e.target.closest('[data-cdel]'); if (!tg && !dl) return;
    const id = (tg || dl).dataset.ctoggle || (tg || dl).dataset.cdel, c = codes.find(x => x.id === id), b = biz();
    try {
      if (dl) { if (!confirm('Delete the code ' + c.code + '?')) return; const r = await sb().from('mc_saas_discount_codes').delete().eq('id', id).eq('business_id', b.id); if (r.error) throw r.error; codes = codes.filter(x => x.id !== id); }
      else { const r = await sb().from('mc_saas_discount_codes').update({ is_active: !c.is_active }).eq('id', id).eq('business_id', b.id); if (r.error) throw r.error; c.is_active = !c.is_active; }
      drawCodes();
    } catch (err) { say(err.message, true); }
  }
  async function saveSettings() {
    const b = biz();
    const pm = { whish: $('shWhish').value.trim(), omt: $('shOmt').value.trim(), bank: $('shBank').value.trim(), link: $('shLink').value.trim() };
    const r = await sb().rpc('mc_saas_save_shop_settings', { p_business_id: b.id, p_default_language: $('shLang').value, p_description_ar: $('shDescAr').value, p_pay_methods: pm, p_pickup_enabled: $('shPickup').checked, p_pickup_address: $('shPickupAddr').value });
    if (r.error) return say(r.error.message, true);
    Object.assign(b, { default_language: $('shLang').value, description_ar: $('shDescAr').value.trim() || null, pay_methods: Object.fromEntries(Object.entries(pm).filter(([, v]) => v)), pickup_enabled: $('shPickup').checked, pickup_address: $('shPickupAddr').value.trim() || null });
    say('✓ Language, pickup and payment methods saved.');
  }

  /* ------------------- Visitors & sales page ------------------- */
  async function analyticsPage(days) {
    const sec = $('mcAnalyticsPage'); if (!sec || !biz()) return;
    days = days || Number(sec.dataset.days) || 30; sec.dataset.days = days;
    const b = biz();
    const site = (A().businessUrl ? A().businessUrl() : location.origin + location.pathname.replace(/admin\.html$/, '') + 'index.html?shop=' + encodeURIComponent(b.slug));
    const sitemap = window.MC.url + '/functions/v1/mc-sitemap?shop=' + encodeURIComponent(b.slug) + (/^https:/.test(location.origin) && !/yallawassel\.github\.io/.test(location.host) ? '&base=' + encodeURIComponent(location.origin + location.pathname.replace(/[^/]*$/, '')) : '');
    sec.innerHTML = `<div class="row" style="align-items:center;justify-content:space-between"><h2>📈 Visitors &amp; sales</h2><div class="an-days">${[7, 30, 90].map(d => `<button type="button" class="btn ${d === days ? 'primary' : ''}" data-days="${d}">${d} days</button>`).join('')}</div></div><div id="anBody"><p class="hint">Loading…</p></div>
      <div class="sh-card"><h3>🔎 Google &amp; sharing</h3><p class="hint">Every product now has its own page with photo, price and description for Google and for WhatsApp / Facebook previews. Submit your sitemap once in <a href="https://search.google.com/search-console" target="_blank" rel="noopener">Google Search Console</a> so Google finds all your products.</p>
        <div class="an-copy"><input readonly value="${esc(sitemap)}"><button type="button" class="btn" data-copy="${esc(sitemap)}">Copy sitemap link</button></div>
        <p class="hint">Tip: add <b>&amp;utm_source=instagram</b> (or facebook, tiktok…) to the catalogue link you post, to see which one brings the most visitors.</p>
        <div class="an-copy"><input readonly value="${esc(site + (site.includes('?') ? '&' : '?') + 'utm_source=instagram')}"><button type="button" class="btn" data-copy="${esc(site + (site.includes('?') ? '&' : '?') + 'utm_source=instagram')}">Copy</button></div></div>
      <div class="sh-card"><h3>💾 Your data &amp; backups</h3><p class="hint">Your catalogue, orders, POS sales, customers and stock are copied automatically every night and kept for 14 days. You can also download everything yourself at any time.</p>
        <div class="row"><button type="button" class="btn primary" id="anExportX">⬇️ Download all my data (Excel)</button><button type="button" class="btn" id="anExportJ">⬇️ Download as JSON</button></div></div>`;
    sec.querySelectorAll('[data-days]').forEach(x => x.onclick = () => analyticsPage(Number(x.dataset.days)));
    sec.querySelectorAll('[data-copy]').forEach(x => x.onclick = () => { navigator.clipboard && navigator.clipboard.writeText(x.dataset.copy); say('Copied.'); });
    $('anExportX').onclick = () => exportData('xlsx'); $('anExportJ').onclick = () => exportData('json');
    const r = await sb().rpc('mc_saas_analytics', { p_business_id: b.id, p_days: days });
    if (r.error) { $('anBody').innerHTML = `<p class="hint">⚠️ ${esc(r.error.message)}</p>`; return; }
    const a = r.data || {}, n = v => Number(v || 0).toLocaleString();
    const pct = (x, y) => y ? Math.round(x / y * 100) + '%' : '—';
    const max = Math.max(1, ...(a.by_day || []).map(d => d.visits));
    const list = (rows, label, val) => rows && rows.length ? rows.map(x => `<div class="an-li"><span>${esc(label(x))}</span><b>${n(val(x))}</b></div>`).join('') : '<p class="hint">No data yet.</p>';
    $('anBody').innerHTML = `<div class="an-kpis">
        <div><b>${n(a.visitors)}</b><span>Visitors</span></div><div><b>${n(a.product_views)}</b><span>Product views</span></div><div><b>${n(a.add_to_cart)}</b><span>Added to cart</span></div>
        <div><b>${n(a.orders)}</b><span>Orders</span></div><div><b>${money(a.revenue)}</b><span>Order value</span></div><div><b>${pct(a.orders, a.visitors)}</b><span>Visitors who ordered</span></div></div>
      <div class="sh-card"><h3>Visits per day</h3><div class="an-bars">${(a.by_day || []).map(d => `<span title="${esc(d.day)}: ${d.visits}" style="height:${Math.max(4, d.visits / max * 100)}%"></span>`).join('') || '<p class="hint">Visits will appear here once customers open your catalogue.</p>'}</div></div>
      <div class="an-cols"><div class="sh-card"><h3>Most viewed products</h3>${list(a.top_products, x => x.name, x => x.views)}</div>
        <div class="sh-card"><h3>Where visitors come from</h3>${list(a.top_sources, x => x.ref, x => x.visits)}</div>
        <div class="sh-card"><h3>What customers search for</h3>${list(a.top_searches, x => x.q, x => x.n)}</div></div>`;
  }
  async function exportData(kind) {
    const b = biz(); say('Preparing your data…');
    const r = await sb().rpc('mc_saas_export_my_data', { p_business_id: b.id }); if (r.error) return say(r.error.message, true);
    const d = r.data || {}, name = (b.slug || 'my-catalogue') + '-data-' + new Date().toISOString().slice(0, 10);
    const dl = (blob, fn) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = fn; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };
    if (kind === 'json' || !window.XLSX) { dl(new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' }), name + '.json'); say('✓ Downloaded.'); return; }
    const wb = XLSX.utils.book_new(), flat = row => Object.fromEntries(Object.entries(row || {}).map(([k, v]) => [k, v !== null && typeof v === 'object' ? JSON.stringify(v) : v]));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([flat(d.business)]), 'business');
    Object.entries(d).filter(([k, v]) => Array.isArray(v)).forEach(([k, v]) => XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(v.length ? v.map(flat) : [{ empty: '' }]), k.replace('mc_saas_', '').slice(0, 31)));
    XLSX.writeFile(wb, name + '.xlsx'); say('✓ Downloaded.');
  }

  /* ------------------- wiring ------------------- */
  extrasBox();
  const hooks = window.mcPageHooks || {};
  const prevProduct = hooks.product;
  hooks.product = () => { if (prevProduct) prevProduct(); extrasBox(); if (!$('productId').value) window.mcExtrasFill(null); };
  const whenBiz = (fn, n = 0) => { if (biz() && (A().products || []).length + 1) fn(); else if (n < 100) setTimeout(() => whenBiz(fn, n + 1), 300); };
  hooks.shop = () => whenBiz(shopPage); hooks.analytics = () => whenBiz(() => analyticsPage());
  // the page may already be open from the link (#shop / #analytics) before the business loaded
  if (location.hash === '#shop') hooks.shop(); if (location.hash === '#analytics') hooks.analytics();
  window.mcShopAdmin = { shopPage, analyticsPage };
})();
