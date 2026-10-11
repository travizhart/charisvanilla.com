// Charis Vanilla Co. checkout Worker (Cloudflare Workers, free plan).
// POST /api/checkout -> recomputes the total from PRICES below, creates a Square Order
// (line items + shipping/pickup fulfillment) and a Square Payment for that order.
// Secrets (wrangler secret put): SQUARE_ACCESS_TOKEN, SQUARE_LOCATION_ID. Never commit them.
// Vars (wrangler.toml): SQUARE_ENV = "sandbox" | "production", ALLOWED_ORIGINS.

export const PRICES = {
  'vanilla-2': { name: 'Pure Vanilla Extract', variation: '2 oz', amount: 1000 },
  'vanilla-4': { name: 'Pure Vanilla Extract', variation: '4 oz', amount: 1800 },
  'coffee-2': { name: 'Coffee Extract', variation: '2 oz', amount: 1000 },
  'coffee-4': { name: 'Coffee Extract', variation: '4 oz', amount: 1800 },
  'gift-12': { name: '$12 Gift Bag', variation: '2 oz vanilla, recipe card, spoon', amount: 1200 },
  'gift-20': { name: '$20 Gift Bag', variation: '4 oz vanilla, recipe card, spoon', amount: 2000 },
};
export const SHIPPING = 800, FREE_SHIPPING_AT = 4000, MAX_QTY = 20;
export const MARKETS = {
  hickory: 'Downtown Hickory Farmers Market (Wednesdays 10am-1pm)',
  'lake-norman': 'Lake Norman Farmers Market, Pursuit Church parking lot, Denver NC (Saturdays 8am-12pm)',
};
const SQUARE_VERSION = '2025-01-23';
// NC sales tax: charged on market pickups and shipments to NC only (0% elsewhere).
// One configurable value: TAX_RATE_PERCENT in wrangler.toml (default 2, the NC food rate,
// pending accountant confirmation). Applied to items only, not shipping.
export const DEFAULT_TAX_RATE_PERCENT = '2';
export const taxRate = env => { const r = Number(env?.TAX_RATE_PERCENT ?? DEFAULT_TAX_RATE_PERCENT); return Number.isFinite(r) && r >= 0 && r < 20 ? r : Number(DEFAULT_TAX_RATE_PERCENT); };
// Square applies an order-level percentage tax to each line item and rounds per line.
export const lineTax = (cents, ratePct) => Math.round(cents * ratePct / 100);

const json = (body, status, cors) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...cors } });
const str = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

function corsHeaders(req, env) {
  const allowed = (env.ALLOWED_ORIGINS || 'https://charisvanilla.com,https://www.charisvanilla.com').split(',').map(s => s.trim());
  const origin = req.headers.get('origin') || '';
  if (!allowed.includes(origin)) return null;
  return { 'access-control-allow-origin': origin, 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '86400', vary: 'origin' };
}

// Pure function: validate a cart + fulfillment and price it from PRICES only.
export function priceOrder(body, env = {}) {
  const errors = [];
  const qty = {};
  if (!Array.isArray(body?.items) || !body.items.length) errors.push('Your cart is empty.');
  for (const it of body?.items || []) {
    const q = Number(it?.qty);
    if (!PRICES[it?.sku]) { errors.push('Unknown product.'); continue; }
    if (!Number.isInteger(q) || q < 1 || q > MAX_QTY) { errors.push('Invalid quantity.'); continue; }
    qty[it.sku] = Math.min(MAX_QTY, (qty[it.sku] || 0) + q);
  }
  const c = body?.contact || {};
  const contact = { name: str(c.name, 100), email: str(c.email, 254), phone: str(c.phone, 30) };
  if (!contact.name) errors.push('Name is required.');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contact.email)) errors.push('A valid email is required.');
  if (contact.phone.replace(/\D/g, '').length < 10) errors.push('A valid phone number is required.');
  const f = body?.fulfillment || {};
  let fulfillment;
  if (f.method === 'pickup') {
    if (!MARKETS[f.market]) errors.push('Choose a pickup market.');
    fulfillment = { method: 'pickup', market: f.market, marketLabel: MARKETS[f.market] };
  } else if (f.method === 'shipping') {
    const a = f.address || {};
    const address = { line1: str(a.line1), line2: str(a.line2), city: str(a.city, 80), state: str(a.state, 2).toUpperCase(), zip: str(a.zip, 10) };
    if (!address.line1 || !address.city) errors.push('Street address and city are required.');
    if (!/^[A-Z]{2}$/.test(address.state)) errors.push('Use a 2-letter state.');
    if (!/^\d{5}(-\d{4})?$/.test(address.zip)) errors.push('Use a 5-digit ZIP code.');
    fulfillment = { method: 'shipping', address };
  } else errors.push('Choose shipping or market pickup.');
  const lines = Object.entries(qty).map(([sku, q]) => ({ sku, qty: q, ...PRICES[sku], total: PRICES[sku].amount * q }));
  const subtotal = lines.reduce((a, l) => a + l.total, 0);
  const shipping = fulfillment?.method === 'shipping' && subtotal < FREE_SHIPPING_AT ? SHIPPING : 0;
  const taxable = fulfillment?.method === 'pickup' || (fulfillment?.method === 'shipping' && fulfillment.address.state === 'NC');
  const taxRatePercent = taxable ? taxRate(env) : 0;
  const tax = lines.reduce((a, l) => a + lineTax(l.total, taxRatePercent), 0);
  return { errors: [...new Set(errors)], lines, subtotal, shipping, taxRatePercent, tax, total: subtotal + shipping + tax, contact, fulfillment };
}

export function buildSquareOrder(p, locationId, ref) {
  const recipient = { display_name: p.contact.name, email_address: p.contact.email, phone_number: p.contact.phone };
  const order = {
    location_id: locationId,
    reference_id: ref,
    source: { name: 'charisvanilla.com' },
    line_items: p.lines.map(l => ({ name: l.name, variation_name: l.variation, quantity: String(l.qty), base_price_money: { amount: l.amount, currency: 'USD' } })),
    fulfillments: [p.fulfillment.method === 'pickup'
      ? { type: 'PICKUP', state: 'PROPOSED', pickup_details: { recipient, schedule_type: 'ASAP', note: `Pickup at ${p.fulfillment.marketLabel}` } }
      : { type: 'SHIPMENT', state: 'PROPOSED', shipment_details: { recipient: { ...recipient, address: {
          address_line_1: p.fulfillment.address.line1, address_line_2: p.fulfillment.address.line2 || undefined,
          locality: p.fulfillment.address.city, administrative_district_level_1: p.fulfillment.address.state,
          postal_code: p.fulfillment.address.zip, country: 'US' } } } }],
  };
  if (p.taxRatePercent > 0) order.taxes = [{ uid: 'nc-sales-tax', name: `NC sales tax (${p.taxRatePercent}%)`, percentage: String(p.taxRatePercent), scope: 'ORDER', type: 'ADDITIVE' }];
  if (p.shipping) order.service_charges = [{ name: 'Shipping', amount_money: { amount: p.shipping, currency: 'USD' }, calculation_phase: 'TOTAL_PHASE', taxable: false }];
  return order;
}

async function square(env, path, body) {
  const base = env.SQUARE_BASE_URL || (env.SQUARE_ENV === 'production' ? 'https://connect.squareup.com' : 'https://connect.squareupsandbox.com');
  let r;
  try { r = await fetch(base + path, { method: 'POST', headers: { authorization: `Bearer ${env.SQUARE_ACCESS_TOKEN}`, 'content-type': 'application/json', 'square-version': SQUARE_VERSION }, body: JSON.stringify(body) }); }
  catch (e) { console.log('square network error', e?.message); return { ok: false, status: 0, data: {} }; }
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data };
}

const cardMessage = (errs = []) => {
  const code = errs[0]?.code || '';
  const map = { CARD_DECLINED: 'Your card was declined.', CVV_FAILURE: 'The security code (CVV) didn\'t match.', ADDRESS_VERIFICATION_FAILURE: 'The ZIP code didn\'t match your card.', INVALID_EXPIRATION: 'The expiration date is invalid.', GENERIC_DECLINE: 'Your card was declined.', INSUFFICIENT_FUNDS: 'Your card was declined (insufficient funds).', INVALID_CARD: 'That card number is invalid.' };
  return map[code] || 'Payment could not be completed. Please check your card details or try another card.';
};

export async function handleCheckout(req, env, ctx, cors) {
  let body;
  try { body = await req.json(); } catch { return json({ ok: false, error: 'Bad request.' }, 400, cors); }
  const p = priceOrder(body, env);
  if (p.errors.length) return json({ ok: false, error: p.errors.join(' ') }, 400, cors);
  if (body.expectedTotal != null && Math.abs(Number(body.expectedTotal) - p.total) > p.lines.length) return json({ ok: false, error: 'Prices have changed. Please review your cart.', total: p.total }, 409, cors);
  const sourceId = str(body.sourceId, 500);
  if (!sourceId) return json({ ok: false, error: 'Missing card details.' }, 400, cors);
  if (!env.SQUARE_ACCESS_TOKEN || !env.SQUARE_LOCATION_ID) return json({ ok: false, error: 'Checkout is not configured yet.' }, 503, cors);
  const key = /^[\w-]{8,45}$/.test(body.idempotencyKey || '') ? body.idempotencyKey : crypto.randomUUID();
  const ref = 'CVC-' + key.slice(0, 8).toUpperCase();

  const o = await square(env, '/v2/orders', { idempotency_key: 'o-' + key, order: buildSquareOrder(p, env.SQUARE_LOCATION_ID, ref) });
  if (!o.ok) { console.log('order error', o.status, JSON.stringify(o.data.errors)); return json({ ok: false, error: 'Could not create the order. Please try again.' }, 502, cors); }
  const order = o.data.order;
  // Square computes tax itself; allow at most 1 cent of rounding difference per line, then charge Square's total.
  if (!order?.total_money || Math.abs(order.total_money.amount - p.total) > p.lines.length) { console.log('total mismatch', order?.total_money, p.total); return json({ ok: false, error: 'Order total mismatch. Please contact us.' }, 502, cors); }

  if (order.total_money.amount !== p.total) { p.tax += order.total_money.amount - p.total; p.total = order.total_money.amount; }
  const pay = await square(env, '/v2/payments', {
    source_id: sourceId, idempotency_key: 'p-' + key, amount_money: { amount: p.total, currency: 'USD' },
    order_id: order.id, location_id: env.SQUARE_LOCATION_ID, autocomplete: true, reference_id: ref,
    buyer_email_address: p.contact.email, verification_token: str(body.verificationToken, 2000) || undefined,
    note: p.fulfillment.method === 'pickup' ? `Pickup: ${p.fulfillment.marketLabel}` : 'Ship to customer',
    ...(p.fulfillment.method === 'shipping' ? { shipping_address: { address_line_1: p.fulfillment.address.line1, address_line_2: p.fulfillment.address.line2 || undefined, locality: p.fulfillment.address.city, administrative_district_level_1: p.fulfillment.address.state, postal_code: p.fulfillment.address.zip, country: 'US' } } : {}),
  });
  if (!pay.ok || !['COMPLETED', 'APPROVED'].includes(pay.data.payment?.status)) {
    console.log('payment error', pay.status, JSON.stringify(pay.data.errors));
    return json({ ok: false, error: cardMessage(pay.data.errors) }, 402, cors);
  }
  const result = { ok: true, reference: ref, orderId: order.id, paymentId: pay.data.payment.id, receiptUrl: pay.data.payment.receipt_url || null,
    lines: p.lines.map(l => ({ name: l.name, variation: l.variation, qty: l.qty, total: l.total })), subtotal: p.subtotal, shipping: p.shipping, tax: p.tax, taxRatePercent: p.taxRatePercent, total: p.total,
    fulfillment: p.fulfillment.method === 'pickup' ? { method: 'pickup', market: p.fulfillment.marketLabel } : { method: 'shipping', address: p.fulfillment.address } };
  if (env.ORDER_EMAIL && env.NOTIFY_TO && env.NOTIFY_FROM) ctx?.waitUntil?.(notify(env, p, result).catch(e => console.log('email error', e?.message)));
  return json(result, 200, cors);
}

const $ = c => '$' + (c / 100).toFixed(2);
export function orderEmailText(p, r, env = {}) {
  return [`New order ${r.reference} on charisvanilla.com${env.SQUARE_ENV === 'production' ? '' : ' (SANDBOX TEST)'}`, '',
    ...p.lines.map(l => `${l.qty} x ${l.name} (${l.variation}) - ${$(l.total)}`),
    `Subtotal: ${$(p.subtotal)}`, `Shipping: ${$(p.shipping)}`, `NC sales tax (${p.taxRatePercent}%): ${$(p.tax)}`, `Total paid: ${$(p.total)}`, '',
    p.fulfillment.method === 'pickup' ? `PICKUP at ${p.fulfillment.marketLabel}` :
      `SHIP TO: ${p.contact.name}, ${p.fulfillment.address.line1}${p.fulfillment.address.line2 ? ', ' + p.fulfillment.address.line2 : ''}, ${p.fulfillment.address.city}, ${p.fulfillment.address.state} ${p.fulfillment.address.zip}`,
    '', `Customer: ${p.contact.name}`, `Email: ${p.contact.email}`, `Phone: ${p.contact.phone}`, '', `Square order: ${r.orderId}`, `Square payment: ${r.paymentId}`].join('\n');
}
async function notify(env, p, r) {
  const { EmailMessage } = await import('cloudflare:email');
  const raw = [`From: Charis Vanilla Orders <${env.NOTIFY_FROM}>`, `To: ${env.NOTIFY_TO}`, `Reply-To: ${p.contact.email}`,
    `Subject: New order ${r.reference} - ${$(p.total)} (${p.fulfillment.method})`, `Message-ID: <${crypto.randomUUID()}@charisvanilla.com>`,
    `Date: ${new Date().toUTCString()}`, 'MIME-Version: 1.0', 'Content-Type: text/plain; charset=utf-8', '', orderEmailText(p, r, env)].join('\r\n');
  await env.ORDER_EMAIL.send(new EmailMessage(env.NOTIFY_FROM, env.NOTIFY_TO, raw));
}

export const handler = {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const cors = corsHeaders(req, env);
    if (url.pathname === '/api/health') return json({ ok: true, env: env.SQUARE_ENV || 'sandbox', taxRatePercent: taxRate(env), configured: !!(env.SQUARE_ACCESS_TOKEN && env.SQUARE_LOCATION_ID) }, 200, cors || {});
    if (url.pathname !== '/api/checkout') return json({ ok: false, error: 'Not found' }, 404, cors || {});
    if (!cors) return json({ ok: false, error: 'Origin not allowed' }, 403, {});
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405, cors);
    return handleCheckout(req, env, ctx, cors);
  },
};
