// Minimal mock of Square's CreateOrder / CreatePayment for local tests. Mirrors Square's sandbox
// test nonces: cnon:card-nonce-ok succeeds, cnon:card-nonce-declined is declined.
import http from 'node:http';
export const calls = [];
export function orderTotal(o) {
  const pct = Number(o.taxes?.[0]?.percentage || 0);
  let items = 0, tax = 0;
  for (const l of o.line_items) { const t = l.base_price_money.amount * Number(l.quantity); items += t; tax += Math.round(t * pct / 100); }
  const sc = (o.service_charges || []).reduce((a, s) => a + s.amount_money.amount, 0);
  return { items, tax, sc, total: items + tax + sc };
}
export function handle(path, body, headers = {}) {
  calls.push({ path, body, auth: headers.authorization });
  if (!String(headers.authorization || '').startsWith('Bearer ')) return [401, { errors: [{ code: 'UNAUTHORIZED' }] }];
  if (path === '/v2/orders') { const t = orderTotal(body.order); return [200, { order: { id: 'ORD_' + body.idempotency_key.slice(2, 10), ...body.order, total_money: { amount: t.total, currency: 'USD' }, total_tax_money: { amount: t.tax, currency: 'USD' }, state: 'OPEN' } }]; }
  if (path === '/v2/payments') {
    if (body.source_id === 'cnon:card-nonce-declined') return [400, { errors: [{ category: 'PAYMENT_METHOD_ERROR', code: 'CARD_DECLINED' }] }];
    return [200, { payment: { id: 'PAY_' + body.idempotency_key.slice(2, 10), status: 'COMPLETED', amount_money: body.amount_money, order_id: body.order_id, receipt_url: 'https://squareupsandbox.com/receipt/preview/TEST' } }];
  }
  return [404, { errors: [{ code: 'NOT_FOUND' }] }];
}
if (process.argv[1] && process.argv[1].endsWith('mock-square.js')) {
  http.createServer((req, res) => { let b = ''; req.on('data', c => b += c); req.on('end', () => {
    const [st, out] = handle(req.url, JSON.parse(b || '{}'), req.headers);
    console.log(req.method, req.url, st, JSON.stringify(JSON.parse(b || '{}')).slice(0, 400));
    res.writeHead(st, { 'content-type': 'application/json' }); res.end(JSON.stringify(out)); }); }).listen(18791, '127.0.0.1', () => console.log('mock square on 18791'));
}
