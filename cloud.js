/* Firebase receives text and attachment metadata only. GitHub receives attachment bytes. */
window.CloudStore = (() => {
  let sdk, authSdk, auth, database, user, token = '', repo = '', active = false;
  const apiRoot = 'https://api.github.com';
  const clean = r => ({id:r.id,title:r.title,content:r.content,source:r.source,tags:r.tags,captured_at:r.captured_at,status:'unprocessed',attachments:r.attachments});
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
  async function connect(config, repository, accessToken) {
    if(active)fail('다른 설정으로 연결하려면 먼저 연결을 해제하세요.');
    if(!config.apiKey || !config.projectId || !config.authDomain)fail('Firebase 웹 앱 설정이 필요합니다.');
    if(!/^[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+$/.test(repository))fail('GitHub 저장소를 소유자/이름 형식으로 입력하세요.');
    token=accessToken.trim();repo=repository;
    try {
      const meta=await github(`/repos/${repo}`);if(!meta.private)fail('첨부파일 보호를 위해 비공개 저장소를 선택하세요.');
      const [appModule,authModule,dbModule]=await Promise.all([
        import('https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js'),
        import('https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js'),
        import('https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js')
      ]);
      sdk=dbModule;authSdk=authModule;
      const app=appModule.initializeApp(config,`inbox-${crypto.randomUUID()}`);
      auth=authSdk.getAuth(app);await authSdk.setPersistence(auth,authSdk.inMemoryPersistence);
      // Popup requires a user gesture; the connect UI loads SDK before enabling login.
      database=sdk.getFirestore(app);
      return true;
    }catch(error){token='';throw error;}
  }
  async function login() {
    if(!auth)fail('먼저 설정 확인을 눌러주세요.');
    user=(await authSdk.signInWithPopup(auth,new authSdk.GoogleAuthProvider())).user;
    try { await sdk.getDocs(sdk.query(sdk.collection(database,'users',user.uid,'items'),sdk.limit(1)));active=true; }
    catch(error){await authSdk.signOut(auth);user=null;throw error;}
    return user.email;
  }
  function collection() { if(!active||!user)fail('클라우드 로그인이 필요합니다.');return sdk.collection(database,'users',user.uid,'items'); }
  async function list(){return (await sdk.getDocs(collection())).docs.map(d=>d.data());}
  async function hydrate(record) {
    const attachments=[];
    for(const attachment of record.attachments) {
      if(attachment.data){attachments.push(attachment);continue;}
      if(!attachment.github)fail('첨부 원본 경로가 없습니다.');
      const ref=attachment.github;const buffer=await github(pathFor(ref)+`?ref=${encodeURIComponent(ref.sha)}`,{},true);
      // ref.sha identifies a commit so a mutable branch cannot change the exported original.
      const bytes=new Uint8Array(buffer);if(bytes.length!==attachment.size)fail('첨부 크기가 일치하지 않습니다.');
      let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));const data=btoa(binary);
      const {github:ignored,...fields}=attachment;attachments.push({...fields,encoding:'base64',data});
    }
    return {...record,attachments};
  }
  async function save(record) {
    collection();const existing=await sdk.getDoc(sdk.doc(collection(),record.id));if(existing.exists())return false;
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
  async function remove(id){await sdk.deleteDoc(sdk.doc(collection(),id));}
  async function disconnect(){active=false;token='';user=null;if(auth)await authSdk.signOut(auth);}
  return {connect,login,list,save,hydrate,remove,disconnect,get active(){return active;}};
})();
