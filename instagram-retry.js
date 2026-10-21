const InstagramRetry={
  findUrl(record){
    const candidates=[record.source,record.capture?.source?.source,record.content].filter(v=>typeof v==='string').flatMap(v=>v.match(/https?:\/\/[^\s<>"']+/g)||[]);
    for(const value of candidates){try{const u=new URL(value);if(u.protocol==='https:'&&['instagram.com','www.instagram.com','m.instagram.com'].includes(u.hostname)&&/^\/(p|reel|reels)\/[A-Za-z0-9_-]+\/?$/.test(u.pathname))return 'https://www.instagram.com'+u.pathname.replace(/\/?$/,'/');}catch{}}
    return null;
  },
  result(record){try{return JSON.parse(record.content).result||null;}catch{const marker='[공개 페이지 수집 결과 · 원문/미수집 상태]\n';const at=record.content?.indexOf(marker);if(at>=0)try{return JSON.parse(record.content.slice(at+marker.length));}catch{}return null;}},
  needsRetry(record){const url=this.findUrl(record);if(!url)return false;const result=this.result(record);if(!result?.status)return true;const fields=/\/reels?\//.test(url)?['caption','cover']:['caption','images'];return fields.some(k=>result.status[k]!=='collected')||record.media_backup?.state!=='collected';},
  candidates(records){const newest=new Map();for(const record of records){const url=this.findUrl(record);if(!url)continue;const prior=newest.get(url);if(!prior||String(record.captured_at||'')>String(prior.captured_at||''))newest.set(url,record);}return [...newest.values()].filter(r=>this.needsRetry(r));},
  async runBatch(records,{extract,save,progress=()=>{},cancelled=()=>false}){
    const targets=this.candidates(records),report={total:targets.length,processed:0,saved:0,partial:0,empty:0,failed:0,cancelled:false,results:[]};
    for(const record of targets){if(cancelled()){report.cancelled=true;break;}const url=this.findUrl(record);progress({...report,current:url,phase:'collecting'});
      try{const result=await extract(url);const useful=!!(result.caption||result.page_description||result.cover_image||result.images?.length||result.comments?.length);
        if(!useful){report.empty++;report.results.push({url,state:'unavailable',message:'본문·이미지·댓글을 가져오지 못했습니다. 기존 자료는 유지했습니다.'});}
        else{const capture=this.capture(record,result);const saved=await save(capture);report.saved++;const partial=this.needsRetry(saved||{...record,content:JSON.stringify({result})});if(partial)report.partial++;report.results.push({url,state:partial?'partial_saved':'saved',status:result.status,media_backup:saved?.media_backup});}
      }catch(error){report.failed++;report.results.push({url,state:'failed',message:error.message});}
      report.processed++;progress({...report,current:url,phase:'finished_item'});
    }
    progress({...report,phase:'done'});return report;
  },
  capture(record,result){const url=this.findUrl(record);if(!url)throw Error('재수집할 Instagram 게시물 링크가 없습니다.');const raw=JSON.stringify({operation:'instagram_web_recollection',previous_item_id:record.id,source_url:url,result},null,2);
    return {schema:'moeum.zettelkasten.capture',schema_version:'1.0.0',sources:[{id:'instagram-web-retry',text:raw,source:url}],ideas:[{id:'web-recollection',title:record.title?record.title+' · 웹 재수집':'Instagram 웹 재수집',source_id:'instagram-web-retry',verbatim_text:raw,source_span:{start:0,end:raw.length},context_spans:[],kind:'unclassified',tags:[...record.tags],related_idea_ids:[],ambiguities:[]}]};}
};
if(typeof module!=='undefined')module.exports=InstagramRetry;
