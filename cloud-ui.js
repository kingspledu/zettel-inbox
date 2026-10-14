let lockReady=false,lockBusy=false,pattern=[];
const config=window.INBOX_FIREBASE_CONFIG;
try{$('temporaryLogin').checked=sessionStorage.getItem('moeum-temporary')==='true';}catch{}
function lockMessage(text){$('lockStatus').textContent=text;}
function lockVisible(visible){$('lockScreen').hidden=!visible;document.querySelector('main').hidden=visible;document.querySelector('aside').hidden=visible;}
function clearPattern(){pattern=[];document.querySelectorAll('[data-dot]').forEach(b=>b.classList.remove('chosen'));$('patternProgress').textContent='';}
function unlockError(error){const code=error?.code||'';if(code==='auth/too-many-requests')return '시도가 많습니다. 잠시 후 다시 시도해주세요.';if(['auth/invalid-credential','auth/wrong-password','auth/invalid-login-credentials'].includes(code))return '번호 또는 패턴이 일치하지 않습니다.';if(code==='permission-denied')return '잠금 인증은 됐지만 보관함 접근에 실패했습니다. [permission-denied]';if(code==='auth/network-request-failed')return '네트워크 연결을 확인한 뒤 다시 시도해주세요.';return '연결 또는 화면 처리 오류입니다. 새로고침해주세요. ['+(code||error?.name||'unknown')+']';}
async function prepareLock(){lockReady=false;lockMessage('연결 준비 중…');try{await localReady;await CloudStore.connect(config,'kingspledu/zettel-inbox-attachments','',{temporary:$('temporaryLogin').checked});lockReady=true;let email=null;if(!$('temporaryLogin').checked)email=await CloudStore.resume();if(email)await finishUnlock();else lockMessage('번호 또는 패턴으로 열어주세요.');}catch(error){lockMessage(unlockError(error));}}
async function finishUnlock(){selected.clear();await refresh();$('pinInput').value='';clearPattern();lockVisible(false);document.querySelector('.storage').textContent='● 저장소 연결됨';if(typeof window.dispatchEvent==='function')setTimeout(()=>window.dispatchEvent(new Event('inbox-unlocked')),0);}
async function submitUnlock(mode,input){if(lockBusy)return;if(!lockReady){lockMessage('아직 연결 준비 중입니다. 잠시 후 다시 시도해주세요.');return;}lockBusy=true;lockMessage('확인 중…');try{await CloudStore.unlock(mode,input);await finishUnlock();}catch(error){lockMessage(unlockError(error));$('pinInput').value='';clearPattern();}finally{lockBusy=false;}}
$('pinForm').onsubmit=e=>{e.preventDefault();return submitUnlock('pin',$('pinInput').value);};
$('temporaryLogin').onchange=()=>{try{if($('temporaryLogin').checked)sessionStorage.setItem('moeum-temporary','true');else sessionStorage.removeItem('moeum-temporary');}catch{}if(!lockBusy)return prepareLock();};
$('showPin').onclick=()=>{$('pinForm').hidden=false;$('patternPanel').hidden=true;clearPattern();};
$('showPattern').onclick=()=>{$('pinForm').hidden=true;$('patternPanel').hidden=false;$('pinInput').value='';};
function addDot(button){const value=button.dataset.dot;if(!pattern.includes(value)){pattern.push(value);button.classList.add('chosen');$('patternProgress').textContent='●'.repeat(pattern.length);}}
let drawing=false,dragged=false,startPoint=null;
const grid=$('patternGrid');
grid.onpointerdown=e=>{if(lockBusy||!lockReady)return;const button=e.target.closest('[data-dot]');if(!button)return;e.preventDefault();drawing=true;dragged=false;startPoint={x:e.clientX,y:e.clientY};addDot(button);grid.setPointerCapture(e.pointerId);};
grid.onpointermove=e=>{if(!drawing)return;if(Math.hypot(e.clientX-startPoint.x,e.clientY-startPoint.y)>12)dragged=true;const button=document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-dot]');if(button&&grid.contains(button))addDot(button);};
grid.onpointerup=()=>{if(!drawing)return;drawing=false;if(dragged)submitUnlock('pattern',pattern.join(''));};
grid.onpointercancel=()=>{drawing=false;clearPattern();};
grid.onkeydown=e=>{const button=e.target.closest('[data-dot]');if(button&&(e.key==='Enter'||e.key===' ')){e.preventDefault();addDot(button);}};
$('patternConfirm').onclick=()=>submitUnlock('pattern',pattern.join(''));
$('patternClear').onclick=clearPattern;
$('lockNow').onclick=async()=>{if(busy||lockBusy)return;await CloudStore.disconnect();records=[];selected.clear();render();$('capture').reset();lockVisible(true);await prepareLock();};
lockVisible(true);prepareLock();
