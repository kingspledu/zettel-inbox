let lockReady=false,lockBusy=false,pattern=[];
const config=window.INBOX_FIREBASE_CONFIG;
try{$('temporaryLogin').checked=sessionStorage.getItem('moeum-temporary')==='true';}catch{}
function lockMessage(text){$('lockStatus').textContent=text;}
function lockVisible(visible){$('lockScreen').hidden=!visible;document.querySelector('main').hidden=visible;document.querySelector('aside').hidden=visible;}
function clearPattern(){pattern=[];document.querySelectorAll('[data-dot]').forEach(b=>b.classList.remove('chosen'));$('patternProgress').textContent='';}
async function prepareLock(){lockReady=false;lockMessage('연결 준비 중…');try{await localReady;await CloudStore.connect(config,'kingspledu/zettel-inbox-attachments','',{temporary:$('temporaryLogin').checked});lockReady=true;let email=null;if(!$('temporaryLogin').checked)email=await CloudStore.resume();if(email)await finishUnlock();else lockMessage('번호 또는 패턴으로 열어주세요.');}catch{lockMessage('연결하지 못했습니다. 새로고침 후 다시 시도해주세요.');}}
async function finishUnlock(){selected.clear();await refresh();$('pinInput').value='';clearPattern();lockVisible(false);document.querySelector('.storage').textContent='● 저장소 연결됨';}
async function submitUnlock(mode,input){if(lockBusy||!lockReady)return;lockBusy=true;lockMessage('확인 중…');try{await CloudStore.unlock(mode,input);await finishUnlock();}catch(error){lockMessage(error.code==='auth/too-many-requests'?'시도가 많습니다. 잠시 후 다시 시도해주세요.':'잠금을 해제하지 못했습니다. 입력과 연결 상태를 확인해주세요.');$('pinInput').value='';clearPattern();}finally{lockBusy=false;}}
$('pinForm').onsubmit=e=>{e.preventDefault();return submitUnlock('pin',$('pinInput').value);};
$('temporaryLogin').onchange=()=>{try{if($('temporaryLogin').checked)sessionStorage.setItem('moeum-temporary','true');else sessionStorage.removeItem('moeum-temporary');}catch{}if(!lockBusy)return prepareLock();};
$('showPin').onclick=()=>{$('pinForm').hidden=false;$('patternPanel').hidden=true;clearPattern();};
$('showPattern').onclick=()=>{$('pinForm').hidden=true;$('patternPanel').hidden=false;$('pinInput').value='';};
function addDot(button){const value=button.dataset.dot;if(!pattern.includes(value)){pattern.push(value);button.classList.add('chosen');$('patternProgress').textContent='●'.repeat(pattern.length);}}
let drawing=false,dragged=false,startPoint=null;
const grid=$('patternGrid');
grid.onpointerdown=e=>{if(lockBusy||!lockReady)return;const button=e.target.closest('[data-dot]');if(!button)return;e.preventDefault();clearPattern();drawing=true;dragged=false;startPoint={x:e.clientX,y:e.clientY};addDot(button);grid.setPointerCapture(e.pointerId);};
grid.onpointermove=e=>{if(!drawing)return;if(Math.hypot(e.clientX-startPoint.x,e.clientY-startPoint.y)>12)dragged=true;const button=document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-dot]');if(button&&grid.contains(button))addDot(button);};
grid.onpointerup=()=>{if(!drawing)return;drawing=false;if(dragged)submitUnlock('pattern',pattern.join(''));};
grid.onpointercancel=()=>{drawing=false;clearPattern();};
grid.onkeydown=e=>{const button=e.target.closest('[data-dot]');if(button&&(e.key==='Enter'||e.key===' ')){e.preventDefault();addDot(button);}};
$('patternConfirm').onclick=()=>submitUnlock('pattern',pattern.join(''));
$('patternClear').onclick=clearPattern;
$('lockNow').onclick=async()=>{if(busy||lockBusy)return;await CloudStore.disconnect();records=[];selected.clear();render();$('capture').reset();lockVisible(true);await prepareLock();};
lockVisible(true);prepareLock();
