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
  let incoming=null,installPrompt=null;
  if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
  window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;$('installApp').hidden=false;});
  $('installApp').onclick=async()=>{if(installPrompt){await installPrompt.prompt();installPrompt=null;}else notify('갤럭시 Chrome 메뉴에서 홈 화면에 추가 → 설치를 선택하세요.');};
  try{incoming=IncomingShare.parse(new URLSearchParams(location.search));if(incoming){$('incomingPanel').hidden=false;$('incomingText').textContent=incoming.raw;$('incomingLink').textContent=incoming.url;}}
  catch(error){$('incomingPanel').hidden=false;$('incomingText').textContent=error.message;$('saveIncoming').disabled=true;}
  // Remove shared text from the address after receiving it; never store it locally.
  if(new URLSearchParams(location.search).has('share_text')||new URLSearchParams(location.search).has('share_url'))history.replaceState(null,'',location.pathname);
  $('saveIncoming').onclick=async()=>{if(busy||!incoming)return;try{requireFirebase();}catch(error){return notify(error.message);}busy=true;$('saveIncoming').disabled=true;try{const rows=await CaptureFormat.toRecords(IncomingShare.capture(incoming));let added=0;for(const row of rows)if(await saveRecord(row))added++;await refresh();$('incomingPanel').hidden=true;incoming=null;notify(added?'Instagram 링크를 보관했습니다.':'이미 보관된 링크입니다.');}catch(error){notify('저장하지 못했습니다: '+error.message);$('saveIncoming').disabled=false;}finally{busy=false;}};
  $('cancelIncoming').onclick=()=>{incoming=null;$('incomingText').textContent='';$('incomingLink').textContent='';$('incomingPanel').hidden=true;};
}
