/* My Catalogue — admin editor for the moving storefront banner. v13 */
(() => {
  const $ = id => document.getElementById(id);
  if (!$('bnCard')) return;
  const A = () => window.MCAdmin || {};
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = (m, e) => (A().setStatus ? A().setStatus(m, e) : alert(m));
  const MAX = 20, MAX_MB = 15, MAX_SEC = 30;
  let st = null, saved = '', videoFile = null, videoBlob = '', busy = false;

  const snapshot = () => JSON.stringify([st.mode, st.ids, st.headline, st.video, !!videoFile]);
  const prod = id => (A().products || []).find(p => p.id === id);
  const thumb = p => p && p.image ? `<img src="${esc(p.image)}" alt="" loading="lazy">` : '<span class="ph">no photo</span>';

  function load() {
    const b = A().biz; if (!b) return;
    st = { mode: b.banner_mode || 'auto', ids: (b.banner_product_ids || []).slice(), headline: b.banner_headline || '', video: b.banner_video_url || '' };
    videoFile = null; if (videoBlob) URL.revokeObjectURL(videoBlob); videoBlob = '';
    saved = snapshot();
    document.querySelectorAll('input[name=bnMode]').forEach(r => { r.checked = r.value === st.mode; });
    $('bnHeadline').value = st.headline;
    render();
  }
  function render() {
    if (!st) return;
    $('bnPicker').classList.toggle('hidden', st.mode !== 'manual');
    const chosen = st.ids.map(prod).filter(Boolean);
    $('bnCount').textContent = `(${chosen.length}/${MAX})`;
    $('bnChosen').innerHTML = chosen.map((p, i) => `<div class="bn-item">${thumb(p)}<div style="min-width:0"><b>${i + 1}. ${esc(p.name)}</b><small>${p.image ? esc(p.category || '') : '⚠️ Needs a photo to appear in the banner'}</small></div><div class="acts"><button type="button" data-bn-up="${i}" aria-label="Move up" ${i ? '' : 'disabled'}>↑</button><button type="button" data-bn-down="${i}" aria-label="Move down" ${i < chosen.length - 1 ? '' : 'disabled'}>↓</button><button type="button" data-bn-del="${esc(p.id)}" aria-label="Remove">✕</button></div></div>`).join('');
    results();
    const v = videoBlob || st.video;
    $('bnVideo').classList.toggle('hidden', !v); $('bnVideoEmpty').classList.toggle('hidden', !!v);
    if (v && $('bnVideo').getAttribute('src') !== v) $('bnVideo').setAttribute('src', v);
    if (!v) $('bnVideo').removeAttribute('src');
    $('bnVideoRemove').disabled = !v;
    $('bnSave').disabled = busy || snapshot() === saved;
    preview();
  }
  function results() {
    const q = $('bnSearch').value.trim().toLowerCase();
    const list = (A().products || []).filter(p => !st.ids.includes(p.id) && (!q || [p.name, p.sku, p.barcode, p.category].join(' ').toLowerCase().includes(q)))
      .sort((a, b) => (b.image ? 1 : 0) - (a.image ? 1 : 0)).slice(0, 30);
    $('bnResults').innerHTML = list.map(p => `<div class="bn-item">${thumb(p)}<div style="min-width:0"><b>${esc(p.name)}</b><small>${esc(p.category || '')}${p.image ? '' : ' · no photo'}</small></div><div class="acts"><button type="button" class="add" data-bn-add="${esc(p.id)}" ${st.ids.length >= MAX ? 'disabled' : ''}>Add</button></div></div>`).join('') || '<p class="hint">No matching products.</p>';
  }
  function preview() {
    const f = $('dsFrame'); if (!f || !f.contentWindow) return;
    try { f.contentWindow.postMessage({ type: 'mc-banner', banner: { banner_mode: st.mode, banner_product_ids: st.ids, banner_headline: st.headline, banner_video_url: videoBlob || st.video } }, location.origin); } catch (_) { }
  }

  document.querySelectorAll('input[name=bnMode]').forEach(r => r.addEventListener('change', () => { st.mode = r.value; render(); }));
  $('bnHeadline').addEventListener('input', () => { st.headline = $('bnHeadline').value; render(); });
  $('bnSearch').addEventListener('input', results);
  $('bnResults').addEventListener('click', e => { const b = e.target.closest('[data-bn-add]'); if (!b || st.ids.length >= MAX) return; st.ids.push(b.dataset.bnAdd); render(); });
  $('bnChosen').addEventListener('click', e => {
    const up = e.target.closest('[data-bn-up]'), dn = e.target.closest('[data-bn-down]'), del = e.target.closest('[data-bn-del]');
    const ids = st.ids.filter(id => prod(id));
    if (up) { const i = +up.dataset.bnUp;[ids[i - 1], ids[i]] = [ids[i], ids[i - 1]]; st.ids = ids; }
    if (dn) { const i = +dn.dataset.bnDown;[ids[i + 1], ids[i]] = [ids[i], ids[i + 1]]; st.ids = ids; }
    if (del) st.ids = st.ids.filter(id => id !== del.dataset.bnDel);
    render();
  });
  $('bnVideoFile').addEventListener('change', async () => {
    const f = $('bnVideoFile').files[0]; $('bnVideoFile').value = ''; if (!f) return;
    if (!/^video\/(mp4|webm|quicktime)$/.test(f.type)) return toast('Please choose an MP4, WebM or MOV video.', true);
    if (f.size > MAX_MB * 1048576) return toast(`This video is ${(f.size / 1048576).toFixed(1)} MB. The limit is ${MAX_MB} MB — trim it or export at a smaller size.`, true);
    const url = URL.createObjectURL(f);
    const sec = await new Promise(res => { const v = document.createElement('video'); v.preload = 'metadata'; v.onloadedmetadata = () => res(v.duration); v.onerror = () => res(NaN); v.src = url; });
    if (Number.isFinite(sec) && sec > MAX_SEC + 0.5) { URL.revokeObjectURL(url); return toast(`This video is ${Math.round(sec)} seconds. Please use a video of ${MAX_SEC} seconds or less.`, true); }
    if (videoBlob) URL.revokeObjectURL(videoBlob);
    videoFile = f; videoBlob = url;
    $('bnVideoNote').textContent = `${f.name} · ${(f.size / 1048576).toFixed(1)} MB${Number.isFinite(sec) ? ' · ' + Math.round(sec) + ' s' : ''} — press Save banner to publish it.`;
    render();
  });
  $('bnVideoRemove').addEventListener('click', () => { if (videoBlob) URL.revokeObjectURL(videoBlob); videoBlob = ''; videoFile = null; st.video = ''; $('bnVideoNote').textContent = ''; render(); });

  $('bnSave').addEventListener('click', async () => {
    const b = A().biz; if (!b || busy) return;
    busy = true; $('bnSave').disabled = true; $('bnSave').textContent = 'Saving…';
    try {
      if (st.mode === 'manual' && !st.ids.some(id => (prod(id) || {}).image)) throw Error('Add at least one product with a photo, or choose Automatic.');
      let video = st.video;
      if (videoFile) {
        const ext = videoFile.type === 'video/webm' ? 'webm' : videoFile.type === 'video/quicktime' ? 'mov' : 'mp4';
        const path = `${b.id}/banner-${Date.now()}.${ext}`;
        $('bnVideoNote').textContent = 'Uploading video…';
        const up = await MC.sb.storage.from('mc-saas-videos').upload(path, videoFile, { contentType: videoFile.type, upsert: false });
        if (up.error) throw up.error;
        video = MC.sb.storage.from('mc-saas-videos').getPublicUrl(path).data.publicUrl;
      }
      const ids = st.ids.filter(id => prod(id));
      const r = await MC.sb.rpc('mc_saas_update_banner', { p_business_id: b.id, p_mode: st.mode, p_product_ids: ids, p_video_url: video || '', p_headline: st.headline.trim() });
      if (r.error) throw r.error;
      Object.assign(b, { banner_mode: st.mode, banner_product_ids: ids, banner_video_url: video || null, banner_headline: st.headline.trim() || null });
      if (videoBlob) URL.revokeObjectURL(videoBlob);
      videoBlob = ''; videoFile = null; st.video = video || ''; st.ids = ids; saved = snapshot();
      $('bnVideoNote').textContent = video ? 'Video is live on your catalogue.' : '';
      toast('✅ Banner saved. Your customers see it now.');
    } catch (e) { toast('Could not save the banner: ' + (e.message || e), true); $('bnVideoNote').textContent = ''; }
    busy = false; $('bnSave').textContent = 'Save banner'; render();
  });

  window.addEventListener('message', e => { if (e.origin === location.origin && e.data && e.data.type === 'mc-preview-ready' && st) setTimeout(preview, 300); });
  document.addEventListener('mc:ready', load);
  const prevHook = window.mcPageHooks && window.mcPageHooks.design;
  if (window.mcPageHooks) window.mcPageHooks.design = () => { if (prevHook) prevHook(); if (!st || snapshot() === saved) load(); };
  if (A().biz) load();
})();
