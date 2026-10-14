$('toggleCloud').onclick=()=>{$('cloudSettings').hidden=!$('cloudSettings').hidden;};
let rememberedCloud=null;
try{rememberedCloud=JSON.parse(localStorage.getItem('moeum-cloud-config')||'null');if(rememberedCloud){$('firebaseConfig').value=JSON.stringify(rememberedCloud.firebase,null,2);$('githubRepo').value=rememberedCloud.repository;}}catch{}
function showMode(email){
  $('connectionStatus').textContent=email?`클라우드 연결 · ${email}`:'브라우저 저장 모드';
  document.querySelector('.storage').textContent=email?'● Firebase 자동 연결 · 첨부는 GitHub':'● 이 브라우저에 저장 · 동기화 없음';
  $('disconnectCloud').hidden=!email;$('migrateLocal').hidden=!email;$('connectCloud').disabled=!!email;
  $('loginCloud').disabled=!!email;$('firebaseConfig').disabled=!!email;$('githubRepo').disabled=!!email;
}
async function connected(email){selected.clear();await refresh();showMode(email);localStorage.setItem('moeum-cloud-autoconnect','true');}
$('connectCloud').onclick=async()=>{if(busy)return;busy=true;$('connectCloud').disabled=true;$('loginCloud').disabled=true;try{const config=JSON.parse($('firebaseConfig').value);await CloudStore.connect(config,$('githubRepo').value.trim(),$('githubToken').value);$('githubToken').value='';localStorage.setItem('moeum-cloud-config',JSON.stringify({firebase:config,repository:$('githubRepo').value.trim()}));const email=await CloudStore.resume();if(email){await connected(email);notify('기존 로그인으로 연결했습니다.');}else{$('loginCloud').disabled=false;notify('Google 로그인은 최초 한 번만 필요합니다.');}}catch(error){notify(error.message);}finally{busy=false;$('connectCloud').disabled=CloudStore.active;}};
$('loginCloud').onclick=async()=>{if(busy)return;busy=true;try{await connected(await CloudStore.login());notify('로그인을 유지합니다. 다음 방문부터 자동 연결됩니다.');}catch(error){showMode(null);$('loginCloud').disabled=false;notify('로그인/DB 연결 실패: '+error.message);}finally{busy=false;}};
$('disconnectCloud').onclick=async()=>{if(busy)return;busy=true;try{localStorage.setItem('moeum-cloud-autoconnect','false');await CloudStore.disconnect();selected.clear();await refresh();showMode(null);$('loginCloud').disabled=true;notify('로그아웃했습니다. 자동 연결도 중지했습니다.');}catch(error){notify(error.message);}finally{busy=false;}};
$('githubToken').onchange=async()=>{if(!CloudStore.active||busy||!$('githubToken').value)return;busy=true;try{await CloudStore.setGithubToken($('githubToken').value);$('githubToken').value='';notify('첨부파일 저장소에 연결했습니다.');}catch(error){notify(error.message);}finally{busy=false;}};
$('migrateLocal').onclick=async()=>{if(busy||!CloudStore.active)return;if(!confirm('이 브라우저의 모든 자료를 Firebase와 비공개 GitHub 저장소에 복사할까요? 로컬 원본은 유지합니다.'))return;busy=true;let copied=0,skipped=0;try{for(const r of await localRecords()){if(await CloudStore.save(r))copied++;else skipped++;}await refresh();notify(`${copied}개 복사, 중복 ${skipped}개 건너뜀. 로컬 원본은 유지했습니다.`);}catch(error){await refresh().catch(()=>{});notify(`${copied}개 복사 후 중단: ${error.message}`);}finally{busy=false;}};
(async()=>{
  if(!rememberedCloud)return;
  try{if(localStorage.getItem('moeum-cloud-autoconnect')==='false')return;}catch{return;}
  busy=true;$('connectionStatus').textContent='기존 로그인으로 자동 연결 중…';
  try{await localReady;await CloudStore.connect(rememberedCloud.firebase,rememberedCloud.repository);const email=await CloudStore.resume();if(email)await connected(email);else{showMode(null);$('loginCloud').disabled=false;notify('로그인 세션이 없습니다. Google 로그인을 한 번 해주세요.');}}
  catch(error){showMode(null);$('loginCloud').disabled=false;notify('자동 연결을 완료하지 못했습니다: '+error.message);}
  finally{busy=false;}
})();
