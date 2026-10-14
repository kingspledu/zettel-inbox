const fs=require('node:fs');const vm=require('node:vm');const assert=require('node:assert/strict');
const elements=new Map();const el=id=>{if(!elements.has(id))elements.set(id,{value:'',style:{},files:[]});return elements.get(id);};
const ctx={document:{getElementById:el},indexedDB:{open:()=>({})},console,Blob,URL,atob,crypto:require('node:crypto').webcrypto,setTimeout,clearTimeout};vm.createContext(ctx);
vm.runInContext(fs.readFileSync('policy.js','utf8')+'\n'+fs.readFileSync('app.js','utf8'),ctx);
vm.runInContext(`
const sample={id:'test',title:'<script>alert(1)</script>',content:'원문\\n부정과 조건 보존',source:'책',tags:['독서'],captured_at:'2026-10-14T00:00:00Z',status:'unprocessed',attachments:[{name:'a.txt',mime_type:'text/plain',size:3,encoding:'base64',data:'YWJj',text_content:'abc'}]};
const exported=makeExport([sample]);
if(exported.execution_requested!==false)throw Error('실행 차단 실패');
if(JSON.stringify(validateImport(JSON.parse(JSON.stringify(exported))))!==JSON.stringify([sample]))throw Error('왕복 실패');
if(escapeHTML(sample.title).includes('<script>'))throw Error('HTML escape 실패');
`,ctx);
assert.throws(()=>vm.runInContext("validateImport({schema:'other',items:[]})",ctx));
assert.throws(()=>vm.runInContext("validateImport({...exported,items:[sample,sample]})",ctx));
assert.throws(()=>vm.runInContext("validateImport({...exported,items:[{...sample,attachments:[{...sample.attachments[0],size:99}]}]})",ctx));
const policy=require('./policy.js');assert.equal(policy.initial_state,'AWAITING_EXPLICIT_USER_COMMAND');assert.ok(policy.command_gate.length>=8);assert.ok(policy.atomic_split_algorithm.steps.length>=8);
console.log('PASS: JSON roundtrip, attachment integrity, duplicate/invalid rejection, HTML escaping, command gate');
