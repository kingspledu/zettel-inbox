const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
(async()=>{
let written,requests=[],privateRepo=true,popupCount=0,appNames=[],persistence;
const authState={currentUser:null,authStateReady:async()=>{}};
const mockApp={getApps:()=>[],initializeApp:(config,name)=>{appNames.push(name);return {};}};
const mockAuth={getAuth:()=>authState,setPersistence:async(a,p)=>{persistence=p;},browserLocalPersistence:{kind:'persistent'},GoogleAuthProvider:class{},signInWithPopup:async()=>{popupCount++;authState.currentUser={uid:'owner',email:'owner@example.test'};return {user:authState.currentUser};},signOut:async()=>{authState.currentUser=null;}};
const mockDb={getFirestore:()=>({}),collection:(...args)=>args.slice(1),query:x=>x,limit:()=>1,getDocs:async()=>({docs:[]}),getDoc:async()=>({exists:()=>false}),doc:(c,id)=>({c,id}),runTransaction:async(db,fn)=>fn({get:async()=>({exists:()=>false}),set:(ref,data)=>{written=data;}}),deleteDoc:async()=>{}};
const ctx={window:{},crypto:require('node:crypto').webcrypto,TextEncoder,atob,btoa,mockApp,mockAuth,mockDb,fetch:async(url,options)=>{
requests.push({url,options});let data;
if(options.method==='PUT')data={commit:{sha:'commit-sha'},content:{sha:'blob-sha'}};
else if(url.includes('/contents/'))data={encoding:'base64',content:'YWJj\n'};
else data={private:privateRepo};return{ok:true,status:200,json:async()=>data,arrayBuffer:async()=>Uint8Array.from([97,98,99]).buffer};
}};
vm.createContext(ctx);let source=fs.readFileSync('cloud.js','utf8').replace(/import\('https:\/\/www.gstatic.com\/firebasejs\/[^']+firebase-app.js'\)/g,'Promise.resolve(mockApp)').replace(/import\('https:\/\/www.gstatic.com\/firebasejs\/[^']+firebase-auth.js'\)/g,'Promise.resolve(mockAuth)').replace(/import\('https:\/\/www.gstatic.com\/firebasejs\/[^']+firebase-firestore.js'\)/g,'Promise.resolve(mockDb)');vm.runInContext(source,ctx);
const cloud=ctx.window.CloudStore;
privateRepo=false;await assert.rejects(()=>cloud.connect({apiKey:'key',projectId:'id',authDomain:'domain'},'owner/private','token'),/비공개/);
privateRepo=true;await cloud.connect({apiKey:'key',projectId:'id',authDomain:'domain'},'owner/private','token');await cloud.login();assert.equal(cloud.active,true);
assert.equal(persistence,mockAuth.browserLocalPersistence);
const record={id:'id',title:'title',content:'원문',source:'book',tags:[],captured_at:new Date().toISOString(),attachments:[{name:'private.txt',size:3,mime_type:'text/plain',encoding:'base64',data:'YWJj',text_content:'abc'}]};
await cloud.save(record);assert.equal(written.content,'원문');assert.equal(written.attachments[0].data,undefined);assert.equal(written.attachments[0].encoding,undefined);assert.equal(written.attachments[0].github.repository,'owner/private');
assert.equal(JSON.parse(requests.find(r=>r.options.method==='PUT').options.body).content,'YWJj');
const restored=await cloud.hydrate(written);assert.equal(restored.attachments[0].data,'YWJj');assert.ok(requests.some(r=>r.url.endsWith('?ref=commit-sha')));
await assert.rejects(()=>cloud.hydrate({...written,attachments:[{...written.attachments[0],github:{repository:'evil/repo',path:'attachments/a/b'}}]}),/일치하지/);
await cloud.disconnect();assert.equal(cloud.active,false);await assert.rejects(()=>cloud.save(record),/로그인/);
assert.equal(await cloud.resume(),null);
// A new page context recovers Firebase state without a popup or a GitHub token.
authState.currentUser={uid:'owner',email:'owner@example.test'};
const freshContext={...ctx,window:{}};vm.createContext(freshContext);vm.runInContext(source,freshContext);
const restoredCloud=freshContext.window.CloudStore;const before=requests.length;
await restoredCloud.connect({apiKey:'key',projectId:'id',authDomain:'domain'},'owner/private');
assert.equal(await restoredCloud.resume(),'owner@example.test');assert.equal(popupCount,1);assert.equal(requests.length,before);assert.equal(appNames.at(-1),appNames[0]);
await restoredCloud.save({...record,attachments:[]});
await assert.rejects(()=>restoredCloud.hydrate(written={...record,attachments:[{...record.attachments[0],data:undefined,github:{repository:'owner/private',path:'attachments/a/b',sha:'commit'}}]}),/토큰/);
await restoredCloud.setGithubToken('token');await restoredCloud.disconnect();assert.equal(authState.currentUser,null);
console.log('PASS: data separation, attachment roundtrip, persistence, reload without popup or GitHub auth, explicit logout');
})().catch(error=>{console.error(error);process.exitCode=1;});
