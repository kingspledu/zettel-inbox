export function postUrl(value){const u=new URL(value);if(u.protocol!=='https:'||!['instagram.com','www.instagram.com','m.instagram.com'].includes(u.hostname)||!/^\/(p|reel|reels)\/[A-Za-z0-9_-]+\/?$/.test(u.pathname))throw Error('게시물 또는 릴스 링크가 필요합니다.');return 'https://www.instagram.com'+u.pathname.replace(/\/?$/,'/');}
function mediaUrl(value){try{const u=new URL(value);return u.protocol==='https:'&&(u.hostname.endsWith('.cdninstagram.com')||u.hostname.endsWith('.fbcdn.net'))?u.href:null;}catch{return null;}}
const decode=s=>s.replace(/&#(x[0-9a-f]+|[0-9]+);/gi,(all,n)=>{const v=n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):parseInt(n,10);return v>=0&&v<=0x10ffff?String.fromCodePoint(v):all;}).replace(/&quot;/g,'"').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>');
export function extract(html,url){
 const result={source_url:postUrl(url),collected_at:new Date().toISOString(),caption:null,comments:[],images:[],cover_image:null,status:{caption:'unavailable',comments:'unavailable',images:'unavailable',cover:'unavailable'},limitations:['공개 페이지에 제공된 정보만 추출했습니다. 숨겨진 댓글·답글·이미지는 포함되지 않을 수 있습니다.','이미지는 URL을 수집하며 원본 파일을 영구 백업한 상태는 아닙니다. 주소가 만료될 수 있습니다.']};
 const reel=/\/reels?\//.test(result.source_url);let structured=false;
 const addImage=u=>{const safe=mediaUrl(u);if(safe&&!result.images.includes(safe))result.images.push(safe);};
 const comment=n=>({id:String(n.id||''),text:typeof n.text==='string'?n.text:'',author:typeof n.owner?.username==='string'?n.owner.username:null,replies:(n.edge_threaded_comments?.edges||[]).map(e=>({id:String(e.node?.id||''),text:e.node?.text||'',author:e.node?.owner?.username||null})),replies_complete:typeof n.edge_threaded_comments?.count==='number'&&n.edge_threaded_comments.count===(n.edge_threaded_comments.edges||[]).length});
 const seen=new Set();function visit(node,depth=0){if(!node||typeof node!=='object'||depth>35||seen.has(node))return;seen.add(node);
  const shortcode=result.source_url.split('/')[4];
  if(node.shortcode===shortcode&&(node.edge_media_to_caption||node.display_url||node.edge_sidecar_to_children)){
   structured=true;const edges=node.edge_media_to_caption?.edges;if(Array.isArray(edges)&&edges.length){result.caption=edges.map(e=>e.node?.text||'').join('\n');result.status.caption='collected';}
   if(reel){result.cover_image=mediaUrl(node.display_url);if(result.cover_image)result.status.cover='collected';}
   else if(node.edge_sidecar_to_children?.edges){for(const e of node.edge_sidecar_to_children.edges)if(!e.node?.is_video)addImage(e.node?.display_url);result.status.images='partial';}
   else if(!node.is_video){addImage(node.display_url);result.status.images=result.images.length?'collected':'unavailable';}
   const comments=node.edge_media_to_parent_comment||node.edge_media_to_comment;if(comments?.edges){result.comments=comments.edges.map(e=>comment(e.node||{}));result.status.comments=comments.page_info?.has_next_page===false&&typeof comments.count==='number'&&comments.count===result.comments.length&&result.comments.every(c=>c.replies_complete)?'collected':'partial';}
  }
  if(node['@type']==='SocialMediaPosting'&&typeof node.articleBody==='string'&&result.caption===null){result.caption=node.articleBody;result.status.caption='collected';}
  for(const v of Object.values(node))if(v&&typeof v==='object')if(Array.isArray(v))v.forEach(x=>visit(x,depth+1));else visit(v,depth+1);
 }
 for(const match of html.matchAll(/<script\b[^>]*type=["']application\/(?:ld\+)?json["'][^>]*>([\s\S]*?)<\/script>/gi)){try{visit(JSON.parse(match[1]));}catch{}}
 let thumbnail=null;for(const match of html.matchAll(/<meta\b[^>]*>/gi)){const attrs={};for(const a of match[0].matchAll(/([\w:-]+)\s*=\s*(["'])([\s\S]*?)\2/g))attrs[a[1].toLowerCase()]=decode(a[3]);if(attrs.property==='og:image')thumbnail=mediaUrl(attrs.content);if(attrs.property==='og:description'&&attrs.content){result.page_description=attrs.content;if(result.caption===null)result.status.caption='preview_only';}}
 if(reel&&thumbnail&&!result.cover_image){result.cover_image=thumbnail;result.status.cover='collected';}
 if(!reel&&!result.images.length&&thumbnail){addImage(thumbnail);result.status.images='partial';result.limitations.push('미리보기 이미지 한 장만 확인됐습니다. 전체 이미지 수집으로 간주하지 마세요.');}
 if(!structured)result.limitations.push('전체 게시물 구조를 확인하지 못했습니다.');
 return result;
}
