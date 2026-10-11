/* Charis Vanilla Co. cart: saves to localStorage, drawer UI, shared by all pages.
   Prices here are for display only. The checkout Worker recomputes every total from its own price list. */
(()=>{
const CATALOG={
 'vanilla-2':{name:'Pure Vanilla Extract',size:'2 oz',price:1000},
 'vanilla-4':{name:'Pure Vanilla Extract',size:'4 oz',price:1800},
 'coffee-2':{name:'Coffee Extract',size:'2 oz',price:1000},
 'coffee-4':{name:'Coffee Extract',size:'4 oz',price:1800},
 'gift-12':{name:'$12 Gift Bag',size:'2 oz vanilla, recipe card, spoon',price:1200},
 'gift-20':{name:'$20 Gift Bag',size:'4 oz vanilla, recipe card, spoon',price:2000}};
const KEY='cvc-cart-v1',MAXQ=20,SHIP=800,FREE_AT=4000,TAX_PCT=2; /* TAX_PCT: display only, keep in sync with TAX_RATE_PERCENT in worker/wrangler.toml */
const money=c=>'$'+(c/100).toFixed(c%100?2:0);
const load=()=>{try{const c=JSON.parse(localStorage.getItem(KEY)||'{}');return Object.fromEntries(Object.entries(c).filter(([k,q])=>CATALOG[k]&&q>0).map(([k,q])=>[k,Math.min(MAXQ,q|0)]))}catch(e){return{}}};
let cart=load();
const save=()=>{localStorage.setItem(KEY,JSON.stringify(cart));render();document.dispatchEvent(new CustomEvent('cart:change',{detail:api.lines()}))};
const api={CATALOG,SHIP,FREE_AT,TAX_PCT,money,
 lines:()=>Object.entries(cart).map(([sku,qty])=>({sku,qty,...CATALOG[sku],total:CATALOG[sku].price*qty})),
 count:()=>Object.values(cart).reduce((a,b)=>a+b,0),
 subtotal:()=>api.lines().reduce((a,l)=>a+l.total,0),
 shipping:(method)=>method==='pickup'||api.subtotal()===0?0:(api.subtotal()>=FREE_AT?0:SHIP),
 taxable:(method,state)=>method==='pickup'||(method==='shipping'&&String(state||'').trim().toUpperCase()==='NC'),
 tax:(method,state)=>api.taxable(method,state)?api.lines().reduce((a,l)=>a+Math.round(l.total*TAX_PCT/100),0):0,
 add(sku,q=1){if(!CATALOG[sku])return;cart[sku]=Math.min(MAXQ,(cart[sku]||0)+q);save()},
 set(sku,q){q=Math.max(0,Math.min(MAXQ,q|0));if(q)cart[sku]=q;else delete cart[sku];save()},
 clear(){cart={};save()},open:()=>openDrawer()};
window.CVCart=api;
const ROOT=location.pathname.includes('/how-its-made/')||location.pathname.includes('/checkout/')?'../':'';

/* drawer */
const d=document.createElement('div');d.className='cart-drawer';d.hidden=true;
d.innerHTML=`<div class="cart-scrim" data-cart-close></div>
<aside class="cart-panel" role="dialog" aria-modal="true" aria-labelledby="cart-title" tabindex="-1">
 <div class="cart-head"><h2 id="cart-title">Your cart</h2><button type="button" class="cart-x" data-cart-close aria-label="Close cart">&times;</button></div>
 <ul class="cart-lines"></ul>
 <p class="cart-empty">Your cart is empty.</p>
 <div class="cart-foot">
  <p class="cart-sub"><span>Subtotal</span><strong></strong></p>
  <p class="cart-sub cart-tax"><span>NC sales tax (${TAX_PCT}%)</span><strong></strong></p>
  <p class="cart-ship-hint"></p>
  <a class="btn btn-primary cart-go" href="${ROOT}checkout/">Checkout</a>
  <button type="button" class="btn btn-ghost" data-cart-close>Keep shopping</button>
 </div>
</aside>`;
document.body.appendChild(d);
const panel=d.querySelector('.cart-panel');let lastFocus=null;
function openDrawer(){lastFocus=document.activeElement;d.hidden=false;requestAnimationFrame(()=>d.classList.add('open'));document.body.classList.add('cart-lock');panel.focus()}
function closeDrawer(){d.classList.remove('open');document.body.classList.remove('cart-lock');setTimeout(()=>{d.hidden=true},250);lastFocus&&lastFocus.focus&&lastFocus.focus()}
d.addEventListener('click',e=>{if(e.target.closest('[data-cart-close]'))closeDrawer();
 const b=e.target.closest('[data-q]');if(b){const sku=b.closest('li').dataset.sku;api.set(sku,(cart[sku]||0)+(+b.dataset.q))}
 const r=e.target.closest('[data-rm]');if(r)api.set(r.closest('li').dataset.sku,0)});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!d.hidden)closeDrawer()});
document.querySelectorAll('[data-cart-open]').forEach(b=>b.addEventListener('click',openDrawer));

function render(){
 const n=api.count();document.querySelectorAll('[data-cart-count]').forEach(c=>{c.textContent=n;c.hidden=!n});
 document.querySelectorAll('[data-cart-open]').forEach(b=>b.setAttribute('aria-label',`Open cart, ${n} item${n===1?'':'s'}`));
 const ls=api.lines(),ul=d.querySelector('.cart-lines');
 ul.innerHTML=ls.map(l=>`<li data-sku="${l.sku}"><div class="cl-info"><strong>${l.name}</strong><small>${l.size} · ${money(l.price)} each</small></div>
  <div class="cl-qty"><button type="button" data-q="-1" aria-label="One fewer">−</button><span aria-live="polite">${l.qty}</span><button type="button" data-q="1" aria-label="One more"${l.qty>=MAXQ?' disabled':''}>+</button></div>
  <div class="cl-tot">${money(l.total)}<button type="button" class="cl-rm" data-rm>Remove</button></div></li>`).join('');
 d.querySelector('.cart-empty').hidden=!!ls.length;d.querySelector('.cart-foot').hidden=!ls.length;
 const sub=api.subtotal();d.querySelector('.cart-sub strong').textContent=money(sub);d.querySelector('.cart-tax strong').textContent=money(api.tax('pickup'));
 d.querySelector('.cart-ship-hint').textContent=sub>=FREE_AT?'Free shipping unlocked. Market pickup is always free. NC tax applies to pickups and NC shipments; none on out-of-state shipping.':`Shipping $8, free at $40+ (${money(FREE_AT-sub)} to go). Market pickup is free. NC tax applies to pickups and NC shipments; none on out-of-state shipping.`;
}
render();
window.addEventListener('storage',e=>{if(e.key===KEY){cart=load();render()}});

/* product cards */
document.querySelectorAll('.buy[data-product]').forEach(b=>{const btn=b.querySelector('.add-cart');if(!btn)return;
 btn.addEventListener('click',()=>{const sz=b.querySelector('input[type=radio]:checked').value,qi=b.querySelector('.qty input');
  const q=Math.max(1,Math.min(MAXQ,parseInt(qi.value,10)||1));api.add(`${b.dataset.product}-${sz}`,q);
  b.querySelector('.buy-msg').textContent=`Added ${q} × ${sz} oz to your cart.`;qi.value=1;openDrawer()})});
document.querySelectorAll('[data-add-sku]').forEach(b=>b.addEventListener('click',()=>{api.add(b.dataset.addSku,1);openDrawer()}));
})();
