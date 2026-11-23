// Unit tests for pure storefront logic (sale prices, Arabic translation table).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const load = (file, extra = {}) => { const ctx = { window: { addEventListener() {} }, document: { addEventListener() {}, getElementById() { return null; } }, ...extra }; vm.createContext(ctx); vm.runInContext(readFileSync(new URL('../' + file, import.meta.url), 'utf8'), ctx); return ctx.window; };

test('sale price replaces the regular price and keeps the old one', () => {
  const w = load('sales.js');
  const [p] = w.MCSale.prepare([{ id: 1, price1: 10, sale_price1: 8, price2: 100, sale_price2: null }]);
  assert.equal(p.price1, 8); assert.equal(p.was1, 10); assert.equal(p.salePct, 20); assert.equal(p.price2, 100);
});
test('expired sale is ignored', () => {
  const w = load('sales.js');
  const [p] = w.MCSale.prepare([{ id: 1, price1: 10, sale_price1: 8, sale_ends_at: '2000-01-01' }]);
  assert.equal(p.price1, 10); assert.equal(p.onSale, false);
});
test('shop-plus loads and exposes its API', () => {
  const w = load('shop-plus.js', { location: { search: '', href: 'https://x/index.html' }, history: {}, crypto: {} });
  assert.equal(typeof w.MCShopPlus.orderExtras, 'function');
  assert.equal(w.MCShopPlus.needsOptions({ options: [{ name: 'Size', values: ['S'] }] }), true);
  assert.equal(w.MCShopPlus.needsOptions({ options: [] }), false);
  assert.equal(w.MCShopPlus.t('Send'), 'Send'); // English by default
});

test('AntiSoft inventory export: selling price, cost and barcode list are recognised', () => {
  const ctx = { window: {} }; vm.createContext(ctx);
  vm.runInContext(readFileSync(new URL('../excel-columns.js', import.meta.url), 'utf8'), ctx);
  const c = ctx.window.MCCols.read([
    ['Item ID', 'Item Name', 'Currency', 'Unit File', 'Sel Price', 'The Units', 'Total Qty', 'Price', 'Total', 'Item Code'],
    [1, 'SOMO CONTAINER 500CC', 'USD', 'PCS', 0.25, '3260874181;', 225, 0.157, 35.3, ''],
    [2, 'NAYLON BAG 45', 'USD', 'PKTS', 2.25, ';6287042530649', -13, 1.75, -22.7, ''],
    [3, 'PAPER BAG WHITE', 'USD', 'PKTS', 8, ';', 5, 5.25, 26.2, 'C229']
  ]);
  assert.equal(c.rows[0].Price1, 0.25); assert.equal(c.rows[0].Cost, 0.157);
  assert.equal(c.rows[0].Barcode, '3260874181'); assert.equal(c.rows[1].Barcode, '6287042530649'); assert.equal(c.rows[2].Barcode, '');
  assert.equal(c.rows[0]['POS Product ID'], 1); assert.equal(c.rows[2].SKU, 'C229');
});
