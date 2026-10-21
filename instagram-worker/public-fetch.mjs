import {postUrl} from './extract.mjs';import {socialUrl} from './social.mjs';
export async function fetchPublic(url,social=false){let current=url;const seen=new Set();for(let hop=0;hop<4;hop++){
 if(seen.has(current))throw Error('redirect loop');seen.add(current);
 const response=await fetch(current,{redirect:'manual',signal:AbortSignal.timeout(15000),headers:{Accept:'text/html'}});
 if(![301,302,303,307,308].includes(response.status))return response;
 const location=response.headers.get('Location');if(!location)throw Error('missing redirect');const target=new URL(location,current);
 if(social){if(socialUrl(target.href).platform!==socialUrl(url).platform)throw Error('cross-service redirect');}else postUrl(target.href);
 await response.body?.cancel();current=target.href;
 }throw Error('too many redirects');}
