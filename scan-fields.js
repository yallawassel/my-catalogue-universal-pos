/* Raffi — camera button for every barcode box (v1).
   Adds a 📷 button next to every input that takes a barcode (found by its id, name, placeholder,
   label or data-scan="1"); new inputs added later are picked up too. Tap → camera (MCScan) → the code
   is typed into the box. A USB / Bluetooth barcode machine keeps working as before: it types into
   the box; its final Enter no longer submits a form by mistake in plain barcode boxes. */
(function () {
  'use strict';
  const RX = /barcode|bar code|باركود|\bean\b|\bgtin\b|\bscan\b/i;
  const ar = () => document.documentElement.dir === 'rtl' || document.documentElement.lang === 'ar';
  function labelText(el) {
    let s = '';
    if (el.id) { const l = document.querySelector('label[for="' + (window.CSS && CSS.escape ? CSS.escape(el.id) : el.id) + '"]'); if (l) s += ' ' + l.textContent; }
    const pl = el.closest('label'); if (pl) s += ' ' + pl.textContent;
    return s;
  }
  function wants(el) {
    if (!(el instanceof HTMLInputElement) || el.dataset.scanDone || el.dataset.noscan != null) return false;
    if (!/^(text|search|tel|number|)$/.test(el.type || '')) return false;
    if (el.closest('.mcs,.mcsh,[data-noscan]')) return false;
    if (el.dataset.scan === '1') return true;
    const hay = [el.id, el.name, el.placeholder, el.getAttribute('aria-label'), el.dataset.field, el.dataset.stockField].join(' ');
    return RX.test(hay) || RX.test(labelText(el));
  }
  function css() {
    if (document.getElementById('mcsfCss')) return;
    const s = document.createElement('style'); s.id = 'mcsfCss';
    s.textContent = '.mcsf{display:flex!important;align-items:stretch;gap:6px;width:100%;min-width:0}.mcsf>input{flex:1 1 auto;min-width:0;width:auto!important;margin:0}' +
      '.mcsf-b{flex:0 0 auto;border:0;border-radius:10px;min-width:42px;padding:0 10px;font-size:18px;line-height:1;cursor:pointer;background:#0f766e;color:#fff;box-shadow:0 2px 6px rgba(15,118,110,.25)}' +
      '.mcs{position:fixed;inset:0;z-index:9999;background:#0b0b12;color:#fff;display:flex;flex-direction:column}.mcs[hidden]{display:none}body.mcs-open{overflow:hidden}.mcs-top{display:flex;justify-content:space-between;align-items:center;padding:12px 14px;gap:10px}.mcs-top button{border:0;border-radius:10px;padding:9px 13px;background:rgba(255,255,255,.14);color:#fff;font-weight:800}.mcs-cam{position:relative;flex:1;min-height:0;overflow:hidden;background:#000}.mcs-cam video{width:100%;height:100%;object-fit:cover}.mcs-frame{position:absolute;inset:0;display:grid;place-items:center;pointer-events:none}.mcs-frame i{width:78%;max-width:420px;height:32%;max-height:200px;border:3px solid #22c55e;border-radius:16px;box-shadow:0 0 0 2000px rgba(0,0,0,.35)}.mcs-msg{position:absolute;left:12px;right:12px;bottom:14px;text-align:center;font-weight:800;background:rgba(0,0,0,.6);padding:10px;border-radius:12px}.mcs-msg.bad{background:rgba(185,28,28,.85)}.mcs-type{display:flex;gap:8px;padding:12px 14px}.mcs-type input{flex:1;min-width:0;padding:13px;border-radius:12px;border:0;font-size:16px}.mcs-type button{border:0;border-radius:12px;padding:0 18px;font-weight:800;background:#0f766e;color:#fff}.mcs-hint{padding:0 14px 14px;display:flex;flex-wrap:wrap;gap:8px;max-height:30vh;overflow:auto}.mcs-hint b{width:100%}.mcs-hint button{border:0;border-radius:10px;padding:10px 12px;background:#fff;color:#111;font-weight:700;text-align:start}' +
      '.mcsf-b:active{transform:scale(.95)}.mcsf-sm .mcsf-b{min-width:34px;padding:0 7px;font-size:15px;border-radius:8px}';
    document.head.appendChild(s);
  }
  function fire(el, code) {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(el, code);
    el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
    const searchy = el.type === 'search' || /search|scan|find/i.test(el.id + ' ' + el.placeholder);
    if (searchy) ['keydown', 'keyup'].forEach(t => el.dispatchEvent(new KeyboardEvent(t, { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true })));
    el.focus();
  }
  function scan(el) {
    if (!window.MCScan) { alert(ar() ? 'الكاميرا مش جاهزة — حدّث الصفحة.' : 'Scanner not loaded — refresh the page.'); return; }
    MCScan.open({
      title: ar() ? 'امسح الباركود' : 'Scan the barcode',
      hint: ar() ? 'وجّه الكاميرا عالباركود — أو اكتبه تحت.' : 'Point the camera at the barcode — or type it below.',
      onCode: code => { MCScan.close(); fire(el, String(code).trim()); return true; }
    });
  }
  function attach(el) {
    el.dataset.scanDone = '1'; css();
    const wrap = document.createElement('span'); wrap.className = 'mcsf';
    if ((el.offsetHeight && el.offsetHeight < 34) || el.closest('table,.tr')) wrap.classList.add('mcsf-sm');
    const b = document.createElement('button'); b.type = 'button'; b.className = 'mcsf-b'; b.textContent = '📷';
    b.title = ar() ? 'امسح بالكاميرا' : 'Scan with the camera'; b.setAttribute('aria-label', b.title);
    b.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); scan(el); });
    el.parentNode.insertBefore(wrap, el); wrap.appendChild(el); wrap.appendChild(b);
    // A barcode machine ends with Enter: in a plain barcode box inside a form, move on instead of submitting.
    if (el.type !== 'search' && !/search|scan|find/i.test(el.id) && el.form) el.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); const f = [...el.form.elements].filter(x => !x.disabled && x.type !== 'hidden' && x.offsetParent); const n = f[f.indexOf(el) + 1]; if (n && n.focus) n.focus(); } });
  }
  function sweep(root) { (root.querySelectorAll ? root : document).querySelectorAll('input').forEach(el => { if (wants(el)) attach(el); }); }
  let pend = false;
  const mo = new MutationObserver(() => { if (pend) return; pend = true; requestAnimationFrame(() => { pend = false; sweep(document); }); });
  const go = () => { sweep(document); mo.observe(document.body, { childList: true, subtree: true }); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
  window.MCScanFields = { sweep, scan };
})();
