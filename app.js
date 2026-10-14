const $ = id => document.getElementById(id);
let db, records = [], selected = new Set(), busy = false, pendingCapture=null;
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function notify(message) { $('status').textContent = message; $('status').style.display = 'block'; clearTimeout(notify.timer); notify.timer = setTimeout(() => $('status').style.display = 'none', 5500); }
function openDB() { return new Promise((resolve,reject) => { const req = indexedDB.open('moeum-inbox',1); req.onupgradeneeded = () => req.result.createObjectStore('items',{keyPath:'id'}); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); }); }
const cloudActive = () => typeof CloudStore !== 'undefined' && CloudStore.active;
async function localRecords() { if(!db)db=await openDB();return new Promise((resolve,reject) => { const req = db.transaction('items','readonly').objectStore('items').getAll(); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); }); }
function requireFirebase(){if(!cloudActive())throw Error('Firebase에 연결하고 로그인한 뒤 사용하세요. 브라우저에는 자료를 저장하지 않습니다.');}
async function refresh() { records=[];if(cloudActive()){try{records=await CloudStore.list();}catch(error){render();throw error;}} records.sort((a,b) => b.captured_at.localeCompare(a.captured_at)); render(); }
async function saveRecord(record) {requireFirebase();return CloudStore.save(record);}
function visible() { const q = $('search').value.toLocaleLowerCase(); return records.filter(r => [r.title,r.content,r.source,...r.tags,...r.attachments.map(a=>a.name)].join('\n').toLocaleLowerCase().includes(q)); }
function renderCapture(r){return r.capture?`<details><summary>원문과 아이디어 분리 정보</summary><pre class="excerpt" style="max-height:400px">${escapeHTML(JSON.stringify(r.capture,null,2))}</pre></details>`:'';}
function render() {
  $('saveCapture').disabled=!cloudActive();$('restore').disabled=!cloudActive();
  $('count').textContent = records.length; $('total').textContent = records.length + '개';
  const rows = visible(); $('selectAll').checked = rows.length > 0 && rows.every(r=>selected.has(r.id));
  $('items').innerHTML = rows.length ? rows.map(r => `<article class="card"><input type="checkbox" data-select="${escapeHTML(r.id)}" aria-label="${escapeHTML(r.title || '자료')} 선택" ${selected.has(r.id)?'checked':''}><div class="card-body"><h3>${escapeHTML(r.title || '제목 없는 자료')}</h3><p class="excerpt">${escapeHTML(r.content)}</p><div class="meta">${escapeHTML(r.source || '출처 미입력')} · ${escapeHTML(new Date(r.captured_at).toLocaleString('ko-KR'))}</div>${renderCapture(r)}${r.tags.map(t=>`<span class="tag">${escapeHTML(t)}</span>`).join('')}${r.attachments.length?`<details><summary>첨부 ${r.attachments.length}개</summary>${r.attachments.map((a,i)=>`<div>${escapeHTML(a.name)} · ${Math.ceil(a.size/1024)} KB <button data-file="${escapeHTML(r.id)}" data-index="${i}">원본 다운로드</button></div>`).join('')}</details>`:''}</div><button data-delete="${escapeHTML(r.id)}">삭제</button></article>`).join('') : `<div class="empty"><b>${!cloudActive()?'Firebase에 연결해주세요':records.length?'검색 결과가 없습니다':'첫 번째 자료를 담아보세요'}</b>모아둔 원문은 자동으로 분석하거나 바꾸지 않습니다.</div>`;
}
function readFile(file) { return new Promise((resolve,reject) => { const reader = new FileReader(); reader.onload = () => resolve({name:file.name,mime_type:file.type || 'application/octet-stream',size:file.size,encoding:'base64',data:reader.result.split(',')[1]}); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file); }); }
function download(blob,name) { const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href=url; a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(url),10000); }
function makeExport(items) { return {schema:'moeum.zettelkasten.inbox',schema_version:'1.0.0',exported_at:new Date().toISOString(),execution_requested:false,llm_instructions:LLM_POLICY,json_capture_spec:{protocol:CaptureFormat.protocol,json_schema:CaptureFormat.schema,template:CaptureFormat.template()},item_count:items.length,items}; }
function makePromptExport() { return {...makeExport([]),purpose:'inbox_addition_prompt_only',inbox_addition_instructions:[
  '이 파일은 기존 수집 자료가 없는 인박스 추가용 지침이다. 빈 items를 과거 자료가 없다는 증거로 해석하거나 다른 기존 파일의 내용을 초기화하지 않는다.',
  '파일을 받으면 수신 사실만 알리고 대기한다. 사용자 지시 전에는 자료, 업무, 예시, 추천, 결과를 미리 만들지 않는다.',
  '사용자가 새 자료를 인박스에 추가하라고 명시하면 제공한 원문과 실제 제공한 출처만 새 items 원소로 추가한다. 출처 등 없는 정보는 추측하지 않는다. 기존 원소와 필드는 수정하지 않는다.',
  '새 자료 수집만으로 최소 단위 분리·분류·요약·재작성을 실행하지 않는다. 해당 작업은 별도의 명시적 사용자 지시가 있어야 한다.',
  '사용자가 업무지시를 최소 단위로 나누어 기록하라고 명시하면 llm_instructions.work_instruction_recording을 따른다. 새 work_instruction_log 기록만 추가하고 기록된 업무 자체는 실행하지 않는다.',
  '원본 지침과 기존 내용은 불변으로 유지한다. 개수·날짜·상태 등 기존 메타데이터도 자동 갱신하지 않는다. 추가한 내용은 신규 항목으로만 보존한다.',
  '실제 파일 저장 도구가 없으면 JSON 출력과 파일 저장을 구분하고, 저장 완료라고 주장하지 않는다.'
]}; }
async function exportRecords(rows) { if(busy)return; if (!rows.length) return notify('내려받을 자료를 선택하거나 먼저 저장하세요.');busy=true;try{const complete=[];for(const r of rows)complete.push(cloudActive()?await CloudStore.hydrate(r):r);download(new Blob([JSON.stringify(makeExport(complete),null,2)],{type:'application/json;charset=utf-8'}),`moeum-inbox-${new Date().toISOString().replace(/[:.]/g,'-')}.json`); notify(`${rows.length}개 자료를 내보냈습니다. 첨부 원본도 포함됩니다.`);}catch(error){notify('내보내기 실패: '+error.message);}finally{busy=false;} }
function downloadJSON(value,name){download(new Blob([JSON.stringify(value,null,2)],{type:'application/json;charset=utf-8'}),name);}
$('downloadSchema').onclick=()=>downloadJSON(CaptureFormat.schema,'moeum-capture.schema.json');
$('downloadTemplate').onclick=()=>downloadJSON(CaptureFormat.template(),'moeum-capture-template.json');
$('capture').onreset=()=>{pendingCapture=null;$('capturePreview').textContent='';$('fileNames').textContent='';};
$('captureJson').onchange=async event=>{
  if(busy)return;pendingCapture=null;$('capturePreview').textContent='';const file=event.target.files[0];if(!file)return;
  busy=true;try{if(!/\.json$/i.test(file.name))throw Error('.json 파일만 등록할 수 있습니다.');if(file.size>10*1024*1024)throw Error('한 파일은 10MB 이하로 나누어주세요.');
    const input=CaptureFormat.validate(JSON.parse(await file.text()));const prepared=await CaptureFormat.toRecords(input);
    for(const r of prepared)if(new TextEncoder().encode(JSON.stringify(r)).length>800000)throw Error('아이디어와 연결 원문이 너무 큽니다. 원문을 더 작은 sources로 나누어주세요.');
    pendingCapture=prepared;$('fileNames').textContent=`${file.name} · 원문 ${input.sources.length}개 · 아이디어 ${prepared.length}개 · 검증 통과`;
    $('capturePreview').innerHTML=prepared.map(r=>`<article class="card"><div><h3>${escapeHTML(r.title||r.capture.idea.id)}</h3><p class="excerpt">${escapeHTML(r.content)}</p><small>원문 ${escapeHTML(r.capture.source.id)} · ${r.capture.idea.source_span.start}~${r.capture.idea.source_span.end} · 문맥 ${r.capture.idea.context_spans.length}개</small></div></article>`).join('');
  }catch(error){$('fileNames').textContent='JSON 검증 실패: '+error.message;}finally{busy=false;}
};
$('capture').onsubmit=async event=>{event.preventDefault();if(busy)return;try{requireFirebase();}catch(error){return notify(error.message);}if(!pendingCapture)return notify('양식에 맞는 JSON 파일을 먼저 선택하고 검증해주세요.');busy=true;let added=0,skipped=0;
  try{for(const r of pendingCapture){if(await saveRecord(r))added++;else skipped++;}await refresh();$('capture').reset();notify(`${added}개 등록, 동일한 기존 자료 ${skipped}개 유지. 기존 내용은 수정하지 않았습니다.`);}
  catch(error){await refresh().catch(()=>{});notify(`${added}개 등록 후 중단: ${error.message}`);}finally{busy=false;}
};
$('items').onchange = e => { const id=e.target.dataset.select;if(id){e.target.checked?selected.add(id):selected.delete(id);render();} };
$('items').onclick = async e => {
  if(busy)return;try{requireFirebase();}catch(error){return notify(error.message);}const deleteId=e.target.dataset.delete, fileId=e.target.dataset.file;
  if(deleteId && confirm('DB에서 이 자료를 삭제할까요? GitHub 첨부 원본은 남습니다.')) {busy=true;try{await CloudStore.remove(deleteId);selected.delete(deleteId);await refresh();notify('삭제했습니다.');}catch{notify('삭제하지 못했습니다.');}finally{busy=false;}}
  if(fileId){busy=true;try{const r=records.find(r=>r.id===fileId);const complete=cloudActive()?await CloudStore.hydrate({...r,attachments:[r.attachments[Number(e.target.dataset.index)]]}):{attachments:[r.attachments[Number(e.target.dataset.index)]]};const file=complete.attachments[0];const bytes=Uint8Array.from(atob(file.data),c=>c.charCodeAt(0));download(new Blob([bytes],{type:file.mime_type}),file.name);}catch(error){notify(error.message);}finally{busy=false;}}
};
$('search').oninput=render;
$('selectAll').onchange=e=>{visible().forEach(r=>e.target.checked?selected.add(r.id):selected.delete(r.id));render();};
$('exportAll').onclick=()=>exportRecords(records);
$('exportPrompt').onclick=()=>{download(new Blob([JSON.stringify(makePromptExport(),null,2)],{type:'application/json;charset=utf-8'}),'moeum-inbox-addition-prompt.json');notify('수집 자료 없이 인박스 추가용 프롬프트만 내려받았습니다.');};
$('exportSelected').onclick=()=>exportRecords(records.filter(r=>selected.has(r.id)));
$('restore').onclick=()=>$('restoreFile').click();
function validateImport(data) {
  if(data.schema!=='moeum.zettelkasten.inbox'||data.schema_version!=='1.0.0'||!Array.isArray(data.items))throw Error('이 앱에서 내보낸 JSON을 선택하세요. 일반 JSON 자료는 파일 첨부로 수집하세요.');
  const ids=new Set();for(const r of data.items){if(!r || typeof r.id!=='string'||!r.id||ids.has(r.id)||!['title','content','source','captured_at'].every(k=>typeof r[k]==='string')||!Number.isFinite(Date.parse(r.captured_at))||!Array.isArray(r.tags)||!r.tags.every(t=>typeof t==='string')||!Array.isArray(r.attachments))throw Error('자료 형식이 올바르지 않습니다.');ids.add(r.id);if(r.capture)CaptureFormat.validateStored(r);for(const a of r.attachments){if(typeof a.name!=='string'||typeof a.mime_type!=='string'||!Number.isFinite(a.size)||a.size<0||a.encoding!=='base64'||typeof a.data!=='string'||(a.text_content!==undefined&&typeof a.text_content!=='string'))throw Error('첨부 형식이 올바르지 않습니다.');if(atob(a.data).length!==a.size)throw Error('첨부 크기가 일치하지 않습니다.');}}
  return data.items;
}
$('restoreFile').onchange=async e=>{if(busy)return;busy=true;let completed=0;try{requireFirebase();const file=e.target.files[0];if(!file)return;if(!/\.json$/i.test(file.name))throw Error('.json 백업만 가져올 수 있습니다.');const incoming=validateImport(JSON.parse(await file.text()));const ids=new Set(records.map(r=>r.id)),fresh=incoming.filter(r=>!ids.has(r.id));for(const r of fresh){if(await saveRecord({id:r.id,title:r.title,content:r.content,source:r.source,tags:r.tags,captured_at:r.captured_at,status:'unprocessed',attachments:r.attachments,...(r.capture?{capture:r.capture}:{})}))completed++;}await refresh();notify(`${completed}개 복원, 중복 ${incoming.length-fresh.length}개 건너뜀. 운영 지침은 앱 기본값을 유지합니다.`);}catch(err){await refresh().catch(()=>{});notify(`${completed}개 저장 후 중단: ${err.message}`);}finally{busy=false;e.target.value='';}};
// Legacy IndexedDB is opened only when the user explicitly migrates old records.
const localReady=Promise.resolve();
render();
