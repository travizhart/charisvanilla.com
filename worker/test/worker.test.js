import test from 'node:test';
import assert from 'node:assert/strict';
import { handler as worker, priceOrder } from '../src/lib.js';
import { handle, calls } from './mock-square.js';

globalThis.fetch = async (url, init) => { const [st, out] = handle(new URL(url).pathname, JSON.parse(init.body), init.headers); return new Response(JSON.stringify(out), { status: st }); };
const env = { SQUARE_ENV: 'sandbox', SQUARE_ACCESS_TOKEN: 'test', SQUARE_LOCATION_ID: 'LTEST', TAX_RATE_PERCENT: '2', SQUARE_BASE_URL: 'https://mock' };
const contact = { name: 'Jane Baker', email: 'jane@example.com', phone: '828-555-1234' };
const req = (body, origin = 'https://charisvanilla.com', method = 'POST') => new Request('https://w/api/checkout', { method, headers: { origin, 'content-type': 'application/json' }, body: method === 'POST' ? JSON.stringify(body) : undefined });
const call = async (body, origin, e = env) => { const r = await worker.fetch(req(body, origin), e, { waitUntil() {} }); return [r.status, await r.json(), r]; };
const ok = (over = {}) => ({ items: [{ sku: 'vanilla-2', qty: 1 }], contact, fulfillment: { method: 'pickup', market: 'hickory' }, sourceId: 'cnon:card-nonce-ok', idempotencyKey: crypto.randomUUID(), ...over });

test('pickup: NC tax 2%, free, totals from server prices', async () => {
  const [st, d] = await call(ok({ items: [{ sku: 'vanilla-2', qty: 1, price: 1 }, { sku: 'gift-20', qty: 1 }] }));
  assert.equal(st, 200); assert.equal(d.subtotal, 3000); assert.equal(d.shipping, 0); assert.equal(d.tax, 60); assert.equal(d.total, 3060);
  const order = calls.at(-2).body.order; assert.equal(order.fulfillments[0].type, 'PICKUP'); assert.match(order.fulfillments[0].pickup_details.note, /Hickory/);
  assert.equal(order.taxes[0].percentage, '2'); assert.equal(calls.at(-1).body.amount_money.amount, 3060); assert.match(calls.at(-1).body.order_id, /^ORD_/);
});
test('ship to NC under $40: $8 shipping, tax on items only', async () => {
  const [, d] = await call(ok({ items: [{ sku: 'coffee-4', qty: 1 }], fulfillment: { method: 'shipping', address: { line1: '1 Main St', city: 'Hickory', state: 'nc', zip: '28601' } } }));
  assert.deepEqual([d.subtotal, d.shipping, d.tax, d.total], [1800, 800, 36, 2636]);
  const o = calls.at(-2).body.order; assert.equal(o.fulfillments[0].type, 'SHIPMENT'); assert.equal(o.service_charges[0].amount_money.amount, 800); assert.equal(o.fulfillments[0].shipment_details.recipient.address.administrative_district_level_1, 'NC');
});
test('ship out of state $40+: free shipping, no tax', async () => {
  const [, d] = await call(ok({ items: [{ sku: 'vanilla-4', qty: 2 }, { sku: 'coffee-2', qty: 1 }], fulfillment: { method: 'shipping', address: { line1: '9 Elm', city: 'Greenville', state: 'SC', zip: '29601' } } }));
  assert.deepEqual([d.subtotal, d.shipping, d.tax, d.total], [4600, 0, 0, 4600]);
  const o = calls.at(-2).body.order; assert.equal(o.taxes, undefined); assert.equal(o.service_charges, undefined);
});
test('exactly $40 ships free', () => { const p = priceOrder({ items: [{ sku: 'gift-20', qty: 2 }], contact, fulfillment: { method: 'shipping', address: { line1: 'x', city: 'y', state: 'VA', zip: '22030' } } }, env); assert.equal(p.shipping, 0); assert.equal(p.total, 4000); });
test('tax rate is configurable', () => { const p = priceOrder({ items: [{ sku: 'gift-12', qty: 1 }], contact, fulfillment: { method: 'pickup', market: 'lake-norman' } }, { TAX_RATE_PERCENT: '7.25' }); assert.equal(p.tax, 87); });
test('declined card returns 402 with friendly message', async () => { const [st, d] = await call(ok({ sourceId: 'cnon:card-nonce-declined' })); assert.equal(st, 402); assert.match(d.error, /declined/); });
test('rejects tampered or invalid carts', async () => {
  for (const b of [ok({ items: [{ sku: 'vanilla-9', qty: 1 }] }), ok({ items: [{ sku: 'vanilla-2', qty: 0 }] }), ok({ items: [{ sku: 'vanilla-2', qty: 999 }] }), ok({ items: [] }),
    ok({ fulfillment: { method: 'pickup', market: 'nowhere' } }), ok({ contact: { ...contact, email: 'x' } }), ok({ fulfillment: { method: 'shipping', address: { line1: 'a', city: 'b', state: 'NC', zip: '1' } } })]) {
    const [st] = await call(b); assert.equal(st, 400); }
  const [st] = await call(ok({ expectedTotal: 1 })); assert.equal(st, 409);
});
test('CORS restricted to charisvanilla.com', async () => {
  const [st] = await call(ok(), 'https://evil.example'); assert.equal(st, 403);
  const [, , r] = await call(ok(), 'https://www.charisvanilla.com'); assert.equal(r.headers.get('access-control-allow-origin'), 'https://www.charisvanilla.com');
  const pre = await worker.fetch(req(null, 'https://charisvanilla.com', 'OPTIONS'), env, {}); assert.equal(pre.status, 204);
});
test('not configured -> 503, no Square call', async () => { const n = calls.length; const [st] = await call(ok(), undefined, { SQUARE_ENV: 'sandbox' }); assert.equal(st, 503); assert.equal(calls.length, n); });
test('sandbox vs production base URL', async () => {
  const seen = []; const f = globalThis.fetch; globalThis.fetch = async (u, i) => { seen.push(new URL(u).host); return f('https://mock' + new URL(u).pathname, i); };
  await call(ok(), undefined, { ...env, SQUARE_BASE_URL: '' }); await call(ok(), undefined, { ...env, SQUARE_BASE_URL: '', SQUARE_ENV: 'production' });
  globalThis.fetch = f; assert.deepEqual([...new Set(seen)], ['connect.squareupsandbox.com', 'connect.squareup.com']);
});
