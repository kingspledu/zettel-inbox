let preparedShare=null,checkingShare=false;
const shareDialog=$('shareDialog');
function resetShare(){preparedShare=null;$('shareFrame').srcdoc='';$('sharePrompt').value='';$('shareLink').textContent='';$('shareLink').removeAttribute('href');$('publishShare').disabled=true;$('checkShare').hidden=true;$('shareConsent').checked=false;$('shareResult').textContent='';}
$('openShare').onclick=()=>{if(busy)return;if(!records.some(r=>selected.has(r.id)))return notify('공개할 자료를 먼저 선택하세요.');resetShare();$('shareTextAttachments').checked=false;shareDialog.showModal();};
$('closeShare').onclick=()=>shareDialog.close();
shareDialog.addEventListener('close',()=>{$('shareToken').value='';});
$('shareTextAttachments').onchange=resetShare;
$('previewShare').onclick=()=>{if(busy)return;try{resetShare();preparedShare=ReadingShare.snapshot(records.filter(r=>selected.has(r.id)),$('shareTextAttachments').checked);$('shareFrame').srcdoc=ReadingShare.render(preparedShare);$('sharePrompt').value=ReadingShare.prompt(preparedShare);$('shareResult').textContent=`자료 ${preparedShare.items.length}개 미리보기. 아직 공개되지 않았습니다.`;}catch(error){notify(error.message);}};
$('shareConsent').onchange=()=>{$('publishShare').disabled=!preparedShare||!$('shareConsent').checked;};
$('publishShare').onclick=async()=>{
  if(busy||!preparedShare||!$('shareConsent').checked)return;busy=true;const snapshot=preparedShare;
  $('publishShare').disabled=true;$('previewShare').disabled=true;$('shareTextAttachments').disabled=true;
  try{const result=await ReadingShare.publish(snapshot,$('shareToken').value);$('shareToken').value='';$('shareLink').href=result.url;$('shareLink').textContent=result.url;$('shareResult').textContent='게시 요청을 저장했습니다. GitHub Pages 배포가 끝나면 링크가 열립니다. 아래 게시 확인을 눌러주세요.';$('checkShare').hidden=false;}
  catch(error){$('shareResult').textContent=error.message;$('publishShare').disabled=false;}
  finally{busy=false;$('previewShare').disabled=false;$('shareTextAttachments').disabled=false;}
};
$('checkShare').onclick=async()=>{if(!preparedShare||checkingShare)return;checkingShare=true;try{$('shareResult').textContent=await ReadingShare.ready(preparedShare)?'게시된 페이지를 확인했습니다. 요청문을 복사해 Gemini 채팅에 붙여 넣으세요.':'아직 게시를 확인하지 못했습니다. 잠시 후 다시 확인하거나 GitHub Actions 상태를 확인해주세요.';}finally{checkingShare=false;}};
$('copySharePrompt').onclick=async()=>{if(!preparedShare)return notify('먼저 미리보기를 만드세요.');try{await navigator.clipboard.writeText($('sharePrompt').value);notify('Gemini에 전달할 요청문을 복사했습니다.');}catch{notify('자동 복사하지 못했습니다. 요청문을 직접 선택해 복사하세요.');}};
