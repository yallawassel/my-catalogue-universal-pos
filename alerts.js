/* Raffi — order alerts: rings the shop owner's phone/computer for every new online order (Web Push).
   Use: MCAlerts.mount(element, () => businessId). Needs saas.js and service-worker.js. */
(() => {
  const VAPID = 'BEwYyVnwmnDORwWGDlrXuDchmjVp10dr1cUqhS_ieFMTVqlFOfKuW7l_tJAYLQtLulJh3H034jQtuIZShSvK-h8';
  const FN = 'https://mkodburhxdrvfacytovb.supabase.co/functions/v1/mc-order-push';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = () => (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  const b64 = s => { const p = '='.repeat((4 - s.length % 4) % 4), r = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from([...r].map(c => c.charCodeAt(0))); };
  async function reg() { return (await navigator.serviceWorker.getRegistration('./')) || navigator.serviceWorker.register('./service-worker.js', { scope: './' }); }
  async function current() { if (!supported()) return null; const r = await navigator.serviceWorker.getRegistration('./'); return r && r.pushManager ? r.pushManager.getSubscription() : null; }
  function device() { const u = navigator.userAgent; return (/android/i.test(u) ? 'Android' : isIOS ? 'iPhone/iPad' : /mac/i.test(u) ? 'Mac' : /windows/i.test(u) ? 'Windows' : 'Device') + ' · ' + (/edg\//i.test(u) ? 'Edge' : /chrome/i.test(u) ? 'Chrome' : /safari/i.test(u) ? 'Safari' : /firefox/i.test(u) ? 'Firefox' : 'Browser'); }
  async function enable(bizId) {
    if (!supported()) throw Error(isIOS && !standalone() ? 'On iPhone: tap Share → “Add to Home Screen”, open Raffi from the new icon, then turn alerts on there.' : 'This browser cannot show notifications. Use Chrome on Android or a computer.');
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') throw Error('Notifications are blocked. Allow notifications for myraffi.com in the browser settings, then try again.');
    const r = await reg(); await Promise.race([navigator.serviceWorker.ready, new Promise((_, no) => setTimeout(() => no(Error('Could not start notifications on this browser. Reload the page and try again.')), 10000))]);
    const sub = (await r.pushManager.getSubscription()) || await r.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(VAPID) });
    const res = await MC.sb.rpc('mc_saas_save_push_subscription', { p_business_id: bizId, p_sub: sub.toJSON(), p_device: device() });
    if (res.error) throw res.error;
    return sub;
  }
  async function disable() { const s = await current(); if (!s) return; try { await MC.sb.rpc('mc_saas_remove_push_subscription', { p_endpoint: s.endpoint }); } catch (_) {} await s.unsubscribe(); }
  async function test(bizId) {
    const { data } = await MC.sb.auth.getSession(); const tok = data && data.session && data.session.access_token;
    if (!tok) throw Error('Your session expired — sign out and sign in again.');
    // make sure THIS device is registered for the signed-in account (heals a phone that shows ON but was never saved)
    try { const s = await current(); if (s && bizId) await MC.sb.rpc('mc_saas_save_push_subscription', { p_business_id: bizId, p_sub: s.toJSON(), p_device: device() }); } catch (_) {}
    const r = await fetch(FN, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + tok, apikey: MC.publishableKey }, body: JSON.stringify({ action: 'test', business_id: bizId, from: /platform-admin/.test(location.pathname) ? 'hq' : 'shop' }) });
    const j = await r.json().catch(() => ({})); if (!r.ok) throw Error(j.error || 'Test failed'); return j;
  }
  // a short "ding-dong" when an order arrives while the page is open
  function ring() { try { const A = new (window.AudioContext || window.webkitAudioContext)(); [[880, 0], [660, .22], [880, .5], [660, .72]].forEach(([f, t]) => { const o = A.createOscillator(), g = A.createGain(); o.frequency.value = f; o.type = 'sine'; g.gain.setValueAtTime(.0001, A.currentTime + t); g.gain.exponentialRampToValueAtTime(.35, A.currentTime + t + .02); g.gain.exponentialRampToValueAtTime(.0001, A.currentTime + t + .2); o.connect(g).connect(A.destination); o.start(A.currentTime + t); o.stop(A.currentTime + t + .22); }); } catch (_) {} }
  if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', e => { if (e.data && e.data.type === 'mc-new-order') { ring(); document.dispatchEvent(new CustomEvent('mc:new-order', { detail: e.data })); } });

  async function mount(el, getBiz) {
    if (!el) return;
    const draw = async (msg, bad) => {
      let on = false; try { on = !!(await current()) && Notification.permission === 'granted'; } catch (_) {}
      el.innerHTML = `<div class="mc-alerts ${on ? 'on' : ''}"><div class="mc-alerts-ic">${on ? '🔔' : '🔕'}</div><div class="mc-alerts-tx"><b>${on ? 'Order alerts are ON on this device' : 'Get a ring for every new order'}</b><small>${on ? 'Your phone or computer rings when a customer sends an order — even when Raffi is closed.' : 'Turn this on on the phone you keep with you. Do it once on each phone or computer.'}</small>${msg ? `<small class="${bad ? 'bad' : 'ok'}">${esc(msg)}</small>` : ''}</div><div class="mc-alerts-btns">${on ? '<button type="button" class="btn" data-al="test">Send a test</button><button type="button" class="btn ghost" data-al="off">Turn off</button>' : '<button type="button" class="btn primary" data-al="on">🔔 Turn on order alerts</button>'}</div></div>`;
    };
    el.onclick = async e => {
      const b = e.target.closest('[data-al]'); if (!b) return; b.disabled = true;
      try {
        if (b.dataset.al === 'on') { await enable(getBiz()); await draw('✓ Done. Press “Send a test” to hear it.'); }
        else if (b.dataset.al === 'off') { await disable(); await draw('Alerts turned off on this device.'); }
        else { const r = await test(getBiz()); await draw(r.sent ? '✓ Test sent to ' + r.sent + ' device' + (r.sent === 1 ? '' : 's') + ' — it should ring in a few seconds.' : 'No device received it. Turn alerts off and on again.', !r.sent); }
      } catch (err) { await draw(err.message || String(err), true); }
    };
    await draw();
  }
  window.MCAlerts = { mount, enable, disable, test, ring, supported };
})();
