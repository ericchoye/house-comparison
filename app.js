'use strict';
const PUBLIC_VIEW = true;
const $ = (s,root=document) => root.querySelector(s);
const $$ = (s,root=document) => Array.from(root.querySelectorAll(s));
const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num = (v,d=0) => v == null ? '待補' : Number(v).toLocaleString('zh-TW',{maximumFractionDigits:d});
const safeURL = value => {try {const u=new URL(value,location.origin);return ['http:','https:'].includes(u.protocol)?u.href:'#';}catch{return '#';}};
const link = (url,label) => `<a href="${esc(safeURL(url))}" target="_blank" rel="noreferrer">${esc(label)}</a>`;
const dateLabel = x => x ? x.slice(0,10).replaceAll('-','/') : '未公開';
const statuses = ['待看房','已約看','已看房','考慮中','暫不考慮'];
const state = {data:null,selected:new Set(),view:'cards',activeId:null,notesDirty:false,bankDirty:false};
let toastTimer;
function toast(message){const el=$('#toast');el.textContent=message;el.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.hidden=true,4200);}
function annotation(p){return state.data.annotations[p.id]||{status:'僅供查閱',notes:'',favorite:0,version:0};}
function valuations(p){return state.data.valuations.filter(v=>v.property_id===p.id);}
function userAddressNote(p){return p.sourceFacts?.address?.evidence_type==='user_provided'?'<span class="address-origin">門牌由使用者提供，待文件核對</span>':'';}
function photo(p,cls=''){return `<img class="${cls}" src="${esc(p.image)}" alt="${esc(p.name)}原刊登房屋照片" loading="lazy" referrerpolicy="no-referrer">`;}
function getFiltered(){
 const q=$('#search').value.trim().toLowerCase(), budget=$('#budget').value,status=$('#status-filter').value;
 const result=state.data.properties.filter(p=>[p.name,p.address,p.broker].join(' ').toLowerCase().includes(q))
  .filter(p=>budget==='all'||(budget==='above'?p.askingPrice>3000:p.askingPrice<=Number(budget)))
  .filter(p=>status==='all'||(status==='favorite'?annotation(p).favorite:annotation(p).status===status));
 const order=$('#sort').value;
 if(order==='price-asc')result.sort((a,b)=>a.askingPrice-b.askingPrice);
 if(order==='price-desc')result.sort((a,b)=>b.askingPrice-a.askingPrice);
 if(order==='area-desc')result.sort((a,b)=>b.area-a.area);
 return result;
}
function totalTransactionCount(){const ids=new Set();state.data.properties.forEach(p=>p.transactions.forEach(t=>ids.add(t.id)));return ids.size;}
function renderOverview(){
 const props=state.data.properties,prices=props.map(p=>p.askingPrice).filter(x=>x!=null);
 const supplied=props.filter(p=>valuations(p).length).length;
 $('#overview').innerHTML=[
  ['收錄物件',`${props.length}<em>間透天</em>`,'同一份清單，持續累積'],
  ['刊登開價',`${num(Math.min(...prices))}–${num(Math.max(...prices))}<em>萬</em>`,'依來源觀察日，不代表成交'],
  ['成交參考',`${totalTransactionCount()}<em>筆</em>`,'官方批次核對＋平台轉載'],
  ['銀行資料',`${supplied}<em>/ ${props.length} 間已補充</em>`,'線上估價與正式回覆分開']
 ].map(([l,v,f])=>`<div class="overview-item"><span class="overview-label">${l}</span><div class="overview-value">${v}</div><div class="overview-foot">${f}</div></div>`).join('');
 $('#checked-date').textContent=`${props.length} 間指定物件 · 來源觀察 ${state.data.observedRange.map(dateLabel).join('–')} · 資料整理 ${dateLabel(state.data.updatedAt)}`;
 $('h1').textContent=state.data.title;
 $('#nav-count').textContent=state.selected.size;
}
function card(p){const a=annotation(p);return `<article class="property-card" aria-labelledby="title-${p.id}">
 <div class="card-visual">${photo(p)}<span class="photo-badge">${esc(p.ageLabel)}・透天</span><a class="photo-source" href="${esc(safeURL(p.sourceUrl))}" target="_blank" rel="noreferrer">照片來源：591</a></div>
 <div class="card-info"><div class="card-title-row"><h3 class="card-title" id="title-${p.id}">${esc(p.name)}</h3><label class="check-label"><input type="checkbox" data-select="${p.id}" ${state.selected.has(p.id)?'checked':''} aria-label="選取${esc(p.name)}加入比較">比較</label></div>
 <p class="card-address" title="${esc(p.address)}">${esc(p.shortAddress)}</p>${userAddressNote(p)}<div class="price-row"><span class="price-number">${num(p.askingPrice)}</span><span class="price-unit">萬</span><span class="price-label">刊登開價</span></div>
 <p class="unit-price">${num(p.askingPrice/p.area,2)} 萬／坪 <span>· 總價／建坪</span></p>
 <div class="facts-inline"><span>${esc(p.layout)}</span><span>建 ${num(p.area,2)} 坪</span></div><div class="minor-facts"><span>${esc(p.floorLabel)}</span><span>地 ${p.landArea==null?'待補':num(p.landArea,2)+' 坪'}</span></div>
 <div class="card-insight"><span class="insight-label">成交參考</span><span>${esc(p.referenceSummary)}</span></div><div class="card-question">${esc(p.keyQuestion)}</div>
 <div class="card-bottom"><button class="detail-button" data-detail="${p.id}">展開資料與筆記</button><span class="status-pill">${a.favorite?'已收藏 · ':''}${esc(a.status)}</span></div></div></article>`;}
function empty(title,description){return `<div class="empty-state"><h3>${esc(title)}</h3><p>${esc(description)}</p></div>`;}
function compare(props){
 if(props.length<2)return empty('先選擇至少兩間物件','回到物件總覽勾選「比較」，即可並排查看。');
 const rows=[
 ['價格與成交',null],
 ['刊登開價',p=>`<span class="big">${num(p.askingPrice)}</span> 萬`],
 ['總價／建坪',p=>`${num(p.askingPrice/p.area,2)} 萬／坪<small>未分拆停車價值，非純房屋單價</small>`],
 ['成交參考',p=>`${esc(p.referenceSummary)}<small>${esc(p.referenceCaveat)}</small>`],
 ['銀行資料',p=>{const vs=valuations(p);return vs.length?vs.map(v=>`${esc(v.bank)} · ${num(v.amount,2)} 萬<small>${esc(v.kind)} · 自行提供</small>`).join('<br>'):'尚未提供<small>不以周邊成交冒充銀行鑑價</small>';}],
 ['物件條件',null],
 ['門牌',p=>`${esc(p.shortAddress)}${userAddressNote(p)}`],['權狀建坪',p=>`${num(p.area,3)} 坪`],['主建物',p=>`${num(p.mainArea,3)} 坪`],['土地坪數',p=>p.landArea==null?'待補':`${num(p.landArea,3)} 坪`],
 ['格局',p=>esc(p.layout)],['樓層／屋齡',p=>`${esc(p.floorLabel)}<small>${esc(p.ageLabel)}（刊登資料）</small>`],['朝向',p=>esc(p.direction||'待確認')],['管理費',p=>esc(p.managementFee||'待補')],
 ['刊登法定用途',p=>`${esc(p.legalUse||'待補')}<small>仍需謄本／使用執照確認</small>`],
 ['停車說明',p=>`${esc(p.parkingClaim)}<small>平台欄位：${esc(p.parkingField)}</small>`],
 ['查核與追蹤',null],['委託起日',()=>`待提供證據<small>首次觀察不等於開始販售</small>`],['首次觀察',p=>`${dateLabel(p.firstObserved)}<small>最近觀察 ${dateLabel(p.checkedAt)}</small>`],
 ['優先確認',p=>`<span class="warning-cell">${esc(p.keyQuestion)}</span>`],['我的狀態',p=>`${esc(annotation(p).status)}${annotation(p).favorite?' · 已收藏':''}`]
 ];
 return `<p class="view-notice">比較已勾選的 ${props.length} 間。成交案例保留其時間與條件；沒有足夠可比資料時，不計算市場溢價。窄螢幕可左右捲動表格。</p><div class="table-wrap" tabindex="0" aria-label="並排比較表，可左右捲動"><table class="comparison-table"><thead><tr><th scope="col">比較項目</th>${props.map(p=>`<th scope="col">${photo(p,'compare-thumb')}<span class="compare-name">${esc(p.name)}</span><button class="detail-button" data-detail="${p.id}">展開詳情</button></th>`).join('')}</tr></thead><tbody>${rows.map(([label,fn])=>fn?`<tr><th scope="row">${label}</th>${props.map(p=>`<td>${fn(p)}</td>`).join('')}</tr>`:`<tr class="category"><th scope="row">${label}</th>${props.map(()=>'<td></td>').join('')}</tr>`).join('')}</tbody></table></div>`;
}
function issueList(p){return `<ul class="issue-list">${p.issues.map(i=>`<li><strong>${esc(i.title)}</strong><p>${esc(i.detail)}</p>${i.sources.map((s,n)=>link(s,`來源 ${n+1}`)).join(' · ')}</li>`).join('')}<li><strong>銀行資料及委託起日待補</strong><p>取得銀行回覆、屋主或房仲可核對的委託日期後再記錄。</p></li></ul>`;}
function render(){
 if(!state.data)return;
 renderOverview();
 const filtered=getFiltered();
 const props=state.view==='compare'?state.data.properties.filter(p=>state.selected.has(p.id)):filtered;
 $('#view-title').textContent={cards:'物件總覽',compare:'並排比較',issues:'看房前，先問清楚'}[state.view];
 $('#result-count').textContent=state.view==='compare'?`${props.length} 間已選取`:`${filtered.length} / ${state.data.properties.length} 間`;
 $$('.nav').forEach(b=>{const active=b.dataset.view===state.view;b.classList.toggle('active',active);if(active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
 $('.toolbar').hidden=state.view==='compare';$('.selection-actions').hidden=state.view!=='cards';
 $('#content').innerHTML=state.view==='cards'?(filtered.length?`<div class="property-grid">${filtered.map(card).join('')}</div>`:empty('沒有符合的物件','調整總價、狀態或搜尋條件。')):state.view==='compare'?compare(props):(filtered.length?`<div class="issue-grid">${filtered.map(p=>`<article class="issue-card"><div class="issue-card-head"><h3>${esc(p.name)}</h3><button class="detail-button" data-detail="${p.id}">展開物件</button></div>${issueList(p)}</article>`).join('')}</div>`:empty('沒有符合的物件','調整篩選條件。'));
 $('#comparison-dock').hidden=state.view!=='cards'||state.selected.size<2;
 $('#dock-count').textContent=`${state.selected.size} 間`;
 const pending=state.data.intake;
 $('#intake-section').hidden=!pending.length;
 $('#intake-section').innerHTML=`<h2>下一批待查物件 <span class="tag">${pending.length} 筆</span></h2><p>已保存；在本專案說「整理待查物件」即可接續查核。</p>${pending.map(x=>`<div class="intake-item">${esc(x.input)}<small> · ${dateLabel(x.created_at)}</small></div>`).join('')}`;
}
function setView(view){if(!['cards','compare','issues'].includes(view))throw new Error('未知檢視');state.view=view;render();}
function fact(label,value){return `<div><dt>${esc(label)}</dt><dd>${esc(value??'待補')}</dd></div>`;}
function section(n,title,content,open=false,id=''){return `<details ${open?'open':''} ${id?`id="${id}"`:''}><summary><span class="section-number">${n}</span>${title}</summary><div class="section-body">${content}</div></details>`;}
function sourceTable(p){return `<ul class="source-list">${p.sourceFacts?.address?.evidence_type==='user_provided'?'<li><strong>使用者提供門牌</strong><small>來源：本專案對話；尚未以謄本核對。原591頁僅顯示巷名。</small></li>':''}${p.sources.map(s=>`<li>${link(s.url,s.label)}<small>${esc(s.kind)} · 觀察 ${dateLabel(s.checkedAt)}</small></li>`).join('')}</ul>`;}
function transactionRows(p){
 const period=$('#tx-period')?.value||'all',phase=$('#tx-phase')?.value||'all',scope=$('#tx-scope')?.value||'local';
 const cutoff=state.data.recentCutoff;
 const tx=p.transactions.filter(t=>scope==='all'||(scope==='nearby'?t.isNearby:!t.isNearby)).filter(t=>period!=='year'||t.date>=cutoff).filter(t=>phase==='all'||t.phase===phase);
 if(!tx.length)return empty('這個條件下沒有成交案例','可以切換全部時間或交易類型；未取得資料不代表沒有成交。');
 return `<p class="helper" style="margin:0 0 12px">顯示 ${tx.length} 筆。${esc(p.transactionScope)}</p><div class="data-table-scroll" tabindex="0" aria-label="成交明細，可左右捲動"><table class="data-table"><thead><tr><th>交易日／標的</th><th>總價</th><th>建坪／地坪</th><th>單價</th><th>類型／依據</th></tr></thead><tbody>${tx.map(t=>`<tr><td>${dateLabel(t.date)}<small>${esc(t.address||'門牌未取得')}</small><small>${esc(t.scope)}</small></td><td class="amount">${num(t.total,2)} 萬</td><td>${num(t.area,2)} 坪<small>地 ${t.land==null?'未取得':num(t.land,2)+' 坪'}</small></td><td>${t.unit==null?'未提供':num(t.unit,2)+' 萬/坪'}<small>${esc(t.unitBasis||'依來源口徑')}</small></td><td><span class="tag ${t.phase==='presale'?'amber':''}">${esc(t.phaseLabel)}</span><small>${link(t.url,t.official?'官方批次核對':'平台轉載實登')}</small>${t.serial?`<small title="${esc(t.serial)}">${esc(t.serial)}</small>`:''}</td></tr>${t.note?`<tr><td colspan="5"><small>備註：${esc(t.note)}</small></td></tr>`:''}`).join('')}</tbody></table></div>`;
}
function bankSection(p){if(PUBLIC_VIEW)return '<p class="helper">此公開版本不含私人銀行資料；請在本機看房筆記查看或補充。</p><form id="bank-form" hidden></form>';const vs=valuations(p);return `<div id="bank-records">${vs.length?vs.map(v=>`<div class="bank-record"><strong>${esc(v.bank)} · ${num(v.amount,2)} 萬</strong><span class="tag">${esc(v.kind)}</span><p>${dateLabel(v.valuation_date)} · 自行提供，尚未獨立驗證</p><p>${esc(v.evidence)}</p></div>`).join(''):'<div class="bank-empty"><div><strong>尚未取得銀行資料</strong><p>取得回覆後，記下銀行、日期與依據。金額單位為萬元。</p></div></div>'}</div>
 <form id="bank-form"><div class="form-grid"><label>銀行名稱<input name="bank" required maxlength="100" placeholder="例如：銀行名稱／分行"></label><label>資料種類<select name="kind"><option>銀行線上估價</option><option>行員初估</option><option>銀行正式回覆</option></select></label><label>估價金額（萬元）<input name="amount" type="number" min="0.01" max="1000000" step="0.01" required placeholder="請填金額"></label><label>估價日期<input name="date" type="date" max="${new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Taipei'})}" required></label><label class="full">回覆依據<textarea name="evidence" rows="3" required maxlength="5000" placeholder="記錄文件名稱、行員回覆方式或線上估價條件。"></textarea></label></div><p class="helper">儲存為「自行提供」的紀錄，與公開查核資料分開。請只填鑑估價值；核貸額度另記在看房筆記。</p><p class="form-error" id="bank-error" role="alert"></p><div class="form-actions"><span></span><button class="button primary" type="submit">新增銀行紀錄</button></div></form>`;}
function notesSection(p){if(PUBLIC_VIEW)return '<p class="helper">私人看房筆記僅保存在本機版本，沒有發布到 GitHub。</p><form id="notes-form" hidden></form>';const a=annotation(p);return `<form id="notes-form" data-version="${a.version}"><div class="notes-controls"><label>看房狀態<select name="status">${statuses.map(s=>`<option ${s===a.status?'selected':''}>${s}</option>`).join('')}</select></label><label class="favorite-label"><input type="checkbox" name="favorite" ${a.favorite?'checked':''}>收藏這間</label></div><label for="notes-input">看房心得與待問問題</label><textarea id="notes-input" name="notes" rows="5" maxlength="15000" placeholder="採光、噪音、停車動線、屋況、房仲回覆……">${esc(a.notes)}</textarea><p class="form-error" id="notes-error" role="alert"></p><div class="form-actions"><small id="notes-save-status">${a.updated_at?'上次儲存 '+dateLabel(a.updated_at):'尚無個人筆記'}</small><button class="button primary" type="submit">儲存筆記</button></div></form>`;}
function openDetail(id){
 const p=state.data.properties.find(p=>p.id===id);if(!p)throw new Error('找不到物件');
 state.activeId=id;state.notesDirty=false;state.bankDirty=false;
 const basic=`<dl class="fact-grid">${[
 ['權狀建坪',num(p.area,3)+' 坪'],['主建物',num(p.mainArea,3)+' 坪'],['附屬建物',p.accessoryArea==null?'待補':num(p.accessoryArea,3)+' 坪'],['土地坪數',p.landArea==null?'待補':num(p.landArea,3)+' 坪'],['格局',p.layout],['樓層',p.floorLabel],['刊登屋齡',p.ageLabel],['朝向',p.direction],['管理費',p.managementFee],['法定用途（刊登）',p.legalUse],['停車欄位',p.parkingField],['房仲',p.broker]
 ].map(([l,v])=>fact(l,v)).join('')}</dl><p class="inline-note">${esc(p.parkingClaim)}。停車價格與面積未分拆；總價／建坪僅供同口徑對照。上述為刊登資料，產權與用途仍以文件核對。</p><h3 class="section-subhead">建案與社區</h3><dl class="fact-grid">${p.communityFacts.map(f=>fact(f.label,f.value)).join('')}</dl><p class="helper">建案資料來源：${p.communitySources.map(s=>link(s.url,s.label)).join(' · ')}</p>`;
 const transactions=`<p class="inline-note">${esc(p.referenceCaveat)}。同街道不等於同社區或同戶；所有案例均保留來源，沒有以本表直接推算鑑價。</p><div class="form-grid" style="margin-bottom:15px"><label>成交時間<select id="tx-period"><option value="all">全部已收錄時間</option><option value="year">近一年</option></select></label><label>交易類型<select id="tx-phase"><option value="all">全部類型（逐筆標示）</option><option value="resale">成屋買賣</option><option value="presale">預售屋</option></select></label></div><label style="display:block;font-size:13px;margin-bottom:15px">案例範圍 <select id="tx-scope"><option value="local">同社區／同巷案例</option><option value="nearby">周邊街道（官方批次）</option><option value="all">全部已收錄案例</option></select></label><div id="tx-table"></div>`;
 const cross=`<p class="inline-note warning">配對尚未以完整門牌／權狀確認。以下價格各有其觀察日期，不連成此戶的降價紀錄。</p>${p.crossListings.map(c=>`<div class="cross-item"><div class="cross-head"><div>${link(c.url,c.platform)} <span class="tag amber">${esc(c.match)}</span></div>${c.price!=null?`<span class="cross-price">${num(c.price)} 萬</span>`:''}</div><p>${esc(c.description)}</p><p>${esc(c.basis)}</p><small>觀察 ${dateLabel(c.checkedAt)}${c.caveat?' · '+esc(c.caveat):''}</small></div>`).join('')||'<p class="helper">尚無額外刊登資料。</p>'}${issueList(p)}`;
 const timeline=`<dl class="fact-grid">${fact('首次觀察',dateLabel(p.firstObserved))}${fact('最近觀察',dateLabel(p.checkedAt))}${fact('委託起日','未取得證據')}${fact('首次刊登日','未公開')}</dl><ol class="timeline">${p.history.map(x=>`<li><time>${dateLabel(x.date)}</time>${esc(x.description)}</li>`).join('')}</ol><p class="inline-note">${p.sourceUpdated?'來源曾顯示「'+esc(p.sourceUpdated)+'」，以原觀察日為準。':''}廣告有效期 ${dateLabel(p.expiresAt)}；有效期與更新日都不代表開始販售。此次建立基準，尚不足以證明在售天數或降價。</p>`;
 $('#detail-content').innerHTML=`<div class="dialog-top"><div><small>物件資料 · ${esc(p.id)}</small><h2 id="detail-title">${esc(p.name)}</h2></div><button class="icon-button" data-close="detail-dialog" aria-label="關閉物件詳情">×</button></div><div class="detail-intro"><div><span class="price-number">${num(p.askingPrice)}</span> <span class="price-unit">萬・刊登開價</span><div class="detail-sub">${esc(p.address)}${userAddressNote(p)}</div><div class="detail-meta"><span>${esc(p.layout)}</span><span>${esc(p.floorLabel)}</span><span>${num(p.area,3)} 坪</span></div></div><a class="button quiet" href="${esc(safeURL(p.sourceUrl))}" target="_blank" rel="noreferrer">查看591原頁</a></div><div class="detail-body">${section('01','物件與建案資料',basic,true)}${section('02','同社區與周邊成交',transactions,true)}${section('03','多方刊登與待確認',cross)}${section('04','販售與觀察紀錄',timeline)}${section('05','銀行估價／鑑價',bankSection(p),false,'bank-details')}${section('06','我的看房筆記',notesSection(p),true,'notes-details')}${section('07','所有資料來源',sourceTable(p))}</div>`;
 $('#tx-table').innerHTML=transactionRows(p);
 const dialog=$('#detail-dialog');if(!dialog.open)dialog.showModal();dialog.scrollTop=0;
 $('#notes-form').addEventListener('input',()=>{state.notesDirty=true;$('#notes-save-status').textContent='尚未儲存';});
 $('#bank-form').addEventListener('input',()=>state.bankDirty=true);
 $('#notes-form').addEventListener('submit',saveNotes);
 $('#bank-form').addEventListener('submit',saveBank);
 $('#tx-period').addEventListener('change',()=>$('#tx-table').innerHTML=transactionRows(p));
 $('#tx-phase').addEventListener('change',()=>$('#tx-table').innerHTML=transactionRows(p));
 $('#tx-scope').addEventListener('change',()=>$('#tx-table').innerHTML=transactionRows(p));
}
async function post(){throw new Error('公開查閱版不提供儲存。');}
async function saveNotes(event){
 event.preventDefault();const form=event.currentTarget,button=$('button[type=submit]',form),p=state.data.properties.find(p=>p.id===state.activeId);
 const data=new FormData(form);$$('input,select,textarea,button',form).forEach(el=>el.disabled=true);$('#notes-error').textContent='';
 try{const r=await post('/api/notes',{propertyId:p.id,version:Number(form.dataset.version),status:data.get('status'),notes:data.get('notes'),favorite:data.has('favorite')});state.data=r.state;form.dataset.version=annotation(p).version;state.notesDirty=false;$('#notes-save-status').textContent=r.backupWarning||'已儲存至本機';render();toast(r.backupWarning||'看房筆記已儲存');}
 catch(e){$('#notes-error').textContent=e.message;}finally{$$('input,select,textarea,button',form).forEach(el=>el.disabled=false);}
}
async function saveBank(event){
 event.preventDefault();const form=event.currentTarget,button=$('button[type=submit]',form),p=state.data.properties.find(p=>p.id===state.activeId),data=new FormData(form);$$('input,select,textarea,button',form).forEach(el=>el.disabled=true);$('#bank-error').textContent='';
 try{const r=await post('/api/valuation',{propertyId:p.id,bank:data.get('bank'),kind:data.get('kind'),amount:Number(data.get('amount')),date:data.get('date'),evidence:data.get('evidence')});state.data=r.state;state.bankDirty=false;
 $('#bank-records').innerHTML=valuations(p).map(v=>`<div class="bank-record"><strong>${esc(v.bank)} · ${num(v.amount,2)} 萬</strong> <span class="tag">${esc(v.kind)}</span><p>${dateLabel(v.valuation_date)} · 自行提供，尚未獨立驗證</p><p>${esc(v.evidence)}</p></div>`).join('');form.reset();render();$('#bank-error').textContent=r.backupWarning||'';toast(r.backupWarning||'銀行紀錄已保存，並標示自行提供');}
 catch(e){$('#bank-error').textContent=e.message;}finally{$$('input,select,textarea,button',form).forEach(el=>el.disabled=false);}
}
function closeDialog(id){
 if(id==='detail-dialog'&&(state.notesDirty||state.bankDirty)){toast('有尚未儲存的內容，請先儲存；或按「捨棄未儲存內容」。');
  if(!$('#discard-draft')){const button=document.createElement('button');button.id='discard-draft';button.className='button quiet';button.textContent='捨棄未儲存內容並關閉';button.addEventListener('click',()=>{state.notesDirty=false;state.bankDirty=false;$('#detail-dialog').close();});$('.dialog-top',$('#detail-dialog')).append(button);}return;}
 $('#'+id).close();
}
document.addEventListener('click',e=>{const target=e.target.closest('button');if(!target)return;
 if(target.dataset.view)setView(target.dataset.view);
 if(target.dataset.detail)openDetail(target.dataset.detail);
 if(target.dataset.close)closeDialog(target.dataset.close);
});
$('#content').addEventListener('change',e=>{if(e.target.dataset.select){const id=e.target.dataset.select;if(e.target.checked){if(state.selected.size>=4){e.target.checked=false;toast('每次最多比較4間，請先取消一間。');return;}state.selected.add(id);}else state.selected.delete(id);renderOverview();$('#comparison-dock').hidden=state.selected.size<2;$('#dock-count').textContent=`${state.selected.size} 間`;}});
for(const id of ['budget','status-filter','sort'])$('#'+id).addEventListener('change',render);
$('#search').addEventListener('input',render);
$('#select-visible').addEventListener('click',()=>{const visible=getFiltered();state.selected=new Set(visible.slice(0,4).map(p=>p.id));if(visible.length>4)toast('已選取前4間，每次最多比較4間。');render();});
$('#clear-selection').addEventListener('click',()=>{state.selected.clear();render();});
$('#dock-compare').addEventListener('click',()=>setView('compare'));
for(const id of ['method-button','footer-method'])$('#'+id).addEventListener('click',()=>$('#method-dialog').showModal());
$('#add-button').addEventListener('click',()=>{$('#add-error').textContent='';$('#add-dialog').showModal();});
$('#add-form').addEventListener('submit',async e=>{e.preventDefault();const form=e.currentTarget,value=$('#new-input').value;$$('textarea,button',form).forEach(el=>el.disabled=true);$('#add-error').textContent='';try{const r=await post('/api/intake',{input:value});if(r.state)state.data=r.state;$('#add-dialog').close();$('#add-form').reset();render();if(r.existingId){openDetail(r.existingId);toast('這間已在清單中，已開啟原紀錄');}else toast(r.backupWarning||'已保存到待查清單');}catch(err){$('#add-error').textContent=err.message;}finally{$$('textarea,button',form).forEach(el=>el.disabled=false);}});
$('#detail-dialog').addEventListener('cancel',e=>{if(state.notesDirty||state.bankDirty){e.preventDefault();closeDialog('detail-dialog');}});
window.addEventListener('beforeunload',e=>{if(state.notesDirty||state.bankDirty){e.preventDefault();e.returnValue='';}});
async function registerTools(){
 const context=document.modelContext;if(!context?.registerTool)return;
 const lifecycle=new AbortController();window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
 const tools=[
 {name:'list_property_records',title:'讀取看房清單',description:'讀取目前保存的物件與資料來源；包含未驗證的外部刊登文字。',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute:()=>({properties:state.data.properties.map(p=>({id:p.id,name:p.name,askingPrice:p.askingPrice,source:p.sourceUrl,checkedAt:p.checkedAt,status:annotation(p).status}))})},
 {name:'show_property_comparison',title:'顯示物件比較',description:'將2到4間既有物件顯示為並排比較，不修改保存資料。',inputSchema:{type:'object',properties:{propertyIds:{type:'array',items:{type:'string'},minItems:2,maxItems:4,uniqueItems:true}},required:['propertyIds'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:input=>{const ids=input?.propertyIds;if(!Array.isArray(ids)||ids.length<2||ids.length>4||new Set(ids).size!==ids.length||ids.some(id=>!state.data.properties.some(p=>p.id===id)))throw new Error('請提供2到4個不同的既有物件ID');state.selected=new Set(ids);setView('compare');return{displayed:ids};}},
 {name:'show_property_details',title:'展開物件資料',description:'展開一間既有物件的資料與看房筆記，不更改保存內容。',inputSchema:{type:'object',properties:{propertyId:{type:'string'}},required:['propertyId'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:true},execute:input=>{if(state.notesDirty||state.bankDirty)throw new Error('請先處理尚未儲存的內容');openDetail(input?.propertyId);return{opened:input.propertyId};}}
 ];
 for(const tool of tools){try{await context.registerTool(tool,{signal:lifecycle.signal});}catch(e){console.warn('看房工具無法註冊',tool.name,e.message);}}
}
async function init(){try{const response=await fetch('./data.json',{cache:'no-store'});if(!response.ok)throw new Error('公開比較資料讀取失敗');state.data=await response.json();state.selected=new Set(state.data.properties.slice(0,4).map(p=>p.id));render();registerTools();}catch(e){$('#content').innerHTML=empty('暫時無法讀取看房資料',e.message+'。請重新整理公開網頁。');}}
init();
