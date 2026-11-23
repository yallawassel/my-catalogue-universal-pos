/* My Catalogue — copy photos (and descriptions) from another catalogue's JSON export (v25).
   Example: the old White Pack catalogue has nice photos but different names and no AntiSoft codes.
   Each product in THIS catalogue is matched by meaning (MCMatch: names, sizes like 500cc / 9oz must agree)
   to a product in the file; you review the suggestions, then only the photo (and optionally the
   description / category) is copied. Names, prices, barcodes and stock are never changed.
   Photos are downloaded and stored in this catalogue's own storage, so they keep working if the old site closes. */
(() => {
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const A = () => window.MCAdmin || {}, sb = () => window.MC.sb, biz = () => A().biz;
  const say = (m, err) => (A().setStatus ? A().setStatus(m, err) : alert(m));
  let source = [], rows = [], filter = 'auto', busy = false;

  function panel() {
    const sec = document.querySelector('section[data-page-id="data"]'); if (!sec || $('ctBox')) return;
    const box = document.createElement('div'); box.id = 'ctBox'; box.className = 'sh-card';
    box.innerHTML = `<h3>📸 Copy photos from another catalogue</h3>
      <p class="hint">Upload the JSON export of another catalogue (for example your old White Pack site). Each of your products is matched by its name and size to a product in the file — even when names, barcodes and codes are different. You check the suggestions, then only the photo is copied. Names, prices, barcodes and stock stay as they are.</p>
      <div class="grid"><div><label for="ctFile">Catalogue JSON file</label><input id="ctFile" type="file" accept=".json,application/json"></div>
      <div><label class="sh-check"><input type="checkbox" id="ctOnlyEmpty" checked> Only products that have no photo yet</label>
      <label class="sh-check"><input type="checkbox" id="ctDesc" checked> Also copy the description when mine is empty</label>
      <label class="sh-check"><input type="checkbox" id="ctCat"> Also use the category of the old catalogue</label></div></div>
      <div id="ctResult"></div>`;
    sec.appendChild(box);
    $('ctFile').onchange = load;
    ['ctOnlyEmpty'].forEach(id => $(id).onchange = () => source.length && analyse());
  }

  async function load() {
    const f = $('ctFile').files[0]; if (!f) return;
    try {
      const d = JSON.parse(await f.text());
      const list = Array.isArray(d) ? d : (d.products || d.items || []);
      source = list.map(p => ({ name: String(p.name || p.title || '').trim(), photo: String(p.photo || p.image || p.image_url || p.imageUrl || '').trim(), description: String(p.description || '').trim(), category: String(p.category || '').trim() }))
        .filter(p => p.name && /^https?:\/\//i.test(p.photo));
      if (!source.length) throw Error('No products with photo links were found in this file.');
      analyse();
    } catch (e) { $('ctResult').innerHTML = `<p class="hint">⚠️ ${esc(e.message)}</p>`; }
  }

  function analyse() {
    if (!window.MCMatch) return say('Matching tool not loaded — refresh the page.', true);
    const targets = (A().products || []).filter(p => !$('ctOnlyEmpty').checked || !p.image);
    rows = targets.map(p => {
      const ranked = source.map((s, i) => ({ i, score: MCMatch.scorePair({ name: p.name }, { name: s.name }).score })).filter(r => r.score >= 0.45).sort((a, b) => b.score - a.score).slice(0, 4);
      const best = ranked[0], second = ranked[1];
      const level = !best ? '' : best.score >= 0.8 && (!second || best.score - second.score >= 0.05) ? 'auto' : best.score >= 0.6 ? 'check' : 'low';
      return { p, ranked, pick: best ? best.i : -1, level, on: level === 'auto', done: false };
    });
    filter = 'auto'; draw();
  }

  function draw() {
    const n = k => rows.filter(r => k === 'all' ? r.ranked.length : r.level === k).length;
    const list = rows.filter(r => filter === 'all' ? r.ranked.length : r.level === filter);
    const sel = rows.filter(r => r.on && r.pick >= 0 && !r.done).length;
    $('ctResult').innerHTML = `<div class="ct-tabs">${[['auto', '✅ Sure'], ['check', '🔎 To check'], ['low', '❔ Weak'], ['all', 'All suggestions']].map(([k, l]) => `<button type="button" class="btn ${filter === k ? 'primary' : ''}" data-ct-tab="${k}">${l} (${n(k)})</button>`).join('')}</div>
      <p class="hint">${rows.length} of your products checked · ${rows.filter(r => !r.ranked.length).length} have no similar product in the file. Tick the correct matches, or pick another photo from the list.</p>
      <div class="row"><button type="button" class="btn" data-ct-all="1">Tick all shown</button><button type="button" class="btn" data-ct-all="0">Untick all shown</button>
      <button type="button" class="btn primary" id="ctApply" ${sel && !busy ? '' : 'disabled'}>📸 Copy ${sel} photo(s)</button></div>
      <div class="ct-list">${list.slice(0, 400).map(r => row(r)).join('') || '<p class="hint">Nothing here.</p>'}</div>${list.length > 400 ? '<p class="hint">Showing the first 400.</p>' : ''}`;
    const res = $('ctResult');
    res.onclick = e => {
      const t = e.target.closest('[data-ct-tab]'); if (t) { filter = t.dataset.ctTab; draw(); return; }
      const all = e.target.closest('[data-ct-all]'); if (all) { list.forEach(r => { if (!r.done && r.pick >= 0) r.on = all.dataset.ctAll === '1'; }); draw(); return; }
      if (e.target.id === 'ctApply') apply();
    };
    res.onchange = e => {
      const c = e.target.closest('[data-ct-on]'); if (c) { const r = rows.find(x => x.p.id === c.dataset.ctOn); if (r) r.on = c.checked; updateCount(); return; }
      const s = e.target.closest('[data-ct-pick]'); if (s) { const r = rows.find(x => x.p.id === s.dataset.ctPick); if (r) { r.pick = Number(s.value); r.on = r.pick >= 0; const img = s.closest('.ct-row').querySelector('.ct-src img'); if (img && r.pick >= 0) img.src = source[r.pick].photo; s.closest('.ct-row').querySelector('[data-ct-on]').checked = r.on; updateCount(); } }
    };
  }
  function updateCount() { const sel = rows.filter(r => r.on && r.pick >= 0 && !r.done).length; const b = $('ctApply'); if (b) { b.disabled = !sel || busy; b.textContent = `📸 Copy ${sel} photo(s)`; } }
  function row(r) {
    const s = r.pick >= 0 ? source[r.pick] : null, best = r.ranked[0];
    const badge = r.done ? '<span class="ct-b ok">✓ copied</span>' : `<span class="ct-b ${r.level}">${best ? Math.round(best.score * 100) + '%' : '—'}</span>`;
    return `<div class="ct-row ${r.done ? 'done' : ''}"><label class="ct-on"><input type="checkbox" data-ct-on="${esc(r.p.id)}" ${r.on ? 'checked' : ''} ${r.done || r.pick < 0 ? 'disabled' : ''}></label>
      <div class="ct-mine"><b>${esc(r.p.name)}</b><small>${esc(r.p.category || '')}${r.p.image ? ' · has a photo' : ''}</small></div>
      <div class="ct-src">${s ? `<img src="${esc(s.photo)}" alt="" loading="lazy">` : '<span class="ct-ph">?</span>'}
        <div><select data-ct-pick="${esc(r.p.id)}" ${r.done ? 'disabled' : ''}>${r.ranked.map(x => `<option value="${x.i}" ${x.i === r.pick ? 'selected' : ''}>${esc(source[x.i].name)} · ${Math.round(x.score * 100)}%</option>`).join('')}<option value="-1" ${r.pick < 0 ? 'selected' : ''}>— no photo for this product —</option></select>${badge}</div></div></div>`;
  }

  async function apply() {
    const todo = rows.filter(r => r.on && r.pick >= 0 && !r.done); if (!todo.length || busy) return;
    if (!confirm(`Copy ${todo.length} photo(s) into your catalogue?${$('ctDesc').checked ? ' Empty descriptions will be filled too.' : ''}${$('ctCat').checked ? ' Categories will be changed to the old catalogue\'s categories.' : ''}`)) return;
    busy = true; updateCount(); const b = biz(); let ok = 0, fail = 0, first = '';
    const cache = new Map(); // one download/upload per source photo, reused for all its sizes
    const one = async r => {
      const s = source[r.pick];
      try {
        let url = cache.get(r.pick);
        if (!url) {
          const res = await fetch(s.photo, { mode: 'cors' }); if (!res.ok) throw Error('download ' + res.status);
          const blob = await res.blob(); const file = new File([blob], 'photo.' + ((blob.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg')), { type: blob.type || 'image/jpeg' });
          const opt = await MC.optimizeImage(file); const path = b.id + '/' + crypto.randomUUID() + '.' + (opt.type === 'image/webp' ? 'webp' : 'jpg');
          const up = await sb().storage.from('mc-saas-images').upload(path, opt, { upsert: false, contentType: opt.type }); if (up.error) throw up.error;
          url = sb().storage.from('mc-saas-images').getPublicUrl(path).data.publicUrl; cache.set(r.pick, url);
        }
        const patch = { image: url, updated_at: new Date().toISOString() };
        if ($('ctDesc').checked && !String(r.p.description || '').trim() && s.description) patch.description = s.description.slice(0, 2000);
        if ($('ctCat').checked && s.category) patch.category = s.category;
        const u = await sb().from('mc_saas_products').update(patch).eq('id', r.p.id).eq('business_id', b.id); if (u.error) throw u.error;
        r.done = true; r.on = false; ok++;
      } catch (e) { fail++; if (!first) first = r.p.name + ': ' + e.message; }
      say(`Copying photos… ${ok + fail}/${todo.length}`);
    };
    for (let i = 0; i < todo.length; i += 3) await Promise.all(todo.slice(i, i + 3).map(one));
    busy = false; if (A().loadProducts) await A().loadProducts();
    say(`✓ ${ok} photo(s) copied${fail ? ` · ${fail} failed (${first})` : ''}.`, fail > 0); draw();
  }

  const hooks = window.mcPageHooks || {}; const prev = hooks.data;
  hooks.data = () => { if (prev) prev(); panel(); };
  if (location.hash === '#data') setTimeout(panel, 500);
  window.mcCatalogueTransfer = { panel };
})();
