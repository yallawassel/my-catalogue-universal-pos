/* My Catalogue PRO (v8) — admin shell, dashboard, sign-in UX, Import & Export Center,
   Photo Studio UI and Live POS connector UI. Works on top of the existing admin logic
   through window.MCAdmin (exposed by admin.html). */
(() => {
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const A = () => window.MCAdmin || {};
  const sb = () => window.MC && window.MC.sb;
  const toast = (m, err = false) => (A().setStatus ? A().setStatus(m, err) : alert(m));
  const download = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };
  const slug = () => (A().biz && A().biz.slug) || 'my-catalogue';
  const catOf = p => String(p.category || 'Products').trim() || 'Products';
  const today = () => new Date().toISOString().slice(0, 10);

  /* ---------------------------- toast status ---------------------------- */
  (function toastify() {
    const st = $('status'); if (!st) return; let timer = null;
    const showNow = () => {
      st.classList.remove('mc-hide'); clearTimeout(timer);
      if (!st.textContent.trim()) { st.classList.add('mc-hide'); return; }
      const err = st.classList.contains('error');
      if (/^(connecting|loading products)/i.test(st.textContent)) return;
      timer = setTimeout(() => st.classList.add('mc-hide'), err ? 9000 : 4200);
    };
    new MutationObserver(showNow).observe(st, { childList: true, characterData: true, subtree: true }); // never observe 'class': showNow changes it (would loop)
    st.addEventListener('click', () => st.classList.add('mc-hide'));
    st.title = 'Click to dismiss';
  })();

  /* ------------------------------ navigation ----------------------------- */
  const TITLES = { dashboard: 'Dashboard', settings: 'Business settings', design: 'Storefront design', domain: 'Custom domain', product: 'Add / edit product', sync: 'Excel / CSV synchronization', catphotos: 'Category photos', catorder: 'Category order', products: 'Products', tools: 'Orders & tools', pos: 'POS setup checker', stock: 'Stock & units', ai: 'AI Studio', data: 'Import & Export', studio: 'Photo Studio', connector: 'Live POS connector' };
  const LEGACY = ['settings', 'design', 'domain', 'product', 'sync', 'catphotos', 'catorder', 'products', 'tools', 'pos', 'stock', 'ai'];
  const hooks = {};
  let current = 'dashboard';
  function openPage(key, opts = {}) {
    if (!TITLES[key]) key = 'dashboard';
    current = key;
    document.querySelectorAll('[data-page-id]').forEach(el => el.classList.toggle('hidden', el.dataset.pageId !== key));
    document.querySelectorAll('.mc-nav[data-page]').forEach(el => el.classList.toggle('active', el.dataset.page === key));
    if ($('mcPageTitle')) $('mcPageTitle').textContent = TITLES[key];
    document.body.classList.remove('mc-nav-open');
    if (!opts.noHash && location.hash !== '#' + key) history.replaceState(history.state, '', '#' + key);
    if (!opts.noScroll) window.scrollTo({ top: 0, behavior: 'smooth' });
    if (hooks[key]) try { hooks[key](); } catch (e) { console.error(e); }
  }
  window.mcOpenPage = openPage;
  document.addEventListener('click', e => {
    const p = e.target.closest('[data-page]');
    if (p && !p.closest('.mc-auth')) { e.preventDefault(); openPage(p.dataset.page); return; }
    const legacy = e.target.closest('[data-admin-open]');
    if (legacy) { e.preventDefault(); openPage(LEGACY[Number(legacy.dataset.adminOpen)] || 'dashboard'); }
  });
  window.addEventListener('hashchange', () => { const k = location.hash.slice(1); if (TITLES[k] && k !== current) openPage(k, { noHash: true }); });
  $('mcBurger') && ($('mcBurger').onclick = () => document.body.classList.toggle('mc-nav-open'));
  document.addEventListener('click', e => { if (document.body.classList.contains('mc-nav-open') && !e.target.closest('.mc-side') && !e.target.closest('#mcBurger')) document.body.classList.remove('mc-nav-open'); });
  $('mcSignOut') && ($('mcSignOut').onclick = () => $('signOut').click());
  $('mcCopyLink') && ($('mcCopyLink').onclick = () => $('copyLink').click());
  // Hide every page until the business loads.
  document.querySelectorAll('[data-page-id]').forEach(el => el.classList.toggle('hidden', el.dataset.pageId !== 'dashboard'));

  /* ---------------------------- sign-in UX ---------------------------- */
  let signUpMode = false;
  function setAuthMode(up) {
    signUpMode = up;
    $('tabSignIn').classList.toggle('on', !up); $('tabSignUp').classList.toggle('on', up);
    $('signIn').classList.toggle('hidden', up); $('signUp').classList.toggle('hidden', !up);
    $('signUpExtras').classList.toggle('hidden', !up);
    $('forgot').style.visibility = up ? 'hidden' : 'visible'; $('magicLink').style.visibility = up ? 'hidden' : 'visible';
    $('authTitle').textContent = up ? 'Create your account ✨' : 'Welcome back 👋';
    $('authSubtitle').textContent = up ? 'Start your professional catalogue for free in under 2 minutes.' : 'Sign in to manage your catalogue.';
    $('password').autocomplete = up ? 'new-password' : 'current-password';
    $('authMsg').classList.add('hidden');
  }
  if ($('tabSignIn')) {
    $('tabSignIn').onclick = () => setAuthMode(false);
    $('tabSignUp').onclick = () => setAuthMode(true);
    $('togglePassword').onclick = () => { const p = $('password'), show = p.type === 'password'; p.type = show ? 'text' : 'password'; if ($('password2')) $('password2').type = p.type; $('togglePassword').textContent = show ? 'Hide' : 'Show'; };
    $('password').addEventListener('input', () => {
      if (!signUpMode) return; const v = $('password').value; let score = 0;
      if (v.length >= 8) score++; if (v.length >= 12) score++; if (/[a-z]/.test(v) && /[A-Z]/.test(v)) score++; if (/\d/.test(v)) score++; if (/[^A-Za-z0-9]/.test(v)) score++;
      const lv = [['Too short', '#f43f5e', 15], ['Weak', '#f43f5e', 30], ['Fair', '#f59e0b', 55], ['Good', '#10b981', 78], ['Strong', '#10b981', 92], ['Excellent', '#059669', 100]][score];
      $('pwMeter').style.width = lv[2] + '%'; $('pwMeter').style.background = lv[1]; $('pwMeterLabel').textContent = v ? 'Password strength: ' + lv[0] : 'Use 8+ characters with letters and numbers.';
    });
    ['email', 'password', 'password2'].forEach(id => $(id) && $(id).addEventListener('keydown', e => { if (e.key === 'Enter') (signUpMode ? $('signUp') : $('signIn')).click(); }));
    const authMsgObs = new MutationObserver(() => $('authMsg').classList.toggle('hidden', !$('authMsg').textContent.trim()));
    authMsgObs.observe($('authMsg'), { childList: true, characterData: true, subtree: true });
  }
  const slugify = v => (window.MC ? MC.slugify(v) : String(v || '').toLowerCase());
  const slugPreview = () => { const s = slugify($('slug').value || $('company').value); if ($('slugPreview')) $('slugPreview').textContent = s ? 'Your catalogue link: ' + new URL('index.html', location.href).href + '?shop=' + s : ''; };
  $('company') && $('company').addEventListener('input', slugPreview); $('slug') && $('slug').addEventListener('input', slugPreview);

  /* ------------------------------- dashboard ------------------------------ */
  let orderStats = { fresh: null, total: null };
  async function loadOrderStats() {
    const biz = A().biz; if (!biz || !sb()) return;
    try {
      const [n, t] = await Promise.all([
        sb().from('mc_saas_orders').select('id', { count: 'exact', head: true }).eq('business_id', biz.id).eq('order_status', 'new'),
        sb().from('mc_saas_orders').select('id', { count: 'exact', head: true }).eq('business_id', biz.id).gte('created_at', new Date(Date.now() - 30 * 864e5).toISOString())
      ]);
      orderStats = { fresh: n.error ? null : n.count, total: t.error ? null : t.count };
    } catch (_) { }
    renderDashboard();
  }
  function stats() {
    const ps = A().products || [];
    const cats = new Set(ps.map(catOf));
    return { total: ps.length, cats: cats.size, noPhoto: ps.filter(p => !p.image).length, noPrice: ps.filter(p => p.price1 == null && p.price2 == null).length, ps };
  }
  function renderSide() {
    const biz = A().biz, user = A().user; if (!biz) return;
    $('mcBizName').textContent = biz.company_name || 'My business';
    $('mcBizState').textContent = biz.is_published ? '🟢 Store is live' : '🟡 Awaiting approval';
    $('mcLogoMark').innerHTML = biz.logo_url ? `<img src="${esc(biz.logo_url)}" alt="">` : esc((biz.company_name || 'M').trim().slice(0, 1).toUpperCase());
    const pill = $('mcPublishPill'); pill.textContent = biz.is_published ? '● Live' : '● Private'; pill.className = 'pill mc-hide-sm ' + (biz.is_published ? 'ok' : 'warn');
    $('mcViewStore').href = A().businessUrl ? A().businessUrl() : '#';
    if (user) { $('mcUserEmail').textContent = user.email || ''; $('mcAvatar').textContent = (user.email || '?').slice(0, 1).toUpperCase(); }
    if (biz.primary_color) document.documentElement.style.setProperty('--brand', biz.primary_color);
  }
  function renderDashboard() {
    const biz = A().biz; if (!biz) return;
    renderSide();
    const s = stats();
    const hour = new Date().getHours();
    $('mcHello').textContent = (hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening') + ', ' + (biz.company_name || 'there') + ' 👋';
    $('mcHeroText').textContent = biz.is_published ? 'Your catalogue is live. Keep products, prices and photos fresh to win more orders.' : 'Your catalogue is private until the platform owner approves it — perfect time to add products and photos.';
    const kpi = (c, ic, val, label, page) => `<button type="button" class="mc-kpi" style="--c:${c}" data-page="${page}"><div class="k-ic">${ic}</div><b>${val}</b><span>${label}</span></button>`;
    $('mcKpis').innerHTML = kpi('#7c3aed', '🗂️', s.total.toLocaleString(), 'Products', 'products') + kpi('#14b8a6', '🏷️', s.cats, 'Categories', 'catorder') +
      kpi('#0ea5e9', '📸', s.total ? Math.round(100 * (s.total - s.noPhoto) / s.total) + '%' : '—', s.noPhoto ? s.noPhoto + ' missing photos' : 'Photo coverage', 'studio') +
      `<a class="mc-kpi" style="--c:#f97316;text-decoration:none" href="orders.html"><div class="k-ic">🧾</div><b>${orderStats.fresh == null ? '—' : orderStats.fresh}</b><span>New orders${orderStats.total != null ? ' · ' + orderStats.total + ' in 30 days' : ''}</span></a>`;
    const items = [
      ['Add your logo & brand colour', !!biz.logo_url, 'settings'],
      ['Set your WhatsApp number', !!String(biz.whatsapp || '').trim(), 'settings'],
      ['Add your first product', s.total > 0, 'product'],
      ['Every product has a price', s.total > 0 && s.noPrice === 0, 'products'],
      ['Every product has a photo', s.total > 0 && s.noPhoto === 0, 'studio'],
      ['Choose a storefront design', !!biz.catalogue_template && biz.catalogue_template !== 'classic', 'design'],
      ['Catalogue approved & published', !!biz.is_published, 'settings']
    ];
    const done = items.filter(i => i[1]).length;
    $('mcProgressBar').style.width = Math.round(100 * done / items.length) + '%';
    $('mcProgressText').textContent = done + ' of ' + items.length + ' steps complete';
    $('mcChecklist').innerHTML = items.map(([t, ok, page]) => `<div class="mc-check ${ok ? 'done' : ''}" data-page="${page}"><span class="dot">${ok ? '✓' : ''}</span><span class="t">${esc(t)}</span>${ok ? '' : '<span style="margin-left:auto;color:var(--violet-2);font-weight:700;font-size:13px">Do it →</span>'}</div>`).join('');
    const recent = s.ps.slice().sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || ''))).slice(0, 5);
    $('mcRecent').innerHTML = recent.length ? recent.map(p => `<div class="mc-recent-row">${p.image ? `<img src="${esc(p.image)}" alt="" loading="lazy">` : '<span class="ph">📦</span>'}<div style="min-width:0;flex:1"><b style="display:block;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(p.name)}</b><small class="hint">${esc(catOf(p))}${p.price1 != null ? ' · ' + esc(MC.money(p.price1, biz.currency)) : ''}</small></div></div>`).join('') : '<div class="mc-empty">No products yet — add your first one!</div>';
    const badge = (id, n) => { const b = $(id); if (!b) return; b.textContent = n; b.classList.toggle('hidden', !n); };
    badge('mcNavPhotos', s.noPhoto); badge('mcNavProducts', s.total);
  }
  hooks.dashboard = () => { renderDashboard(); loadOrderStats(); };
  let dashTimer = null;
  const productList = $('productList');
  if (productList) new MutationObserver(() => { clearTimeout(dashTimer); dashTimer = setTimeout(() => { renderDashboard(); if (current === 'studio') fillStudioSelects(); }, 250); }).observe(productList, { childList: true });

  const onReady = () => {
    renderDashboard(); loadOrderStats();
    const k = location.hash.slice(1);
    openPage(TITLES[k] ? k : current || 'dashboard', { noScroll: true });
  };
  document.addEventListener('mc:ready', onReady);


  /* -------------------------- Import & Export Center -------------------------- */
  const HEADERS = ['Product Name', 'Category', 'Barcode', 'SKU', 'POS Product ID', 'Label1', 'Price1', 'Label2', 'Price2', 'Description', 'Photo URL', 'Display Order', 'Active'];
  const productRow = p => ({ 'Product Name': p.name || '', Category: catOf(p), Barcode: p.barcode || '', SKU: p.sku || '', 'POS Product ID': p.pos_product_id || '', Label1: p.label1 || '', Price1: p.price1 ?? '', Label2: p.label2 || '', Price2: p.price2 ?? '', Description: p.description || '', 'Photo URL': p.image || '', 'Display Order': (Number(p.sort_order) || 0) + 1, Active: p.is_active === false ? 'No' : 'Yes' });
  const sortedProducts = () => {
    const ps = (A().products || []).slice();
    const rank = new Map((A().categoryRows || []).map(c => [c.name, Number(c.sort_order) || 0]));
    return ps.sort((a, b) => (rank.has(catOf(a)) ? rank.get(catOf(a)) : 1e6) - (rank.has(catOf(b)) ? rank.get(catOf(b)) : 1e6) || catOf(a).localeCompare(catOf(b)) || (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0));
  };
  const on = (id, fn) => { const el = $(id); if (el) el.addEventListener('click', async () => { try { await fn(); } catch (e) { toast(e.message || String(e), true); } }); };
  on('dcExportXlsx', async () => {
    const XLSX = await A().loadXlsx(); const rows = sortedProducts().map(productRow);
    const wb = XLSX.utils.book_new(); const ws = XLSX.utils.json_to_sheet(rows, { header: HEADERS });
    ws['!cols'] = [34, 20, 18, 14, 16, 12, 10, 12, 10, 44, 50, 12, 8].map(wch => ({ wch }));
    XLSX.utils.book_append_sheet(wb, ws, 'Products');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['My Catalogue export'], ['Business', A().biz.company_name], ['Exported', new Date().toLocaleString()], ['Products', rows.length], ['Re-import', 'Upload this file in Excel / CSV sync. Matching uses Barcode, then POS Product ID, then SKU.']]), 'Info');
    XLSX.writeFile(wb, `${slug()}-products-${today()}.xlsx`); toast(`Excel export ready: ${rows.length} products.`);
  });
  const csvCell = v => { const s = String(v ?? ''); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  on('dcExportCsv', () => {
    const rows = sortedProducts().map(productRow);
    const csv = '\ufeff' + [HEADERS.join(','), ...rows.map(r => HEADERS.map(h => csvCell(r[h])).join(','))].join('\r\n');
    download(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `${slug()}-products-${today()}.csv`); toast(`CSV export ready: ${rows.length} products.`);
  });
  on('dcExportBackup', async () => {
    const biz = A().biz; let units = [];
    try { const u = await sb().from('mc_saas_product_units').select('*').eq('business_id', biz.id); if (!u.error) units = u.data || []; } catch (_) { }
    const cats = (A().categoryRows || []).slice().sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    const data = {
      format: 'my-catalogue-backup', version: 8, exported_at: new Date().toISOString(),
      business: { company_name: biz.company_name, slug: biz.slug, description: biz.description, whatsapp: biz.whatsapp, currency: biz.currency, logo_url: biz.logo_url, primary_color: biz.primary_color, catalogue_template: biz.catalogue_template },
      categoryOrder: cats.map(c => c.name), categoryImages: Object.fromEntries(cats.filter(c => c.image_url).map(c => [c.name, c.image_url])),
      products: sortedProducts().map(p => ({ name: p.name, category: catOf(p), description: p.description || '', image: p.image || '', barcode: p.barcode || '', sku: p.sku || '', pos_product_id: p.pos_product_id || '', label1: p.label1 || '', price1: p.price1, label2: p.label2 || '', price2: p.price2, sort_order: p.sort_order, is_active: p.is_active !== false })),
      units: units.map(u => ({ product_name: (A().products.find(p => p.id === u.product_id) || {}).name || '', unit_name: u.unit_name, is_base_unit: u.is_base_unit, conversion_to_base: u.conversion_to_base, conversion_configured: u.conversion_configured, barcode: u.barcode, selling_price: u.selling_price }))
    };
    download(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), `${slug()}-backup-${today()}.json`); toast('Full backup downloaded. Keep it somewhere safe.');
  });
  if ($('dcOrdersFrom')) { $('dcOrdersFrom').value = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10); $('dcOrdersTo').value = today(); }
  on('dcExportOrders', async () => {
    const biz = A().biz, from = $('dcOrdersFrom').value, to = $('dcOrdersTo').value;
    let q = sb().from('mc_saas_orders').select('*').eq('business_id', biz.id).order('created_at', { ascending: false }).limit(5000);
    if (from) q = q.gte('created_at', new Date(from + 'T00:00:00').toISOString());
    if (to) q = q.lte('created_at', new Date(to + 'T23:59:59').toISOString());
    const r = await q; if (r.error) throw r.error;
    const orders = r.data || []; if (!orders.length) { toast('No orders in this period.'); return; }
    const XLSX = await A().loadXlsx(); const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(orders.map(o => ({ 'Order #': o.order_number, Date: new Date(o.created_at).toLocaleString(), Customer: o.customer_name, Phone: o.customer_phone, Address: o.delivery_address, 'Map link': o.delivery_lat != null ? `https://www.google.com/maps?q=${o.delivery_lat},${o.delivery_lng}` : '', Items: (o.items || []).length, Total: Number(o.total || 0), Currency: o.currency, Status: o.order_status, Payment: o.payment_status, Notes: o.notes }))), 'Orders');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(orders.flatMap(o => (o.items || []).map(it => ({ 'Order #': o.order_number, Date: new Date(o.created_at).toLocaleDateString(), Customer: o.customer_name, Product: it.name, Unit: it.unit, Quantity: it.quantity, 'Unit price': it.unit_price, 'Line total': it.line_total })))), 'Order lines');
    XLSX.writeFile(wb, `${slug()}-orders-${from || 'all'}-to-${to || today()}.xlsx`); toast(`Exported ${orders.length} orders.`);
  });
  on('dcExportPhotos', async () => {
    const XLSX = await A().loadXlsx(); const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sortedProducts().map(p => ({ Product: p.name, Category: catOf(p), Barcode: p.barcode || '', 'Has photo': p.image ? 'Yes' : 'No', 'Photo URL': p.image || '' }))), 'Photos');
    XLSX.writeFile(wb, `${slug()}-photos-${today()}.xlsx`); toast('Photo list exported.');
  });
  on('dcPrintPriceList', () => {
    const biz = A().biz, money = v => v == null ? '—' : MC.money(v, biz.currency); const groups = new Map();
    sortedProducts().filter(p => p.is_active !== false).forEach(p => { if (!groups.has(catOf(p))) groups.set(catOf(p), []); groups.get(catOf(p)).push(p); });
    const w = window.open('', '_blank'); if (!w) throw Error('Allow pop-ups to open the printable price list.');
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(biz.company_name)} — Price list</title><style>body{font-family:'Plus Jakarta Sans',Arial,sans-serif;color:#1b1740;margin:28px}header{display:flex;align-items:center;gap:16px;border-bottom:4px solid ${esc(biz.primary_color || '#7c3aed')};padding-bottom:14px;margin-bottom:10px}header img{width:64px;height:64px;object-fit:contain}h1{margin:0}h2{background:${esc(biz.primary_color || '#7c3aed')};color:#fff;padding:7px 12px;border-radius:8px;font-size:16px;margin:22px 0 6px}table{width:100%;border-collapse:collapse;font-size:13px}td,th{padding:7px 8px;border-bottom:1px solid #e7e4f5;text-align:left}th{font-size:11px;text-transform:uppercase;color:#6b6890}td.p{text-align:right;white-space:nowrap;font-weight:700}td img{width:38px;height:38px;object-fit:contain}.btn{position:fixed;right:20px;top:20px;padding:10px 16px;border:0;border-radius:10px;background:#7c3aed;color:#fff;font-weight:700;cursor:pointer}@media print{.btn{display:none}h2{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body><button class="btn" onclick="print()">🖨 Print / Save PDF</button><header>${biz.logo_url ? `<img src="${esc(biz.logo_url)}">` : ''}<div><h1>${esc(biz.company_name)}</h1><div>Price list · ${new Date().toLocaleDateString()}${biz.whatsapp ? ' · WhatsApp +' + esc(biz.whatsapp) : ''}</div></div></header>${[...groups].map(([c, ps]) => `<h2>${esc(c)}</h2><table><tr><th></th><th>Product</th><th>Code</th><th style="text-align:right">Price</th><th style="text-align:right">Price 2</th></tr>${ps.map(p => `<tr><td>${p.image ? `<img src="${esc(p.image)}">` : ''}</td><td><b>${esc(p.name)}</b></td><td>${esc(p.barcode || p.sku || '')}</td><td class="p">${money(p.price1)} <small>${esc(p.label1 || '')}</small></td><td class="p">${p.label2 ? money(p.price2) + ' <small>' + esc(p.label2) + '</small>' : ''}</td></tr>`).join('')}</table>`).join('')}</body></html>`);
    w.document.close();
  });
  on('dcRestoreJson', () => $('importJson').click());
  on('dcTplProducts', () => $('downloadProductTemplate').click());
  on('dcTplPos', () => $('downloadPosTemplate').click());
  on('dcTplUnits', () => $('downloadUnitTemplate').click());

  /* ------------------------------- Photo Studio ------------------------------- */
  const studio = { bg: 'white', source: null, resultBlob: null, bulk: [], stop: false, busy: false };
  const studioOpts = () => ({ background: studio.bg, fill: Number($('psFill').value), tolerance: Number($('psTol').value), shadow: $('psShadow').value, enhance: $('psEnhance').value, brand: (A().biz && A().biz.primary_color) || '#7c3aed' });
  function fillStudioSelects() {
    const ps = A().products || []; const sel = $('psProduct'); if (!sel) return; const prev = sel.value;
    sel.innerHTML = '<option value="">Choose a product…</option>' + ps.slice().sort((a, b) => a.name.localeCompare(b.name)).map(p => `<option value="${esc(p.id)}">${p.image ? '🖼️' : '⬜'} ${esc(p.name)}</option>`).join('');
    if (ps.some(p => p.id === prev)) sel.value = prev;
    const cats = [...new Set(ps.map(catOf))].sort(); const cs = $('psCategory'), pc = cs.value;
    cs.innerHTML = '<option value="">All categories</option>' + cats.map(c => `<option>${esc(c)}</option>`).join(''); if (cats.includes(pc)) cs.value = pc;
    const withPhoto = ps.filter(p => p.image).length; $('psBulkInfo').textContent = `${withPhoto} with photo · ${ps.length - withPhoto} without`;
  }
  hooks.studio = fillStudioSelects;
  document.querySelectorAll('#psBg .mc-swatch').forEach(b => b.onclick = () => { document.querySelectorAll('#psBg .mc-swatch').forEach(x => x.classList.remove('on')); b.classList.add('on'); studio.bg = b.dataset.bg; });
  $('psProduct') && ($('psProduct').onchange = () => {
    const p = (A().products || []).find(x => x.id === $('psProduct').value); studio.resultBlob = null; $('psApplyOne').disabled = true; $('psUpload').value = '';
    studio.source = p && p.image ? p.image : null; $('psBefore').src = studio.source || '';
    const c = $('psAfter'); c.getContext('2d').clearRect(0, 0, c.width, c.height);
    if (p && !p.image) toast('This product has no photo yet — upload one, or press Preview to create a branded photo card.');
  });
  $('psUpload') && ($('psUpload').onchange = () => { const f = $('psUpload').files[0]; if (!f) return; studio.source = f; $('psBefore').src = URL.createObjectURL(f); studio.resultBlob = null; $('psApplyOne').disabled = true; });
  const drawInto = (canvas, src) => { const ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(src, 0, 0, canvas.width, canvas.height); };
  on('psPreview', async () => {
    if (!window.MCStudio) throw Error('photo-studio.js did not load.');
    const p = (A().products || []).find(x => x.id === $('psProduct').value);
    if (!studio.source && !p) throw Error('Choose a product or upload a photo first.');
    const btn = $('psPreview'); btn.disabled = true; btn.textContent = 'Working…';
    try {
      const res = studio.source ? await MCStudio.process(studio.source, studioOpts()) : await MCStudio.brandCard(p, studioOpts());
      drawInto($('psAfter'), res.canvas); studio.resultBlob = res.blob; $('psApplyOne').disabled = false;
      $('psApplyOne').textContent = p ? 'Use this photo' : 'Download photo';
      toast(res.bgRemoved === false ? 'Busy background detected — photo was enhanced and framed instead. Tip: shoot on a plain wall or paper.' : 'Preview ready ✨');
    } finally { btn.disabled = false; btn.textContent = '✨ Preview'; }
  });
  on('psApplyOne', async () => {
    if (!studio.resultBlob) return; const id = $('psProduct').value;
    const file = new File([studio.resultBlob], 'studio.' + (studio.resultBlob.type === 'image/webp' ? 'webp' : 'jpg'), { type: studio.resultBlob.type });
    if (!id) { download(file, 'studio-photo.' + file.name.split('.').pop()); return; }
    $('psApplyOne').disabled = true; toast('Saving studio photo…');
    await A().replaceProductImage(id, file); await A().loadProducts(); toast('Studio photo saved to the product ✅. The old photo is kept in storage.');
  });
  function bulkTargets() {
    const scope = $('psScope').value, cat = $('psCategory').value; let ps = (A().products || []).slice();
    if (cat) ps = ps.filter(p => catOf(p) === cat);
    if (scope === 'missing') return ps.filter(p => !p.image);
    return ps.filter(p => p.image);
  }
  function renderBulk() {
    $('psBulkGrid').innerHTML = studio.bulk.map((b, i) => `<div class="mc-studio-card"><label class="sel"><input type="checkbox" data-ps-sel="${i}" ${b.selected ? 'checked' : ''} ${b.blob ? '' : 'disabled'}></label>${b.tag ? `<span class="tag" style="background:${b.tagColor}">${esc(b.tag)}</span>` : ''}${b.url ? `<img src="${b.url}" alt="">` : `<div style="aspect-ratio:1;display:grid;place-items:center;background:#faf9ff;font-size:13px;color:var(--muted)">${b.error ? '⚠️ ' + esc(b.error) : '⏳'}</div>`}<div class="meta"><b>${esc(b.p.name)}</b><span class="hint">${esc(catOf(b.p))}</span></div></div>`).join('');
    const n = studio.bulk.filter(b => b.selected && b.blob).length; $('psBulkApply').disabled = !n || studio.busy; $('psBulkApply').textContent = `✅ Save ${n} selected photo${n === 1 ? '' : 's'}`;
  }
  $('psBulkGrid') && $('psBulkGrid').addEventListener('change', e => { const c = e.target.closest('[data-ps-sel]'); if (!c) return; studio.bulk[Number(c.dataset.psSel)].selected = c.checked; renderBulk(); });
  on('psBulkSelectAll', () => { const all = studio.bulk.every(b => !b.blob || b.selected); studio.bulk.forEach(b => { if (b.blob) b.selected = !all; }); renderBulk(); });
  on('psBulkStop', () => { studio.stop = true; });
  document.addEventListener('click', e => { const b = e.target.closest('[data-studio]'); if (!b) return; e.preventDefault(); openPage('studio'); fillStudioSelects(); $('psProduct').value = b.dataset.studio; $('psProduct').dispatchEvent(new Event('change')); });
  on('psBulkRun', async () => {
    if (studio.busy) return; const targets = bulkTargets();
    if (!targets.length) throw Error($('psScope').value === 'missing' ? 'Every product in this selection already has a photo 🎉' : 'No products with photos in this selection.');
    const MAX = 200; if (targets.length > MAX && !confirm(`${targets.length} products selected. Process the first ${MAX} now? (You can run again for the rest.)`)) return;
    studio.bulk.forEach(b => b.url && URL.revokeObjectURL(b.url));
    studio.bulk = targets.slice(0, MAX).map(p => ({ p, selected: false })); studio.stop = false; studio.busy = true;
    $('psBulkRun').disabled = true; $('psBulkStop').disabled = false; renderBulk();
    const opts = studioOpts(); let ok = 0;
    for (let i = 0; i < studio.bulk.length; i++) {
      if (studio.stop) break; const b = studio.bulk[i];
      try {
        const res = b.p.image ? await MCStudio.process(b.p.image, opts) : await MCStudio.brandCard(b.p, opts);
        b.blob = res.blob; b.url = URL.createObjectURL(res.blob);
        if (!b.p.image) { b.tag = 'Brand card'; b.tagColor = '#7c3aed'; b.selected = true; }
        else if (res.bgRemoved) { b.tag = 'Background removed'; b.tagColor = '#059669'; b.selected = true; }
        else { b.tag = 'Framed only'; b.tagColor = '#d97706'; b.selected = false; }
        ok++;
      } catch (e) { b.error = e.message || 'Failed'; }
      $('psBulkBar').style.width = Math.round(100 * (i + 1) / studio.bulk.length) + '%';
      if (i % 3 === 0 || i === studio.bulk.length - 1) renderBulk();
      await new Promise(r => setTimeout(r, 0));
    }
    studio.busy = false; $('psBulkRun').disabled = false; $('psBulkStop').disabled = true; renderBulk();
    toast(`${ok} previews ready. Review them, untick any you don't like, then press Save.`);
  });
  on('psBulkApply', async () => {
    const chosen = studio.bulk.filter(b => b.selected && b.blob && !b.saved); if (!chosen.length) return;
    if (!confirm(`Replace the catalogue photo of ${chosen.length} product(s) with the new studio photo? Original files stay in storage.`)) return;
    studio.busy = true; renderBulk(); let saved = 0, failed = 0;
    for (let i = 0; i < chosen.length; i++) {
      const b = chosen[i];
      try { await A().replaceProductImage(b.p.id, new File([b.blob], 'studio.' + (b.blob.type === 'image/webp' ? 'webp' : 'jpg'), { type: b.blob.type })); b.saved = true; b.selected = false; b.tag = 'Saved ✓'; b.tagColor = '#1b1740'; saved++; }
      catch (e) { failed++; b.error = e.message; }
      $('psBulkBar').style.width = Math.round(100 * (i + 1) / chosen.length) + '%';
      toast(`Saving photos ${i + 1}/${chosen.length}…`);
    }
    studio.busy = false; renderBulk(); await A().loadProducts();
    toast(`${saved} studio photo(s) saved${failed ? ', ' + failed + ' failed' : ''}.`, failed > 0);
  });

  /* ---------------------------- Live POS connector ---------------------------- */
  const fnUrl = () => (window.MC && MC.url ? MC.url : '') + '/functions/v1/mc-pos-connector';
  const SETUP_HINT = 'Connector not installed yet: run POS_CONNECTOR_V8_MIGRATION.sql in Supabase and deploy the mc-pos-connector Edge Function (see POS_CONNECTOR_GUIDE.md).';
  async function loadConnector() {
    const biz = A().biz; if (!biz) return;
    const k = await sb().from('mc_saas_pos_agent_keys').select('id,name,key_prefix,permission,created_at,last_used_at,last_sync_summary,revoked_at').eq('business_id', biz.id).order('created_at', { ascending: false });
    if (k.error) { $('lcKeys').innerHTML = `<div class="mc-empty">${esc(SETUP_HINT)}<br><small>${esc(k.error.message)}</small></div>`; }
    else {
      const perm = { price: 'Prices only', full: 'Products + prices', full_stock: 'Products + prices + stock' };
      $('lcKeys').innerHTML = (k.data || []).length ? `<div style="overflow-x:auto"><table class="mc-table"><tr><th>Name</th><th>Key</th><th>Allowed</th><th>Last used</th><th>Last result</th><th></th></tr>${k.data.map(x => {
        const s = x.last_sync_summary || {};
        return `<tr><td><b>${esc(x.name)}</b><div class="hint" style="font-size:12px">Created ${new Date(x.created_at).toLocaleDateString()}</div></td><td><code>${esc(x.key_prefix)}…</code></td><td>${esc(perm[x.permission] || x.permission)}</td><td>${x.last_used_at ? new Date(x.last_used_at).toLocaleString() : '<span class="hint">Never</span>'}</td><td>${s.received != null ? `<span class="hint" style="font-size:12px">${s.dry_run ? 'Dry run · ' : ''}${s.received} rows · ${s.updated || 0} updated · ${s.added || 0} new</span>` : ''}</td><td>${x.revoked_at ? '<span class="pill bad">Revoked</span>' : `<button class="btn danger" type="button" data-lc-revoke="${esc(x.id)}">Revoke</button>`}</td></tr>`;
      }).join('')}</table></div>` : '<div class="mc-empty">No connector keys yet. Create one above to connect your first POS.</div>';
    }
    const j = await sb().from('mc_saas_sync_jobs').select('id,source_type,sync_mode,status,rows_total,rows_updated,rows_added,rows_failed,started_at,completed_at,error_summary').eq('business_id', biz.id).order('started_at', { ascending: false }).limit(15);
    if (j.error) { $('lcJobs').innerHTML = `<div class="mc-empty">${esc(j.error.message)}</div>`; return; }
    const src = { file: '📄 Excel/CSV', local_agent: '🖥️ Windows agent', api: '☁️ API', manual: '✋ Manual', custom: '🧩 Custom' };
    const stc = { completed: 'ok', completed_with_errors: 'warn', failed: 'bad', running: '' };
    $('lcJobs').innerHTML = (j.data || []).length ? `<div style="overflow-x:auto"><table class="mc-table"><tr><th>When</th><th>Source</th><th>Mode</th><th>Status</th><th>Rows</th><th>Updated</th><th>Added</th><th>Failed</th></tr>${j.data.map(x => `<tr><td>${new Date(x.started_at).toLocaleString()}</td><td>${src[x.source_type] || esc(x.source_type)}</td><td>${x.sync_mode === 'price' ? 'Prices' : 'Full'}</td><td><span class="pill ${stc[x.status] || ''}">${esc(String(x.status).replace(/_/g, ' '))}</span></td><td>${x.rows_total}</td><td>${x.rows_updated}</td><td>${x.rows_added}</td><td>${x.rows_failed}</td></tr>`).join('')}</table></div>` : '<div class="mc-empty">No synchronizations yet.</div>';
  }
  hooks.connector = () => loadConnector().catch(e => toast(e.message, true));
  on('lcRefresh', () => loadConnector().then(() => toast('Connector status refreshed.')));
  $('lcKeys') && $('lcKeys').addEventListener('click', async e => {
    const b = e.target.closest('[data-lc-revoke]'); if (!b) return;
    if (!confirm('Revoke this key? Any POS computer using it will stop syncing immediately.')) return;
    const r = await sb().rpc('mc_saas_pos_agent_revoke_key', { p_key_id: b.dataset.lcRevoke });
    if (r.error) toast('Could not revoke: ' + r.error.message, true); else { toast('Key revoked.'); loadConnector(); }
  });
  function agentConfig(key, permission) {
    return {
      endpoint: fnUrl(), apikey: (window.MC && MC.publishableKey) || '', connectorKey: key,
      source: 'sqlserver', syncMode: permission === 'price' ? 'price' : 'full', markupPercent: 0, includeStock: permission === 'full_stock', autoApply: false,
      sqlServer: { connectionString: 'Server=.\\SQLEXPRESS;Database=Data2025;User Id=mc_readonly;Password=CHANGE_ME;ApplicationIntent=ReadOnly;Encrypt=False;TrustServerCertificate=True', queryFile: 'antisoft-products.sql', timeoutSeconds: 60 },
      csv: { folder: 'C:\\POS\\Exports', pattern: '*.csv', delimiter: ',', encoding: 'UTF8' },
      columns: { barcode: 'Barcode', posProductId: 'ItemID', sku: 'SKU', name: 'Name', category: 'Category', unit1: 'Unit1', price1: 'Price1', unit2: 'Unit2', price2: 'Price2', stock: 'Stock', description: 'Description' },
      logFolder: 'logs'
    };
  }
  on('lcCreateKey', async () => {
    const biz = A().biz, name = $('lcKeyName').value.trim() || 'POS connector', permission = $('lcKeyMode').value;
    const r = await sb().rpc('mc_saas_pos_agent_create_key', { p_business_id: biz.id, p_name: name, p_permission: permission });
    if (r.error) throw Error(/function|does not exist|schema cache/i.test(r.error.message) ? SETUP_HINT : r.error.message);
    const key = r.data && r.data.key; if (!key) throw Error('The key was not returned.');
    const box = $('lcNewKey'); box.classList.remove('hidden');
    box.innerHTML = `<div class="mc-card" style="border-color:#f9a8d4;background:#fff7fb"><h3>🔑 Your new connector key — copy it now</h3><p class="hint">For security it will not be shown again. Paste it into <code>config.json</code> on the POS computer (or download the ready-made config below).</p><div class="mc-codebox" id="lcKeyText">${esc(key)}</div><div class="row" style="margin-top:10px"><button class="btn primary" type="button" id="lcCopyKey">📋 Copy key</button><button class="btn" type="button" id="lcDownloadCfg">⬇️ Download config.json</button><button class="btn ghost" type="button" id="lcTest">🧪 Test connection</button></div></div>`;
    $('lcCopyKey').onclick = async () => { try { await navigator.clipboard.writeText(key); toast('Key copied.'); } catch (_) { toast('Select the key text and copy it manually.', true); } };
    $('lcDownloadCfg').onclick = () => download(new Blob([JSON.stringify(agentConfig(key, permission), null, 2)], { type: 'application/json' }), 'config.json');
    $('lcTest').onclick = async () => {
      try { const res = await fetch(fnUrl(), { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-connector-key': key, apikey: MC.publishableKey }, body: JSON.stringify({ action: 'ping' }) }); const data = await res.json(); if (!res.ok) throw Error(data.error || res.statusText); toast('✅ Connected to ' + data.business.name + ' with key “' + data.key.name + '”.'); loadConnector(); }
      catch (e) { toast('Test failed: ' + e.message + '. Is the mc-pos-connector function deployed?', true); }
    };
    $('lcKeyName').value = ''; loadConnector(); toast('Connector key created. Copy it now.');
  });
  function guide(kind) {
    const g = $('lcGuide'); g.style.display = 'block'; const url = esc(fnUrl());
    if (kind === 'windows') g.innerHTML = `<h3>🖥️ Windows POS (AntiSoft / SQL Server) — setup</h3><ol class="mc-steps">
      <li><b>Create a read-only SQL login</b> on the POS server (run <code>pos-agent/sql/create-readonly-login.sql</code> in SQL Server Management Studio as administrator). It can only <i>read</i> — it cannot change or delete anything in AntiSoft.</li>
      <li><b>Copy the <code>pos-agent</code> folder</b> from this package to the POS PC, e.g. <code>C:\\MyCatalogueAgent</code>.</li>
      <li><b>Create a connector key</b> below and press <i>Download config.json</i>. Put the file in the agent folder and replace <code>CHANGE_ME</code> with the read-only password.</li>
      <li><b>Map your AntiSoft columns</b>: run <code>sql/antisoft-discover-columns.sql</code>, then adjust <code>antisoft-products.sql</code> so it returns Barcode, ItemID, Name, Category, Unit1, Price1, Unit2, Price2 (and Stock if wanted).</li>
      <li><b>Dry run</b>: right-click <code>Run-DryRun.cmd</code> → Run. It shows exactly what would change — nothing is saved.</li>
      <li><b>Go live</b>: run <code>Install-Schedule.cmd</code> as administrator to sync automatically every 15 minutes (set <code>"autoApply": true</code> in config.json first).</li></ol>`;
    else if (kind === 'folder') g.innerHTML = `<h3>📁 Any POS with Excel/CSV export — setup</h3><ol class="mc-steps"><li>Set your POS to export its product/price list as CSV into one folder (e.g. <code>C:\\POS\\Exports</code>). Many POS systems can schedule this.</li><li>Copy the <code>pos-agent</code> folder to that PC and download <code>config.json</code> after creating a key below.</li><li>In config.json set <code>"source": "csv"</code>, the folder path, and the column names used by your export under <code>"columns"</code>.</li><li>Run <code>Run-DryRun.cmd</code> to preview, then <code>Install-Schedule.cmd</code> to automate. Each new export file is processed once, then moved into a <code>processed</code> sub-folder.</li></ol>`;
    else g.innerHTML = `<h3>☁️ HTTPS API for cloud POS &amp; developers</h3><p class="hint">Send up to 5,000 items per request. Matching order: unit/product barcode → POS product ID → SKU. Names are never used for matching. Use <code>"dry_run": true</code> to preview.</p><div class="mc-codebox">POST ${url}
Headers:
  Content-Type: application/json
  apikey: ${esc((window.MC && MC.publishableKey) || '')}
  x-connector-key: mcpos_xxxxxxxx   ← your connector key

{
  "action": "sync",
  "dry_run": true,
  "sync_mode": "full",          // "price" = update prices only
  "markup_pct": 0,
  "include_stock": false,
  "items": [
    { "barcode": "5281234567890", "pos_product_id": "1043", "sku": "KB-750",
      "name": "Kraft bowl 750cc", "category": "Kraft",
      "unit1": "Piece", "price1": 0.18, "unit2": "Box", "price2": 45,
      "stock_qty": 1200 }
  ]
}</div><p class="hint" style="margin-top:10px">Test it: <code>{"action":"ping"}</code> returns your business name. The response of a sync lists every row with its action: <b>update</b>, <b>new</b>, <b>unchanged</b> or <b>skip</b> (with the reason).</p>`;
    g.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  on('lcGuideWindows', () => guide('windows')); on('lcGuideFolder', () => guide('folder')); on('lcGuideApi', () => guide('api'));

  // admin.html may have finished loading the business before this file arrived.
  if (window.MCAdmin && window.MCAdmin.biz) onReady();
})();
