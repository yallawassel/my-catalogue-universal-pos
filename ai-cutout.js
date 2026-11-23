/* My Catalogue — free AI background remover that runs on the device (v24).
   U²-Net small (models/u2netp.onnx, ~4.5 MB, Apache-2.0) on ONNX Runtime Web (WebAssembly).
   First use downloads about 8 MB (cached afterwards); each photo then takes ~1–2 s, no credits, nothing leaves the phone.
   MCCutout.mask(canvas, onStatus) -> Float32Array alpha (0..1) of canvas.width*canvas.height */
(() => {
  const ORT = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.31.1/dist/';
  const MODEL = new URL('models/u2netp.onnx', document.baseURI).href;
  const SIZE = 320, MEAN = [0.485, 0.456, 0.406], STD = [0.229, 0.224, 0.225];
  let session = null, loading = null;

  const loadScript = src => new Promise((ok, no) => {
    if (window.ort) return ok();
    const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => no(new Error('Could not load the AI engine. Check the internet connection.'));
    document.head.appendChild(s);
  });
  async function modelBytes() {
    try {
      const c = await caches.open('mc-ai-models-v1');
      let r = await c.match(MODEL);
      if (!r) { r = await fetch(MODEL); if (!r.ok) throw new Error('model ' + r.status); await c.put(MODEL, r.clone()); }
      return new Uint8Array(await r.arrayBuffer());
    } catch (_) {
      const r = await fetch(MODEL); if (!r.ok) throw new Error('Could not download the AI model (' + r.status + ').');
      return new Uint8Array(await r.arrayBuffer());
    }
  }
  function getSession(onStatus) {
    if (session) return Promise.resolve(session);
    if (!loading) loading = (async () => {
      onStatus && onStatus('Preparing the AI background remover (first time only, about 8 MB)…');
      await loadScript(ORT + 'ort.wasm.min.js');
      ort.env.wasm.wasmPaths = ORT;
      ort.env.wasm.numThreads = (self.crossOriginIsolated && navigator.hardwareConcurrency > 1) ? Math.min(4, navigator.hardwareConcurrency) : 1;
      const bytes = await modelBytes();
      session = await ort.InferenceSession.create(bytes, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
      return session;
    })().catch(e => { loading = null; throw e; });
    return loading;
  }

  async function mask(src, onStatus) {
    const s = await getSession(onStatus);
    onStatus && onStatus('Removing the background with AI…');
    const w = src.width, h = src.height;
    const c = document.createElement('canvas'); c.width = c.height = SIZE;
    const cx = c.getContext('2d', { willReadFrequently: true }); cx.drawImage(src, 0, 0, SIZE, SIZE);
    const px = cx.getImageData(0, 0, SIZE, SIZE).data, n = SIZE * SIZE, input = new Float32Array(3 * n);
    for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) input[k * n + i] = (px[i * 4 + k] / 255 - MEAN[k]) / STD[k];
    const out = await s.run({ [s.inputNames[0]]: new ort.Tensor('float32', input, [1, 3, SIZE, SIZE]) });
    const pred = out[s.outputNames[0]].data;
    let lo = Infinity, hi = -Infinity; for (let i = 0; i < n; i++) { if (pred[i] < lo) lo = pred[i]; if (pred[i] > hi) hi = pred[i]; }
    const m = cx.createImageData(SIZE, SIZE), span = hi - lo || 1;
    for (let i = 0; i < n; i++) { const v = Math.round((pred[i] - lo) / span * 255); m.data[i * 4] = m.data[i * 4 + 1] = m.data[i * 4 + 2] = v; m.data[i * 4 + 3] = 255; }
    cx.putImageData(m, 0, 0);
    const big = document.createElement('canvas'); big.width = w; big.height = h;
    const bx = big.getContext('2d', { willReadFrequently: true }); bx.imageSmoothingQuality = 'high'; bx.drawImage(c, 0, 0, w, h);
    const bd = bx.getImageData(0, 0, w, h).data, alpha = new Float32Array(w * h);
    // sharpen the soft edge a little: 0.15 → 0, 0.85 → 1
    for (let i = 0; i < alpha.length; i++) alpha[i] = Math.min(1, Math.max(0, (bd[i * 4] / 255 - 0.15) / 0.7));
    return alpha;
  }

  window.MCCutout = { mask, preload: getSession, get ready() { return !!session; } };
})();
