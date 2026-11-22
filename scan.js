/* My Catalogue — barcode scanner (v22).
   MCScan.open({ title, onCode }) shows a full-screen camera that reads product barcodes.
   Uses the phone's built-in BarcodeDetector (Android Chrome) and falls back to ZXing (iPhone / others).
   A text box also accepts typed barcodes or a USB / Bluetooth scanner, or part of a product name. */
(() => {
  const ZXING = 'https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js';
  const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'code_93', 'itf', 'codabar', 'qr_code'];
  let ui = null, stream = null, timer = null, zx = null, last = '', lastAt = 0, opts = {};

  const norm = v => String(v ?? '').replace(/\s+/g, '').replace(/^0+(?=\d)/, '').toUpperCase();
  function load(src) { return new Promise((ok, no) => { if (window.ZXing) return ok(); const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => no(Error('Could not load the scanner')); document.head.appendChild(s); }); }
  function beep() { try { const a = new (window.AudioContext || window.webkitAudioContext)(), o = a.createOscillator(), g = a.createGain(); o.frequency.value = 1400; g.gain.value = .08; o.connect(g); g.connect(a.destination); o.start(); setTimeout(() => { o.stop(); a.close(); }, 120); } catch (_) {} if (navigator.vibrate) navigator.vibrate(60); }

  function build() {
    ui = document.createElement('div'); ui.className = 'mcs'; ui.innerHTML = `
      <div class="mcs-top"><b id="mcsTitle">Scan a barcode</b><button type="button" id="mcsClose">✕ Close</button></div>
      <div class="mcs-cam"><video id="mcsVideo" playsinline muted autoplay></video><div class="mcs-frame"><i></i></div><div class="mcs-msg" id="mcsMsg">Point the camera at the barcode</div></div>
      <form class="mcs-type" id="mcsForm"><input id="mcsInput" inputmode="search" autocomplete="off" placeholder="Or type the barcode / part of the name"><button type="submit">Go</button></form>
      <div class="mcs-hint" id="mcsHint"></div>`;
    document.body.appendChild(ui);
    ui.querySelector('#mcsClose').onclick = () => close(true);
    ui.querySelector('#mcsForm').onsubmit = e => { e.preventDefault(); const v = ui.querySelector('#mcsInput').value.trim(); if (v) { ui.querySelector('#mcsInput').value = ''; found(v, true); } };
  }
  function msg(t, kind) { const m = ui && ui.querySelector('#mcsMsg'); if (m) { m.textContent = t; m.className = 'mcs-msg' + (kind ? ' ' + kind : ''); } }
  function found(code, typed) {
    const now = Date.now(); if (!typed && code === last && now - lastAt < 2500) return; last = code; lastAt = now;
    if (!typed) beep();
    const r = opts.onCode && opts.onCode(code, typed);
    if (r === false) msg((typed ? '“' + code + '”' : 'Barcode ' + code) + ' is not in your products. Try another.', 'bad');
  }
  async function start() {
    const video = ui.querySelector('#mcsVideo');
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    } catch (e) { msg('Camera not available (' + (e.name === 'NotAllowedError' ? 'permission refused' : e.message) + '). Type the barcode below.', 'bad'); return; }
    video.srcObject = stream; await video.play().catch(() => {});
    let native = null;
    if ('BarcodeDetector' in window) { try { const ok = await BarcodeDetector.getSupportedFormats(); native = new BarcodeDetector({ formats: FORMATS.filter(f => ok.includes(f)) }); } catch (_) { native = null; } }
    if (native) {
      const tick = async () => { if (!stream) return; try { if (video.readyState >= 2) { const r = await native.detect(video); if (r && r[0] && r[0].rawValue) found(r[0].rawValue); } } catch (_) {} timer = setTimeout(tick, 180); };
      tick(); return;
    }
    try {
      await load(ZXING);
      const hints = new Map(); hints.set(ZXing.DecodeHintType.TRY_HARDER, true);
      zx = new ZXing.MultiFormatReader(); zx.setHints(hints);
      const cv = document.createElement('canvas'), cx = cv.getContext('2d', { willReadFrequently: true });
      const tick = () => {
        if (!stream) return;
        if (video.readyState >= 2 && video.videoWidth) {
          const w = Math.min(960, video.videoWidth), h = Math.round(video.videoHeight * w / video.videoWidth);
          cv.width = w; cv.height = h; cx.drawImage(video, 0, 0, w, h);
          try { const r = zx.decode(new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(new ZXing.HTMLCanvasElementLuminanceSource(cv)))); if (r) found(r.getText()); } catch (_) { /* nothing found in this frame */ }
        }
        timer = setTimeout(tick, 220);
      };
      tick();
    } catch (e) { msg('Scanner could not start: ' + e.message + '. Type the barcode below.', 'bad'); }
  }
  function stop() {
    clearTimeout(timer); timer = null;
    zx = null;
    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
  }
  function close(user) { stop(); if (ui) ui.hidden = true; document.body.classList.remove('mcs-open'); if (user && opts.onClose) opts.onClose(); }
  function open(o) {
    opts = o || {}; if (!ui) build();
    ui.hidden = false; document.body.classList.add('mcs-open'); last = '';
    ui.querySelector('#mcsTitle').textContent = opts.title || 'Scan a barcode';
    ui.querySelector('#mcsHint').innerHTML = opts.hint || '';
    msg('Point the camera at the barcode'); start();
  }
  window.MCScan = { open, close: () => close(false), norm, msg: (t, k) => msg(t, k) };
})();
