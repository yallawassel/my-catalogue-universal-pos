/* My Catalogue POS — core: sign-in, business, cashier PIN, shift, data, offline queue, UI helpers. */
(() => {
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sb = window.MC && MC.sb;
  const P = window.POS = {
    $, esc, sb, user: null, biz: null, settings: null, cashier: null, shift: null, products: [], cats: [], stock: new Map(),
    customers: [], cashiers: [], queue: [], online: navigator.onLine, device: { paper: '80', autoPrint: false }, hooks: {}
  };
  const LS = k => 'mcpos-' + (P.biz ? P.biz.id + '-' : '') + k;
  P.save = (k, v) => { try { localStorage.setItem(LS(k), JSON.stringify(v)); } catch (_) { } };
  P.load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(LS(k))); return v ?? d; } catch (_) { return d; } };
  P.uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }));

  /* ---------------- money ---------------- */
  P.rate = () => Number(P.settings?.lbp_rate || 89500);
  P.roundLbp = v => { const r = Number(P.settings?.round_lbp || 1000); return Math.round(v / r) * r; };
  P.toLbp = usd => P.roundLbp(usd * P.rate());
  P.r2 = v => Math.round((Number(v) + Number.EPSILON) * 100) / 100;
  P.fmt = v => (Number(v) < 0 ? '−' : '') + '$' + Math.abs(Number(v) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  P.fmtL = v => Math.round(Number(v) || 0).toLocaleString('en-US') + ' LBP';
  P.num = v => { const n = Number(String(v ?? '').replace(/,/g, '').trim()); return Number.isFinite(n) ? n : 0; };
  P.today = () => new Date().toLocaleDateString('en-CA');
  P.dt = v => new Date(v).toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

  /* ---------------- UI helpers ---------------- */
  let toastT;
  P.toast = (m, bad) => { const t = $('toast'); t.textContent = m; t.className = 'toast show' + (bad ? ' bad' : ''); clearTimeout(toastT); toastT = setTimeout(() => t.className = 'toast', bad ? 5200 : 2600); };
  P.err = e => { const m = (e && (e.message || e.error_description)) || String(e); P.toast(m.replace(/^.*?ERROR:\s*/, ''), true); return m; };
  P.modal = (title, html, opts = {}) => {
    $('mTitle').textContent = title; $('mBody').innerHTML = html; $('modal').hidden = false;
    $('modal').querySelector('.sheet').classList.toggle('wide', !!opts.wide);
    P._onClose = opts.onClose || null;
    setTimeout(() => { const f = $('mBody').querySelector('[autofocus],input:not([type=hidden]):not([readonly])'); if (f && !opts.noFocus) f.focus(); }, 60);
    return $('mBody');
  };
  P.close = () => { $('modal').hidden = true; $('mBody').innerHTML = ''; const f = P._onClose; P._onClose = null; if (f) f(); if (P.hooks.focusScan) P.hooks.focusScan(); };
  $('mClose').onclick = P.close;
  $('modal').addEventListener('click', e => { if (e.target === $('modal')) P.close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('modal').hidden) P.close(); });
  P.ask = (title, label, opts = {}) => new Promise(res => {
    const b = P.modal(title, `<label for="askIn">${esc(label)}</label><input id="askIn" type="${opts.type || 'text'}" ${opts.inputmode ? `inputmode="${opts.inputmode}"` : ''} value="${esc(opts.value ?? '')}" autocomplete="off"><div class="sheet-foot"><button class="btn" type="button" id="askNo">Cancel</button><button class="btn primary" type="button" id="askOk">${esc(opts.ok || 'OK')}</button></div>`, { onClose: () => res(null) });
    const done = v => { P._onClose = null; P.close(); res(v); };
    b.querySelector('#askOk').onclick = () => done(b.querySelector('#askIn').value);
    b.querySelector('#askNo').onclick = () => done(null);
    b.querySelector('#askIn').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); done(e.target.value); } });
  });
  P.confirm = (title, text, ok = 'Yes') => new Promise(res => {
    const b = P.modal(title, `<p>${text}</p><div class="sheet-foot"><button class="btn" type="button" id="cfNo">Cancel</button><button class="btn primary" type="button" id="cfOk">${esc(ok)}</button></div>`, { onClose: () => res(false), noFocus: true });
    b.querySelector('#cfOk').onclick = () => { P._onClose = null; P.close(); res(true); };
    b.querySelector('#cfNo').onclick = () => { P._onClose = null; P.close(); res(false); };
  });
  P.isManager = () => !P.cashier || P.cashier.role === 'manager';
  // what this cashier may do (managers and the owner may do everything)
  const PERM_DEFAULT = { discount: true, credit: true, wholesale: true };
  P.can = key => {
    if (P.isManager()) return true;
    const c = (P.cashiers || []).find(x => x.id === P.cashier.id), p = (c && c.perms) || {};
    return key in p ? !!p[key] : !!PERM_DEFAULT[key];
  };
  const show = id => { ['vLogin', 'vBiz', 'vInactive', 'vPin', 'vShift', 'vApp'].forEach(v => $(v).hidden = v !== id); };
  P.show = show;

  /* ---------------- tabs ---------------- */
  P.tab = name => {
    const nb = document.querySelector(`.side [data-tab="${name}"]`);
    if ((nb?.dataset.role === 'manager' && !P.isManager()) || (nb?.dataset.perm && !P.can(nb.dataset.perm))) return P.toast('You are not allowed to open this. Ask a manager.', true);
    document.querySelectorAll('.side [data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === name));
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('on', t.id === 'tab-' + name));
    $('sideNav').classList.remove('open');
    if (P.hooks['tab_' + name]) P.hooks['tab_' + name]();
  };
  $('sideNav').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) P.tab(b.dataset.tab); });
  $('navToggle').onclick = () => $('sideNav').classList.toggle('open');

  /* ---------------- online / offline queue ---------------- */
  const isNetErr = e => !navigator.onLine || /fetch|network|Failed to|Load failed|timeout/i.test(String(e?.message || e));
  P.isNetErr = isNetErr;
  function netUI() {
    $('netState').textContent = P.online ? '● Online' : '● Offline — sales are saved on this device';
    $('netState').classList.toggle('off', !P.online);
    const n = P.queue.length, bad = P.queue.filter(q => q.error).length;
    $('queueState').hidden = !n;
    $('queueState').textContent = bad ? `⚠️ ${bad} need attention` : `⏳ ${n} waiting to sync`;
  }
  P.netUI = netUI;
  window.addEventListener('online', () => { P.online = true; netUI(); P.sync(); });
  window.addEventListener('offline', () => { P.online = false; netUI(); });
  const RPC = { sale: 'mc_saas_pos_record_sale', ret: 'mc_saas_pos_record_return', pay: 'mc_saas_pos_customer_payment', entry: 'mc_saas_pos_cash_entry' };
  const ARG = { sale: 'p_sale', ret: 'p_return', pay: 'p_pay', entry: 'p_entry' };
  // send now; if the network is down keep it in the device queue (same client_uuid = never duplicated)
  P.submit = async (type, payload) => {
    try {
      const r = await sb.rpc(RPC[type], { p_business_id: P.biz.id, [ARG[type]]: payload });
      if (r.error) throw r.error;
      P.online = true; netUI();
      return { ok: true, data: r.data };
    } catch (e) {
      if (isNetErr(e)) {
        P.online = false; P.queue.push({ type, payload, at: Date.now() }); P.save('queue', P.queue); netUI();
        return { ok: true, offline: true, data: { invoice_label: 'OFFLINE-' + payload.client_uuid.slice(0, 6).toUpperCase() } };
      }
      throw e;
    }
  };
  let syncing = false;
  P.sync = async () => {
    if (syncing || !P.queue.length || !P.biz) return;
    syncing = true;
    try {
      for (const q of [...P.queue]) {
        try {
          const r = await sb.rpc(RPC[q.type], { p_business_id: P.biz.id, [ARG[q.type]]: q.payload });
          if (r.error) throw r.error;
          P.queue = P.queue.filter(x => x !== q); P.online = true;
        } catch (e) {
          if (isNetErr(e)) { P.online = false; break; }
          q.error = String(e.message || e);
        }
        P.save('queue', P.queue); netUI();
      }
      if (!P.queue.length) { P.toast('✅ All offline sales are synced.'); P.refreshStock && P.refreshStock(); }
    } finally { syncing = false; netUI(); }
  };
  setInterval(() => { if (P.queue.length) P.sync(); }, 30000);

  /* ---------------- data ---------------- */
  P.loadData = async () => {
    const id = P.biz.id;
    const [st, ca, pr, cat, cu] = await Promise.all([
      sb.from('mc_saas_pos_settings').select('*').eq('business_id', id).maybeSingle(),
      sb.from('mc_saas_pos_cashiers').select('id,name,role,is_active,perms').eq('business_id', id).order('name'),
      MC.fetchAll(() => sb.from('mc_saas_products').select('id,name,category,image,barcode,sku,label1,price1,label2,price2,sale_price1,sale_price2,sale_ends_at,availability,sort_order,is_active,wholesale_price1,wholesale_price2').eq('business_id', id).eq('is_active', true).order('sort_order').order('name').order('id')),
      sb.from('mc_saas_categories').select('name,sort_order').eq('business_id', id).order('sort_order'),
      MC.fetchAll(() => sb.from('mc_saas_pos_customers').select('*').eq('business_id', id).order('name'))
    ]);
    if (st.error) throw st.error;
    P.settings = st.data || { lbp_rate: 89500, round_lbp: 1000, tax_rate: 0, invoice_prefix: 'INV' };
    P.cashiers = (ca.data || []);
    P.products = (pr.data || []).map(prepProduct);
    const order = new Map((cat.data || []).map((c, i) => [c.name, i]));
    P.cats = [...new Set(P.products.map(p => p.category || 'Products'))].sort((a, b) => (order.get(a) ?? 999) - (order.get(b) ?? 999) || a.localeCompare(b));
    P.customers = cu.data || [];
    await P.refreshStock();
    P.save('settings', P.settings); P.save('cashiers', P.cashiers); P.save('products', P.products); P.save('cats', P.cats); P.save('customers', P.customers);
  };
  P.refreshStock = async () => {
    try {
      // "Sell everything" switch (Stock page): stock is ignored, so the till shows no "Out" badges either
      const ss = await sb.rpc('mc_saas_public_stock_settings', { p_business_id: P.biz.id });
      const st = !ss.error && Array.isArray(ss.data) ? ss.data[0] : null;
      const sellAll = !!st && !st.show_on_catalogue && !st.hide_out_of_stock && st.block_out_of_stock_orders === false;
      if (sellAll) { P.stock = new Map(); P.save('stock', []); }
      else {
        const r = await MC.fetchAll(() => sb.from('mc_saas_stock_availability').select('product_id,available_qty_base,stock_initialized').eq('business_id', P.biz.id));
        if (!r.error) { P.stock = new Map((r.data || []).filter(x => x.stock_initialized).map(x => [x.product_id, Number(x.available_qty_base)])); P.save('stock', [...P.stock]); }
      }
    } catch (_) { }
    if (P.hooks.renderGrid) P.hooks.renderGrid();
  };
  function prepProduct(p) {
    const active = !p.sale_ends_at || new Date(p.sale_ends_at) > new Date();
    const eff = u => { const reg = p['price' + u], sale = p['sale_price' + u]; return reg != null && sale != null && active && Number(sale) < Number(reg) ? Number(sale) : (reg == null ? null : Number(reg)); };
    return { ...p, w1: p.wholesale_price1 == null ? null : Number(p.wholesale_price1), w2: p.wholesale_price2 == null ? null : Number(p.wholesale_price2), p1: eff(1), p2: eff(2), was1: p.price1 != null && eff(1) < Number(p.price1) ? Number(p.price1) : null, was2: p.price2 != null && eff(2) < Number(p.price2) ? Number(p.price2) : null };
  }
  P.loadCached = () => {
    P.settings = P.load('settings', null); P.cashiers = P.load('cashiers', []); P.products = P.load('products', []);
    P.cats = P.load('cats', []); P.customers = P.load('customers', []); P.stock = new Map(P.load('stock', []));
    return !!P.settings;
  };

  /* ---------------- sign in ---------------- */
  $('loginForm').addEventListener('submit', async e => {
    e.preventDefault(); $('lMsg').textContent = 'Signing in…';
    const r = await sb.auth.signInWithPassword({ email: $('lEmail').value.trim(), password: $('lPass').value });
    if (r.error) { $('lMsg').textContent = r.error.message; return; }
    start();
  });
  $('lMagic').onclick = async () => {
    const email = $('lEmail').value.trim(); if (!email) { $('lMsg').textContent = 'Type your email first.'; return; }
    const r = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname, shouldCreateUser: false } });
    $('lMsg').textContent = r.error ? r.error.message : 'Check your email and open the sign-in link on this device.';
  };
  document.addEventListener('click', async e => { if (e.target.closest('[data-signout]')) { await sb.auth.signOut(); localStorage.removeItem('mcpos-last-biz'); location.reload(); } });

  async function pickBusiness() {
    const m = await sb.from('mc_saas_members').select('business_id,role').eq('user_id', P.user.id).in('role', ['owner', 'admin', 'editor']);
    if (m.error) throw m.error;
    const ids = (m.data || []).map(x => x.business_id);
    if (!ids.length) { $('inactiveMsg').textContent = 'This account is not linked to a business yet. Create your business in the catalogue admin first.'; show('vInactive'); return null; }
    const b = await sb.from('mc_saas_businesses').select('id,company_name,slug,currency,logo_url,primary_color,whatsapp,pos_enabled,main_system').in('id', ids);
    if (b.error) throw b.error;
    const list = b.data || [], last = localStorage.getItem('mcpos-last-biz');
    const roles = new Map((m.data || []).map(x => [x.business_id, x.role]));
    list.forEach(x => x.my_role = roles.get(x.id));
    const chosen = list.find(x => x.id === last) || (list.length === 1 ? list[0] : null);
    if (chosen) return chosen;
    return new Promise(res => {
      $('bizList').innerHTML = list.map(x => `<button type="button" data-biz="${x.id}"><span class="logo-dot sm">${x.logo_url ? `<img src="${esc(x.logo_url)}" alt="">` : esc(x.company_name[0])}</span>${esc(x.company_name)}</button>`).join('');
      show('vBiz');
      $('bizList').onclick = e => { const t = e.target.closest('[data-biz]'); if (t) res(list.find(x => x.id === t.dataset.biz)); };
    });
  }

  /* ---------------- cashier PIN ---------------- */
  let pin = '';
  const dots = () => { $('pinDots').innerHTML = '<i></i>'.repeat(pin.length); };
  async function pinSubmit() {
    if (pin.length < 4) return;
    $('pinErr').textContent = '';
    try {
      const r = await sb.rpc('mc_saas_pos_pin_login', { p_business_id: P.biz.id, p_pin: pin });
      if (r.error) throw r.error;
      const c = (r.data || [])[0]; if (!c) throw Error('Wrong PIN.');
      setCashier({ id: c.id, name: c.name, role: c.role });
    } catch (e) {
      if (isNetErr(e)) { // offline: allow the last cashier who used this device
        const last = P.load('cashier', null);
        if (last && last.pinHash === await hash(pin)) return setCashier(last);
      }
      $('pinErr').textContent = 'Wrong PIN.';
    }
    pin = ''; dots();
  }
  const hash = async s => { try { const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(P.biz.id + ':' + s)); return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join(''); } catch (_) { return ''; } };
  async function setCashier(c) { P.cashier = c; if (c) P.save('cashier', { ...c, pinHash: pin ? await hash(pin) : c.pinHash }); else P.save('cashier', null); pin = ''; await afterCashier(); }
  $('pinPad').addEventListener('click', e => {
    const k = e.target.closest('[data-k]')?.dataset.k; if (!k) return;
    if (k === 'C') pin = ''; else if (k === 'OK') return pinSubmit(); else if (pin.length < 8) pin += k;
    dots();
  });
  document.addEventListener('keydown', e => {
    if ($('vPin').hidden) return;
    if (/^\d$/.test(e.key) && pin.length < 8) { pin += e.key; dots(); }
    else if (e.key === 'Backspace') { pin = pin.slice(0, -1); dots(); }
    else if (e.key === 'Enter') pinSubmit();
  });
  $('pinOwner').onclick = async () => {
    const managers = P.cashiers.filter(c => c.is_active && c.role === 'manager');
    if (managers.length) {
      const v = await P.ask('Owner mode', 'Enter a manager PIN', { type: 'password', inputmode: 'numeric' });
      if (!v) return;
      const r = await sb.rpc('mc_saas_pos_pin_login', { p_business_id: P.biz.id, p_pin: v });
      if (r.error || !r.data?.[0] || r.data[0].role !== 'manager') return P.toast('Wrong manager PIN.', true);
    }
    pin = ''; setCashier(null);
  };
  P.lock = () => { P.cashier = null; P.save('cashier', null); P.shift = null; if (P.cashiers.some(c => c.is_active)) { pin = ''; dots(); $('pinErr').textContent = ''; show('vPin'); } else afterCashier(); };
  $('lockBtn').onclick = () => P.lock();
  $('osLock').onclick = () => P.lock();

  /* ---------------- shift ---------------- */
  async function afterCashier() {
    $('topCashier').textContent = (P.cashier ? P.cashier.name : 'Owner') + (P.isManager() ? ' · manager' : '');
    document.querySelectorAll('[data-role=manager]').forEach(el => el.hidden = !P.isManager());
    document.querySelectorAll('[data-perm]').forEach(el => el.hidden = !P.can(el.dataset.perm));
    try {
      let q = sb.from('mc_saas_pos_shifts').select('*').eq('business_id', P.biz.id).eq('status', 'open').order('opened_at', { ascending: false }).limit(1);
      q = P.cashier ? q.eq('cashier_id', P.cashier.id) : q.is('cashier_id', null);
      const r = await q; if (r.error) throw r.error;
      P.shift = r.data?.[0] || null;
    } catch (e) { if (isNetErr(e)) P.shift = P.load('shift', null); else return P.err(e); }
    if (P.shift) { P.save('shift', P.shift); enterApp(); } else { $('osUsd').value = 0; $('osLbp').value = 0; show('vShift'); }
  }
  $('osGo').onclick = async () => {
    try {
      const r = await sb.rpc('mc_saas_pos_open_shift', { p_business_id: P.biz.id, p_cashier_id: P.cashier ? P.cashier.id : null, p_opening_usd: P.num($('osUsd').value), p_opening_lbp: P.num($('osLbp').value) });
      if (r.error) throw r.error;
      P.shift = r.data; P.save('shift', P.shift); enterApp();
    } catch (e) { P.err(e); }
  };
  P.afterCashier = afterCashier;

  function enterApp() {
    show('vApp');
    $('topBiz').textContent = P.biz.company_name;
    $('topLogo').innerHTML = P.biz.logo_url ? `<img src="${esc(P.biz.logo_url)}" alt="">` : esc(P.biz.company_name[0]);
    $('rateVal').textContent = P.rate().toLocaleString('en-US');
    P.device = P.load('device', { paper: '80', autoPrint: false });
    netUI();
    (P.hooks.enter || []).forEach(f => { try { f(); } catch (e) { console.error(e); } });
    P.tab('sell');
    P.sync();
  }
  P.enterHooks = f => { (P.hooks.enter = P.hooks.enter || []).push(f); };

  $('topRate').onclick = async () => {
    if (!P.isManager()) return P.toast('Only a manager can change the exchange rate.', true);
    const v = await P.ask('Exchange rate', '1 USD = how many LBP?', { type: 'number', inputmode: 'numeric', value: P.rate() });
    const n = P.num(v); if (!n) return;
    const r = await sb.from('mc_saas_pos_settings').update({ lbp_rate: n, updated_at: new Date().toISOString() }).eq('business_id', P.biz.id);
    if (r.error) return P.err(r.error);
    P.settings.lbp_rate = n; P.save('settings', P.settings); $('rateVal').textContent = n.toLocaleString('en-US');
    P.hooks.renderCart && P.hooks.renderCart(); P.toast('✅ Rate updated.');
  };

  /* ---------------- start ---------------- */
  async function start() {
    let session = null;
    try { session = (await sb.auth.getSession()).data.session; } catch (_) { }
    if (!session) { show('vLogin'); return; }
    P.user = session.user;
    try {
      P.biz = await pickBusiness(); if (!P.biz) return;
      localStorage.setItem('mcpos-last-biz', P.biz.id);
      if (!P.biz.pos_enabled) { show('vInactive'); return; }
      if (P.biz.main_system === 'external') {
        $('inactiveMsg').innerHTML = 'This shop uses <b>its own POS</b> (connected to the catalogue) as the main system, so items, prices and stock come from it and this till is switched off.<br><br>To sell with the My Catalogue POS instead, open <a href="admin.html#connector">Catalogue admin → Live POS connector</a> and choose <b>My Catalogue POS</b> as the main system.';
        show('vInactive'); return;
      }
      await P.loadData();
      P.save('biz', P.biz);
    } catch (e) {
      if (!isNetErr(e)) return P.err(e);
      // offline start with what this device already knows
      const last = localStorage.getItem('mcpos-last-biz');
      P.biz = last ? (() => { try { return JSON.parse(localStorage.getItem('mcpos-' + last + '-biz')); } catch (_) { return null; } })() : null;
      if (!P.biz || !P.loadCached()) { show('vLogin'); $('lMsg').textContent = 'No internet. Connect once to download your products.'; return; }
      P.online = false;
    }
    P.queue = P.load('queue', []);
    $('pinBiz').textContent = P.biz.company_name;
    $('pinLogo').innerHTML = P.biz.logo_url ? `<img src="${esc(P.biz.logo_url)}" alt="">` : esc(P.biz.company_name[0]);
    const saved = P.load('cashier', null);
    if (P.cashiers.some(c => c.is_active)) {
      if (saved && P.cashiers.some(c => c.id === saved.id && c.is_active)) { P.cashier = saved; afterCashier(); }
      else show('vPin');
    } else { P.cashier = null; afterCashier(); }
  }
  sb.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_OUT') show('vLogin'); });
  P.start = start;
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./service-worker.js').catch(() => { });
  document.addEventListener('DOMContentLoaded', () => { });
  setTimeout(start, 0);
})();
