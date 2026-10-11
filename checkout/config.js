/* Public checkout settings (safe to publish: no secrets here).
   Sandbox:    appId sandbox-sq0idb-baF_xw3QvvO-XUhopHuA1Q, location L95W9WZBSP351
   Production: appId sq0idp-aE9pWyebXWTlT8eTcca43g, location LYH7H3N7B2R57 (main "Charis Vanilla";
               all online orders go here, the pickup market is named in the order's pickup details).
               Market locations (not used online): Hickory LVPP38TTY30Q8, Lake Norman L5VE99W7GVVSG.
   api: the Cloudflare Worker URL. With no appId, the page runs in preview/mock mode. */
window.CVC_CONFIG={
  env:'sandbox',
  appId:'sandbox-sq0idb-baF_xw3QvvO-XUhopHuA1Q',
  locationId:'L95W9WZBSP351',
  api:'https://charis-checkout.charisvanilla.workers.dev'
};
