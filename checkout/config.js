/* Public checkout settings (safe to publish: no secrets here).
   env: "sandbox" or "production". appId + locationId come from the Square Developer dashboard.
   api: the Cloudflare Worker URL. With no appId, the page runs in preview/mock mode. */
window.CVC_CONFIG={
  env:'sandbox',
  appId:'',        // sandbox-sq0idb-...  (production: sq0idp-...)
  locationId:'',   // L...
  api:''           // https://charis-checkout.<subdomain>.workers.dev
};
