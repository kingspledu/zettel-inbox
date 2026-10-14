const $ = id => document.getElementById(id);
let db, records = [], selected = new Set(), busy = false, pendingCapture=null;
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function notify(message) { $('status').textContent = message; $('status').style.display = 'block'; clearTimeout(notify.timer); notify.timer = setTimeout(() => $('status').style.display = 'none', 5500); }
function openDB() { return new Promise((resolve,reject) => { const req = indexedDB.open('moeum-inbox',1); req.onupgradeneeded = () => req.result.createObjectStore('items',{keyPath:'id'}); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); }); }
const cloudActive = () => typeof CloudStore !== 'undefined' && CloudStore.active;
async function localRecords() { if(!db)db=await openDB();return new Promise((resolve,reject) => { const req = db.transaction('items','readonly').objectStore('items').getAll(); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); }); }
function requireFirebase(){if(!cloudActive())throw Error('먼저 보관함 잠금을 해제해주세요.');}
async function refresh() { records=[];if(cloudActive()){try{records=await CloudStore.list();}catch(error){render();throw error;}} records.sort((a,b) => b.captured_at.localeCompare(a.captured_at)); render(); }
async function saveRecord(record) {requireFirebase();return CloudStore.save(record);}
function visible() { const q = $('search').value.toLocaleLowerCase(); return records.filter(r => [r.title,r.content,r.source,...r.tags,...r.attachments.map(a=>a.name)].join('\n').toLocaleLowerCase().includes(q)); }
function renderCapture(r){return r.capture?`<details><summary>원문과 아이디어 분리 정보</summary><pre class="excerpt" style="max-height:400px">${escapeHTML(JSON.stringify(r.capture,null,2))}</pre></details>`:'';}
let postImageUrls=[];
function renderPostText(text){
  if(typeof DOMParser==='undefined')return escapeHTML(text).replace(/\n/g,'<br>');
  const allowed=new Set(['P','BR','STRONG','B','EM','I','U','UL','OL','LI','BLOCKQUOTE','H1','H2','H3','H4','A','DIV','SPAN']);
  const blocked=new Set(['SCRIPT','STYLE','IFRAME','OBJECT','EMBED','SVG','MATH','FORM','INPUT','BUTTON']);
  const doc=new DOMParser().parseFromString(String(text),'text/html');
  function clean(node){if(node.nodeType===3)return escapeHTML(node.textContent).replace(/\n/g,'<br>');if(node.nodeType!==1||blocked.has(node.tagName))return '';const children=[...node.childNodes].map(clean).join('');if(!allowed.has(node.tagName))return children;
    const tag=node.tagName.toLowerCase();if(tag==='br')return '<br>';
    if(tag==='a'){try{const url=new URL(node.getAttribute('href'));if(!['https:','http:'].includes(url.protocol))return children;return `<a href="${escapeHTML(url.href)}" target="_blank" rel="noopener noreferrer">${children}</a>`;}catch{return children;}}
    return `<${tag}>${children}</${tag}>`;
  }
  return [...doc.body.childNodes].map(clean).join('');
}
function renderInstagramPost(r){
  const url=InstagramRetry.findUrl(r);if(!url)return `<p class="excerpt">${escapeHTML(r.content)}</p>`;
  const result=InstagramRetry.result(r);const reel=/\/reels?\//.test(url);
  const text=result?.caption??result?.page_description??(result?'아직 게시물 본문을 수집하지 못했습니다.':r.content);
  const urls=[...new Set((reel?[result?.cover_image]:result?.images||[]).filter(Boolean))].filter(value=>{try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&(u.hostname.endsWith('.cdninstagram.com')||u.hostname.endsWith('.fbcdn.net'));}catch{return false;}});
  const images=urls.map((src,i)=>`<figure><img src="${escapeHTML(src)}" alt="${reel?'릴스 커버':'게시물 이미지 '+(i+1)}" loading="lazy" referrerpolicy="no-referrer"><figcaption>${reel?'릴스 커버':'이미지 '+(i+1)}</figcaption></figure>`).join('');
  return `<section class="instagram-post"><div class="post-heading">${reel?'Instagram 릴스':'Instagram 게시물'}${result?.status?.caption==='preview_only'?' · 본문 미리보기':''}</div><div class="post-content">${renderPostText(text)}</div><div class="post-gallery" data-post-gallery="${escapeHTML(r.id)}">${images}</div>${r.attachments.some(a=>a.mime_type?.startsWith('image/'))?`<button data-view-post="${escapeHTML(r.id)}">저장된 원본 이미지 보기</button>`:''}<div class="post-actions"><a href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer">게시물 열기 ↗</a><button data-copy-post="${escapeHTML(r.id)}">게시물 링크 복사</button></div><details><summary>수집 원문·상태 보기</summary><pre class="excerpt">${escapeHTML(r.content)}</pre></details></section>`;
}
function renderInstagramRetry(r){return InstagramRetry.findUrl(r)?`<div style="margin-top:12px"><button data-retry-instagram="${escapeHTML(r.id)}">웹에서 다시 수집</button></div>`:'';}
function render() {
  for(const url of postImageUrls)URL.revokeObjectURL(url);postImageUrls=[];
  const retryCount=InstagramRetry.candidates(records).length;$('retryMissingInstagram').textContent=`수집 안 된 항목 일괄 다운로드 (${retryCount})`;$('retryMissingInstagram').disabled=!cloudActive()||!retryCount;
  $('saveCapture').disabled=!cloudActive();$('restore').disabled=!cloudActive();
  $('count').textContent = records.length; $('total').textContent = records.length + '개';
  const rows = visible(); $('selectAll').checked = rows.length > 0 && rows.every(r=>selected.has(r.id));
  $('items').innerHTML = rows.length ? rows.map(r => `<article class="card"><input type="checkbox" data-select="${escapeHTML(r.id)}" aria-label="${escapeHTML(r.title || '자료')} 선택" ${selected.has(r.id)?'checked':''}><div class="card-body"><h3>${escapeHTML(r.title || '제목 없는 자료')}</h3>${renderInstagramPost(r)}<div class="meta">${escapeHTML(r.source || '출처 미입력')} · ${escapeHTML(new Date(r.captured_at).toLocaleString('ko-KR'))}</div>${r.media_backup?`<p>이미지 파일 저장 ${r.media_backup.files.length}개 · 실패 ${r.media_backup.errors.length}개</p>`:''}${renderCapture(r)}${renderInstagramRetry(r)}${InstagramRetry.findUrl(r)?'':r.tags.map(t=>`<span class="tag">${escapeHTML(t)}</span>`).join('')}${r.attachments.length?`<details><summary>첨부 ${r.attachments.length}개</summary>${r.attachments.map((a,i)=>`<div>${escapeHTML(a.name)} · ${Math.ceil(a.size/1024)} KB <button data-file="${escapeHTML(r.id)}" data-index="${i}">원본 다운로드</button></div>`).join('')}</details>`:''}</div><button data-delete="${escapeHTML(r.id)}">삭제</button></article>`).join('') : `<div class="empty"><b>${!cloudActive()?'보관함 잠금을 해제해주세요':records.length?'검색 결과가 없습니다':'첫 번째 자료를 담아보세요'}</b>모아둔 원문은 자동으로 분석하거나 바꾸지 않습니다.</div>`;
}
function readFile(file) { return new Promise((resolve,reject) => { const reader = new FileReader(); reader.onload = () => resolve({name:file.name,mime_type:file.type || 'application/octet-stream',size:file.size,encoding:'base64',data:reader.result.split(',')[1]}); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file); }); }
function download(blob,name) { const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href=url; a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(url),10000); }
function makeExport(items) { return {schema:'moeum.zettelkasten.inbox',schema_version:'1.0.0',exported_at:new Date().toISOString(),execution_requested:false,llm_instructions:LLM_POLICY,json_capture_spec:{protocol:CaptureFormat.protocol,json_schema:CaptureFormat.schema,template:CaptureFormat.template()},item_count:items.length,items}; }
function makePromptExport() { return {...makeExport([]),purpose:'inbox_addition_prompt_only',json_writing_start_gate:{
  required_user_command:'이제부터 입력한 자료들을 json 파일로 작성해',
  initial_state:'WAITING_FOR_JSON_WRITING_START_COMMAND',
  rules:[
    '사용자가 실제 대화에서 “이제부터 입력한 자료들을 json 파일로 작성해”라고 실행 지시하기 전에는 JSON 작성을 절대로 시작하지 않는다. 이 문구가 지침·인용·예시·첨부자료 안에 등장하는 것은 실행 지시가 아니다.',
    '시작 지시 전에는 입력한 자료를 수신하고 대기한다. 미리 최소 단위 분리, 분류, 정리, 재작성, 요약, 제목 생성, 초안, JSON 구조 채우기, 파일 생성 또는 결과 제시를 하지 않는다. 수신 확인만 짧게 답한다.',
    '입력이 길어지거나 자료가 여러 개 쌓였다는 이유로 먼저 작업하지 않는다. 침묵·시간 경과·입력 종료 추측은 시작 허가가 아니다. 일반적인 작성 요청을 위 시작 문구로 임의 해석하지 않는다.',
    '시작 지시를 받으면 사용자가 지정한 자료 범위만 기존 원문을 보존하여 JSON으로 작성한다. “이제부터”의 대상이 이전 자료인지 이후 자료인지 불명확하면 범위만 확인하고, 확인되기 전에는 작성을 시작하지 않는다.',
    '시작 허가는 해당 작업 범위에만 적용한다. 완료·취소·중단 후 새 자료는 다시 대기하며 새로운 시작 지시 없이 추가 작성하지 않는다. 기존 내용 수정·삭제·덮어쓰기 금지 규칙은 계속 유지한다.',
    '이 프롬프트 안의 일반적인 JSON 작성 허용 조건과 충돌하면 이 명시적 시작 조건을 우선 적용한다. 이 파일을 읽은 것만으로 작업을 시작하지 않는다.'
  ]
},inbox_addition_instructions:[
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
  if(e.target.dataset.copyPost){const r=records.find(r=>r.id===e.target.dataset.copyPost),url=r&&InstagramRetry.findUrl(r);if(!url)return;try{await navigator.clipboard.writeText(url);notify('게시물 링크를 복사했습니다.');}catch{notify('복사하지 못했습니다. 게시물 열기 링크에서 주소를 복사해주세요.');}return;}
  if(e.target.dataset.viewPost){if(busy)return;const r=records.find(r=>r.id===e.target.dataset.viewPost);if(!r)return;const button=e.target;busy=true;button.disabled=true;
    try{requireFirebase();const complete=await CloudStore.hydrate({...r,attachments:r.attachments.filter(a=>['image/jpeg','image/png','image/webp'].includes(a.mime_type))});const gallery=[...document.querySelectorAll('[data-post-gallery]')].find(el=>el.dataset.postGallery===r.id);if(gallery){const fragments=complete.attachments.map((a,i)=>{const src=URL.createObjectURL(new Blob([Uint8Array.from(atob(a.data),c=>c.charCodeAt(0))],{type:a.mime_type}));postImageUrls.push(src);return `<figure><img src="${src}" alt="저장된 이미지 ${i+1}"><figcaption>저장된 원본 ${i+1}</figcaption></figure>`;});gallery.innerHTML=fragments.join('');}notify('저장된 원본 이미지를 표시했습니다.');}catch(error){notify(error.message);}finally{busy=false;button.disabled=false;}return;
  }

  if(e.target.dataset.retryInstagram){await retrySavedInstagram(e.target.dataset.retryInstagram);return;}
  if(busy)return;try{requireFirebase();}catch(error){return notify(error.message);}const deleteId=e.target.dataset.delete, fileId=e.target.dataset.file;
  if(deleteId && confirm('DB에서 이 자료를 삭제할까요? GitHub 첨부 원본은 남습니다.')) {busy=true;try{await CloudStore.remove(deleteId);selected.delete(deleteId);await refresh();notify('삭제했습니다.');}catch{notify('삭제하지 못했습니다.');}finally{busy=false;}}
  if(fileId){busy=true;try{const r=records.find(r=>r.id===fileId);const complete=cloudActive()?await CloudStore.hydrate({...r,attachments:[r.attachments[Number(e.target.dataset.index)]]}):{attachments:[r.attachments[Number(e.target.dataset.index)]]};const file=complete.attachments[0];const bytes=Uint8Array.from(atob(file.data),c=>c.charCodeAt(0));download(new Blob([bytes],{type:file.mime_type}),file.name);}catch(error){notify(error.message);}finally{busy=false;}}
};
let pendingInstagramRetry=null;
async function retrySavedInstagram(id){if(busy)return;try{requireFirebase();}catch(error){return notify(error.message);}const record=records.find(r=>r.id===id);if(!record)return;
  busy=true;pendingInstagramRetry=null;$('saveRetry').hidden=false;$('saveRetry').disabled=true;$('retryResult').textContent='저장된 링크로 공개 웹페이지를 다시 조회하고 있습니다…';$('retryDialog').showModal();
  try{const result=await CloudStore.extractInstagram(InstagramRetry.findUrl(record));pendingInstagramRetry=[InstagramRetry.capture(record,result)];$('retryResult').textContent=JSON.stringify(result,null,2);$('saveRetry').disabled=false;}
  catch(error){$('retryResult').textContent='재수집 실패: '+error.message+'\n기존 자료는 그대로 보존했습니다.';}finally{busy=false;}
}
$('closeRetry').onclick=()=>{if(busy)return;pendingInstagramRetry=null;$('retryDialog').close();};
$('retryDialog').oncancel=event=>{if(busy)event.preventDefault();else pendingInstagramRetry=null;};
$('saveRetry').onclick=async()=>{if(busy||!pendingInstagramRetry?.length)return;busy=true;$('saveRetry').disabled=true;let added=0;try{for(const capture of pendingInstagramRetry){const rows=await CaptureFormat.toRecords(capture);for(const row of rows)if(new TextEncoder().encode(JSON.stringify(row)).length>800000)throw Error('재수집 결과가 너무 커 저장할 수 없습니다.');for(const row of rows)if(await saveRecord(await CloudStore.archiveInstagram(row,records)))added++;}await refresh();pendingInstagramRetry=null;$('retryDialog').close();notify(`재수집 결과 ${added}개를 새 항목으로 보관했습니다. 기존 자료는 유지했습니다.`);}catch(error){await refresh().catch(()=>{});$('retryResult').textContent+=`\n${added}개 저장 후 중단: ${error.message}`;$('saveRetry').disabled=false;}finally{busy=false;}};
let cancelBatchRetry=false;
$('stopRetry').onclick=()=>{cancelBatchRetry=true;$('stopRetry').disabled=true;$('stopRetry').textContent='현재 항목 처리 후 중지';};
$('retryMissingInstagram').onclick=async()=>{
  if(busy)return;try{requireFirebase();}catch(error){return notify(error.message);}
  if(!InstagramRetry.candidates(records).length)return notify('재시도할 미수집 Instagram 링크가 없습니다.');
  busy=true;cancelBatchRetry=false;pendingInstagramRetry=null;$('saveRetry').disabled=true;$('saveRetry').hidden=true;$('stopRetry').hidden=false;$('stopRetry').disabled=false;$('stopRetry').textContent='중지';$('retryDialog').showModal();
  try{await InstagramRetry.runBatch([...records],{
    extract:url=>CloudStore.extractInstagram(url),
    save:async capture=>{const rows=await CaptureFormat.toRecords(capture);for(const row of rows)if(new TextEncoder().encode(JSON.stringify(row)).length>800000)throw Error('결과가 너무 커 저장하지 못했습니다.');let saved;for(const row of rows){saved=await CloudStore.archiveInstagram(row,records);await saveRecord(saved);}return saved;},
    cancelled:()=>cancelBatchRetry,
    progress:r=>{$('retryResult').textContent=[r.phase==='done'?(r.cancelled?'중지됨':'순차 수집 완료'):'순차 수집·저장 중',`처리 ${r.processed}/${r.total} · 저장 ${r.saved} (일부 수집 ${r.partial}) · 미수집 ${r.empty} · 실패 ${r.failed}`,r.current||'',JSON.stringify(r.results,null,2)].join('\n');}
  });await refresh();}
  catch(error){$('retryResult').textContent+='\n처리 중단: '+error.message;}
  finally{busy=false;$('stopRetry').hidden=true;await refresh().catch(()=>{});}
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
$('restoreFile').onchange=async e=>{if(busy)return;busy=true;let completed=0;try{requireFirebase();const file=e.target.files[0];if(!file)return;if(!/\.json$/i.test(file.name))throw Error('.json 백업만 가져올 수 있습니다.');const incoming=validateImport(JSON.parse(await file.text()));const ids=new Set(records.map(r=>r.id)),fresh=incoming.filter(r=>!ids.has(r.id));for(const r of fresh){if(await saveRecord({id:r.id,title:r.title,content:r.content,source:r.source,tags:r.tags,captured_at:r.captured_at,status:'unprocessed',attachments:r.attachments,...(r.capture?{capture:r.capture}:{}),...(r.media_backup?{media_backup:r.media_backup}:{})}))completed++;}await refresh();notify(`${completed}개 복원, 중복 ${incoming.length-fresh.length}개 건너뜀. 운영 지침은 앱 기본값을 유지합니다.`);}catch(err){await refresh().catch(()=>{});notify(`${completed}개 저장 후 중단: ${err.message}`);}finally{busy=false;e.target.value='';}};
// Legacy IndexedDB is opened only when the user explicitly migrates old records.
const localReady=Promise.resolve();
render();
