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
