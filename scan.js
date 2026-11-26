/* Raffi — barcode scanner (v23, sharper for small barcodes).
   MCScan.open({ title, hint, onCode, onClose }) shows a full-screen camera that reads product barcodes.
   • asks for a high-resolution back camera with continuous autofocus; tap the picture to re-focus
   • zoom buttons (1× 1.5× 2× 3×): real camera zoom when the phone allows it, otherwise a digital zoom
     that also makes the decoder look closer — small barcodes: zoom 2× and hold the phone a bit further back
   • 🔦 torch when the phone has one
   • every frame is read twice: the whole view and an enlarged crop of the green box
   Uses BarcodeDetector (Android Chrome) and falls back to ZXing (iPhone / others).
   A text box also accepts typed barcodes or a USB / Bluetooth scanner, or part of a product name. */
(() => {
  const ZXING = 'https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js';
  const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'code_93', 'itf', 'codabar', 'qr_code', 'data_matrix'];
  const ZOOMS = [1, 1.5, 2, 3];
  let ui = null, stream = null, track = null, caps = {}, timer = null, zx = null, last = '', lastAt = 0, opts = {}, zoom = 1, hwZoom = false, torch = false, tick = 0;
  const cv = document.createElement('canvas'), cx = cv.getContext('2d', { willReadFrequently: true });

  const norm = v => String(v ?? '').replace(/\s+/g, '').replace(/^0+(?=\d)/, '').toUpperCase();
  const ar = () => document.documentElement.dir === 'rtl' || document.documentElement.lang === 'ar';
  const L = (en, a) => (ar() ? a : en);
  function load(src) { return new Promise((ok, no) => { if (window.ZXing) return ok(); const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => no(Error('Could not load the scanner')); document.head.appendChild(s); }); }
  function beep() { try { const a = new (window.AudioContext || window.webkitAudioContext)(), o = a.createOscillator(), g = a.createGain(); o.frequency.value = 1400; g.gain.value = .08; o.connect(g); g.connect(a.destination); o.start(); setTimeout(() => { o.stop(); a.close(); }, 120); } catch (_) {} if (navigator.vibrate) navigator.vibrate(60); }

  function css() {
    if (document.getElementById('mcsCss2')) return;
    const s = document.createElement('style'); s.id = 'mcsCss2';
    s.textContent = '.mcs-cam video{transform-origin:50% 50%;transition:transform .15s}' +
      '.mcs-tools{position:absolute;top:10px;left:0;right:0;display:flex;justify-content:center;gap:6px;flex-wrap:wrap;padding:0 8px;z-index:2}' +
      '.mcs-tools button{border:0;border-radius:999px;min-width:46px;height:40px;padding:0 12px;font-weight:800;font-size:15px;background:rgba(0,0,0,.55);color:#fff;backdrop-filter:blur(4px)}' +
      '.mcs-tools button.on{background:#22c55e;color:#06210f}.mcs-tools .sep{width:8px}' +
      '.mcs-focus{position:absolute;width:70px;height:70px;margin:-35px 0 0 -35px;border:2px solid #fde047;border-radius:12px;pointer-events:none;opacity:0;transition:opacity .3s}' +
      '.mcs-tip{position:absolute;left:12px;right:12px;bottom:64px;text-align:center;font-size:13px;font-weight:700;color:#e2e8f0;text-shadow:0 1px 3px #000;pointer-events:none}';
    document.head.appendChild(s);
  }
  function build() {
    css();
    ui = document.createElement('div'); ui.className = 'mcs'; ui.innerHTML = `
      <div class="mcs-top"><b id="mcsTitle">Scan a barcode</b><button type="button" id="mcsClose">✕ ${L('Close', 'سكّر')}</button></div>
      <div class="mcs-cam" id="mcsCam"><video id="mcsVideo" playsinline muted autoplay></video><div class="mcs-frame"><i></i></div>
        <div class="mcs-tools" id="mcsTools">${ZOOMS.map(z => `<button type="button" data-z="${z}">${z}×</button>`).join('')}<span class="sep"></span><button type="button" id="mcsTorch" hidden>🔦</button></div>
        <div class="mcs-focus" id="mcsFocus"></div>
        <div class="mcs-tip" id="mcsTip">${L('Small barcode? Tap 2× and hold the phone a bit further back. Tap the picture to focus.', 'باركود زغير؟ كبوس 2× وبعّد التلفون شوي. كبوس عالصورة ليركّز.')}</div>
        <div class="mcs-msg" id="mcsMsg">Point the camera at the barcode</div></div>
      <form class="mcs-type" id="mcsForm"><input id="mcsInput" inputmode="search" autocomplete="off" placeholder="${L('Or type the barcode / part of the name', 'أو اكتب الباركود / جزء من الاسم')}"><button type="submit">Go</button></form>
      <div class="mcs-hint" id="mcsHint"></div>`;
    document.body.appendChild(ui);
    ui.querySelector('#mcsClose').onclick = () => close(true);
    ui.querySelector('#mcsForm').onsubmit = e => { e.preventDefault(); const v = ui.querySelector('#mcsInput').value.trim(); if (v) { ui.querySelector('#mcsInput').value = ''; found(v, true); } };
    ui.querySelector('#mcsTools').onclick = e => {
      const zb = e.target.closest('[data-z]'); if (zb) { setZoom(Number(zb.dataset.z)); try { localStorage.setItem('mcs-zoom', zb.dataset.z); } catch (_) {} return; }
      if (e.target.closest('#mcsTorch')) setTorch(!torch);
    };
    ui.querySelector('#mcsVideo').addEventListener('click', focusAt);
  }
  function msg(t, kind) { const m = ui && ui.querySelector('#mcsMsg'); if (m) { m.textContent = t; m.className = 'mcs-msg' + (kind ? ' ' + kind : ''); } }
  function found(code, typed) {
    const now = Date.now(); if (!typed && code === last && now - lastAt < 2500) return; last = code; lastAt = now;
    if (!typed) beep();
    const r = opts.onCode && opts.onCode(code, typed);
    if (r === false) msg((typed ? '“' + code + '”' : 'Barcode ' + code) + ' is not in your products. Try another.', 'bad');
  }

  /* ---- camera controls ---- */
  async function apply(c) { try { await track.applyConstraints({ advanced: [c] }); return true; } catch (_) { return false; } }
  async function setZoom(z) {
    zoom = z; const v = ui.querySelector('#mcsVideo');
    ui.querySelectorAll('[data-z]').forEach(b => b.classList.toggle('on', Number(b.dataset.z) === z));
    hwZoom = false;
    if (track && caps.zoom && caps.zoom.max > 1) {
      const zz = Math.max(caps.zoom.min || 1, Math.min(caps.zoom.max, z));
      hwZoom = await apply({ zoom: zz });
    }
    v.style.transform = hwZoom ? '' : `scale(${z})`;
  }
  async function setTorch(on) { if (!track || !caps.torch) return; if (await apply({ torch: on })) { torch = on; ui.querySelector('#mcsTorch').classList.toggle('on', on); } }
  async function focusAt(e) {
    const f = ui.querySelector('#mcsFocus'), box = ui.querySelector('#mcsCam').getBoundingClientRect();
    f.style.left = (e.clientX - box.left) + 'px'; f.style.top = (e.clientY - box.top) + 'px'; f.style.opacity = '1'; setTimeout(() => { f.style.opacity = '0'; }, 700);
    if (!track) return;
    const modes = caps.focusMode || [];
    const poi = { x: (e.clientX - box.left) / box.width, y: (e.clientY - box.top) / box.height };
    if (modes.includes('single-shot')) { await apply(caps.pointsOfInterest ? { focusMode: 'single-shot', pointsOfInterest: [poi] } : { focusMode: 'single-shot' }); setTimeout(() => { if (modes.includes('continuous')) apply({ focusMode: 'continuous' }); }, 1500); }
    else if (modes.includes('continuous')) await apply({ focusMode: 'continuous' });
  }

  /* ---- what to read: the visible view, or an enlarged crop of the green box ---- */
  function grab(video, mode) {   // mode 0 = whole view, 1 = green box, 2 = centre, enlarged 3×
    const tight = mode > 0;
    const vw = video.videoWidth, vh = video.videoHeight; if (!vw || !vh) return null;
    const d = hwZoom ? 1 : zoom;                         // digital zoom = look at the middle only
    let w = vw / d, h = vh / d;
    if (mode === 1) { w *= 0.86; h *= 0.42; }            // the green box area
    if (mode === 2) { w *= 0.5; h *= 0.25; }             // a small barcode in the middle
    const sx = (vw - w) / 2, sy = (vh - h) / 2;
    const outW = Math.round(Math.min(1800, Math.max(mode === 2 ? w * 3 : tight ? 1200 : 960, w))), outH = Math.round(h * outW / w);
    cv.width = outW; cv.height = outH;
    cx.imageSmoothingEnabled = true; cx.imageSmoothingQuality = 'high';
    cx.drawImage(video, sx, sy, w, h, 0, 0, outW, outH);
    return cv;
  }
  async function start() {
    const video = ui.querySelector('#mcsVideo');
    const want = { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } };
    try { stream = await navigator.mediaDevices.getUserMedia({ video: Object.assign({}, want, { advanced: [{ focusMode: 'continuous' }] }), audio: false }); }
    catch (e) {
      try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false }); }
      catch (e2) { msg('Camera not available (' + (e2.name === 'NotAllowedError' ? 'permission refused' : e2.message) + '). Type the barcode below.', 'bad'); ui.querySelector('#mcsTools').hidden = true; return; }
    }
    track = stream.getVideoTracks()[0]; caps = (track.getCapabilities && track.getCapabilities()) || {};
    if ((caps.focusMode || []).includes('continuous')) apply({ focusMode: 'continuous' });
    ui.querySelector('#mcsTorch').hidden = !caps.torch;
    video.srcObject = stream; await video.play().catch(() => {});
    let z = 1; try { z = Number(localStorage.getItem('mcs-zoom')) || 1; } catch (_) {}
    await setZoom(ZOOMS.includes(z) ? z : 1);

    let native = null;
    if ('BarcodeDetector' in window) { try { const ok = await BarcodeDetector.getSupportedFormats(); native = new BarcodeDetector({ formats: FORMATS.filter(f => ok.includes(f)) }); } catch (_) { native = null; } }
    if (native) {
      const run = async () => {
        if (!stream) return;
        try {
          if (video.readyState >= 2) {
            const src = grab(video, tick++ % 3);
            const r = src ? await native.detect(src) : null;
            if (r && r[0] && r[0].rawValue) found(r[0].rawValue);
          }
        } catch (_) {}
        timer = setTimeout(run, 110);
      };
      run(); return;
    }
    try {
      await load(ZXING);
      const hints = new Map(); hints.set(ZXing.DecodeHintType.TRY_HARDER, true);
      const F = ZXing.BarcodeFormat; hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E, F.CODE_128, F.CODE_39, F.CODE_93, F.ITF, F.CODABAR, F.QR_CODE, F.DATA_MATRIX].filter(x => x !== undefined));
      zx = new ZXing.MultiFormatReader(); zx.setHints(hints);
      const run = () => {
        if (!stream) return;
        if (video.readyState >= 2 && video.videoWidth) {
          const n = tick++, src = grab(video, n % 3);
          if (src) {
            const lum = new ZXing.HTMLCanvasElementLuminanceSource(src);
            const bin = n % 6 >= 3 ? new ZXing.GlobalHistogramBinarizer(lum) : new ZXing.HybridBinarizer(lum);
            try { const r = zx.decode(new ZXing.BinaryBitmap(bin)); if (r) found(r.getText()); } catch (_) { /* nothing in this frame */ }
          }
        }
        timer = setTimeout(run, 140);
      };
      run();
    } catch (e) { msg('Scanner could not start: ' + e.message + '. Type the barcode below.', 'bad'); }
  }
  function stop() {
    clearTimeout(timer); timer = null; zx = null; torch = false;
    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
    track = null; caps = {};
    if (ui) { ui.querySelector('#mcsTorch').classList.remove('on'); ui.querySelector('#mcsTools').hidden = false; }
  }
  function close(user) { stop(); if (ui) ui.hidden = true; document.body.classList.remove('mcs-open'); if (user && opts.onClose) opts.onClose(); }
  function open(o) {
    opts = o || {}; if (!ui) build();
    ui.hidden = false; document.body.classList.add('mcs-open'); last = '';
    ui.querySelector('#mcsTitle').textContent = opts.title || 'Scan a barcode';
    ui.querySelector('#mcsHint').innerHTML = opts.hint || '';
    msg(L('Point the camera at the barcode', 'وجّه الكاميرا عالباركود')); start();
  }
  window.MCScan = { open, close: () => close(false), norm, msg: (t, k) => msg(t, k) };
})();
