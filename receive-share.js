const IncomingShare={
  parse(params){
    const title=params.get('share_title')||'',text=params.get('share_text')||'',url=params.get('share_url')||'';
    if(!title&&!text&&!url)return null;
    const raw=[title,text,url].filter(Boolean).join('\n');if(raw.length>30000)throw Error('공유 내용이 너무 큽니다.');
    const candidates=raw.match(/https?:\/\/[^\s<>"']+/g)||[];
    const link=candidates.map(x=>x.replace(/[),.。]+$/g,'')).find(x=>{try{const u=new URL(x);return u.protocol==='https:'&&(u.hostname==='instagram.com'||u.hostname.endsWith('.instagram.com'));}catch{return false;}});
    if(!link)throw Error('Instagram HTTPS 링크를 찾지 못했습니다. Instagram에서 링크 공유를 선택해주세요.');
    return {title,raw,url:link};
  },
  capture(value){return {schema:'moeum.zettelkasten.capture',schema_version:'1.0.0',sources:[{id:'instagram-share',text:value.raw,source:value.url}],ideas:[{id:'shared-link',title:value.title,source_id:'instagram-share',verbatim_text:value.raw,source_span:{start:0,end:value.raw.length},context_spans:[],kind:'unclassified',tags:[],related_idea_ids:[],ambiguities:[]}]};}
};
if(typeof module!=='undefined')module.exports=IncomingShare;
if(typeof document!=='undefined'){
  let incoming=null,installPrompt=null,details=null;
  $('extractIncoming').onclick=async()=>{if(busy||!incoming)return;try{requireFirebase();}catch(error){return notify(error.message);}busy=true;$('extractIncoming').disabled=true;details=null;$('incomingDetails').textContent='공개 페이지에서 수집 중…';try{details=await CloudStore.extractInstagram(incoming.url);$('incomingDetails').textContent=JSON.stringify(details,null,2);}catch(error){$('incomingDetails').textContent=error.message+'\n본문·댓글·이미지는 수집되지 않았습니다. 링크만 보관할 수 있습니다.';}finally{busy=false;$('extractIncoming').disabled=false;}};
  if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
  window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;$('installApp').hidden=false;});
  $('installApp').onclick=async()=>{if(installPrompt){await installPrompt.prompt();installPrompt=null;}else notify('갤럭시 Chrome 메뉴에서 홈 화면에 추가 → 설치를 선택하세요.');};
  try{incoming=IncomingShare.parse(new URLSearchParams(location.search));if(incoming){$('incomingPanel').hidden=false;$('incomingText').textContent=incoming.raw;$('incomingLink').textContent=incoming.url;}}
  catch(error){$('incomingPanel').hidden=false;$('incomingText').textContent=error.message;$('saveIncoming').disabled=true;}
  // Remove shared text from the address after receiving it; never store it locally.
  if(new URLSearchParams(location.search).has('share_text')||new URLSearchParams(location.search).has('share_url'))history.replaceState(null,'',location.pathname);
  $('saveIncoming').onclick=async()=>{if(busy||!incoming)return;try{requireFirebase();}catch(error){return notify(error.message);}busy=true;$('saveIncoming').disabled=true;try{const value=details?{...incoming,raw:incoming.raw+'\n\n[공개 페이지 수집 결과 · 원문/미수집 상태]\n'+JSON.stringify(details,null,2)}:incoming;const rows=await CaptureFormat.toRecords(IncomingShare.capture(value));for(const row of rows)if(new TextEncoder().encode(JSON.stringify(row)).length>800000)throw Error('수집 결과가 너무 큽니다. 현재는 저장할 수 없습니다.');let added=0;for(const row of rows)if(await saveRecord(row))added++;await refresh();$('incomingPanel').hidden=true;incoming=null;details=null;notify(added?'Instagram 자료를 보관했습니다.':'이미 보관된 자료입니다.');}catch(error){notify('저장하지 못했습니다: '+error.message);$('saveIncoming').disabled=false;}finally{busy=false;}};
  $('cancelIncoming').onclick=()=>{if(busy)return;incoming=null;details=null;$('incomingDetails').textContent='';$('incomingText').textContent='';$('incomingLink').textContent='';$('incomingPanel').hidden=true;};
  window.addEventListener('inbox-unlocked',()=>{if(incoming&&!details)$('extractIncoming').onclick();});
  if(incoming&&cloudActive())$('extractIncoming').onclick();
}
