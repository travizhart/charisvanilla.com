(()=>{
const t=document.querySelector('.nav-toggle'),l=document.getElementById('nav-list');
if(t){t.addEventListener('click',()=>{const o=t.getAttribute('aria-expanded')==='true';t.setAttribute('aria-expanded',String(!o));l.classList.toggle('open',!o)});
 l.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>{t.setAttribute('aria-expanded','false');l.classList.remove('open')}))}
(()=>{const sf=document.getElementById('site-search');if(!sf)return;const q=document.getElementById('q'),m=document.getElementById('search-msg');
const idx=[['vanilla','#vanilla','Pure Madagascar Vanilla Extract'],['madagascar','#vanilla','Vanilla Extract'],['coffee','#coffee','Coffee Extract'],['arabica','#coffee','Coffee Extract'],['espresso','#coffee','Coffee Extract'],['extract','#extracts','Extracts'],['price','#extracts','Prices'],['gift','#gifts','Gift bags'],['bag','#gifts','Gift bags'],['present','#gifts','Gift bags'],['market','#markets','Markets'],['hickory','#markets','Downtown Hickory Farmers Market'],['lake norman','#markets','Lake Norman Farmers Market'],['denver','#markets','Lake Norman Farmers Market'],['hours','#markets','Market days & hours'],['saturday','#markets','Market days'],['wednesday','#markets','Market days'],['how it','page:how-its-made/','How it\'s made'],['made','page:how-its-made/','How it\'s made'],['process','page:how-its-made/','How it\'s made'],['strain','page:how-its-made/','How it\'s made'],['bottl','page:how-its-made/','How it\'s made'],['smell','#smell-test','Smell test'],['video','#smell-test','Smell test videos'],['story','#story','Our story'],['about','#story','Our story'],['order','#order','Order request'],['buy','#order','Order request'],['contact','#order','Contact']];
sf.addEventListener('submit',e=>{e.preventDefault();const t=q.value.trim().toLowerCase();m.textContent='';if(!t)return;
 let hit=idx.find(([k])=>k.includes(t)||t.includes(k));const sub=location.pathname.includes('/how-its-made/');
 if(hit&&hit[1].startsWith('page:')){if(sub){const p=document.getElementById('process');p&&p.scrollIntoView({behavior:'smooth'});m.textContent='Showing: How it\'s made';return}location.href=hit[1].slice(5);return}
 if(hit&&sub){location.href='../'+hit[1];return}
 let el=hit&&document.querySelector(hit[1]);
 if(!el){el=[...document.querySelectorAll('main section, main article')].find(x=>x.textContent.toLowerCase().includes(t));}
 if(!el){m.textContent=`No results for "${q.value.trim()}". Try vanilla, coffee, gift bags or markets.`;return}
 m.textContent='Showing: '+(hit?hit[2]:(el.querySelector('h2,h3')||{}).textContent||'result');
 el.scrollIntoView({behavior:'smooth',block:'start'});el.classList.add('search-hit');setTimeout(()=>el.classList.remove('search-hit'),2200);});
q.addEventListener('input',()=>{if(!q.value)m.textContent=''});})();
const f=document.getElementById('order-form');if(!f)return;
const qs=[...f.querySelectorAll('input[data-price]')],tot=document.getElementById('total'),msg=document.getElementById('form-msg');
const n=i=>Math.max(0,Math.min(50,parseInt(i.value,10)||0));
const calc=()=>{const s=qs.reduce((a,i)=>a+n(i)*+i.dataset.price,0);tot.textContent='$'+s;return s};
qs.forEach(i=>i.addEventListener('input',calc));
document.querySelectorAll('[data-preset="gift12"]').forEach(b=>b.addEventListener('click',()=>{const g=document.getElementById('gift12-qty');if(n(g)===0){g.value=1;calc()}}));
document.querySelectorAll('[data-preset="gift"]').forEach(b=>b.addEventListener('click',()=>{const g=document.getElementById('gift-qty');if(n(g)===0){g.value=1;calc()}}));
document.querySelectorAll('.buy').forEach(b=>b.querySelector('.add-order').addEventListener('click',()=>{
 const sz=b.querySelector('input[type=radio]:checked').value,q=Math.max(1,Math.min(50,parseInt(b.querySelector('.qty input').value,10)||1));
 const i=f.querySelector(`[data-key="${b.dataset.product}-${sz}"]`);i.value=Math.min(50,n(i)+q);calc();
 b.querySelector('.buy-msg').textContent=`Added ${q} × ${sz} oz to your order.`;
 i.closest('tr').classList.add('flash');setTimeout(()=>i.closest('tr').classList.remove('flash'),1500);
 document.getElementById('order').scrollIntoView({behavior:'smooth'});}));
f.addEventListener('submit',e=>{e.preventDefault();msg.classList.remove('err');
 const items=qs.filter(i=>n(i)>0).map(i=>`- ${n(i)} x ${i.dataset.item} ($${n(i)*+i.dataset.price})`);
 const name=f.elements['name'].value.trim(),reach=f.elements['reach'].value.trim(),notes=f.elements['notes'].value.trim();
 if(!items.length){msg.textContent='Add at least one bottle or gift bag first.';msg.classList.add('err');return}
 if(!name||!reach){msg.textContent='Please add your name and a phone number or email so we can reply.';msg.classList.add('err');return}
 const body=`Hi Charis Vanilla Co.,\n\nI'd like to request:\n${items.join('\n')}\n\nEstimated total: $${calc()}\n\nName: ${name}\nPhone/email: ${reach}${notes?'\nNotes: '+notes:''}\n\nThank you!`;
 location.href='mailto:hello@charisvanilla.com?subject='+encodeURIComponent('Order request from '+name)+'&body='+encodeURIComponent(body);
 msg.textContent='Your email app should open with the order written out. Press send there to finish.';
});
})();
