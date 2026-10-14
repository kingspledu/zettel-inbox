const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
(async()=>{
let written,requests=[],privateRepo=true;
const mockApp={initializeApp:()=>({})};
const mockAuth={getAuth:()=>({}),setPersistence:async()=>{},inMemoryPersistence:{},GoogleAuthProvider:class{},signInWithPopup:async()=>({user:{uid:'owner',email:'owner@example.test'}}),signOut:async()=>{}};
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
const record={id:'id',title:'title',content:'원문',source:'book',tags:[],captured_at:new Date().toISOString(),attachments:[{name:'private.txt',size:3,mime_type:'text/plain',encoding:'base64',data:'YWJj',text_content:'abc'}]};
await cloud.save(record);assert.equal(written.content,'원문');assert.equal(written.attachments[0].data,undefined);assert.equal(written.attachments[0].encoding,undefined);assert.equal(written.attachments[0].github.repository,'owner/private');
assert.equal(JSON.parse(requests.find(r=>r.options.method==='PUT').options.body).content,'YWJj');
const restored=await cloud.hydrate(written);assert.equal(restored.attachments[0].data,'YWJj');assert.ok(requests.some(r=>r.url.endsWith('?ref=commit-sha')));
await assert.rejects(()=>cloud.hydrate({...written,attachments:[{...written.attachments[0],github:{repository:'evil/repo',path:'attachments/a/b'}}]}),/일치하지/);
await cloud.disconnect();assert.equal(cloud.active,false);await assert.rejects(()=>cloud.save(record),/로그인/);
console.log('PASS: private repository, Firebase/GitHub separation, attachment roundtrip, pinned commit, foreign reference denial, disconnect');
})().catch(error=>{console.error(error);process.exitCode=1;});
