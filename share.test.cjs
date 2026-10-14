const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
(async()=>{
const requests=[];let publicRepo=true;
const ctx={LLM_POLICY:require('./policy.js'),crypto:require('node:crypto').webcrypto,TextEncoder,btoa,fetch:async(url,options)=>{requests.push({url,options});return{ok:true,json:async()=>url.endsWith('/zettel-inbox')?{private:!publicRepo,full_name:'kingspledu/zettel-inbox'}:{commit:{sha:'commit'}},text:async()=>''};}};vm.createContext(ctx);vm.runInContext(fs.readFileSync('share.js','utf8')+';this.share=ReadingShare;',ctx);const share=ctx.share;
const item={id:'source-id',title:'제목 <script>alert(1)</script>',content:'조건과 부정 유지\n</pre><img src=x onerror=alert(1)>',source:'출처',tags:['태그'],attachments:[{name:'secret.txt',text_content:'첨부 개인 텍스트',data:'SECRET_BASE64',github:{repository:'private/repo'}},{name:'photo.jpg',data:'PRIVATE_IMAGE'}]};
const before=JSON.stringify(item),data=share.snapshot([item]);const html=share.render(data);
assert.equal(JSON.stringify(item),before);assert.equal(data.items[0].attachment_texts.length,0);assert.ok(!html.includes('secret.txt'));assert.ok(!html.includes('PRIVATE_IMAGE'));assert.ok(!html.includes('private/repo'));assert.ok(!html.includes('<script>'));assert.ok(!html.includes('<img'));assert.ok(html.includes('&lt;/pre&gt;'));assert.ok(html.includes('MOEUM_END_'+data.id));assert.ok(html.includes('source-id'));
assert.equal(share.snapshot([item],true).items[0].attachment_texts[0].content,'첨부 개인 텍스트');assert.throws(()=>share.snapshot([]));
await assert.rejects(()=>share.publish(data,''),/토큰/);assert.equal(requests.length,0);
publicRepo=false;await assert.rejects(()=>share.publish(data,'token'),/일치하지/);publicRepo=true;
const result=await share.publish(data,'token');assert.equal(result.url,share.url(data.id));const request=requests.at(-1),body=JSON.parse(request.options.body);assert.equal(request.options.method,'PUT');assert.equal(body.sha,undefined);assert.equal(body.branch,'main');assert.ok(request.url.includes('/shares/'+data.id+'/index.html'));assert.equal(Buffer.from(body.content,'base64').toString('utf8'),html);assert.ok(!html.includes('token'));
assert.ok(share.prompt(data).includes('읽었다고 추측하지'));
console.log('PASS: selected snapshot, attachment opt-in, HTML escaping, no source mutation, public target validation, no overwrite, UTF-8 publication, reading verification prompt');
})().catch(error=>{console.error(error);process.exitCode=1;});
