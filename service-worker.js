const CACHE_NAME = 'my-catalogue-pro-v45';
const APP_SHELL = ['./', './admin.html', './index.html', './orders.html', './quotation.html', './driver-tracking.html', './platform-admin.html', './saas.js', './theme.css', './storefront.css', './admin-pro.js', './photo-studio.js', './photo-match.js', './excel-columns.js', './ai-pro.js', './templates.js', './layouts.js', './banner.js', './banner-admin.js', './sales.js', './sale-admin.js', './stock.js', './stock-admin.js', './pieces-admin.js', './quote.js', './shop-plus.js', './shop-admin.js', './shop-admin.css', './import-undo.js', './catalogue-transfer.js', './scan.js', './ai-cutout.js', './restaurant.js', './pos.html', './pos.css', './pos.webmanifest', './pos-core.js', './pos-print.js', './pos-sell.js', './pos-office.js', './pos-reports.js', './pos-stock.js', './templates.css', './design-studio.js', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-maskable-512.png', './raffi-mark.svg', './alerts.js', './welcome.html', './platform-admin.html', './platform.webmanifest', './icon-hq-192.png', './icon-hq-512.png'];
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL).catch(()=>{}))); self.skipWaiting(); });
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))).then(()=>self.clients.claim())); });
const CDN_HOSTS = ['cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];
self.addEventListener('fetch', event => { const req=event.request; if(req.method==='GET' && CDN_HOSTS.includes(new URL(req.url).hostname)){ event.respondWith(caches.open(CACHE_NAME).then(c=>c.match(req).then(hit=>{ const net=fetch(req).then(res=>{ if(res.ok||res.type==='opaque') c.put(req,res.clone()); return res; }).catch(()=>hit); return hit||net; }))); return; }
  if(req.method!=='GET' || new URL(req.url).origin!==self.location.origin) return; event.respondWith(fetch(req).then(res=>{if(res.ok && res.status===200 && !/\.(mp4|webm)(\?|$)/.test(req.url) && !req.url.includes('/rest/v1/') && !req.url.includes('/auth/v1/')){const copy=res.clone();caches.open(CACHE_NAME).then(c=>c.put(req,copy));}return res;}).catch(()=>caches.match(req).then(cached=>cached||(req.mode==='navigate'?caches.match('./index.html'):Promise.reject(new Error('Offline resource unavailable')))))); });

// Raffi order alerts (Web Push)
self.addEventListener('push', event => {
  let d = {}; try { d = event.data ? event.data.json() : {}; } catch (_) { d = { title: 'Raffi', body: event.data ? event.data.text() : '' }; }
  const title = d.title || '🛎️ New order', url = new URL(d.url || './orders.html', self.registration.scope).href;
  event.waitUntil(Promise.all([
    self.registration.showNotification(title, { body: d.body || '', tag: d.tag || 'raffi-order', renotify: true, requireInteraction: true, icon: './icon-192.png', badge: './icon-192.png', vibrate: [300, 120, 300, 120, 600], data: { url } }),
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => list.forEach(c => c.postMessage({ type: 'mc-new-order', title, body: d.body || '' })))
  ]));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || new URL('./orders.html', self.registration.scope).href;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const hit = list.find(c => c.url.split('#')[0] === url.split('#')[0]);
    if (hit) return hit.focus();
    return self.clients.openWindow(url);
  }));
});
