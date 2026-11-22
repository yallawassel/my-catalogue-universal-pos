/* My Catalogue — "Recent imports" with Undo (v21).
   Every JSON import and Excel sync is recorded as a batch. Undo removes the products it added,
   puts back the prices/names it changed, and restores the category photos it replaced.
   A safety copy is saved on the server before anything is removed. */
(() => {
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const A = () => window.MCAdmin || {}, sb = () => window.MC.sb, biz = () => A().biz;
  const say = (m, err) => (A().setStatus ? A().setStatus(m, err) : alert(m));
  const KIND = { json: 'JSON import', excel: 'Excel import', sync: 'Excel / CSV sync' };

  window.mcStartImport = async (kind, fileName, syncJobId) => {
    try {
      const r = await sb().rpc('mc_saas_start_import', { p_business_id: biz().id, p_kind: kind, p_file_name: fileName || null, p_sync_job_id: syncJobId || null });
      if (r.error) throw r.error; return r.data;
    } catch (e) { console.warn('Import will not be undoable:', e.message); return null; }
  };

  function panel(page) {
    const sec = document.querySelector(`section[data-page-id="${page}"]`); if (!sec) return null;
    let box = sec.querySelector('.iu-box');
    if (!box) { box = document.createElement('div'); box.className = 'iu-box sh-card'; sec.appendChild(box); }
    return box;
  }
  async function draw(page) {
    const box = panel(page), b = biz(); if (!box || !b) return;
    box.innerHTML = '<h3>↩️ Recent imports</h3><p class="hint">Loading…</p>';
    const r = await sb().from('mc_saas_import_batches').select('id,kind,file_name,created_at,undone_at,undo_result').eq('business_id', b.id).order('created_at', { ascending: false }).limit(8);
    if (r.error) { box.innerHTML = '<h3>↩️ Recent imports</h3><p class="hint">⚠️ ' + esc(r.error.message) + '</p>'; return; }
    const rows = r.data || [];
    const counts = await Promise.all(rows.map(x => x.undone_at ? null : sb().rpc('mc_saas_import_summary', { p_batch_id: x.id }).then(y => y.data, () => null)));
    box.innerHTML = `<h3>↩️ Recent imports</h3><p class="hint">Imported the wrong file? Undo removes the products it added and puts back anything it changed — your other products stay as they are.</p>
      ${rows.length ? rows.map((x, i) => { const c = counts[i] || {}; const when = new Date(x.created_at).toLocaleString();
        return `<div class="iu-row ${x.undone_at ? 'off' : ''}"><div><b>${esc(KIND[x.kind] || x.kind)}</b>${x.file_name ? ' · ' + esc(x.file_name) : ''}<small>${esc(when)}</small></div>
          <div class="iu-n">${x.undone_at ? `Undone · ${Number((x.undo_result || {}).deleted || 0)} removed${(x.undo_result || {}).restored ? ', ' + x.undo_result.restored + ' restored' : ''}` : `${Number(c.added || 0)} added${c.updated ? ' · ' + c.updated + ' changed' : ''}`}</div>
          ${x.undone_at ? '' : `<button type="button" class="btn danger" data-undo="${esc(x.id)}" data-added="${Number(c.added || 0)}" data-updated="${Number(c.updated || 0)}" data-orders="${Number(c.with_orders || 0)}">Undo</button>`}</div>`; }).join('')
        : '<p class="hint">No imports recorded yet. Imports you run from now on will appear here.</p>'}`;
    box.onclick = e => { const btn = e.target.closest('[data-undo]'); if (btn) undo(btn, page); };
  }
  async function undo(btn, page) {
    const added = Number(btn.dataset.added), updated = Number(btn.dataset.updated), orders = Number(btn.dataset.orders);
    let msg = 'Undo this import?\n\n• ' + added + ' product(s) it added will be deleted';
    if (updated) msg += '\n• ' + updated + ' product(s) it changed will get their old name/prices back';
    msg += '\n• Category photos it replaced will be put back';
    if (orders) msg += '\n\n⚠️ ' + orders + ' of these products already appear in orders or POS sales. Those orders keep their lines, but the products will be gone.';
    msg += '\n\nA safety copy is kept on the server.';
    if (!confirm(msg)) return;
    btn.disabled = true; btn.textContent = 'Undoing…';
    const r = await sb().rpc('mc_saas_undo_import', { p_batch_id: btn.dataset.undo });
    if (r.error) { btn.disabled = false; btn.textContent = 'Undo'; return say('Could not undo: ' + r.error.message, true); }
    const d = r.data || {};
    if (A().loadProducts) await A().loadProducts();
    say('✓ Import undone: ' + (d.deleted || 0) + ' product(s) removed' + (d.restored ? ', ' + d.restored + ' restored to their old values' : '') + (d.categories_removed ? ', ' + d.categories_removed + ' empty categor' + (d.categories_removed === 1 ? 'y' : 'ies') + ' removed' : '') + '.');
    draw(page);
  }
  const hooks = window.mcPageHooks || {};
  ['data', 'sync'].forEach(pg => { const prev = hooks[pg]; hooks[pg] = () => { if (prev) prev(); const go = (n = 0) => biz() ? draw(pg) : n < 60 && setTimeout(() => go(n + 1), 300); go(); }; });
  if (location.hash === '#data' || location.hash === '#sync') hooks[location.hash.slice(1)]();
  window.mcImportUndo = { draw };
})();
