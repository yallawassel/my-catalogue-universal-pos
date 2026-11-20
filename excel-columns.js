/* My Catalogue — smart Excel/CSV column detection (v9.1)
   Handles POS exports such as AntiSoft: report titles above the real header row, CamelCase
   titles (ItemName), Arabic / French titles, cost vs selling prices, and lets the user override.
   MCCols.read(aoa, mappingOverride) -> { headerRow, headers, mapping, rows (objects with canonical keys), samples }
*/
(() => {
  const norm = v => String(v ?? '')
    .replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Za-z])(\d)/g, '$1 $2')
    .toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[ً-ٰٟـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const compact = v => norm(v).replace(/\s+/g, '');

  // field -> canonical key used by the importer, exact aliases, "contains" hints, words that disqualify
  const FIELDS = [
    { f: 'barcode', key: 'Barcode', label: 'Barcode',
      exact: ['barcode', 'bar code', 'ean', 'ean 13', 'upc', 'gtin', 'code barre', 'code barres', 'codebarre', 'باركود', 'الباركود', 'رمز الباركود', 'item barcode', 'unit barcode'],
      has: ['barcode', 'bar code', 'باركود', 'ean'] },
    { f: 'posProductId', key: 'POS Product ID', label: 'POS product ID',
      exact: ['pos product id', 'pos id', 'product id', 'item id', 'itemid', 'item no', 'item number', 'item num', 'external id', 'رقم الصنف', 'رقم الماده', 'رقم المنتج', 'id'] },
    { f: 'sku', key: 'SKU', label: 'SKU / item code',
      exact: ['sku', 'product code', 'item code', 'itemcode', 'code', 'reference', 'ref', 'code article', 'رمز', 'رمز الصنف', 'كود', 'كود الصنف', 'رمز الماده'] },
    { f: 'label2', key: 'Label2', label: 'Unit 2 (e.g. Box)',
      exact: ['label 2', 'label2', 'unit 2', 'unit2', 'second unit', 'packaging 2', 'price unit 2', 'الوحده 2', 'وحده 2'] },
    { f: 'price2', key: 'Price2', label: 'Price 2',
      exact: ['price 2', 'price2', 'second price', 'unit price 2', 'sale price 2', 'سعر 2', 'السعر 2'] },
    { f: 'price1', key: 'Price1', label: 'Price (selling)',
      exact: ['price 1', 'price1', 'price', 'selling price', 'sale price', 'sales price', 'unit price', 'retail price', 'wholesale price', 'sell price', 'prix', 'prix vente', 'prix de vente', 'السعر', 'سعر', 'سعر البيع', 'سعر المبيع', 'سعر المفرق', 'سعر الجمله', 'سعر الوحده'],
      has: ['price', 'prix', 'سعر'], not: ['cost', 'purchase', 'buy', 'achat', 'شراء', 'كلفه', 'تكلفه', 'old', 'previous', 'قديم', '2'] },
    { f: 'label1', key: 'Label1', label: 'Unit (e.g. Piece)',
      exact: ['label 1', 'label1', 'unit 1', 'unit1', 'first unit', 'unit', 'uom', 'unit name', 'unite', 'unit of measure', 'الوحده', 'وحده', 'وحده القياس'],
      has: ['unit', 'وحده', 'uom'], not: ['price', 'سعر', '2', 'barcode', 'باركود', 'factor', 'qty', 'quantity'] },
    { f: 'category', key: 'Category', label: 'Category',
      exact: ['category', 'product category', 'categorie', 'group', 'item group', 'group name', 'family', 'famille', 'department', 'dept', 'section', 'class', 'الفئه', 'فئه', 'المجموعه', 'مجموعه', 'القسم', 'قسم', 'العائله'],
      has: ['categ', 'group', 'famil', 'depart', 'فئه', 'مجموع', 'قسم'] },
    { f: 'name', key: 'Product Name', label: 'Product name',
      exact: ['product name', 'name', 'product', 'item name', 'itemname', 'item', 'item description', 'product description', 'item desc', 'designation', 'designation article', 'libelle', 'article', 'nom', 'nom produit', 'name en', 'english name', 'item name en', 'material name', 'اسم', 'الاسم', 'اسم الصنف', 'الصنف', 'اسم الماده', 'الماده', 'البيان', 'اسم المنتج', 'المنتج', 'اسم الماده عربي', 'الاسم عربي'],
      has: ['name', 'اسم', 'designation', 'libelle', 'desc', 'بيان'], not: ['group', 'categ', 'unit', 'supplier', 'vendor', 'brand', 'مورد', 'وحده', 'فئه', 'مجموع', 'file', 'user', 'customer', 'زبون'] },
    { f: 'description', key: 'Description', label: 'Description',
      exact: ['description', 'details', 'specification', 'specifications', 'notes', 'remarks', 'وصف', 'الوصف', 'ملاحظات', 'تفاصيل'] },
    { f: 'imageUrl', key: 'Photo URL', label: 'Photo link (URL)',
      exact: ['photo url', 'image url', 'image link', 'photo link', 'picture url', 'رابط الصوره'] },
    { f: 'photo', key: 'Photo', label: 'Photo file name',
      exact: ['photo', 'image', 'picture', 'image filename', 'photo filename', 'image file', 'photo file', 'صوره', 'الصوره'] },
    { f: 'sortOrder', key: 'Display Order', label: 'Display order',
      exact: ['display order', 'sort order', 'position', 'ترتيب', 'الترتيب'] }
  ];
  FIELDS.forEach(d => { d.exactN = new Set(d.exact.map(norm)); d.exactC = new Set(d.exact.map(compact)); d.hasN = (d.has || []).map(norm); d.notN = (d.not || []).map(norm); });

  function exactField(h) { const n = norm(h), c = compact(h); if (!n) return null; return FIELDS.find(d => d.exactN.has(n) || d.exactC.has(c)) || null; }
  function hintScore(d, h) {
    const n = norm(h); if (!n || !d.hasN.length) return 0;
    if (d.notN.some(x => (' ' + n + ' ').includes(' ' + x + ' ') || n.includes(x) && x.length > 2)) return 0;
    return d.hasN.some(x => n.includes(x)) ? 1 : 0;
  }

  function detectHeaderRow(aoa) {
    let best = { row: 0, score: -1 };
    const limit = Math.min(aoa.length, 30);
    for (let r = 0; r < limit; r++) {
      const cells = (aoa[r] || []).map(v => String(v ?? '').trim()), filled = cells.filter(Boolean);
      if (filled.length < 2) continue;
      const fields = new Set(); cells.forEach(c => { const d = exactField(c); if (d) fields.add(d.f); });
      let hints = 0; cells.forEach(c => { if (!exactField(c) && FIELDS.some(d => hintScore(d, c))) hints++; });
      const numeric = filled.filter(c => /^-?[\d.,\s]+$/.test(c)).length;
      const score = fields.size * 3 + hints - numeric * 2 + Math.min(filled.length, 8) * 0.1;
      if (score > best.score) best = { row: r, score };
    }
    return best.row;
  }

  function autoMap(headers, aoa, headerRow) {
    const used = new Set(), mapping = {};
    // 1) exact titles
    for (const d of FIELDS) { const i = headers.findIndex((h, k) => !used.has(k) && exactField(h) === d); if (i >= 0) { mapping[d.f] = i; used.add(i); } }
    // 2) "contains" hints for important fields still missing
    for (const d of FIELDS) {
      if (mapping[d.f] !== undefined || !d.hasN.length) continue;
      const i = headers.findIndex((h, k) => !used.has(k) && hintScore(d, h)); if (i >= 0) { mapping[d.f] = i; used.add(i); }
    }
    // 3) no name column but a description column: that is the name (common in POS exports)
    if (mapping.name === undefined && mapping.description !== undefined) { mapping.name = mapping.description; delete mapping.description; }
    // 4) still no name: the text column with the longest, most varied values
    if (mapping.name === undefined) {
      const sample = aoa.slice(headerRow + 1, headerRow + 41);
      let best = -1, bestScore = 0;
      headers.forEach((h, k) => {
        if (used.has(k)) return;
        const vals = sample.map(r => String((r || [])[k] ?? '').trim()).filter(Boolean);
        const textVals = vals.filter(v => /\p{L}/u.test(v) && !/^\d+([.,]\d+)?$/.test(v));
        if (textVals.length < Math.max(1, vals.length * 0.6)) return;
        const avg = textVals.reduce((s, v) => s + v.length, 0) / textVals.length, uniq = new Set(textVals).size / textVals.length;
        const sc = avg * uniq; if (sc > bestScore) { bestScore = sc; best = k; }
      });
      if (best >= 0) { mapping.name = best; mapping._nameGuessed = true; }
    }
    return mapping;
  }

  const isTotalRow = cells => cells.some(c => /^(total|totals|grand total|sum|المجموع|الاجمالي|الإجمالي|مجموع)\b/i.test(String(c).trim()));

  function read(aoa, override) {
    aoa = (aoa || []).map(r => Array.isArray(r) ? r : []);
    const headerRow = override && Number.isInteger(override.headerRow) ? override.headerRow : detectHeaderRow(aoa);
    const width = aoa.reduce((m, r) => Math.max(m, r.length), 0);
    const headers = Array.from({ length: width }, (_, k) => String((aoa[headerRow] || [])[k] ?? '').trim() || `Column ${k + 1}`);
    let mapping = autoMap(headers, aoa, headerRow);
    if (override && override.mapping) {
      mapping = {}; // user's choice wins, matched by column title
      for (const [f, title] of Object.entries(override.mapping)) { if (title === '') continue; const i = headers.indexOf(title); if (i >= 0) mapping[f] = i; }
    }
    const headerSig = norm(headers.join('|'));
    const rows = [];
    for (let r = headerRow + 1; r < aoa.length; r++) {
      const cells = aoa[r]; if (!cells.some(v => String(v ?? '').trim())) continue;
      if (norm(headers.map((_, k) => cells[k] ?? '').join('|')) === headerSig) continue; // repeated page header
      if (isTotalRow(cells) && mapping.name !== undefined && !String(cells[mapping.barcode] ?? '').trim()) continue;
      const obj = { __row: r + 1 };
      for (const d of FIELDS) if (mapping[d.f] !== undefined) obj[d.key] = cells[mapping[d.f]] ?? '';
      rows.push(obj);
    }
    const samples = headers.map((_, k) => { const v = aoa.slice(headerRow + 1).map(r => String((r || [])[k] ?? '').trim()).find(Boolean); return v || ''; });
    return { headerRow, headers, mapping, rows, samples, fields: FIELDS.map(d => ({ f: d.f, label: d.label })) };
  }

  // pick the sheet that looks most like a product list
  function bestSheet(sheets) { // [{name, aoa}]
    let best = sheets[0], bestScore = -1;
    for (const s of sheets) { const r = read(s.aoa); const sc = Object.keys(r.mapping).filter(k => !k.startsWith('_')).length * 10 + Math.min(r.rows.length, 5000) / 1000; if (sc > bestScore) { bestScore = sc; best = s; } }
    return best;
  }

  window.MCCols = { read, bestSheet, norm };
})();
