$('toggleCloud').onclick=()=>{$('cloudSettings').hidden=!$('cloudSettings').hidden;};
try{const stored=JSON.parse(localStorage.getItem('moeum-cloud-config')||'null');if(stored){$('firebaseConfig').value=JSON.stringify(stored.firebase,null,2);$('githubRepo').value=stored.repository;}}catch{}
function showMode(email){
  $('connectionStatus').textContent=email?`클라우드 연결 · ${email}`:'브라우저 저장 모드';
  document.querySelector('.storage').textContent=email?'● Firebase + GitHub에 저장':'● 이 브라우저에 저장 · 동기화 없음';
  $('disconnectCloud').hidden=!email;$('migrateLocal').hidden=!email;$('connectCloud').disabled=!!email;
  $('loginCloud').disabled=!!email;$('firebaseConfig').disabled=!!email;$('githubRepo').disabled=!!email;
}
$('connectCloud').onclick=async()=>{if(busy)return;busy=true;$('connectCloud').disabled=true;try{const config=JSON.parse($('firebaseConfig').value);await CloudStore.connect(config,$('githubRepo').value.trim(),$('githubToken').value);$('githubToken').value='';try{localStorage.setItem('moeum-cloud-config',JSON.stringify({firebase:config,repository:$('githubRepo').value.trim()}));}catch{}$('loginCloud').disabled=false;notify('설정을 확인했습니다. Google 로그인을 눌러주세요.');}catch(error){notify(error.message);}finally{busy=false;$('connectCloud').disabled=false;}};
$('loginCloud').onclick=async()=>{if(busy)return;busy=true;try{const email=await CloudStore.login();selected.clear();await refresh();showMode(email);notify('클라우드에 연결했습니다. 기존 브라우저 자료는 별도로 옮길 수 있습니다.');}catch(error){await CloudStore.disconnect().catch(()=>{});await refresh().catch(()=>{});showMode(null);notify('로그인/DB 연결 실패: '+error.message);}finally{busy=false;}};
$('disconnectCloud').onclick=async()=>{if(busy)return;busy=true;try{await CloudStore.disconnect();selected.clear();await refresh();showMode(null);$('loginCloud').disabled=true;notify('연결을 해제했습니다. 브라우저 자료를 표시합니다.');}catch(error){notify(error.message);}finally{busy=false;}};
$('migrateLocal').onclick=async()=>{if(busy||!CloudStore.active)return;if(!confirm('이 브라우저의 모든 자료를 Firebase와 비공개 GitHub 저장소에 복사할까요? 로컬 원본은 유지합니다.'))return;busy=true;let copied=0,skipped=0;try{for(const r of await localRecords()){if(await CloudStore.save(r))copied++;else skipped++;}await refresh();notify(`${copied}개 복사, 중복 ${skipped}개 건너뜀. 로컬 원본은 유지했습니다.`);}catch(error){await refresh().catch(()=>{});notify(`${copied}개 복사 후 중단: ${error.message}`);}finally{busy=false;}};
