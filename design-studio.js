/* My Catalogue — storefront design studio: template gallery + live catalogue preview. v11 */
(() => {
  const $ = id => document.getElementById(id);
  if (!$('dsGrid') || !window.MCTemplates) return;
  const T = MCTemplates, A = () => window.MCAdmin || {};
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = (m, e) => (A().setStatus ? A().setStatus(m, e) : alert(m));
  let group = 'all', pick = null, color = null, ready = false, loadedFor = '', device = 'phone';

  // Old selects (AI page + hidden legacy select) get every template too.
  const opts = T.list.map(t => `<option value="${t.key}">${esc(t.name)} — ${esc(t.desc.split('.')[0])}</option>`).join('');
  ['aiTemplateSelect', 'catalogueTemplate'].forEach(id => { const s = $(id); if (s) { const v = s.value; s.innerHTML = opts; if (v) s.value = v; } });

  function mock(t) {
    const [bg, head, card] = t.sw, acc = t.color;
    const cols = t.key === 'supermarket' || t.key === 'compact' ? 3 : t.key === 'wholesale' || t.key === 'list' ? 1 : 2;
    const n = cols === 1 ? 3 : cols * 2;
    const light = ['#ffffff', '#fbf6f2'].includes(head.toLowerCase());
    const cells = Array.from({ length: n }, () => `<span style="background:${card};${t.key === 'luxury' || t.key === 'electronics' ? 'border:1px solid ' + acc + '55;' : ''}${cols === 1 ? 'flex-direction:row;align-items:center;justify-content:flex-start' : ''}"></span>`).join('');
    return `<div class="ds-mock" style="background:${bg};--acc:${acc}"><div class="h" style="background:${head === bg && !light ? '#000' : head};${light ? 'border:1px solid #0001' : ''}"><i style="${light ? 'background:#0002' : ''}"></i><b style="${light ? 'background:#0003' : ''}"></b></div><div class="g" style="grid-template-columns:repeat(${cols},1fr)">${cells}</div></div>`;
  }
  function renderGroups() {
    const used = new Set(T.list.map(t => t.group));
    $('dsGroups').innerHTML = Object.entries(T.groups).filter(([k]) => k === 'all' || used.has(k)).map(([k, v]) => `<button type="button" class="ds-chip ${k === group ? 'active' : ''}" data-ds-group="${k}">${esc(v)}</button>`).join('');
  }
  function render() {
    const saved = A().biz?.catalogue_template || 'classic';
    $('dsGrid').innerHTML = T.list.filter(t => group === 'all' || t.group === group).map(t => `<button type="button" class="ds-card ${t.key === pick ? 'active' : ''} ${t.key === saved ? 'saved' : ''}" data-ds-key="${t.key}" aria-pressed="${t.key === pick}">${mock(t)}<div class="ds-info"><div class="ds-name">${t.icon} ${esc(t.name)}</div><div class="ds-desc">${esc(t.desc)}</div></div></button>`).join('');
    const t = T.get(pick), b = A().biz || {};
    const dirty = pick !== (b.catalogue_template || 'classic') || (color || '').toLowerCase() !== (b.primary_color || '').toLowerCase();
    $('dsCurrent').textContent = `Previewing: ${t.name}${dirty ? ' · not saved yet' : ' · this is your live design'}`;
    $('dsSave').disabled = !dirty;
  }
  function send() {
    const f = $('dsFrame');
    try { f.contentWindow && f.contentWindow.postMessage({ type: 'mc-preview', template: pick, color }, location.origin); } catch (_) { }
  }
  function frameUrl() {
    const b = A().biz; if (!b) return '';
    return new URL(`index.html?shop=${encodeURIComponent(b.slug)}&mcpreview=1&tpl=${encodeURIComponent(pick)}&color=${encodeURIComponent(color)}`, location.href).href;
  }
  function fit() {
    const box = $('dsFrameBox'), stage = $('dsStage'); if (!box || !stage.clientWidth) return;
    const w = device === 'phone' ? 395 : 1196, h = device === 'phone' ? 760 : 776;
    const maxH = window.innerWidth < 700 ? 520 : window.innerHeight - 150;
    const s = Math.min(1, stage.clientWidth / w, Math.max(300, maxH) / h);
    box.style.transform = `scale(${s})`; stage.style.height = Math.round(h * s) + 'px';
  }
  function load() {
    const b = A().biz; if (!b) return;
    if (!ready) { pick = b.catalogue_template || 'classic'; color = b.primary_color || T.get(pick).color; $('dsColor').value = color; ready = true; renderGroups(); }
    render();
    $('dsOpen').href = A().businessUrl ? A().businessUrl() : '#';
    if (loadedFor !== b.id) { loadedFor = b.id; $('dsFrame').src = frameUrl(); }
    requestAnimationFrame(fit);
  }

  $('dsGroups').addEventListener('click', e => { const c = e.target.closest('[data-ds-group]'); if (!c) return; group = c.dataset.dsGroup; renderGroups(); render(); });
  $('dsGrid').addEventListener('click', e => {
    const c = e.target.closest('[data-ds-key]'); if (!c) return;
    const b = A().biz || {}, t = T.get(c.dataset.dsKey);
    // A new template brings its recommended colour, unless the business already chose its own colour for this template.
    color = t.key === b.catalogue_template ? (b.primary_color || t.color) : t.color;
    pick = t.key; $('dsColor').value = color; render(); send();
    if (window.innerWidth < 1100) $('dsStage').scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  $('dsColor').addEventListener('input', () => { color = $('dsColor').value; render(); send(); });
  $('dsUseColor').addEventListener('click', () => { color = T.get(pick).color; $('dsColor').value = color; render(); send(); });
  document.querySelectorAll('[data-dev]').forEach(b => b.addEventListener('click', () => {
    device = b.dataset.dev; document.querySelectorAll('[data-dev]').forEach(x => x.classList.toggle('active', x === b));
    $('dsFrameBox').className = 'ds-frame ' + device; fit();
  }));
  $('dsSave').addEventListener('click', async () => {
    const b = A().biz; if (!b) return;
    $('dsSave').disabled = true;
    try {
      const r = await MC.sb.rpc('mc_saas_update_catalogue_design', { p_business_id: b.id, p_template: pick, p_primary_color: color });
      if (r.error) throw r.error;
      b.catalogue_template = pick; b.primary_color = color.toLowerCase();
      if ($('brandColor')) $('brandColor').value = color;
      if ($('aiTemplateSelect')) $('aiTemplateSelect').value = pick;
      render(); toast(`✅ Design saved: ${T.get(pick).name}. Your customers see it now.`);
    } catch (e) { $('dsSave').disabled = false; toast('Could not save the design: ' + (e.message || e), true); }
  });
  window.addEventListener('message', e => { if (e.origin === location.origin && e.data && e.data.type === 'mc-preview-ready') { send(); $('dsNote').textContent = 'Live preview of your real catalogue — tap a template to try it.'; } });
  window.addEventListener('resize', fit);
  $('dsFrame').addEventListener('load', () => { send(); fit(); });

  const hook = () => load();
  if (window.mcPageHooks) window.mcPageHooks.design = hook;
  document.addEventListener('mc:ready', () => { ready = false; loadedFor = ''; if (location.hash === '#design') load(); });
  if (A().biz && location.hash === '#design') load();
})();
