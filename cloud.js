/* Firebase receives text and attachment metadata only. GitHub receives attachment bytes. */
window.CloudStore = (() => {
  let sdk, authSdk, auth, database, user, inboxUid, token = '', repo = '', active = false, temporary = false;
  const apiRoot = 'https://api.github.com';
  const clean = r => ({id:r.id,title:r.title,content:r.content,source:r.source,tags:r.tags,captured_at:r.captured_at,status:'unprocessed',attachments:r.attachments,...(r.capture?{capture:r.capture}:{}),...(r.media_backup?{media_backup:r.media_backup}:{})});
  const fail = message => { throw new Error(message); };
  async function github(path, options = {}, raw = false) {
    if(!token) fail('첨부파일을 사용하려면 연결 설정에서 GitHub 토큰을 입력하세요.');
    const response = await fetch(apiRoot + path,{...options,headers:{Accept:raw?'application/vnd.github.raw+json':'application/vnd.github+json',Authorization:`Bearer ${token}`,'X-GitHub-Api-Version':'2022-11-28',...(options.body?{'Content-Type':'application/json'}:{})}});
    if(!response.ok) fail(`GitHub 요청 실패 (${response.status}). 토큰 권한과 만료 여부를 확인하세요.`);
    return response.status === 204 ? null : raw ? response.arrayBuffer() : response.json();
  }
  function pathFor(ref) {
    if(ref.repository !== repo || !/^attachments\/[0-9a-f-]+\/[0-9a-f-]+$/.test(ref.path)) fail('현재 연결과 일치하지 않는 첨부 경로입니다. 원래 저장소로 연결하세요.');
    return `/repos/${repo}/contents/${ref.path}`;
  }
  async function setGithubToken(accessToken) {
    token=(accessToken || '').trim();
    try{const meta=await github(`/repos/${repo}`);if(!meta.private)fail('첨부파일 보호를 위해 비공개 저장소를 선택하세요.');}
    catch(error){token='';throw error;}
  }
  async function connect(config, repository, accessToken = '', options = {}) {
    if(active)fail('다른 설정으로 연결하려면 먼저 연결을 해제하세요.');
    if(!config.apiKey || !config.projectId || !config.authDomain)fail('Firebase 웹 앱 설정이 필요합니다.');
    if(!/^[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+$/.test(repository))fail('GitHub 저장소를 소유자/이름 형식으로 입력하세요.');
    token='';repo=repository;temporary=options.temporary===true;
    try {
      if(accessToken.trim())await setGithubToken(accessToken);
      const [appModule,authModule,dbModule]=await Promise.all([
        import('https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js'),
        import('https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js'),
        import('https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js')
      ]);
      sdk=dbModule;authSdk=authModule;
      // A stable app name is required to recover the same persisted Auth session after reload.
      const appName=temporary?`inbox-temporary-${crypto.randomUUID()}`:`inbox-${config.projectId}`;
      const app=appModule.getApps().find(a=>a.name===appName)||appModule.initializeApp(config,appName);
      auth=authSdk.getAuth(app);await authSdk.setPersistence(auth,temporary?authSdk.inMemoryPersistence:authSdk.browserLocalPersistence);
      await auth.authStateReady();
      // Popup requires a user gesture; the connect UI loads SDK before enabling login.
      database=sdk.getFirestore(app);
      return true;
    }catch(error){token='';throw error;}
  }
  async function activate(nextUser) {
    user=nextUser;
    try {inboxUid=(await user.getIdTokenResult()).claims.inbox_uid||user.uid;await sdk.getDocs(sdk.query(sdk.collection(database,'users',inboxUid,'items'),sdk.limit(1)));active=true; }
    catch(error){active=false;user=null;throw error;}
    return user.email;
  }
  async function resume() { return auth?.currentUser ? activate(auth.currentUser) : null; }
  async function login() {
    if(!auth)fail('먼저 설정 확인을 눌러주세요.');
    const provider=new authSdk.GoogleAuthProvider();
    if(temporary)provider.setCustomParameters({prompt:'select_account'});
    return activate((await authSdk.signInWithPopup(auth,provider)).user);
  }
  async function unlock(mode,input){if(!auth)fail('연결 준비 중입니다. 잠시 후 다시 시도하세요.');const accounts=window.INBOX_UNLOCK_ACCOUNTS;if(!accounts?.[mode])fail('잠금 설정을 불러오지 못했습니다.');const password=await UnlockKey.derive(mode,input);return activate((await authSdk.signInWithEmailAndPassword(auth,accounts[mode],password)).user);}
  function collection() { if(!active||!user)fail('잠금을 먼저 해제해주세요.');return sdk.collection(database,'users',inboxUid,'items'); }
  async function list(){return (await sdk.getDocs(collection())).docs.map(d=>d.data());}
  async function hydrate(record) {
    const attachments=[];
    for(const attachment of record.attachments) {
      if(attachment.data){attachments.push(attachment);continue;}
      if(!attachment.github)fail('첨부 원본 경로가 없습니다.');
      const ref=attachment.github;pathFor(ref);let buffer;
      if(window.INSTAGRAM_COLLECTOR_URL&&ref.repository==='kingspledu/zettel-inbox-attachments'){
        const response=await fetch('http://127.0.0.1:4191/attachment',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+await user.getIdToken()},body:JSON.stringify(ref)});
        if(!response.ok)fail('첨부 파일을 불러오지 못했습니다.');buffer=await response.arrayBuffer();
      }else buffer=await github(pathFor(ref)+`?ref=${encodeURIComponent(ref.sha)}`,{},true);
      // ref.sha identifies a commit so a mutable branch cannot change the exported original.
      const bytes=new Uint8Array(buffer);if(bytes.length!==attachment.size)fail('첨부 크기가 일치하지 않습니다.');
      let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));const data=btoa(binary);
      const {github:ignored,...fields}=attachment;attachments.push({...fields,encoding:'base64',data});
    }
    return {...record,attachments};
  }
  async function save(record) {
    collection();const existing=await sdk.getDoc(sdk.doc(collection(),record.id));if(existing.exists()){if(record.capture&&JSON.stringify(existing.data().capture)!==JSON.stringify(record.capture))fail('같은 ID의 기존 아이디어와 내용이 다릅니다. 기존 자료는 수정하지 않았습니다. 새 아이디어 ID를 사용하세요.');return false;}
    const uploaded=[];const attachments=[];
    try {
      for(const file of record.attachments){
        if(file.github && !file.data){pathFor(file.github);attachments.push(file);continue;}
        const path=`attachments/${crypto.randomUUID()}/${crypto.randomUUID()}`;
        const result=await github(`/repos/${repo}/contents/${path}`,{method:'PUT',body:JSON.stringify({message:'Store inbox attachment',content:file.data})});
        const githubRef={repository:repo,path,sha:result.commit.sha};uploaded.push({path,sha:result.content.sha});
        const {data,encoding,...metadata}=file;attachments.push({...metadata,github:githubRef});
      }
      const payload=clean({...record,attachments});
      if(new TextEncoder().encode(JSON.stringify(payload)).length>800000)fail('텍스트가 너무 큽니다. 원본 파일로 첨부하거나 자료를 나누어 저장하세요.');
      await sdk.runTransaction(database,async tx=>{const ref=sdk.doc(collection(),record.id);if((await tx.get(ref)).exists())fail('같은 ID의 자료가 이미 있습니다. 다시 불러와주세요.');tx.set(ref,payload);});
      return true;
    }catch(error){
      // Cross-service writes are not atomic. Keep uploaded files for recovery, including on ambiguous network failures.
      if(uploaded.length)throw new Error('DB 저장을 확인하지 못했습니다. GitHub에 첨부가 남아 있을 수 있습니다. 원본 입력을 유지했으니 연결 확인 후 재시도하세요.');
      throw error;
    }
  }
  async function archiveInstagram(record, previous=[]) {
    const result=InstagramRetry.result(record);if(!result)return record;
    const urls=[...new Set(/\/reels?\//.test(InstagramRetry.findUrl(record)||'')?[result.cover_image].filter(Boolean):result.images||[])];

    const attachments=[...record.attachments],files=[],errors=[];
    for(const url of urls){
      const existing=previous.flatMap(r=>r.attachments||[]).find(a=>a.source_url===url&&a.github);
      if(existing){attachments.push(existing);files.push({url,state:'stored'});continue;}
      try{
        const response=await fetch('http://127.0.0.1:4191/archive',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+await user.getIdToken()},body:JSON.stringify({url})});
        const attachment=await response.json();if(!response.ok)throw Error(attachment.error||'이미지 저장 실패');
        pathFor(attachment.github);attachments.push(attachment);
        files.push({url,state:'stored'});
      }catch(error){errors.push({url,error:error.message==='Failed to fetch'?'PC 수집 도우미를 실행해주세요.':error.message});}
    }
    return {...record,attachments,media_backup:{state:urls.length&&!errors.length?'collected':'partial',files,errors}};
  }
  async function extractSocial(url){if(!active||!user)fail('잠금을 먼저 해제해주세요.');const response=await fetch(window.INSTAGRAM_COLLECTOR_URL+'/social',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+await user.getIdToken()},body:JSON.stringify({url})});const data=await response.json();if(!response.ok)fail(data.error||'공개 자료 수집 실패');return data;}
  async function remove(id){await sdk.deleteDoc(sdk.doc(collection(),id));}
  async function disconnect(){active=false;token='';user=null;inboxUid=null;if(auth)await authSdk.signOut(auth);}
  async function extractInstagram(url){if(!active||!user)fail('잠금을 먼저 해제해주세요.');const endpoint=window.INSTAGRAM_COLLECTOR_URL;try{const health=await fetch('http://127.0.0.1:4191/health',{signal:AbortSignal.timeout(2500)});if(health.ok&&(await health.json()).app==='moeum-local-collector'){const local=await fetch('http://127.0.0.1:4191/extract',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+await user.getIdToken()},body:JSON.stringify({url})});const data=await local.json();if(local.ok)return data;throw Error(data.error||'PC 수집 실패');}}catch(error){if(error.message==='PC 수집 실패'||error.message?.startsWith('수집 실패:'))throw error;}if(!endpoint)fail('상세 수집 서버가 설정되지 않았습니다.');const response=await fetch(endpoint+'/extract',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+await user.getIdToken()},body:JSON.stringify({url})});const result=await response.json();if(!response.ok)fail(result.error||'상세 수집에 실패했습니다.');return result;}
  return {connect,resume,login,unlock,extractSocial,extractInstagram,archiveInstagram,setGithubToken,list,save,hydrate,remove,disconnect,get active(){return active;},get temporary(){return temporary;}};
})();
