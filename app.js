const $ = id => document.getElementById(id);
let db, records = [], selected = new Set(), busy = false;
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function notify(message) { $('status').textContent = message; $('status').style.display = 'block'; clearTimeout(notify.timer); notify.timer = setTimeout(() => $('status').style.display = 'none', 5500); }
function openDB() { return new Promise((resolve,reject) => { const req = indexedDB.open('moeum-inbox',1); req.onupgradeneeded = () => req.result.createObjectStore('items',{keyPath:'id'}); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); }); }
function transact(mode, action) { return new Promise((resolve,reject) => { const tx = db.transaction('items',mode); action(tx.objectStore('items')); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error || new Error('저장 취소')); }); }
const cloudActive = () => typeof CloudStore !== 'undefined' && CloudStore.active;
async function localRecords() { return new Promise((resolve,reject) => { const req = db.transaction('items').objectStore('items').getAll(); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); }); }
async function refresh() { records = cloudActive() ? await CloudStore.list() : await localRecords(); records.sort((a,b) => b.captured_at.localeCompare(a.captured_at)); render(); }
async function saveRecord(record) { if(cloudActive())return CloudStore.save(record); await transact('readwrite',store=>store.add(record));return true; }
function visible() { const q = $('search').value.toLocaleLowerCase(); return records.filter(r => [r.title,r.content,r.source,...r.tags,...r.attachments.map(a=>a.name)].join('\n').toLocaleLowerCase().includes(q)); }
function render() {
  $('count').textContent = records.length; $('total').textContent = records.length + '개';
  const rows = visible(); $('selectAll').checked = rows.length > 0 && rows.every(r=>selected.has(r.id));
  $('items').innerHTML = rows.length ? rows.map(r => `<article class="card"><input type="checkbox" data-select="${escapeHTML(r.id)}" aria-label="${escapeHTML(r.title || '자료')} 선택" ${selected.has(r.id)?'checked':''}><div class="card-body"><h3>${escapeHTML(r.title || '제목 없는 자료')}</h3><p class="excerpt">${escapeHTML(r.content)}</p><div class="meta">${escapeHTML(r.source || '출처 미입력')} · ${escapeHTML(new Date(r.captured_at).toLocaleString('ko-KR'))}</div>${r.tags.map(t=>`<span class="tag">${escapeHTML(t)}</span>`).join('')}${r.attachments.length?`<details><summary>첨부 ${r.attachments.length}개</summary>${r.attachments.map((a,i)=>`<div>${escapeHTML(a.name)} · ${Math.ceil(a.size/1024)} KB <button data-file="${escapeHTML(r.id)}" data-index="${i}">원본 다운로드</button></div>`).join('')}</details>`:''}</div><button data-delete="${escapeHTML(r.id)}">삭제</button></article>`).join('') : `<div class="empty"><b>${records.length?'검색 결과가 없습니다':'첫 번째 자료를 담아보세요'}</b>모아둔 원문은 자동으로 분석하거나 바꾸지 않습니다.</div>`;
}
function readFile(file) { return new Promise((resolve,reject) => { const reader = new FileReader(); reader.onload = () => resolve({name:file.name,mime_type:file.type || 'application/octet-stream',size:file.size,encoding:'base64',data:reader.result.split(',')[1]}); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file); }); }
function download(blob,name) { const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href=url; a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(url),10000); }
function makeExport(items) { return {schema:'moeum.zettelkasten.inbox',schema_version:'1.0.0',exported_at:new Date().toISOString(),execution_requested:false,llm_instructions:LLM_POLICY,item_count:items.length,items}; }
async function exportRecords(rows) { if(busy)return; if (!rows.length) return notify('내려받을 자료를 선택하거나 먼저 저장하세요.');busy=true;try{const complete=[];for(const r of rows)complete.push(cloudActive()?await CloudStore.hydrate(r):r);download(new Blob([JSON.stringify(makeExport(complete),null,2)],{type:'application/json;charset=utf-8'}),`moeum-inbox-${new Date().toISOString().replace(/[:.]/g,'-')}.json`); notify(`${rows.length}개 자료를 내보냈습니다. 첨부 원본도 포함됩니다.`);}catch(error){notify('내보내기 실패: '+error.message);}finally{busy=false;} }
$('files').onchange = () => { $('fileNames').textContent = [...$('files').files].map(f=>f.name).join(', '); };
$('capture').onsubmit = async event => {
  event.preventDefault(); if(busy || !db)return; const files=[...$('files').files];
  if(!$('content').value.trim() && !files.length && !$('source').value.trim()) return notify('내용, 출처 링크 또는 파일을 넣어주세요.');
  if(files.reduce((n,f)=>n+f.size,0)>25*1024*1024)return notify('한 번에 첨부할 수 있는 파일 합계는 25MB입니다. 나누어 저장해주세요.');
  busy=true; const submit=$('capture').querySelector('button[type=submit]'); submit.disabled=true;
  try { const attachments=await Promise.all(files.map(readFile)); let content=$('content').value;
    for(let i=0;i<files.length;i++) if(/\.(txt|md|json|csv|tsv|html|xml|log)$/i.test(files[i].name)||files[i].type.startsWith('text/')) attachments[i].text_content=await files[i].text();
    const record={id:crypto.randomUUID(),title:$('title').value.trim(),content,source:$('source').value.trim(),tags:$('tags').value.split(',').map(t=>t.trim()).filter(Boolean),captured_at:new Date().toISOString(),status:'unprocessed',attachments};
    await saveRecord(record); $('capture').reset(); $('fileNames').textContent=''; await refresh(); notify('원문을 저장했습니다.');
  }catch(err){notify('저장하지 못했습니다: '+err.message);}finally{busy=false;submit.disabled=false;}
};
$('items').onchange = e => { const id=e.target.dataset.select;if(id){e.target.checked?selected.add(id):selected.delete(id);render();} };
$('items').onclick = async e => {
  if(busy)return;const deleteId=e.target.dataset.delete, fileId=e.target.dataset.file;
  if(deleteId && confirm(cloudActive()?'DB에서 이 자료를 삭제할까요? GitHub 첨부 원본은 남습니다.':'이 자료와 첨부파일을 삭제할까요? 백업하지 않았다면 복구할 수 없습니다.')) {busy=true;try{if(cloudActive())await CloudStore.remove(deleteId);else await transact('readwrite',s=>s.delete(deleteId));selected.delete(deleteId);await refresh();notify('삭제했습니다.');}catch{notify('삭제하지 못했습니다.');}finally{busy=false;}}
  if(fileId){busy=true;try{const r=records.find(r=>r.id===fileId);const complete=cloudActive()?await CloudStore.hydrate({...r,attachments:[r.attachments[Number(e.target.dataset.index)]]}):{attachments:[r.attachments[Number(e.target.dataset.index)]]};const file=complete.attachments[0];const bytes=Uint8Array.from(atob(file.data),c=>c.charCodeAt(0));download(new Blob([bytes],{type:file.mime_type}),file.name);}catch(error){notify(error.message);}finally{busy=false;}}
};
$('search').oninput=render;
$('selectAll').onchange=e=>{visible().forEach(r=>e.target.checked?selected.add(r.id):selected.delete(r.id));render();};
$('exportAll').onclick=()=>exportRecords(records);
$('exportSelected').onclick=()=>exportRecords(records.filter(r=>selected.has(r.id)));
$('restore').onclick=()=>$('restoreFile').click();
function validateImport(data) {
  if(data.schema!=='moeum.zettelkasten.inbox'||data.schema_version!=='1.0.0'||!Array.isArray(data.items))throw Error('이 앱에서 내보낸 JSON을 선택하세요. 일반 JSON 자료는 파일 첨부로 수집하세요.');
  const ids=new Set();for(const r of data.items){if(!r || typeof r.id!=='string'||!r.id||ids.has(r.id)||!['title','content','source','captured_at'].every(k=>typeof r[k]==='string')||!Number.isFinite(Date.parse(r.captured_at))||!Array.isArray(r.tags)||!r.tags.every(t=>typeof t==='string')||!Array.isArray(r.attachments))throw Error('자료 형식이 올바르지 않습니다.');ids.add(r.id);for(const a of r.attachments){if(typeof a.name!=='string'||typeof a.mime_type!=='string'||!Number.isFinite(a.size)||a.size<0||a.encoding!=='base64'||typeof a.data!=='string'||(a.text_content!==undefined&&typeof a.text_content!=='string'))throw Error('첨부 형식이 올바르지 않습니다.');if(atob(a.data).length!==a.size)throw Error('첨부 크기가 일치하지 않습니다.');}}
  return data.items;
}
$('restoreFile').onchange=async e=>{if(busy)return;busy=true;let completed=0;try{const file=e.target.files[0];if(!file)return;const incoming=validateImport(JSON.parse(await file.text()));const ids=new Set(records.map(r=>r.id)),fresh=incoming.filter(r=>!ids.has(r.id));for(const r of fresh){if(await saveRecord({id:r.id,title:r.title,content:r.content,source:r.source,tags:r.tags,captured_at:r.captured_at,status:'unprocessed',attachments:r.attachments}))completed++;}await refresh();notify(`${completed}개 복원, 중복 ${incoming.length-fresh.length}개 건너뜀. 운영 지침은 앱 기본값을 유지합니다.`);}catch(err){await refresh().catch(()=>{});notify(`${completed}개 저장 후 중단: ${err.message}`);}finally{busy=false;e.target.value='';}};
openDB().then(async result=>{db=result;await refresh();}).catch(()=>notify('브라우저 저장소를 열 수 없습니다. 일반 브라우저에서 다시 열어주세요.'));
