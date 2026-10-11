#!/usr/bin/env bash
# GO LIVE: switch the checkout from Square sandbox to PRODUCTION and publish the cart to charisvanilla.com.
# Run only after Travis/owner approval:   bash worker/go-live.sh
# Needs: wrangler OAuth login (owner's Cloudflare), gh logged in, and the PRODUCTION Square token in
#        $SQUARE_SANDBOX_ACCESS_TOKEN (misnamed var; it really holds the production token).
set -euo pipefail
cd "$(dirname "$0")/.."            # repo root
PROD_APP_ID="sq0idp-aE9pWyebXWTlT8eTcca43g"
PROD_LOCATION="LYH7H3N7B2R57"
WORKER_URL="https://charis-checkout.charisvanilla.workers.dev"
W() { env -u CLOUDFLARE_API_TOKEN npx --prefix worker wrangler "$@"; }
[[ -n "${SQUARE_SANDBOX_ACCESS_TOKEN:-}" ]] || { echo "SQUARE_SANDBOX_ACCESS_TOKEN (production token) is not set"; exit 1; }
[[ -z "$(git status --porcelain)" ]] || { echo "Working tree not clean"; exit 1; }
git checkout cart-checkout && git pull -q --ff-only

echo "1/6 Check the production token can see the main location (read-only)"
curl -fsS https://connect.squareup.com/v2/locations/$PROD_LOCATION \
  -H "Authorization: Bearer $SQUARE_SANDBOX_ACCESS_TOKEN" -H "Square-Version: 2025-01-23" | grep -Eq '"status": *"ACTIVE"' \
  || { echo "Production token/location check failed"; exit 1; }

echo "2/6 Worker vars: production, charisvanilla.com origins only"
sed -i 's/^SQUARE_ENV = "sandbox"/SQUARE_ENV = "production"/' worker/wrangler.toml
sed -i 's#^ALLOWED_ORIGINS = .*#ALLOWED_ORIGINS = "https://charisvanilla.com,https://www.charisvanilla.com"#' worker/wrangler.toml
grep -q '^SQUARE_ENV = "production"' worker/wrangler.toml

echo "3/6 Production secrets + deploy"
(cd worker && printf %s "$SQUARE_SANDBOX_ACCESS_TOKEN" | env -u CLOUDFLARE_API_TOKEN npx wrangler secret put SQUARE_ACCESS_TOKEN)
(cd worker && printf %s "$PROD_LOCATION" | env -u CLOUDFLARE_API_TOKEN npx wrangler secret put SQUARE_LOCATION_ID)
(cd worker && env -u CLOUDFLARE_API_TOKEN npx wrangler deploy)
sleep 5; curl -fsS "$WORKER_URL/api/health" | tee /dev/stderr | grep -q '"env":"production","taxRatePercent":2,"configured":true'

echo "4/6 Front end: production app ID + location, bump cache versions"
sed -i "s/^  env:'sandbox',/  env:'production',/; s/^  appId:'[^']*',/  appId:'$PROD_APP_ID',/; s/^  locationId:'[^']*',/  locationId:'$PROD_LOCATION',/" checkout/config.js
grep -q "appId:'$PROD_APP_ID'" checkout/config.js
bump() { perl -pi -e 's/(\Q'"$1"'\E\?v=)(\d+)/$1.($2+1)/ge' index.html how-its-made/index.html checkout/index.html; }
bump styles.css; bump app.js; bump cart.js; bump config.js; bump checkout.js

echo "5/6 Commit, merge to main, push (GitHub Pages publishes main)"
git add -A && git commit -qm "Go live: Square production checkout"
git push -q origin cart-checkout
git checkout main && git pull -q --ff-only && git merge --no-ff -q cart-checkout -m "Launch on-site cart and Square checkout" && git push -q origin main

echo "6/6 Done. Check https://charisvanilla.com/checkout/ after Pages builds (~1 min)."
echo "Optional cleanup: delete the sandbox test copy at travizhart.github.io/site-previews/charis-cart-test/"
