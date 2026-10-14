$('toggleCloud').onclick=()=>{$('cloudSettings').hidden=!$('cloudSettings').hidden;};
const bundledFirebase=typeof window!=='undefined'?window.INBOX_FIREBASE_CONFIG:null;
let rememberedCloud=bundledFirebase?{firebase:bundledFirebase,repository:'kingspledu/zettel-inbox-attachments'}:null;
let temporaryTab=false;
try{temporaryTab=sessionStorage.getItem('moeum-temporary')==='true';}catch{}
$('temporaryLogin').checked=temporaryTab;
try{const saved=JSON.parse(localStorage.getItem('moeum-cloud-config')||'null');if(saved&&(!bundledFirebase||saved.firebase?.projectId===bundledFirebase.projectId))rememberedCloud=saved;}catch{}
if(rememberedCloud){$('firebaseConfig').value=JSON.stringify(rememberedCloud.firebase,null,2);$('githubRepo').value=rememberedCloud.repository;}
function showMode(email){
  $('connectionStatus').textContent=email?`${CloudStore.temporary?'임시 로그인':'로그인 유지'} · ${email}`:'Firebase 연결 필요';
  document.querySelector('.storage').textContent=email?(CloudStore.temporary?'● 임시 로그인 · 새로고침하면 종료':'● Firebase 자동 연결 · 첨부는 GitHub'):'● Firebase 연결 대기 · 자료 저장 중지';
  if(!email)$('cloudSettings').hidden=false;
  $('disconnectCloud').hidden=!email;$('migrateLocal').hidden=true;$('connectCloud').disabled=!!email;
  $('temporaryLogin').disabled=!!email;
  $('loginCloud').disabled=!!email;$('firebaseConfig').disabled=!!email;$('githubRepo').disabled=!!email;
}
async function connected(email){selected.clear();await refresh();showMode(email);if(!CloudStore.temporary)localStorage.setItem('moeum-cloud-autoconnect','true');}
$('temporaryLogin').onchange=()=>{$('loginCloud').disabled=true;if(!CloudStore.active&&!busy&&$('firebaseConfig').value)$('connectCloud').onclick();};
$('connectCloud').onclick=async()=>{if(busy)return;busy=true;$('connectCloud').disabled=true;$('loginCloud').disabled=true;try{const config=JSON.parse($('firebaseConfig').value),temporary=$('temporaryLogin').checked;await CloudStore.connect(config,$('githubRepo').value.trim(),$('githubToken').value,{temporary});$('githubToken').value='';try{if(temporary)sessionStorage.setItem('moeum-temporary','true');else sessionStorage.removeItem('moeum-temporary');}catch{}if(!temporary)localStorage.setItem('moeum-cloud-config',JSON.stringify({firebase:config,repository:$('githubRepo').value.trim()}));const email=await CloudStore.resume();if(email){await connected(email);notify('기존 로그인으로 연결했습니다.');}else{$('loginCloud').disabled=false;notify(temporary?'임시 로그인: 새로고침하거나 탭을 닫으면 종료됩니다.':'Google 로그인은 최초 한 번만 필요합니다.');}}catch(error){notify(error.message);}finally{busy=false;$('connectCloud').disabled=CloudStore.active;}};
$('loginCloud').onclick=async()=>{if(busy)return;busy=true;try{await connected(await CloudStore.login());notify(CloudStore.temporary?'임시 로그인했습니다. 로그인 정보와 입력한 설정은 기기에 저장하지 않습니다.':'로그인을 유지합니다. 다음 방문부터 자동 연결됩니다.');}catch(error){showMode(null);$('loginCloud').disabled=false;notify('로그인/DB 연결 실패: '+error.message);}finally{busy=false;}};
$('disconnectCloud').onclick=async()=>{if(busy)return;busy=true;try{if(!CloudStore.temporary)localStorage.setItem('moeum-cloud-autoconnect','false');const wasTemporary=CloudStore.temporary;await CloudStore.disconnect();$('githubToken').value='';if(wasTemporary){$('firebaseConfig').value='';$('capture').reset();$('fileNames').textContent='';}selected.clear();await refresh();showMode(null);$('loginCloud').disabled=true;notify('로그아웃했습니다.');}catch(error){notify(error.message);}finally{busy=false;}};
$('githubToken').onchange=async()=>{if(!CloudStore.active||busy||!$('githubToken').value)return;busy=true;try{await CloudStore.setGithubToken($('githubToken').value);$('githubToken').value='';notify('첨부파일 저장소에 연결했습니다.');}catch(error){notify(error.message);}finally{busy=false;}};
$('migrateLocal').onclick=async()=>{if(busy||!CloudStore.active)return;if(!confirm('이 브라우저의 모든 자료를 Firebase와 비공개 GitHub 저장소에 복사할까요? 로컬 원본은 유지합니다.'))return;busy=true;let copied=0,skipped=0;try{for(const r of await localRecords()){if(await CloudStore.save(r))copied++;else skipped++;}await refresh();notify(`${copied}개 복사, 중복 ${skipped}개 건너뜀. 로컬 원본은 유지했습니다.`);}catch(error){await refresh().catch(()=>{});notify(`${copied}개 복사 후 중단: ${error.message}`);}finally{busy=false;}};
(async()=>{
  if(!rememberedCloud){showMode(null);return;}
  let autoResume=!temporaryTab;
  try{if(localStorage.getItem('moeum-cloud-autoconnect')==='false')autoResume=false;}catch{autoResume=false;}
  busy=true;$('connectionStatus').textContent='기존 로그인으로 자동 연결 중…';
  try{await localReady;await CloudStore.connect(rememberedCloud.firebase,rememberedCloud.repository,'',{temporary:temporaryTab});const email=autoResume?await CloudStore.resume():null;if(email)await connected(email);else{showMode(null);$('loginCloud').disabled=false;notify('Firebase 연결을 준비했습니다. Google 로그인을 눌러주세요.');}}
  catch(error){showMode(null);$('loginCloud').disabled=false;notify('자동 연결을 완료하지 못했습니다: '+error.message);}
  finally{busy=false;}
})();
