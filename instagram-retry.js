const InstagramRetry={
  findUrl(record){
    const candidates=[record.source,record.capture?.source?.source,record.content].filter(v=>typeof v==='string').flatMap(v=>v.match(/https?:\/\/[^\s<>"']+/g)||[]);
    for(const value of candidates){try{const u=new URL(value);if(u.protocol==='https:'&&['instagram.com','www.instagram.com','m.instagram.com'].includes(u.hostname)&&/^\/(p|reel|reels)\/[A-Za-z0-9_-]+\/?$/.test(u.pathname))return 'https://www.instagram.com'+u.pathname.replace(/\/?$/,'/');}catch{}}
    return null;
  },
  result(record){try{return JSON.parse(record.content).result||null;}catch{const marker='[공개 페이지 수집 결과 · 원문/미수집 상태]\n';const at=record.content?.indexOf(marker);if(at>=0)try{return JSON.parse(record.content.slice(at+marker.length));}catch{}return null;}},
  needsRetry(record){const url=this.findUrl(record);if(!url)return false;const result=this.result(record);if(!result?.status)return true;const fields=/\/reels?\//.test(url)?['caption','comments','cover']:['caption','comments','images'];return fields.some(k=>result.status[k]!=='collected');},
  candidates(records){const newest=new Map();for(const record of records){const url=this.findUrl(record);if(!url)continue;const prior=newest.get(url);if(!prior||String(record.captured_at||'')>String(prior.captured_at||''))newest.set(url,record);}return [...newest.values()].filter(r=>this.needsRetry(r));},
  capture(record,result){const url=this.findUrl(record);if(!url)throw Error('재수집할 Instagram 게시물 링크가 없습니다.');const raw=JSON.stringify({operation:'instagram_web_recollection',previous_item_id:record.id,source_url:url,result},null,2);
    return {schema:'moeum.zettelkasten.capture',schema_version:'1.0.0',sources:[{id:'instagram-web-retry',text:raw,source:url}],ideas:[{id:'web-recollection',title:record.title?record.title+' · 웹 재수집':'Instagram 웹 재수집',source_id:'instagram-web-retry',verbatim_text:raw,source_span:{start:0,end:raw.length},context_spans:[],kind:'unclassified',tags:[...record.tags],related_idea_ids:[],ambiguities:[]}]};}
};
if(typeof module!=='undefined')module.exports=InstagramRetry;
