/* My Catalogue — Smart photo matching (v8.1)
   Matches photo files to products by identifiers (barcode / SKU / POS ID / Excel photo file name)
   and by fuzzy product-name similarity. Works with English, French and Arabic names.
   Usage:
     const res = MCMatch.match(items, files)
       items: [{ key, name, barcode, sku, posProductId, photoName, category }]
       files: [File | { name }]
     -> res.byItem: Map(key -> { file, fileIndex, score, level: 'auto'|'check', reason })
        res.unusedFiles: [fileIndex]
        res.rank(itemKey) -> [{ fileIndex, score, reason }]  (best photos for one item, for the picker)
*/
(() => {
  const NOISE = new Set(['img', 'image', 'images', 'photo', 'photos', 'pic', 'picture', 'dsc', 'dscn', 'dcim', 'copy', 'final', 'edited', 'edit', 'new', 'whatsapp', 'wa', 'screenshot', 'scan', 'jpg', 'jpeg', 'png', 'webp', 'heic', 'the', 'and', 'of', 'with', 'for', 'de', 'la', 'le', 'et', 'a']);
  const UNIT_ALIASES = [
    ['ml', 'cc|ml|mls|millilitre|milliliter|مل'], ['l', 'l|lt|ltr|litre|liter|لتر'],
    ['g', 'gr|grs|g|gm|gms|gram|grams|غرام|غ'], ['kg', 'kg|kgs|kilo|kilos|كيلو|كغ'],
    ['pc', 'pcs|pc|piece|pieces|pz|قطعه|قطع'], ['oz', 'oz|ounce|ounces'],
    ['cm', 'cm|cms|سم'], ['mm', 'mm'], ['in', 'in|inch|inches']
  ];
  // token-boundary regexes (\b does not work with Arabic letters)
  const UNITS = UNIT_ALIASES.map(([unit, alts]) => [new RegExp('(^|\\s)(?:' + alts + ')(?=\\s|$)', 'g'), '$1' + unit]);

  function normalize(v) {
    let s = String(v ?? '').toLowerCase();
    s = s.replace(/\.(jpe?g|png|webp|gif|bmp|heic|heif|tiff?|avif)$/i, '');
    s = s.replace(/\s*\(\d{1,2}\)\s*$/, '').replace(/[\s_-]+copy(\s*\d+)?$/, ''); // "photo (1)", "photo - copy"

    s = s.normalize('NFKD').replace(/[̀-ͯ]/g, '');
    // Arabic: remove diacritics & tatweel, unify letter forms, Arabic/Persian digits -> 0-9
    s = s.replace(/[ً-ٰٟۖ-ۭـ]/g, '')
      .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
      .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x06F0));
    s = s.replace(/["”″]/g, ' in ').replace(/(\d)[,](\d)/g, '$1.$2');
    s = s.replace(/[^\p{L}\p{N}.]+/gu, ' ');
    s = s.replace(/(\p{N})(\p{L})/gu, '$1 $2').replace(/(\p{L})(\p{N})/gu, '$1 $2'); // 750cc -> 750 cc
    s = s.replace(/(^|\s)\.+|\.+(\s|$)/g, ' ');
    for (const [re, rep] of UNITS) s = s.replace(re, rep);
    return s.replace(/\s+/g, ' ').trim();
  }
  const compact = v => normalize(v).replace(/\s+/g, '');
  const tokensOf = n => n.split(' ').filter(t => t && !NOISE.has(t) && !(t.length === 1 && !/\d/.test(t)));
  const numbersOf = toks => new Set(toks.filter(t => /^\d+(\.\d+)?$/.test(t)).map(t => String(Number(t))));
  function trigrams(s) { const p = '  ' + s + ' ', out = new Set(); for (let i = 0; i < p.length - 2; i++) out.add(p.slice(i, i + 3)); return out; }
  function dice(a, b) { if (!a.size || !b.size) return 0; let n = 0; for (const x of a) if (b.has(x)) n++; return (2 * n) / (a.size + b.size); }
  function lev(a, b) {
    if (a === b) return 0; const m = a.length, n = b.length; if (!m || !n) return m || n;
    let prev = Array.from({ length: n + 1 }, (_, i) => i);
    for (let i = 1; i <= m; i++) { const cur = [i]; for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; }
    return prev[n];
  }
  const tokenSim = (a, b) => { if (a === b) return 1; if (/\d/.test(a) || /\d/.test(b)) return 0; if (a.length < 4 || b.length < 4) return (a.startsWith(b) || b.startsWith(a)) && Math.min(a.length, b.length) >= 3 ? 0.8 : 0; const r = 1 - lev(a, b) / Math.max(a.length, b.length); return r >= 0.75 ? r : 0; };
  function softTokenScore(ta, tb) { // fuzzy token overlap, tolerant of typos and plurals
    if (!ta.length || !tb.length) return 0; let sum = 0;
    for (const a of ta) { let best = 0; for (const b of tb) { const s = tokenSim(a, b); if (s > best) best = s; if (best === 1) break; } sum += best; }
    let sum2 = 0; for (const b of tb) { let best = 0; for (const a of ta) { const s = tokenSim(a, b); if (s > best) best = s; if (best === 1) break; } sum2 += best; }
    return (sum + sum2) / (ta.length + tb.length);
  }

  function prepFile(f, i) {
    const n = normalize(f.name), toks = tokensOf(n);
    return { i, n, c: n.replace(/\s+/g, ''), toks, tokSet: new Set(toks), nums: numbersOf(toks), tri: trigrams(toks.join(' ')) };
  }
  function prepItem(it) {
    const n = normalize(it.name), toks = tokensOf(n);
    return { it, n, toks, nums: numbersOf(toks), tri: trigrams(toks.join(' ')),
      ids: [['photoName', it.photoName, 1.0, 'Excel photo name'], ['barcode', it.barcode, 0.99, 'barcode in file name'], ['sku', it.sku, 0.97, 'SKU in file name'], ['pos', it.posProductId, 0.95, 'POS ID in file name']]
        .map(([k, v, w, why]) => ({ k, c: compact(v), w, why })).filter(x => x.c && (x.k === 'photoName' || x.c.length >= 3)) };
  }

  function scorePair(p, f) {
    // 1. identifiers
    for (const id of p.ids) {
      if (id.k === 'photoName') { if (f.c === id.c) return { score: 1, reason: id.why }; continue; }
      if (f.c === id.c || f.tokSet.has(id.c)) return { score: id.w, reason: id.why };
      if (id.c.length >= 6 && f.c.includes(id.c)) return { score: id.w - 0.03, reason: id.why };
    }
    if (!p.toks.length || !f.toks.length) return { score: 0, reason: '' };
    // 2. name similarity
    if (p.n && p.n.replace(/\s+/g, '') === f.c) return { score: 0.96, reason: 'same name' };
    let s = 0.55 * softTokenScore(p.toks, f.toks) + 0.45 * dice(p.tri, f.tri);
    // sizes/numbers must agree: "Cup 8oz" must not take the "Cup 12oz" photo
    if (p.nums.size && f.nums.size) {
      let common = 0; for (const x of p.nums) if (f.nums.has(x)) common++;
      if (!common) s *= 0.55; else if (common === p.nums.size && common === f.nums.size) s = Math.min(1, s + 0.06);
    } else if (p.nums.size && !f.nums.size) s *= 0.92;
    return { score: Math.round(s * 1000) / 1000, reason: 'similar name' };
  }

  function match(items, files, opts = {}) {
    const auto = opts.auto ?? 0.8, check = opts.check ?? 0.55, margin = opts.margin ?? 0.06;
    const P = items.map(prepItem), F = Array.from(files || []).map(prepFile);
    // inverted index (token + trigram) to avoid comparing everything with everything
    const idx = new Map(); const add = (k, i) => { let a = idx.get(k); if (!a) idx.set(k, a = []); a.push(i); };
    F.forEach(f => { f.toks.forEach(t => add('t:' + t.slice(0, 4), f.i)); add('c:' + f.c, f.i); });
    const pairs = [], perItem = new Map();
    P.forEach((p, pi) => {
      let cand = new Set();
      p.toks.forEach(t => (idx.get('t:' + t.slice(0, 4)) || []).forEach(i => cand.add(i)));
      p.ids.forEach(id => { (idx.get('c:' + id.c) || []).forEach(i => cand.add(i)); (idx.get('t:' + id.c.slice(0, 4)) || []).forEach(i => cand.add(i)); });
      if (F.length <= 400 || !cand.size) cand = new Set(F.map(f => f.i)); // small sets: check everything
      const ranked = [];
      for (const i of cand) { const r = scorePair(p, F[i]); if (r.score >= 0.3) ranked.push({ fileIndex: i, score: r.score, reason: r.reason }); }
      ranked.sort((a, b) => b.score - a.score);
      perItem.set(p.it.key, ranked);
      ranked.slice(0, 5).forEach(r => pairs.push({ pi, ...r }));
    });
    // one photo per product, best pairs first
    pairs.sort((a, b) => b.score - a.score);
    const usedFile = new Set(), byItem = new Map();
    for (const pr of pairs) {
      const key = P[pr.pi].it.key;
      if (byItem.has(key) || usedFile.has(pr.fileIndex) || pr.score < check) continue;
      const ranked = perItem.get(key), second = ranked.find(r => r.fileIndex !== pr.fileIndex);
      const clear = !second || pr.score - second.score >= margin || pr.score >= 0.95;
      byItem.set(key, { file: files[pr.fileIndex], fileIndex: pr.fileIndex, score: pr.score, reason: pr.reason, level: pr.score >= auto && clear ? 'auto' : 'check' });
      usedFile.add(pr.fileIndex);
    }
    return {
      byItem,
      unusedFiles: F.map(f => f.i).filter(i => !usedFile.has(i)),
      rank: key => perItem.get(key) || []
    };
  }

  // Thumbnail URL cache so previews don't leak memory
  const urls = new WeakMap();
  const thumb = f => { if (!f) return ''; if (!urls.has(f)) urls.set(f, URL.createObjectURL(f)); return urls.get(f); };

  window.MCMatch = { normalize, match, scorePair: (item, file) => scorePair(prepItem(item), prepFile(file, 0)), thumb };
})();
