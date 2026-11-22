/* My Catalogue — "Pieces in each unit" in the product form. Stock is always kept in pieces. v19 */
(() => {
  const $ = id => document.getElementById(id);
  if (!$('pcBox')) return;
  const PIECE = /^(piece|pieces|pcs|pc|pce|pcs\.|unit|units|each|ea|item|قطعة|قطع|حبة|حبه)$/i;
  const parse = s => { const t = String(s || '').toLowerCase().trim(); const m = t.match(/(?:\*|×|x|of|\/)\s*(\d+(?:\.\d+)?)\s*(?:pcs|pc|pieces)?\s*$/) || t.match(/(\d+(?:\.\d+)?)\s*(?:pcs|pc|pieces|pce)\s*$/); return m ? Number(m[1]) : null; };
  const num = v => { const s = String(v ?? '').trim(); return s === '' ? null : Number(s); };
  function refresh() {
    const l1 = $('pLabel1').value.trim() || 'Box', l2 = $('pLabel2').value.trim();
    $('pcL1').textContent = l1; $('pcL2').textContent = l2;
    const one = PIECE.test(l1);
    $('pcRow1').classList.toggle('hidden', one);
    $('pcRow2').classList.toggle('hidden', !l2 || PIECE.test(l2));
    $('pPieces1').placeholder = parse(l1) ? String(parse(l1)) + ' (from the name)' : 'e.g. 500';
    $('pPieces2').placeholder = parse(l2) ? String(parse(l2)) + ' (from the name)' : 'e.g. 50';
    $('pcBox').classList.toggle('hidden', one && (!l2 || PIECE.test(l2)));
  }
  window.mcPiecesFill = p => { $('pPieces1').value = p && p.pieces1 != null ? Number(p.pieces1) : ''; $('pPieces2').value = p && p.pieces2 != null ? Number(p.pieces2) : ''; refresh(); };
  window.mcPiecesPayload = () => {
    const a = num($('pPieces1').value), b = num($('pPieces2').value);
    if ((a !== null && !(a > 0)) || (b !== null && !(b > 0))) throw Error('Pieces in a unit must be more than zero.');
    return { pieces1: PIECE.test($('pLabel1').value.trim()) ? null : a, pieces2: $('pLabel2').value.trim() ? b : null };
  };
  ['pLabel1', 'pLabel2'].forEach(id => $(id).addEventListener('input', refresh));
  refresh();
})();
