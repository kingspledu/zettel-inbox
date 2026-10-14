const UnlockKey={
  async derive(mode,input){
    if(!['pin','pattern'].includes(mode))throw Error('잠금 방식이 올바르지 않습니다.');
    if(mode==='pin'&&!/^\d{4}$/.test(input))throw Error('4자리 번호를 입력해주세요.');
    if(mode==='pattern'&&(!/^[1-9]{4,9}$/.test(input)||new Set(input).size!==input.length))throw Error('서로 다른 점을 4개 이상 연결해주세요.');
    const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(input),'PBKDF2',false,['deriveBits']);
    const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt:new TextEncoder().encode('moeum-inbox-kingspledu-2026:'+mode),iterations:210000,hash:'SHA-256'},material,256);
    return Array.from(new Uint8Array(bits),x=>x.toString(16).padStart(2,'0')).join('');
  }
};
if(typeof module!=='undefined')module.exports=UnlockKey;
