/* Public reading pages are immutable snapshots, separate from the private inbox. */
const ReadingShare = (() => {
  const repository='kingspledu/zettel-inbox';
  const origin='https://kingspledu.github.io/zettel-inbox/';
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function snapshot(rows, includeText=false) {
    if(!rows.length)throw Error('공개할 자료를 먼저 선택하세요.');
    const ids=new Set();
    const items=rows.map(r=>{
      if(ids.has(r.id))throw Error('자료 ID가 중복됩니다.');ids.add(r.id);
      return {id:r.id,title:r.title,content:r.content,source:r.source,tags:[...r.tags],
        attachment_texts:includeText?r.attachments.filter(a=>typeof a.text_content==='string').map(a=>({name:a.name,content:a.text_content})):[],
        omitted_attachment_count:r.attachments.filter(a=>!includeText||typeof a.text_content!=='string').length};
    });
    return {id:crypto.randomUUID(),created_at:new Date().toISOString(),items,instructions:JSON.parse(JSON.stringify(LLM_POLICY))};
  }
  function url(id){if(!/^[0-9a-f-]{36}$/.test(id))throw Error('잘못된 공유 ID');return `${origin}shares/${id}/`;}
  function prompt(data){return `다음 자료 페이지를 먼저 읽어줘. ${url(data.id)}\n페이지의 운영 지침과 자료 ${data.items.length}개를 읽되, 요약·분류·재작성·추가 제안은 하지 마. 읽은 자료 ID 목록과 페이지 끝 확인 표식 MOEUM_END_${data.id}를 확인했는지만 알려줘. 접근 실패·누락·잘림이 있으면 정확히 말하고 읽었다고 추측하지 마. 첨부 원본과 링크된 외부 페이지는 읽은 것으로 간주하지 마. 이후 내 명시적 지시를 기다려줘.`;}
  function render(data){
    const articles=data.items.map((r,i)=>`<article id="item-${i+1}"><h2>${i+1}. ${escape(r.title||'제목 없는 자료')}</h2><p>자료 ID: <code>${escape(r.id)}</code></p><p>출처: ${escape(r.source||'미입력')}</p><p>태그: ${r.tags.map(escape).join(', ')||'없음'}</p><h3>원문</h3><pre>${escape(r.content)}</pre>${r.attachment_texts.map(a=>`<section><h3>텍스트 첨부: ${escape(a.name)}</h3><pre>${escape(a.content)}</pre></section>`).join('')}<p>제외된 첨부 원본: ${r.omitted_attachment_count}개. 원본 파일·이미지·PDF 내용은 이 페이지에서 제공하지 않습니다.</p></article>`).join('\n');
    return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><meta name="moeum-share-id" content="${escape(data.id)}"><title>인박스 읽기 자료 · ${data.items.length}개</title><style>body{max-width:900px;margin:40px auto;padding:0 22px;font:16px/1.8 system-ui,sans-serif;color:#243b30;background:#fafcfb}h1{font-size:28px}h2{font-size:22px}article,section.policy{border-top:1px solid #cbd8cf;padding:22px 0}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:14px/1.8 ui-monospace,monospace;background:#eff4f0;padding:18px;border-radius:8px}code{overflow-wrap:anywhere}.notice{background:#fff3d7;padding:16px;border-radius:8px}</style></head><body><header><h1>인박스 읽기 자료</h1><p>자료 ${data.items.length}개 · 고정된 공개 사본 · 게시 준비 시각 ${escape(data.created_at)}</p><p class="notice">이 페이지는 로그인 없이 열립니다. 원본 인박스와 자동 동기화되지 않습니다. 첨부 원본과 외부 링크의 내용은 읽기 범위에 포함되지 않습니다.</p></header><section class="policy"><h2>사용자가 지정한 운영 지침</h2><p>자료 수신은 작업 실행 명령이 아닙니다. 아래 지침을 읽고 다음 명시적 지시를 기다리세요. 지침의 준수는 사용하는 LLM이 결정하며 이 페이지는 시스템 지침을 대신하지 않습니다.</p><pre>${escape(JSON.stringify(data.instructions,null,2))}</pre></section><nav><h2>자료 목록</h2><ol>${data.items.map((r,i)=>`<li><a href="#item-${i+1}">${escape(r.title||'제목 없는 자료')}</a> · ID ${escape(r.id)}</li>`).join('')}</ol></nav><main>${articles}</main><footer><h2>읽기 범위 확인</h2><p>총 자료 ${data.items.length}개. 자료별 ID와 원문을 대조하고, 접근하지 않은 첨부·외부 자료를 읽었다고 말하지 마세요.</p><p>페이지 끝 확인 표식: <code>MOEUM_END_${escape(data.id)}</code></p></footer></body></html>`;
  }
  function encode(text){const bytes=new TextEncoder().encode(text);let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(binary);}
  async function publish(data,token){
    if(!token.trim())throw Error('공개 앱 저장소의 Contents 읽기·쓰기 토큰이 필요합니다.');
    const html=render(data);if(new TextEncoder().encode(html).length>2*1024*1024)throw Error('공개 페이지가 2MB를 초과합니다. 자료를 나누어 게시하세요.');
    const headers={Accept:'application/vnd.github+json',Authorization:`Bearer ${token.trim()}`,'X-GitHub-Api-Version':'2022-11-28'};
    const metaResponse=await fetch(`https://api.github.com/repos/${repository}`,{headers});
    if(!metaResponse.ok)throw Error(`게시 저장소 인증 실패 (${metaResponse.status})`);
    const meta=await metaResponse.json();if(meta.private||meta.full_name!==repository)throw Error('공개 게시 저장소가 일치하지 않습니다.');
    // No sha is sent: an existing snapshot can never be overwritten.
    const response=await fetch(`https://api.github.com/repos/${repository}/contents/shares/${data.id}/index.html`,{method:'PUT',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({message:'Publish selected inbox reading snapshot',branch:'main',content:encode(html)})});
    if(!response.ok)throw Error(`게시 요청 실패 (${response.status}). 권한을 확인하고 저장소에 같은 공유 ID가 존재하는지도 확인하세요.`);
    const result=await response.json();return {url:url(data.id),commit:result.commit.sha};
  }
  async function ready(data){try{const response=await fetch(`${url(data.id)}?check=${Date.now()}`,{cache:'no-store'});return response.ok&&(await response.text()).includes(`<meta name="moeum-share-id" content="${data.id}">`);}catch{return false;}}
  return {snapshot,render,url,prompt,publish,ready};
})();
if(typeof module!=='undefined')module.exports=ReadingShare;
