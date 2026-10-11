(()=>{
const C=window.CVC_CONFIG||{},cart=window.CVCart,$=id=>document.getElementById(id),money=cart.money;
const qs=new URLSearchParams(location.search);
const API=qs.get('api')||C.api, MOCK=!C.appId||qs.has('mock');
const f=$('co-form'),err=$('co-err'),pay=$('co-pay');
let card=null,wallets=[],busy=false;
const method=()=>f.elements.method.value,state=()=>f.elements.state.value;
function totals(){const sub=cart.subtotal(),ship=cart.shipping(method()),tax=cart.tax(method(),state());return{sub,ship,tax,total:sub+ship+tax}}
function render(){
 const ls=cart.lines();$('co-grid').hidden=!ls.length;document.querySelector('.co-empty').hidden=!!ls.length||!$('co-done').hidden;
 $('co-lines').innerHTML=ls.map(l=>`<li><span>${l.qty} × ${l.name}<small>${l.size}</small></span><span>${money(l.total)}</span></li>`).join('');
 const t=totals();$('co-sub').textContent=money(t.sub);
 $('co-shipamt').textContent=method()==='pickup'?'Free (pickup)':(t.ship?money(t.ship):'Free');
 const tx=cart.taxable(method(),state());$('co-taxlabel').textContent=tx?`NC sales tax (${cart.TAX_PCT}%)`:'Sales tax';
 $('co-tax').textContent=tx?money(t.tax):(method()==='shipping'&&!state().trim()?'Enter state':'$0 (out of state)');
 $('co-total').textContent=money(t.total);pay.textContent=`Pay ${money(t.total)}`;
 const m=method();$('co-pickup').hidden=m!=='pickup';$('co-ship').hidden=m!=='shipping';
 ['line1','city','state','zip'].forEach(n=>f.elements[n].required=m==='shipping');
}
f.addEventListener('change',render);f.elements.state.addEventListener('input',render);document.addEventListener('cart:change',render);
render();

async function initSquare(){
 if(MOCK){const m=$('co-mock');m.hidden=false;m.textContent='Preview mode: Square is not connected yet, so no card form is shown and the test card nonce is used.';$('card-container').hidden=true;return}
 await new Promise((res,rej)=>{const s=document.createElement('script');s.src=C.env==='production'?'https://web.squarecdn.com/v1/square.js':'https://sandbox.web.squarecdn.com/v1/square.js';s.onload=res;s.onerror=rej;document.head.appendChild(s)});
 const payments=window.Square.payments(C.appId,C.locationId);
 card=await payments.card({style:{input:{fontSize:'16px',color:'#2a1b11'},'.input-container.is-focus':{borderColor:'#3b2618'}}});await card.attach('#card-container');
 const req=()=>{const t=totals();return payments.paymentRequest({countryCode:'US',currencyCode:'USD',total:{amount:(t.total/100).toFixed(2),label:'Charis Vanilla Co.'}})};
 try{const g=await payments.googlePay(req());await g.attach('#google-pay',{buttonSizeMode:'fill',buttonType:'long'});wallets.push(['#google-pay',g])}catch(e){$('google-pay').hidden=true}
 try{const a=await payments.applePay(req());const el=$('apple-pay');el.hidden=false;el.innerHTML='<button type="button" class="btn btn-primary" style="width:100%;background:#000">Pay with Apple Pay</button>';wallets.push(['#apple-pay',a])}catch(e){}
 wallets.forEach(([sel,w])=>document.querySelector(sel).addEventListener('click',e=>{e.preventDefault();submit(w)}));
}
initSquare().catch(e=>{err.textContent='The payment form could not load. Please refresh, or email hello@charisvanilla.com.';console.error(e)});

function validate(){
 const e=f.elements,m=method();
 if(!e.name.value.trim())return'Please enter your name.';
 if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e.email.value.trim()))return'Please enter a valid email.';
 if(e.phone.value.replace(/\D/g,'').length<10)return'Please enter a phone number with area code.';
 if(m==='pickup'&&!e.market.value)return'Please choose which market you\'ll pick up at.';
 if(m==='shipping'){if(!e.line1.value.trim()||!e.city.value.trim())return'Please enter your street address and city.';
  if(!/^[A-Za-z]{2}$/.test(e.state.value.trim()))return'Please use a 2-letter state, like NC.';
  if(!/^\d{5}(-\d{4})?$/.test(e.zip.value.trim()))return'Please enter a 5-digit ZIP code.'}
 return'';
}
let idem=sessionStorage.getItem('cvc-idem')||crypto.randomUUID();sessionStorage.setItem('cvc-idem',idem);
async function submit(method_=null){
 if(busy)return;err.textContent='';const v=validate();if(v){err.textContent=v;return}
 if(!API){err.textContent='Checkout is not connected yet. Please email hello@charisvanilla.com to order.';return}
 busy=true;pay.disabled=true;pay.textContent='Processing…';
 try{
  let sourceId='cnon:card-nonce-ok';
  if(!MOCK){const r=await (method_||card).tokenize();if(r.status!=='OK'){throw new Error(r.errors?.[0]?.message||'Please check your card details.')}sourceId=r.token}
  const e=f.elements,m=method();
  const body={items:cart.lines().map(l=>({sku:l.sku,qty:l.qty})),expectedTotal:totals().total,sourceId,idempotencyKey:idem,
   contact:{name:e.name.value.trim(),email:e.email.value.trim(),phone:e.phone.value.trim()},
   fulfillment:m==='pickup'?{method:'pickup',market:e.market.value}:{method:'shipping',address:{line1:e.line1.value,line2:e.line2.value,city:e.city.value,state:e.state.value,zip:e.zip.value}}};
  const res=await fetch(API.replace(/\/$/,'')+'/api/checkout',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  const d=await res.json().catch(()=>({ok:false,error:'Unexpected response.'}));
  if(!d.ok){if(res.status===402||res.status===400){}else{idem=crypto.randomUUID();sessionStorage.setItem('cvc-idem',idem)}throw new Error(d.error||'Payment failed.')}
  sessionStorage.removeItem('cvc-idem');done(d,body.contact.email);
 }catch(x){err.textContent=x.message;busy=false;pay.disabled=false;render()}
}
f.addEventListener('submit',e=>{e.preventDefault();submit()});
function done(d,email){
 cart.clear();$('co-grid').hidden=true;document.querySelector('.co-empty').hidden=true;$('co-title').textContent='Order confirmed';
 const s=$('co-done');s.hidden=false;$('done-ref').textContent=`Order number ${d.reference}`;$('done-email').textContent=email;
 $('done-lines').innerHTML=d.lines.map(l=>`<li><span>${l.qty} × ${l.name}<small>${l.variation}</small></span><span>${money(l.total)}</span></li>`).join('');
 $('done-tots').innerHTML=`<p class="co-tot"><span>Subtotal</span><span>${money(d.subtotal)}</span></p><p class="co-tot"><span>Shipping</span><span>${d.shipping?money(d.shipping):'Free'}</span></p><p class="co-tot"><span>${d.tax?`NC sales tax (${d.taxRatePercent}%)`:'Sales tax'}</span><span>${money(d.tax)}</span></p><p class="co-tot co-grand"><span>Total paid</span><span>${money(d.total)}</span></p>`;
 const a=d.fulfillment.address;$('done-ful').innerHTML=d.fulfillment.method==='pickup'?`<strong>Pickup:</strong> ${d.fulfillment.market}. We'll have your order ready at our table.`:`<strong>Shipping to:</strong> ${a.line1}${a.line2?', '+a.line2:''}, ${a.city}, ${a.state} ${a.zip}`;
 if(d.receiptUrl)$('done-receipt').innerHTML=`<a href="${d.receiptUrl}" target="_blank" rel="noopener">View your Square receipt</a>`;
 s.focus({preventScroll:true});window.scrollTo({top:0,behavior:'instant'});
}
})();
