const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cash=n=>(n/100).toLocaleString('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2});
const names={home:'ภาพรวมคลัง',stock:'สินค้าในคลัง',moves:'รับเข้า / เบิกออก',sales:'บิลขาย / ใบแจ้งหนี้',bills:'วางบิล',settings:'ข้อมูลร้าน'};
const icons=['▦','▤','⇄','▧','▥','⚙'];
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
function stockTable(products){
 return table(['รหัสสินค้า','ชื่อสินค้า','คงเหลือ','หน่วย','ราคาขาย (บาท)','สถานะ'],products.map(p=>tr([esc(p.sku),esc(p.name),'<b>'+p.qty+'</b>',esc(p.unit),cash(p.price),p.qty<=p.minimum?'<span class="pill warn">ถึงจุดสั่งซื้อ</span>':'<span class="pill">พร้อมขาย</span>'])),'ไม่มีรายการสินค้า');
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
 action=act('＋ เพิ่มสินค้า','productForm()','primary');body='<section class="panel"><input id="search" aria-label="ค้นหาสินค้า" placeholder="ค้นหารหัสหรือชื่อสินค้า"><div id="products">'+stockTable(db.product)+'</div></section>';
 }else if(tab==='moves'){
 action=btnDoc('IN','↓ รับสินค้าเข้า')+btnDoc('OUT','↑ เบิกสินค้าออก');
 body=panel('ประวัติการเคลื่อนไหว',table(['วันที่','เอกสาร','สินค้า','จำนวน','หน่วย'],db.line.slice().reverse().map(l=>{const d=findDoc(l.doc),p=findProduct(l.product);return tr([day(d.created),act(code(d),'openDoc('+d.id+')'),esc(p.name),(d.kind==='IN'?'+':'−')+l.qty,esc(p.unit)])}),'ยังไม่มีการเคลื่อนไหว'));
 }else if(tab==='sales'){
 action=btnDoc('INV','＋ เปิดบิลขาย');body=panel('บัญชีลูกหนี้',table(['ใบแจ้งหนี้','ลูกค้า','ครบกำหนด','ยอดขาย','ค้างรับ (บาท)','จัดการ'],inv.map(d=>tr([act(code(d),'openDoc('+d.id+')'),esc(d.party),day(d.due),cash(d.total),cash(d.total-d.paid),d.total>d.paid?act('รับชำระ','payForm('+d.id+')'):'<span class="pill">ชำระครบ</span>'])),'ยังไม่มีบิลขาย'));
 }else if(tab==='bills'){action=act('＋ สร้างใบวางบิล','billForm()','primary');body=panel('รายการใบวางบิล',docsTable(docs.filter(d=>d.kind==='BILL')))}
 else{const s=db.settings[0];body=panel('ข้อมูลที่แสดงบนเอกสาร','<h3>'+esc(s.name)+'</h3><p>'+esc(s.address)+'</p><br>'+act('แก้ไขข้อมูลร้าน','settingsForm()'))}
 $('#page').innerHTML='<div class="title"><h1>'+names[tab]+'</h1><div class="actions">'+action+'</div></div>'+body;
 if(tab==='stock')$('#search').oninput=e=>{const q=e.target.value.trim().toLowerCase();$('#products').innerHTML=stockTable(db.product.filter(p=>(p.sku+' '+p.name).toLowerCase().includes(q)))};
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
function productForm(){form('เพิ่มสินค้า',input('รหัสสินค้า','sku','','text','required maxlength="60"')+input('ชื่อสินค้า','name')+'<div class="fields">'+input('หน่วยนับ','unit','ชิ้น','text','required maxlength="30"')+input('ราคาขาย (บาท)','price','0','number',numAttrs)+input('แจ้งเตือนเมื่อเหลือ','minimum','0','number','required min="0" step="1"')+'</div>',v=>({...v,op:'product'}))}
function settingsForm(){const s=db.settings[0];form('ข้อมูลร้าน',input('ชื่อร้าน','name',s.name)+input('ที่อยู่ / ช่องทางติดต่อ','address',s.address,'text','maxlength="500"'),v=>({...v,op:'settings'}))}
function transactionForm(k){
 if(!db.product.length){modal(kinds[k],'<p>เพิ่มสินค้าในคลังก่อนทำรายการ</p><br>'+act('＋ เพิ่มสินค้า','productForm()','primary'));return}
 const party=k==='INV'?'ชื่อลูกค้า':k==='IN'?'ผู้ส่งสินค้า / ร้านค้า':'ผู้เบิก';
 form(kinds[k],'<div class="fields">'+input(party,'party','','text',k==='OUT'?'maxlength="200"':'required maxlength="200"')+(k==='INV'?input('วันครบกำหนด','due',today(),'date'):'')+'</div><div id="lines"></div>'+act('＋ เพิ่มรายการ',"addLine('"+k+"')")+input('หมายเหตุ','note','','text','maxlength="500"')+'<b class="amount" id="sum"></b>',v=>({...v,op:k,lines:[...document.querySelectorAll('.item')].map(el=>({id:el.querySelector('select').value,qty:el.querySelector('.qty').value,price:el.querySelector('.price')?.value||0}))}),r=>openDoc(r.doc));
 addLine(k);
}
function addLine(k){
 const box=document.createElement('div');box.className='item';
 box.innerHTML='<label>สินค้า<select>'+db.product.map(p=>'<option value="'+p.id+'">'+esc(p.sku+' · '+p.name)+' (เหลือ '+p.qty+')</option>').join('')+'</select></label><label>จำนวน<input class="qty" type="number" min="1" step="1" value="1" required></label>'+(k==='OUT'?'':'<label>ราคา / หน่วย<input class="price" type="number" '+numAttrs+'></label>')+'<button type="button" aria-label="ลบรายการ">×</button>';
 $('#lines').append(box);
 const total=()=>{const sum=[...document.querySelectorAll('.item')].reduce((s,x)=>s+Number(x.querySelector('.qty').value)*Math.round(100*Number(x.querySelector('.price')?.value||0)),0);$('#sum').textContent=k==='OUT'?'':'รวม ฿ '+cash(sum)};
 const choose=()=>{if(k!=='OUT')box.querySelector('.price').value=k==='INV'?findProduct(+box.querySelector('select').value).price/100:0;total()};
 box.querySelector('select').onchange=choose;box.oninput=total;box.querySelector('button').onclick=()=>{if($('#lines').children.length>1){box.remove();total()}};choose();
}
function billForm(){
 const unpaid=db.doc.filter(d=>d.kind==='INV'&&d.total>d.paid&&!db.bill_amount.some(b=>b.invoice===d.id));
 if(!unpaid.length){modal('สร้างใบวางบิล','<p>ยังไม่มีใบแจ้งหนี้ค้างชำระที่รอวางบิล</p>');return}
 const parties=[...new Set(unpaid.map(d=>d.party))];
 form('สร้างใบวางบิล','<label>ลูกค้า<select id="party">'+parties.map(p=>'<option>'+esc(p)+'</option>').join('')+'</select></label><div id="choices"></div>',()=>({op:'BILL',ids:[...document.querySelectorAll('#choices input:checked')].map(e=>e.value)}),r=>openDoc(r.doc));
 const choices=()=>{$('#choices').innerHTML=table(['เลือก','ใบแจ้งหนี้','ยอดค้าง (บาท)'],unpaid.filter(d=>d.party===$('#party').value).map(d=>tr(['<input type="checkbox" checked value="'+d.id+'" aria-label="'+code(d)+'">',code(d),cash(d.total-d.paid)])),'')};$('#party').onchange=choices;choices()
}
function payForm(id){const d=findDoc(id);form('รับชำระ '+code(d),'<p>'+esc(d.party)+' · ค้างรับ ฿ '+cash(d.total-d.paid)+'</p>'+input('จำนวนเงินที่ได้รับ (บาท)','amount',(d.total-d.paid)/100,'number','required min=".01" step=".01" max="'+(d.total-d.paid)/100+'"'),v=>({...v,op:'pay',id}),()=>openDoc(id))}
function openDoc(id){
 const d=findDoc(id),s=db.settings[0];
 let detail=d.kind==='BILL'?table(['ใบแจ้งหนี้','ครบกำหนด','ยอดวางบิล (บาท)'],db.bill_amount.filter(b=>b.bill===id).map(b=>tr([code(findDoc(b.invoice)),day(findDoc(b.invoice).due),cash(b.amount)])),''):table(['สินค้า','จำนวน','หน่วย',...(d.kind==='OUT'?[]:['ราคา','รวม'])],db.line.filter(l=>l.doc===id).map(l=>{const p=findProduct(l.product);return tr([esc(p.sku+' · '+p.name),l.qty,esc(p.unit),...(d.kind==='OUT'?[]:[cash(l.price),cash(l.price*l.qty)])])}),'');
 let html='<div class="dochead"><h2>'+esc(s.name)+'</h2><p>'+esc(s.address)+'</p></div><div class="row"><h2>'+kinds[d.kind]+'</h2><b>'+code(d)+'</b></div><p>วันที่ '+day(d.created)+(d.due?' · ครบกำหนด '+day(d.due):'')+'</p><p>'+({INV:'ลูกค้า',BILL:'ลูกค้า',IN:'ผู้ส่งสินค้า',OUT:'ผู้เบิก'}[d.kind])+' '+esc(d.party)+'</p><br>'+detail+(d.kind==='OUT'?'':'<h3 class="amount">ยอดรวม ฿ '+cash(d.total)+'</h3>')+(d.note?'<p>หมายเหตุ '+esc(d.note)+'</p>':'');
 if(d.kind==='INV'){html+='<p class="amount">รับชำระแล้ว '+cash(d.paid)+' · คงค้าง '+cash(d.total-d.paid)+' บาท</p>';const pays=db.payment.filter(p=>p.invoice===id);if(pays.length)html+=table(['วันที่รับชำระ','จำนวนเงิน (บาท)'],pays.map(p=>tr([day(p.created),cash(p.amount)])),'')}
 $('#print').innerHTML=html;modal('รายละเอียดเอกสาร',html+'<br><div class="actions">'+act('พิมพ์ / บันทึก PDF','window.print()','primary')+(d.kind==='INV'&&d.total>d.paid?act('รับชำระ','payForm('+id+')'):'')+'</div>');
}
refresh().catch(e=>{$('#page').textContent=e.message});
