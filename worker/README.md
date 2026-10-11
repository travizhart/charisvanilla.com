# charis-checkout (Cloudflare Worker)

POST /api/checkout: validates the cart, recomputes prices, shipping ($8, free at $40+ subtotal) and
NC sales tax (TAX_RATE_PERCENT, default 2, on market pickups and NC shipments only) from src/lib.js,
creates a Square Order (line items, tax, shipping service charge, PICKUP/SHIPMENT fulfillment), then a
Square Payment for that order. GET /api/health reports env/config (no secrets).

Test:   npm install && npm test                      (unit tests, mocked Square)
Local:  node test/mock-square.js  +  npx wrangler dev  (.dev.vars: SQUARE_BASE_URL=http://127.0.0.1:18791)
Deploy: npx wrangler secret put SQUARE_ACCESS_TOKEN
        npx wrangler secret put SQUARE_LOCATION_ID
        npx wrangler deploy
Then put the Worker URL, Square application ID and location ID in ../checkout/config.js.
Go live: SQUARE_ENV="production" in wrangler.toml + production secrets + production appId in config.js.
