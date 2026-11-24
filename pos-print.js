/* My Catalogue POS — receipts (80/58 mm), A4 invoices, PDF, Excel, share & email. */
(() => {
  const P = window.POS, esc = P.esc;
  const loadScript = (src, test) => new Promise((res, rej) => { if (test()) return res(); const s = document.createElement('script'); s.src = src; s.onload = () => res(); s.onerror = () => rej(Error('Could not load a library. Check the internet connection.')); document.head.appendChild(s); });
  P.loadXlsx = () => loadScript('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js', () => !!window.XLSX).then(() => window.XLSX);
  P.loadPdf = () => loadScript('https://cdn.jsdelivr.net/npm/html2pdf.js@0.10.1/dist/html2pdf.bundle.min.js', () => !!window.html2pdf).then(() => window.html2pdf);

  const head = () => {
    const b = P.biz, s = P.settings || {};
    return `<div class="h">${b.logo_url ? `<img src="${esc(b.logo_url)}" alt="" class="logo">` : ''}<b class="bn">${esc(b.company_name)}</b>${s.receipt_header ? `<div class="hd">${esc(s.receipt_header).replace(/\n/g, '<br>')}</div>` : ''}</div>`;
  };
  const money = v => P.fmt(v), lbp = v => P.fmtL(v);
  const vatInfo = s => { const rate = Number(s.vat_rate ?? (s.tax ? P.settings?.tax_rate : 0) ?? 0); return { on: Number(s.tax) !== 0 && rate > 0, rate, incl: !!s.prices_include_vat, lbpVat: Math.round(Math.abs(Number(s.tax)) * (s.rate || P.rate())), net: P.r2(Number(s.total) - Number(s.tax)) }; };
  const vatNo = () => P.settings?.vat_number ? `VAT No: ${esc(P.settings.vat_number)}` : '';
  function payLines(s) {
    const out = [];
    if (s.paid_usd) out.push(['Cash USD', money(s.paid_usd)]);
    if (s.paid_lbp) out.push(['Cash LBP', lbp(s.paid_lbp)]);
    if (s.paid_card) out.push(['Card', money(s.paid_card)]);
    if (s.credit_amount) out.push(['On account (debt)', money(s.credit_amount)]);
    if (s.change_usd) out.push(['Change USD', money(s.change_usd)]);
    if (s.change_lbp) out.push(['Change LBP', lbp(s.change_lbp)]);
    return out;
  }

  /* ---------- 80 / 58 mm receipt ---------- */
  P.receiptHtml = (s, width = '80') => {
    const w = width === '58' ? 58 : 80, ret = s.kind === 'return';
    const items = (s.items || []).map(i => `<tr><td colspan="3" class="nm">${esc(i.name)}${i.unit ? ` <small>(${esc(i.unit)})</small>` : ''}</td></tr>
      <tr><td>${P.r2(i.qty)} × ${money(i.price)}${i.discount ? ` <small>−${money(i.discount)}</small>` : ''}</td><td></td><td class="r">${money(i.line_total)}</td></tr>`).join('');
    const rateLbp = Math.round(s.total * (s.rate || P.rate()));
    return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(s.invoice_label)}</title><style>
      @page{size:${w}mm auto;margin:2mm}*{box-sizing:border-box}body{margin:0;width:${w - 4}mm;font:${w === 58 ? 10.5 : 12}px/1.35 'Courier New',ui-monospace,monospace;color:#000}
      .h{text-align:center;margin-bottom:6px}.logo{max-width:40mm;max-height:18mm;object-fit:contain;display:block;margin:0 auto 4px;filter:grayscale(1)}.bn{font-size:1.35em;display:block}.hd{font-size:.92em}
      table{width:100%;border-collapse:collapse}td{padding:1px 0;vertical-align:top}.r{text-align:right;white-space:nowrap}.nm{font-weight:700;padding-top:4px}
      hr{border:0;border-top:1px dashed #000;margin:5px 0}.big td{font-size:1.25em;font-weight:700}.c{text-align:center}small{font-size:.85em}
    </style></head><body>${head()}<div class="c">${vatInfo(s).on && vatNo() ? vatNo() + '<br>' : ''}<b>${ret ? 'RETURN' : vatInfo(s).on ? 'TAX INVOICE' : 'RECEIPT'} ${esc(s.invoice_label)}</b><br>${P.dt(s.created_at || Date.now())}<br>Cashier: ${esc(s.cashier_name || 'Owner')}${s.customer_name ? `<br>Customer: ${esc(s.customer_name)}` : ''}</div><hr>
    <table>${items}</table><hr><table>
      <tr><td>Subtotal</td><td class="r">${money(s.subtotal)}</td></tr>
      ${s.discount ? `<tr><td>Discount</td><td class="r">−${money(s.discount)}</td></tr>` : ''}
      ${vatInfo(s).on && !vatInfo(s).incl ? `<tr><td>VAT ${vatInfo(s).rate}%</td><td class="r">${money(s.tax)}</td></tr>` : ''}
      <tr class="big"><td>TOTAL</td><td class="r">${money(s.total)}</td></tr>
      ${vatInfo(s).on && vatInfo(s).incl ? `<tr><td>incl. VAT ${vatInfo(s).rate}%</td><td class="r">${money(s.tax)}</td></tr><tr><td>Total excl. VAT</td><td class="r">${money(vatInfo(s).net)}</td></tr>` : ''}
      ${vatInfo(s).on ? `<tr><td>VAT in LBP</td><td class="r">${lbp(vatInfo(s).lbpVat)}</td></tr>` : ''}
      <tr><td>in LBP</td><td class="r">${lbp(rateLbp)}</td></tr>
      <tr><td colspan="2"><small>Rate: 1$ = ${Number(s.rate || P.rate()).toLocaleString('en-US')} LBP</small></td></tr>
    </table><hr><table>${payLines(s).map(([a, b]) => `<tr><td>${a}</td><td class="r">${b}</td></tr>`).join('')}</table>
    ${s.customer_balance != null ? `<hr><table><tr><td>Account balance</td><td class="r">${money(s.customer_balance)}</td></tr></table>` : ''}
    <hr><div class="c">${esc(P.settings?.receipt_footer || 'Thank you!')}</div>${s.offline ? '<div class="c"><small>Saved offline — invoice number given when synced</small></div>' : ''}<br></body></html>`;
  };

  /* ---------- A4 invoice ---------- */
  P.invoiceHtml = (s, forPdf) => {
    const ret = s.kind === 'return', b = P.biz;
    const rows = (s.items || []).map((i, k) => `<tr><td>${k + 1}</td><td>${esc(i.name)}${i.barcode ? `<br><small>${esc(i.barcode)}</small>` : ''}</td><td>${esc(i.unit || '')}</td><td class="r">${P.r2(i.qty)}</td><td class="r">${money(i.price)}</td><td class="r">${i.discount ? money(i.discount) : '—'}</td><td class="r">${money(i.line_total)}</td></tr>`).join('');
    const css = `.inv{font:13px/1.45 'Plus Jakarta Sans',Arial,sans-serif;color:#111;padding:${forPdf ? '0' : '14mm'};background:#fff}
      .inv .inv-top{display:flex;justify-content:space-between;gap:20px;border-bottom:3px solid ${b.primary_color || '#115e59'};padding-bottom:12px}
      .inv .inv-top img{max-height:60px;max-width:160px;object-fit:contain}.inv h1{margin:0;font-size:26px;color:${b.primary_color || '#115e59'}}
      .inv .meta{text-align:right}.inv .muted{color:#555}.inv .to{margin:16px 0;display:flex;justify-content:space-between;gap:20px}
      .inv table{width:100%;border-collapse:collapse;margin-top:8px}.inv th{background:#f1f6f5;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.04em;padding:8px}
      .inv td{padding:8px;border-bottom:1px solid #e1eae8;vertical-align:top}.inv .r{text-align:right}.inv small{color:#666}
      .inv .sum{margin-left:auto;width:300px;margin-top:12px}.inv .sum td{border:0;padding:4px 8px}.inv .sum .g td{font-size:18px;font-weight:800;border-top:2px solid #111}
      .inv .foot{margin-top:28px;color:#555;font-size:12px;border-top:1px solid #e1eae8;padding-top:10px}`;
    const body = `<div class="inv"><div class="inv-top"><div>${b.logo_url ? `<img src="${esc(b.logo_url)}" alt=""><br>` : ''}<b style="font-size:18px">${esc(b.company_name)}</b><div class="muted">${esc(P.settings?.receipt_header || '').replace(/\n/g, '<br>')}</div></div>
      <div class="meta"><h1>${ret ? 'CREDIT NOTE' : vatInfo(s).on ? 'TAX INVOICE' : 'INVOICE'}</h1>${vatInfo(s).on && vatNo() ? `<div>${vatNo()}</div>` : ''}<b>${esc(s.invoice_label)}</b><br>${new Date(s.created_at || Date.now()).toLocaleDateString(undefined, { day: '2-digit', month: 'long', year: 'numeric' })}</div></div>
      <div class="to"><div><small>BILL TO</small><br><b>${esc(s.customer_name || 'Walk-in customer')}</b>${s.customer_phone ? `<br>${esc(s.customer_phone)}` : ''}</div><div class="meta"><small>CASHIER</small><br>${esc(s.cashier_name || 'Owner')}<br><small>Payment: ${esc(s.payment_method || '')}</small></div></div>
      <table><thead><tr><th>#</th><th>Item</th><th>Unit</th><th class="r">Qty</th><th class="r">Price</th><th class="r">Discount</th><th class="r">Total</th></tr></thead><tbody>${rows}</tbody></table>
      <table class="sum"><tr><td>Subtotal</td><td class="r">${money(s.subtotal)}</td></tr>${s.discount ? `<tr><td>Discount</td><td class="r">−${money(s.discount)}</td></tr>` : ''}${vatInfo(s).on ? `<tr><td>Total excl. VAT</td><td class="r">${money(vatInfo(s).net)}</td></tr><tr><td>VAT ${vatInfo(s).rate}%${vatInfo(s).incl ? ' (included)' : ''}</td><td class="r">${money(s.tax)}</td></tr>` : ''}
      <tr class="g"><td>Total${vatInfo(s).on ? ' incl. VAT' : ''}</td><td class="r">${money(s.total)}</td></tr>${vatInfo(s).on ? `<tr><td>VAT in LBP</td><td class="r">${lbp(vatInfo(s).lbpVat)}</td></tr>` : ''}<tr><td>in LBP</td><td class="r">${lbp(Math.round(s.total * (s.rate || P.rate())))}</td></tr>
      ${payLines(s).map(([a, v]) => `<tr><td class="muted">${a}</td><td class="r muted">${v}</td></tr>`).join('')}</table>
      <div class="foot">${esc(P.settings?.receipt_footer || '')} · Rate 1$ = ${Number(s.rate || P.rate()).toLocaleString('en-US')} LBP</div></div>`;
    return forPdf ? `<style>${css}</style>${body}` : `<!doctype html><html><head><meta charset="utf-8"><title>${esc(s.invoice_label)}</title><link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;800&display=swap" rel="stylesheet"><style>@page{size:A4;margin:0}body{margin:0}${css}</style></head><body>${body}</body></html>`;
  };

  /* ---------- print ---------- */
  P.printHtml = html => {
    const f = document.getElementById('printFrame');
    f.srcdoc = html;
    f.onload = () => { setTimeout(() => { try { f.contentWindow.focus(); f.contentWindow.print(); } catch (_) { const w = window.open('', '_blank'); w.document.write(html); w.document.close(); w.print(); } }, 250); f.onload = null; };
  };
  P.printSale = (s, paper) => { paper = paper || P.device.paper || '80'; P.printHtml(paper === 'a4' ? P.invoiceHtml(s) : P.receiptHtml(s, paper)); };

  /* ---------- PDF + share + email ---------- */
  P.pdfBlob = async (html, name, opts = {}) => {
    const h2p = await P.loadPdf();
    // html2pdf clones the element into its own page container: the element itself must be a plain block
    // (no position/size tricks on it, or the copy has 0 height and the PDF is blank). Hide it with a wrapper.
    const wrap = document.createElement('div'); wrap.style.cssText = 'position:fixed;left:-12000px;top:0;';
    const box = document.createElement('div'); box.style.cssText = 'width:' + (opts.width || '190mm') + ';background:#fff;color:#111';
    box.innerHTML = html; wrap.appendChild(box); document.body.appendChild(wrap);
    try {
      await Promise.all([...box.querySelectorAll('img')].map(im => im.complete ? 0 : new Promise(r => { im.onload = im.onerror = r; })));
      return await h2p().set({ margin: opts.margin ?? 10, filename: name, image: { type: 'jpeg', quality: 0.95 }, html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' }, jsPDF: { unit: 'mm', format: 'a4', orientation: opts.landscape ? 'landscape' : 'portrait' }, pagebreak: { mode: ['css', 'legacy'] } }).from(box).outputPdf('blob');
    } finally { wrap.remove(); }
  };
  P.download = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500); };
  P.shareFile = async (blob, name, title, text) => {
    const file = new File([blob], name, { type: blob.type || 'application/pdf' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title, text }); return true; } catch (e) { if (e.name === 'AbortError') return true; }
    }
    P.download(blob, name); P.toast('Saved the file. Attach it in WhatsApp or email.'); return false;
  };
  P.email = (to, subject, body) => { location.href = 'mailto:' + encodeURIComponent(to || '') + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body); };
  P.salePdf = async s => P.pdfBlob(P.invoiceHtml(s, true), (s.invoice_label || 'invoice') + '.pdf');
})();
