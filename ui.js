const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cash=n=>(n/100).toLocaleString('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2});
const exactCash=n=>(n/100n).toLocaleString('th-TH')+'.'+String(n%100n).padStart(2,'0');
const stockValue=p=>BigInt(p.qty)*BigInt(p.price);
const names={home:'ภาพรวมคลัง',stock:'สินค้าในคลัง',moves:'รับเข้า / เบิกออก',sales:'บิลขาย / ใบแจ้งหนี้',reports:'รายงานยอดขาย',bills:'วางบิล',customers:'สมาชิก / ลูกค้า',settings:'ข้อมูลบริษัท'};
const icons=['▦','▤','⇄','▧','▦','▥','♙','⚙'];
const kinds={IN:'ใบรับสินค้า',OUT:'ใบเบิกสินค้า',INV:'ใบแจ้งหนี้',BILL:'ใบวางบิล'};
const code=d=>d.kind+'-'+String(d.id).padStart(5,'0');
const day=s=>new Date(s.length===10?s+'T00:00:00':s).toLocaleDateString('th-TH',{day:'numeric',month:'short',year:'numeric'});
const today=()=>new Date().toLocaleDateString('sv-SE');
let db,tab='home',toastTimer;
const act=(label,js,cls='')=>'<button type="button" class="'+cls+'" onclick="'+js+'">'+label+'</button>';
const table=(heads,rows,empty)=>'<table><thead><tr>'+heads.map(h=>'<th>'+h+'</th>').join('')+'</tr></thead><tbody>'+ (rows.join('')||'<tr><td class="empty" colspan="'+heads.length+'">'+empty+'</td></tr>')+'</tbody></table>';
const tr=cells=>'<tr>'+cells.map(c=>'<td>'+c+'</td>').join('')+'</tr>';
const panel=(title,body)=>'<section class="panel"><div class="row"><h2>'+title+'</h2></div>'+body+'</section>';
const btnDoc=(k,label)=>act(label,"transactionForm('"+k+"')",'primary');
const findDoc=id=>db.doc.find(d=>d.id===id);
const findProduct=id=>db.product.find(p=>p.id===id);
function toast(msg){$('#toast').textContent=msg;$('#toast').style.display='block';clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').style.display='none',3000)}
async function refresh(){const res=await fetch('/api');if(!res.ok)throw Error('อ่านฐานข้อมูลไม่สำเร็จ');db=await res.json();render()}
function go(v){tab=v;render()}
function docsTable(docs){
 return table(['เลขที่เอกสาร','วันที่','ประเภท','ลูกค้า / คู่ค้า','ยอดเอกสาร (บาท)',''],docs.map(d=>tr([code(d),day(d.created),'<span class="pill">'+kinds[d.kind]+'</span>',esc(d.party)||'—',d.kind==='OUT'?'—':cash(d.total),act('เปิด','openDoc('+d.id+')')])), 'ยังไม่มีเอกสาร');
}
const categoryName=id=>db.category.find(c=>c.id===id)?.name??'ไม่ระบุหมวด';
const matches=(query, values)=>query.trim().toLowerCase().split(/\s+/).every(word=>values.join(' ').toLowerCase().includes(word));
const productMatches=(query,p)=>matches(query,[p.sku,p.name,p.unit,categoryName(p.category_id)]);
const pointsBalance=id=>db.points_entry.filter(p=>p.customer===id).reduce((sum,p)=>sum+p.points,0);

function stockTable(products, editable=false){
 const headings=['รหัสสินค้า','ชื่อสินค้า','หมวดหมู่','คงเหลือ','หน่วย','ราคาขาย / หน่วย','มูลค่าคงเหลือ','สถานะ'];
 if(editable) headings.push('จัดการ');
 return table(headings,products.map(p=>tr([
  esc(p.sku),esc(p.name),esc(categoryName(p.category_id)),'<b>'+p.qty+'</b>',esc(p.unit),cash(p.price),
  exactCash(stockValue(p)),p.qty<=p.minimum?'<span class="pill warn">ถึงจุดสั่งซื้อ</span>':'<span class="pill">พร้อมขาย</span>',
  ...(editable?[act('แก้ไข','productForm('+p.id+')')]:[])
 ])),'ไม่พบสินค้า');
}
function categoryOptions(selected=''){
 return '<option value="">ไม่ระบุหมวด</option>'+db.category.map(c=>'<option value="'+c.id+'" '+(c.id===selected?'selected':'')+'>'+esc(c.name)+'</option>').join('');
}
function updateStockSearch(){
 const category=$('#category-filter').value;
 const products=db.product.filter(p=>
  (category==='all'||String(p.category_id??'')===category)&&productMatches($('#search').value,p));
 const value=products.reduce((sum,p)=>sum+stockValue(p),0n);
 $('#stock-summary').textContent=products.length+' รายการ · มูลค่าคงเหลือตามราคาขาย ฿ '+exactCash(value);
 $('#products').innerHTML=stockTable(products,true);
}
function salesReport(inv){
 const now=new Date(),startWeek=new Date(now);
 startWeek.setDate(now.getDate()-((now.getDay()+6)%7));
 const dateKey=date=>date.toLocaleDateString('sv-SE');
 const current=today();
 const periods=[['วันนี้',current],['สัปดาห์นี้',dateKey(startWeek)],['เดือนนี้',current.slice(0,7)+'-01']];
 return table(['ช่วงเวลา','ตั้งแต่','ถึง','บิลขาย','ยอดขายสุทธิ (บาท)','ยอดรับเงินจริง (บาท)'],
  periods.map(([label,start])=>{
   const inPeriod=date=>date.slice(0,10)>=start&&date.slice(0,10)<=current;
   const sold=inv.filter(d=>inPeriod(d.created));
   const paid=db.payment.filter(p=>inPeriod(p.created));
   return tr([label,day(start),day(current),sold.length,cash(sold.reduce((sum,d)=>sum+d.total,0)),
    cash(paid.reduce((sum,p)=>sum+p.amount,0))]);
  }),'');
}
function render(){
 $('#nav').innerHTML=Object.keys(names).map((v,i)=>act('<b>'+icons[i]+'</b>'+names[v],"go('"+v+"')",v===tab?'active':'')).join('');
 $('#crumb').textContent='Stockroom  /  '+names[tab];$('#today').textContent=day(today());
 const docs=db.doc.slice().reverse(),inv=docs.filter(d=>d.kind==='INV'), low=db.product.filter(p=>p.qty<=p.minimum);
 let action='',body='';
 if(tab==='home'){
 action=btnDoc('INV','＋ เปิดบิลขาย');
 const sales=inv.filter(d=>d.created.startsWith(today()));
 body='<div class="hero">ยอดขายวันนี้<strong>฿ '+cash(sales.reduce((s,d)=>s+d.total,0))+'</strong><small>'+sales.length+' บิลขาย</small></div><div class="cards">'+[['รายการสินค้า',db.product.length,'รหัสสินค้า'],['ถึงจุดสั่งซื้อ',low.length,'รายการ'],['ยอดค้างรับ','฿ '+cash(inv.reduce((s,d)=>s+d.total-d.paid,0)),'บาท']].map(([a,b,c])=>'<div class="card">'+a+'<strong>'+b+'</strong><small>'+c+'</small></div>').join('')+'</div><div class="actions">'+act('＋ เพิ่มสินค้า','productForm()')+btnDoc('IN','↓ รับเข้าคลัง')+btnDoc('OUT','↑ เบิกออก')+'</div>'+panel('เอกสารล่าสุด',docsTable(docs.slice(0,6)))+panel('สินค้าถึงจุดสั่งซื้อ',stockTable(low));
 }else if(tab==='stock'){
 action=act('＋ เพิ่มสินค้า','productForm()','primary')+act('＋ เพิ่มหมวดหมู่','categoryForm()');
 body='<section class="panel"><div class="fields"><label>ค้นหาสินค้า<input id="search" type="search" placeholder="รหัส ชื่อสี หมวด หรือหน่วย"></label><label>หมวดหมู่<select id="category-filter"><option value="all">ทุกหมวดหมู่</option>'+categoryOptions()+'</select></label></div><p id="stock-summary" class="amount" aria-live="polite"></p><div id="products"></div></section>';
 }else if(tab==='moves'){
 action=btnDoc('IN','↓ รับสินค้าเข้า')+btnDoc('OUT','↑ เบิกสินค้าออก');
 body=panel('รับสินค้าใหม่','<p>เพิ่มสินค้าและระบุหน่วยนับก่อน เมื่อรับของจริงให้กดรับสินค้าเข้า เลือกสินค้า แล้วกรอกจำนวน</p><br>'+act('＋ เพิ่มสินค้า','productForm(null, true)'))+panel('ประวัติการเคลื่อนไหว',table(['วันที่','เอกสาร','สินค้า','จำนวน','หน่วย'],db.line.slice().reverse().map(l=>{const d=findDoc(l.doc),p=findProduct(l.product);return tr([day(d.created),act(code(d),'openDoc('+d.id+')'),esc(l.name||p.name),(d.kind==='IN'?'+':'−')+l.qty,esc(l.unit||p.unit)])}),'ยังไม่มีการเคลื่อนไหว'));
 }else if(tab==='sales'){
 action=btnDoc('INV','＋ เปิดบิลขาย');body=panel('บัญชีลูกหนี้',table(['ใบแจ้งหนี้','ลูกค้า','ครบกำหนด','ยอดขาย','ค้างรับ (บาท)','จัดการ'],inv.map(d=>tr([act(code(d),'openDoc('+d.id+')'),esc(d.party),day(d.due),cash(d.total),cash(d.total-d.paid),d.total>d.paid?act('รับชำระ','payForm('+d.id+')'):'<span class="pill">ชำระครบ</span>'])),'ยังไม่มีบิลขาย'));
 }else if(tab==='reports'){body=panel('ยอดขายตามวันที่เปิดบิล และยอดรับเงินตามวันที่ชำระ',salesReport(inv))}
 else if(tab==='bills'){action=act('＋ สร้างใบวางบิล','billForm()','primary');body=panel('รายการใบวางบิล',docsTable(docs.filter(d=>d.kind==='BILL')))}
 else if(tab==='customers'){
  action=act('＋ เพิ่มสมาชิก','customerForm()','primary')+act('ตั้งค่าแต้ม','loyaltyForm()');
  body='<section class="panel"><input id="search" aria-label="ค้นหาลูกค้า" placeholder="ค้นหาชื่อ เบอร์โทร หรือรหัสสมาชิก"><div id="customers">'+customerTable(db.customer)+'</div></section>';
 }else{
  body=panel('หัวเอกสารบริษัท',companyHeader()+'<br>'+act('แก้ไขข้อมูลบริษัท','settingsForm()'));
 }
 $('#page').innerHTML='<div class="title"><h1>'+names[tab]+'</h1><div class="actions">'+action+'</div></div>'+body;
 if(tab==='customers')$('#search').oninput=e=>{
  const term=e.target.value.trim().toLowerCase();
  $('#customers').innerHTML=customerTable(db.customer.filter(c=>[memberCode(c.id),c.name,c.phone].some(value=>value.toLowerCase().includes(term))));
 };
 if(tab==='stock'){
  $('#search').oninput=updateStockSearch;
  $('#category-filter').onchange=updateStockSearch;
  updateStockSearch();
 }
}
const closeModal=()=>$('#modal').close();
function modal(title,html){$('#inside').innerHTML='<div class="row"><h2>'+title+'</h2>'+act('ปิด','closeModal()')+'</div><hr>'+html;if(!$('#modal').open)$('#modal').showModal()}
function input(label,name,value='',type='text',attrs='required maxlength="200"'){return '<label>'+label+'<input type="'+type+'" name="'+name+'" value="'+esc(value)+'" '+attrs+'></label>'}
function form(title,body,payload,after){
 modal(title,'<form>'+body+'<div class="error" role="alert"></div><button class="primary">บันทึก</button></form>');
 const f=$('dialog form'),token=crypto.randomUUID();
 f.onsubmit=async e=>{e.preventDefault();const btn=f.querySelector('button:not([type=button])');btn.disabled=true;
 try{const data=payload(Object.fromEntries(new FormData(f)),f);const res=await fetch('/api',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...data,token})});const r=await res.json();if(!res.ok)throw Error(r.error);await refresh();closeModal();toast('บันทึกแล้ว');if(after)after(r)}catch(err){f.querySelector('.error').textContent=err.message}finally{btn.disabled=false}};
}
const numAttrs='required min="0" max="10000000" step=".01"';
function productForm(id, receiveNext=false){
 const p=findProduct(id);
 const units=['แกลลอน','กระป๋อง','ถัง','ลิตร','ปี๊บ','ขวด','ชุด','ชิ้น'];
 form(p?'แก้ไขสินค้า':'เพิ่มสินค้า',
  input('รหัสสินค้า','sku',p?.sku,'text','required maxlength="60"')+input('ชื่อสินค้า','name',p?.name)
  +'<div class="fields"><label>หมวดหมู่<select name="category_id">'+categoryOptions(p?.category_id)+'</select></label>'
  +input('หน่วยนับ','unit',p?.unit??'แกลลอน','text','required maxlength="30" list="paint-units"')
  +'<datalist id="paint-units">'+units.map(unit=>'<option value="'+unit+'"></option>').join('')+'</datalist></div>'
  +'<div class="fields">'+input('ราคาขาย / หน่วย (บาท)','price',(p?.price??0)/100,'number',numAttrs)
  +input('แจ้งเตือนเมื่อเหลือ','minimum',p?.minimum??0,'number','required min="0" step="1"')
  +input('แต้มต่อหน่วย','points_per_unit',p?.points_per_unit??'','number','min="0" max="1000000000" step="1" placeholder="ใช้แต้มตามยอดซื้อ"')+'</div>'
  +'<small>เว้นช่องแต้มต่อหน่วยเพื่อใช้กติกาตามยอดซื้อ หรือกรอก 0 สำหรับสินค้าที่ไม่สะสมแต้ม</small>',
  values=>({...values,op:'product',id}),receiveNext?result=>transactionForm('IN',result.product):undefined);
}
function categoryForm(){
 form('เพิ่มหมวดหมู่',input('ชื่อหมวดหมู่','name','','text','required maxlength="80"'),v=>({...v,op:'category'}));
}
function loyaltyForm(){
 const rules=db.loyalty[0];
 form('ตั้งค่าแต้มสมาชิก',
  input('ยอดซื้อ (บาท) ต่อ 1 แต้ม','spend_per_point',rules.spend_per_point/100,'number','required min=".01" max="10000000" step=".01"')
  +input('ส่วนลด (บาท) ต่อ 1 แต้ม','point_value',rules.point_value/100,'number','required min=".01" max="10000000" step=".01"')
  +'<small>แต้มเข้าบัญชีเมื่อชำระบิลครบ แลกแต้มเป็นส่วนลดตอนเปิดบิลขาย</small>',v=>({...v,op:'loyalty'}));
}
const memberCode=id=>'CUS-'+String(id).padStart(5,'0');
const receiptCode=id=>'REC-'+String(id).padStart(5,'0');
const customerKey=d=>d.customer_id?'member:'+d.customer_id:'name:'+d.party;

function contactDetails(address,phone){
 return (address?'<p class="document-address">'+esc(address)+'</p>':'')+(phone?'<p>โทร '+esc(phone)+'</p>':'');
}
function companyHeader(){
 const company=db.settings[0];
 const identity=[company.tax_id?'เลขประจำตัวผู้เสียภาษี '+company.tax_id:'',company.branch].filter(Boolean).join(' · ');
 return '<div class="dochead"><h2>'+esc(company.name)+'</h2>'+contactDetails(company.address,company.phone)+(identity?'<p>'+esc(identity)+'</p>':'')+'</div>';
}
function addressInput(value=''){
 return '<label>ที่อยู่<textarea name="address" maxlength="500" rows="3">'+esc(value)+'</textarea></label>';
}
function settingsForm(){
 const c=db.settings[0];
 form('แก้ไขหัวเอกสารบริษัท',input('ชื่อบริษัท / ร้านค้า','name',c.name)+addressInput(c.address)
  +input('เบอร์โทร','phone',c.phone,'tel','maxlength="50"')
  +'<div class="fields">'+input('เลขประจำตัวผู้เสียภาษี','tax_id',c.tax_id,'text','maxlength="30"')
  +input('สำนักงานใหญ่ / สาขา','branch',c.branch,'text','maxlength="100"')+'</div>',
  values=>({...values,op:'settings'}));
}
function customerTable(customers){
 return table(['รหัสสมาชิก','ชื่อลูกค้า','ที่อยู่','เบอร์โทร','แต้มคงเหลือ',''],customers.map(c=>tr([
  memberCode(c.id),esc(c.name),'<span class="document-address">'+esc(c.address)+'</span>',esc(c.phone),
  act(String(pointsBalance(c.id))+' แต้ม','pointsHistory('+c.id+')'),act('แก้ไข','customerForm('+c.id+')')
 ])),'ยังไม่มีสมาชิก');
}
function customerForm(id){
 const c=db.customer.find(c=>c.id===id);
 form(c?'แก้ไข '+memberCode(id):'เพิ่มสมาชิก',input('ชื่อลูกค้า','name',c?.name)+addressInput(c?.address)
  +input('เบอร์โทร','phone',c?.phone,'tel','maxlength="50"'),values=>({...values,op:'customer',id}));
}
function pointsHistory(id){
 const member=db.customer.find(c=>c.id===id);
 const rows=db.points_entry.filter(e=>e.customer===id).reverse().map(e=>tr([
  day(e.created),code(findDoc(e.invoice)),e.kind==='earn'?'สะสม':'แลก',String(e.points)
 ]));
 modal('ประวัติแต้ม '+memberCode(id),'<p>'+esc(member.name)+' · คงเหลือ '+pointsBalance(id)+' แต้ม</p>'
  +table(['วันที่','ใบแจ้งหนี้','รายการ','แต้ม'],rows,'ยังไม่มีรายการแต้ม'));
}
function transactionForm(kind, productId){
 if(!db.product.length){
  modal(kinds[kind],'<p>เพิ่มสินค้าและหน่วยนับก่อนทำรายการ</p><br>'+act('＋ เพิ่มสินค้า','productForm(null,'+(kind==='IN')+')','primary'));
  return;
 }
 const party=kind==='INV'?'ชื่อลูกค้า':kind==='IN'?'ผู้ส่งสินค้า / ร้านค้า':'ผู้เบิก';
 const memberFields='<div class="fields">'+input('ค้นหาสมาชิก','member_search','','search','placeholder="ชื่อ เบอร์โทร หรือรหัส"')
  +'<label>สมาชิก<select name="customer_id"></select></label></div><div id="member-details"></div>';
 form(kinds[kind],(kind==='INV'?memberFields:'')
  +'<div class="fields">'+input(party,'party','','text',kind==='OUT'?'maxlength="200"':'required maxlength="200"')
  +(kind==='INV'?input('วันครบกำหนด','due',today(),'date'):'')+'</div>'
  +'<div id="lines"></div>'+act('＋ เพิ่มรายการ',"addLine('"+kind+"')")
  +(kind==='INV'?'<div id="redeem-wrap" hidden>'+input('แต้มที่ต้องการแลก','redeem','0','number','min="0" step="1" disabled')+'</div>':'')
  +input('หมายเหตุ','note','','text','maxlength="500"')+'<div id="sum" class="amount" aria-live="polite"></div>',
  values=>({...values,op:kind,lines:saleLines()}),result=>openDoc(result.doc));
 if(kind==='INV') setupMemberSearch();
 addLine(kind,productId);
}

function setupMemberSearch(){
 const select=$('select[name=customer_id]');
 const search=$('input[name=member_search]');
 const partyInput=$('input[name=party]');
 const redeem=$('input[name=redeem]');
 const updateMember=()=>{
  const member=db.customer.find(c=>c.id===Number(select.value));
  partyInput.disabled=Boolean(member);
  partyInput.closest('label').hidden=Boolean(member);
  redeem.disabled=!member;
  $('#redeem-wrap').hidden=!member;
  redeem.value=0;
  redeem.max=member?Math.min(1000000000,pointsBalance(member.id)):0;
  $('#member-details').innerHTML=member?contactDetails(member.address,member.phone)+'<p>แต้มคงเหลือ '+pointsBalance(member.id)+' แต้ม</p>':'';
  updateTransactionTotal('INV');
 };
 const filter=()=>{
  const selected=select.value;
  const members=db.customer.filter(c=>String(c.id)===selected||matches(search.value,[memberCode(c.id),c.name,c.phone]));
  select.innerHTML='<option value="">ลูกค้าทั่วไป / พิมพ์ชื่อเอง</option>'
   +members.map(c=>'<option value="'+c.id+'">'+esc(memberCode(c.id)+' · '+c.name+(c.phone?' · '+c.phone:''))+'</option>').join('');
  select.value=selected||'';
 };
 search.oninput=filter;
 select.onchange=updateMember;
 redeem.oninput=()=>updateTransactionTotal('INV');
 filter();
}
function saleLines(){
 return [...document.querySelectorAll('.item')].map(el=>({
  id:el.querySelector('select').value,qty:el.querySelector('.qty').value,price:el.querySelector('.price')?.value||0
 }));
}
function updateTransactionTotal(kind){
 if(kind==='OUT')return;
 let total=0, eligible=0, fixed=0;
 for(const line of saleLines()){
  const product=findProduct(Number(line.id));
  if(!product)continue;
  const qty=Number(line.qty);
  const amount=qty*Math.round(100*Number(line.price));
  total+=amount;
  if(product.points_per_unit==null)eligible+=amount;
  else fixed+=qty*product.points_per_unit;
 }
 const rules=db.loyalty[0];
 const member=kind==='INV'&&$('select[name=customer_id]').value;
 const redeemed=member?Number($('input[name=redeem]').value):0;
 const discount=redeemed*rules.point_value;
 const net=total-discount;
 let earned=0;
 if(net>0&&Number.isSafeInteger(total)&&Number.isSafeInteger(discount)&&Number.isSafeInteger(fixed)){
  const eligibleDiscount=(BigInt(discount)*BigInt(eligible)+BigInt(total)-1n)/BigInt(total);
  earned=BigInt(fixed)+(BigInt(eligible)-eligibleDiscount)/BigInt(rules.spend_per_point);
 }
 $('#sum').innerHTML=(discount?'<p>ยอดสินค้า ฿ '+cash(total)+' · ส่วนลดแต้ม ฿ '+cash(discount)+'</p>':'')
  +'<strong>ยอดสุทธิ ฿ '+cash(net)+'</strong>'
  +(member?'<p><small>'+ (discount>total?'ส่วนลดเกินยอดสินค้า':'ได้รับ '+earned+' แต้มเมื่อชำระครบ')+'</small></p>':'');
}
function addLine(kind,productId){
 const box=document.createElement('div');
 box.className='item';
 box.innerHTML='<label>ค้นหาสินค้า<input class="product-search" type="search" placeholder="รหัสหรือชื่อสี"></label>'
  +'<label>สินค้า<select required></select></label><label>จำนวน<input class="qty" type="number" min="1" max="1000000000" step="1" value="1" required></label>'
  +(kind==='OUT'?'':'<label>'+(kind==='IN'?'ต้นทุน / หน่วย':'ราคาขาย / หน่วย')+'<input class="price" type="number" '+numAttrs+'></label>')
  +'<button type="button" aria-label="ลบรายการ">×</button>';
 $('#lines').append(box);
 const select=box.querySelector('select');
 const search=box.querySelector('.product-search');
 const choose=()=>{
  const p=findProduct(Number(select.value));
  if(kind!=='OUT')box.querySelector('.price').value=p?(kind==='INV'?p.price/100:0):'';
  updateTransactionTotal(kind);
 };
 const filter=()=>{
  const previous=select.value;
  const products=db.product.filter(p=>productMatches(search.value,p));
  select.innerHTML='<option value="">'+(products.length?'เลือกสินค้า':'ไม่พบสินค้า')+'</option>'
   +products.map(p=>'<option value="'+p.id+'">'+esc(p.sku+' · '+p.name+' (เหลือ '+p.qty+' '+p.unit+')')+'</option>').join('');
  select.value=products.some(p=>String(p.id)===previous)?previous:products.length===1?String(products[0].id):'';
  if(select.value!==previous)choose();
 };
 search.oninput=filter;
 select.onchange=choose;
 box.oninput=()=>updateTransactionTotal(kind);
 box.querySelector('button').onclick=()=>{if($('#lines').children.length>1){box.remove();updateTransactionTotal(kind)}};
 filter();
 if(productId)select.value=String(productId);
 choose();
}
function billForm(){
 const unpaid=db.doc.filter(d=>d.kind==='INV'&&d.total>d.paid&&!db.bill_amount.some(b=>b.invoice===d.id));
 if(!unpaid.length){modal('สร้างใบวางบิล','<p>ยังไม่มีใบแจ้งหนี้ค้างชำระที่รอวางบิล</p>');return}
 const parties=[...new Map(unpaid.map(d=>[customerKey(d),d])).entries()];
 form('สร้างใบวางบิล','<label>ลูกค้า<select id="party">'+parties.map(([key,d])=>'<option value="'+esc(key)+'">'+esc(d.party+(d.customer_id?' · '+memberCode(d.customer_id):' · ลูกค้าทั่วไป'))+'</option>').join('')+'</select></label><div id="choices"></div>',()=>({op:'BILL',ids:[...document.querySelectorAll('#choices input:checked')].map(e=>e.value)}),r=>openDoc(r.doc));
 const choices=()=>{$('#choices').innerHTML=table(['เลือก','ใบแจ้งหนี้','ยอดค้าง (บาท)'],unpaid.filter(d=>customerKey(d)===$('#party').value).map(d=>tr(['<input type="checkbox" checked value="'+d.id+'" aria-label="'+code(d)+'">',code(d),cash(d.total-d.paid)])),'')};$('#party').onchange=choices;choices()
}
function payForm(id){const d=findDoc(id);form('รับชำระ '+code(d),'<p>'+esc(d.party)+' · ค้างรับ ฿ '+cash(d.total-d.paid)+'</p>'+input('จำนวนเงินที่ได้รับ (บาท)','amount',(d.total-d.paid)/100,'number','required min=".01" step=".01" max="'+(d.total-d.paid)/100+'"'),v=>({...v,op:'pay',id}),result=>openReceipt(result.receipt))}
function openDoc(id){
 const d=findDoc(id);
 let detail=d.kind==='BILL'?table(['ใบแจ้งหนี้','ครบกำหนด','ยอดวางบิล (บาท)'],db.bill_amount.filter(b=>b.bill===id).map(b=>tr([code(findDoc(b.invoice)),day(findDoc(b.invoice).due),cash(b.amount)])),''):table(['สินค้า','จำนวน','หน่วย',...(d.kind==='OUT'?[]:['ราคา','รวม'])],db.line.filter(l=>l.doc===id).map(l=>{const p=findProduct(l.product);return tr([esc((l.sku||p.sku)+' · '+(l.name||p.name)),l.qty,esc(l.unit||p.unit),...(d.kind==='OUT'?[]:[cash(l.price),cash(l.price*l.qty)])])}),'');
 let html=companyHeader()+'<div class="row"><h2>'+kinds[d.kind]+'</h2><b>'+code(d)+'</b></div><p>วันที่ '+day(d.created)+(d.due?' · ครบกำหนด '+day(d.due):'')+'</p><p>'+({INV:'ลูกค้า',BILL:'ลูกค้า',IN:'ผู้ส่งสินค้า',OUT:'ผู้เบิก'}[d.kind])+' '+esc(d.party)+'</p>'+contactDetails(d.party_address,d.party_phone)+'<br>'+detail+(d.kind==='OUT'?'':'<h3 class="amount">ยอดรวม ฿ '+cash(d.total)+'</h3>')+(d.note?'<p>หมายเหตุ '+esc(d.note)+'</p>':'');
 if(d.kind==='INV'&&d.discount)html+='<p class="amount">ยอดสินค้าก่อนลด ฿ '+cash(d.total+d.discount)+' · ส่วนลดจากแต้ม ฿ '+cash(d.discount)+'</p>';
 if(d.kind==='INV'&&d.customer_id){
  const earned=db.points_entry.find(p=>p.invoice===id&&p.kind==='earn');
  const redeemed=db.points_entry.find(p=>p.invoice===id&&p.kind==='redeem');
  if(redeemed)html+='<p>แลก '+(-redeemed.points)+' แต้ม</p>';
  if(d.pending_points)html+='<p>'+(earned?'ได้รับ ':'รอชำระครบเพื่อรับ ')+d.pending_points+' แต้ม</p>';
 }
 if(d.kind==='INV'){html+='<p class="amount">รับชำระแล้ว '+cash(d.paid)+' · คงค้าง '+cash(d.total-d.paid)+' บาท</p>';const pays=db.payment.filter(p=>p.invoice===id);if(pays.length)html+=table(['วันที่รับชำระ','จำนวนเงิน (บาท)'],pays.map(p=>tr([day(p.created),cash(p.amount)])),'')}
 $('#print').innerHTML=html;
 const receiptLinks=d.kind==='INV'?db.payment.filter(p=>p.invoice===id).map(p=>act('ใบเสร็จ '+receiptCode(p.id),'openReceipt('+p.id+')')).join(''):'';
 modal('รายละเอียดเอกสาร',html+'<br><div class="actions">'+act('พิมพ์ / บันทึก PDF','window.print()','primary')+(d.kind==='INV'&&d.total>d.paid?act('รับชำระ','payForm('+id+')'):'')+receiptLinks+'</div>');
}
function openReceipt(id){
 const payment=db.payment.find(p=>p.id===id);
 const invoice=findDoc(payment.invoice);
 const html=companyHeader()
  +'<div class="row"><h2>ใบเสร็จรับเงิน</h2><b>'+receiptCode(id)+'</b></div>'
  +'<p>วันที่รับเงิน '+day(payment.created)+'</p><p>ได้รับเงินจาก '+esc(invoice.party)+'</p>'
  +contactDetails(invoice.party_address,invoice.party_phone)
  +'<br>'+table(['อ้างอิงใบแจ้งหนี้','จำนวนเงิน (บาท)'],[tr([code(invoice),cash(payment.amount)])],'')
  +'<h3 class="amount">ยอดรับเงิน ฿ '+cash(payment.amount)+'</h3>';
 $('#print').innerHTML=html;
 modal('รายละเอียดใบเสร็จ',html+'<br><div class="actions">'
  +act('พิมพ์ / บันทึก PDF','window.print()','primary')
  +act('เปิดใบแจ้งหนี้','openDoc('+invoice.id+')')+'</div>');
}
refresh().catch(e=>{$('#page').textContent=e.message});
