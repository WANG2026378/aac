(()=>{
  'use strict';
  const STORAGE_KEY='buddhist-study-amitabha-v1';
  const $=id=>document.getElementById(id);
  const defaults={total:0,textScale:1,introSeen:false,voiceConsent:false};
  let state={...defaults};
  let cards=[];
  let currentCard=null;
  let installPrompt=null;
  let recognition=null;
  let voiceOn=false;
  let resumeAfterReward=false;
  let wakeLock=null;

  try{state={...defaults,...JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}')}}catch(_error){}
  state.total=Math.max(0,Math.floor(Number(state.total)||0));
  state.textScale=Math.min(1.35,Math.max(1,Number(state.textScale)||1));

  const unlocked=()=>Math.min(138,Math.floor(state.total/108));
  const roundCount=()=>state.total%108;
  const save=()=>localStorage.setItem(STORAGE_KEY,JSON.stringify(state));

  function setPage(name){
    document.querySelectorAll('.tab').forEach(button=>button.classList.toggle('active',button.dataset.page===name));
    document.querySelectorAll('.page').forEach(page=>page.classList.remove('active'));
    $(`${name}Page`).classList.add('active');
    scrollTo({top:0,behavior:'smooth'});
    if(name==='gallery')renderGallery();
  }

  function draw(){
    const current=roundCount();
    const found=unlocked();
    document.documentElement.style.setProperty('--scale',state.textScale);
    $('roundCount').textContent=current;
    $('totalCount').textContent=state.total.toLocaleString('zh-TW');
    $('unlockedCount').textContent=found;
    $('roundProgress').style.width=`${current/108*100}%`;
    $('collectionProgress').style.width=`${found/138*100}%`;
    $('counterTitle').textContent=`第 ${Math.floor(state.total/108)+1} 輪・本輪`;
    const remaining=current===0?108:108-current;
    $('encourage').textContent=found>=138
      ?'138 張圖文已全部收集，仍可繼續安心念佛。'
      :`再念 ${remaining} 遍，解鎖第 ${String(found+1).padStart(3,'0')} 張圖文。`;
    save();
  }

  function add(amount){
    if(amount<0&&roundCount()===0){
      alert('本輪目前是 0；已完成的 108 遍與圖文收藏不會被扣除。');
      return;
    }
    const before=unlocked();
    state.total=Math.max(0,state.total+amount);
    const after=unlocked();
    draw();
    if(amount>0&&after>before){
      if(navigator.vibrate)navigator.vibrate([100,70,180]);
      showReward(after);
    }
  }

  function renderGallery(){
    const count=unlocked();
    const fragment=document.createDocumentFragment();
    cards.forEach((card,index)=>{
      const available=index<count;
      const button=document.createElement('button');
      button.type='button';
      button.className=`gallery-card${available?'':' locked'}`;
      if(available){
        const image=document.createElement('img');
        image.loading='lazy';
        image.src=card.image;
        image.alt=`第 ${String(card.number).padStart(3,'0')} 張：${card.title}`;
        button.append(image);
        button.addEventListener('click',()=>showReward(card.number,false));
      }else{
        const lockedArt=document.createElement('span');
        lockedArt.className='locked-art';
        lockedArt.textContent='🔒';
        button.append(lockedArt);
        button.addEventListener('click',()=>alert(`再完成 ${(index+1-count)*108} 遍佛號，即可依序解鎖這張圖。`));
      }
      const strong=document.createElement('strong');
      strong.textContent=available?`${String(card.number).padStart(3,'0')}｜${card.title}`:`第 ${String(card.number).padStart(3,'0')} 張`;
      const small=document.createElement('small');
      small.textContent=available?(card.appendix?'卷末附錄圖文':'點開閱讀經文'):'尚未解鎖';
      button.append(strong,small);
      fragment.append(button);
    });
    $('gallery').replaceChildren(fragment);
  }

  function showReward(number,isNew=true){
    const card=cards[number-1];
    if(!card)return;
    currentCard=card;
    $('rewardNumber').textContent=`第 ${String(card.number).padStart(3,'0')} 張`;
    $('appendixBadge').hidden=!card.appendix;
    $('rewardImage').src=card.image;
    $('rewardImage').alt=card.title;
    $('rewardTitle').textContent=card.title;
    $('rewardScripture').textContent=card.scripture;
    $('rewardPlain').textContent=card.plain;
    $('rewardVisual').textContent=card.visual;
    document.querySelector('#rewardDialog .eyebrow').textContent=isNew?'108 遍圓滿・新圖解鎖':'已收藏的經文圖解';
    if(isNew&&voiceOn){resumeAfterReward=true;stopVoice(false)}
    $('rewardDialog').showModal();
  }

  async function requestWakeLock(){
    if(!$('wakeToggle').checked||!('wakeLock'in navigator)||document.visibilityState!=='visible')return;
    try{wakeLock=await navigator.wakeLock.request('screen');wakeLock.addEventListener('release',()=>{wakeLock=null})}catch(_error){}
  }

  async function releaseWakeLock(){
    try{await wakeLock?.release()}catch(_error){}
    wakeLock=null;
  }

  function voiceStatus(message){$('voiceStatus').textContent=message}
  function recognitionClass(){return window.SpeechRecognition||window.webkitSpeechRecognition}

  function startVoice(){
    const Recognition=recognitionClass();
    if(!Recognition){voiceStatus('此瀏覽器不支援語音辨識，請使用＋1手動計數。');return}
    if(voiceOn)return;
    recognition=new Recognition();
    recognition.lang='zh-TW';
    recognition.continuous=true;
    recognition.interimResults=true;
    recognition.maxAlternatives=1;
    recognition.onstart=()=>{
      voiceOn=true;
      $('voiceButton').classList.add('listening');
      $('voiceButton').textContent='⏹ 停止語音計數';
      voiceStatus('正在聽您念佛。請一聲一聲清楚持念。');
      requestWakeLock();
    };
    recognition.onresult=event=>{
      let interim='';
      for(let index=event.resultIndex;index<event.results.length;index+=1){
        const result=event.results[index];
        const transcript=result[0].transcript.replace(/[\s，。！？、,.!?]/g,'');
        if(result.isFinal){
          const matches=transcript.match(/南無阿彌陀佛|阿彌陀佛|彌陀佛/g)||[];
          if(matches.length){add(matches.length);voiceStatus(`已聽到 ${matches.length} 聲佛號；本輪 ${roundCount()}／108。`)}
        }else{interim+=transcript}
      }
      if(interim)voiceStatus(`正在辨識：${interim.slice(-18)}`);
    };
    recognition.onerror=event=>{
      if(event.error==='not-allowed'||event.error==='service-not-allowed')voiceStatus('麥克風未允許。請到手機設定開啟 Safari 麥克風，或使用＋1。');
      else if(event.error!=='aborted'&&event.error!=='no-speech')voiceStatus('語音辨識暫時中斷，請重新按開始，漏計可用＋1補正。');
    };
    recognition.onend=()=>{
      recognition=null;
      if(voiceOn&&document.visibilityState==='visible')setTimeout(()=>{if(voiceOn&&!recognition)startVoice()},350);
      else if(!voiceOn){$('voiceButton').classList.remove('listening');$('voiceButton').textContent='🎙️ 開始語音計數'}
    };
    try{recognition.start()}catch(_error){voiceOn=false;voiceStatus('無法開啟麥克風，請稍後再試。')}
  }

  function stopVoice(showMessage=true){
    voiceOn=false;
    try{recognition?.stop()}catch(_error){}
    recognition=null;
    $('voiceButton').classList.remove('listening');
    $('voiceButton').textContent='🎙️ 開始語音計數';
    if(showMessage)voiceStatus('已停止語音計數。');
    releaseWakeLock();
  }

  function askForVoice(){
    if(voiceOn){stopVoice();return}
    if(!state.voiceConsent){$('voiceDialog').showModal();return}
    startVoice();
  }

  async function shareCard(){
    if(!currentCard)return;
    const text=`《佛說阿彌陀經》\n${currentCard.scripture}\n\n${currentCard.plain}\n\n西方蓮語：${location.href}`;
    if(navigator.share){try{await navigator.share({title:currentCard.title,text,url:location.href});return}catch(_error){}}
    try{await navigator.clipboard.writeText(text);alert('圖文說明已複製，可以貼給親友。')}catch(_error){alert(text)}
  }

  function closeReward(){
    $('rewardDialog').close();
    if(resumeAfterReward){resumeAfterReward=false;startVoice()}
  }

  async function copyUrl(){
    try{await navigator.clipboard.writeText(location.href);$('copyUrl').textContent='已複製網址 ✓';setTimeout(()=>$('copyUrl').textContent='複製網站網址',1800)}
    catch(_error){prompt('請長按複製網址：',location.href)}
  }

  document.querySelectorAll('.tab').forEach(button=>button.addEventListener('click',()=>setPage(button.dataset.page)));
  $('plusButton').addEventListener('click',()=>add(1));
  $('minusButton').addEventListener('click',()=>add(-1));
  $('voiceButton').addEventListener('click',askForVoice);
  $('voiceAgree').addEventListener('click',()=>{state.voiceConsent=true;save();$('voiceDialog').close();startVoice()});
  $('voiceCancel').addEventListener('click',()=>$('voiceDialog').close());
  $('rewardClose').addEventListener('click',closeReward);
  $('shareReward').addEventListener('click',shareCard);
  $('copyUrl').addEventListener('click',copyUrl);
  $('textSize').addEventListener('click',()=>{state.textScale=state.textScale>=1.35?1:Number((state.textScale+.1).toFixed(2));draw();$('textSize').textContent=state.textScale===1?'大字 A＋':'恢復／再放大'});
  $('resetRound').addEventListener('click',()=>{const current=roundCount();if(!current)return alert('本輪目前是 0，不需要歸零。');if(confirm(`只將本輪 ${current} 遍歸零嗎？已解鎖的圖不受影響。`)){state.total-=current;draw()}});
  $('resetAll').addEventListener('click',()=>{if(confirm('這會清除全部念佛數與 138 張收藏進度。確定要繼續嗎？')&&confirm('再次確認：真的要全部重新開始嗎？')){state={...defaults,introSeen:true,voiceConsent:state.voiceConsent};save();draw();renderGallery()}});
  $('introClose').addEventListener('click',()=>{state.introSeen=true;save();$('introDialog').close()});
  $('introHelp').addEventListener('click',()=>{state.introSeen=true;save();$('introDialog').close();setPage('help')});
  $('wakeToggle').addEventListener('change',()=>{$('wakeToggle').checked?requestWakeLock():releaseWakeLock()});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&voiceOn)requestWakeLock();else releaseWakeLock()});
  window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;$('installStatus').textContent='這支手機可以直接安裝，請按上方按鈕。'});
  $('installButton').addEventListener('click',async()=>{if(installPrompt){installPrompt.prompt();await installPrompt.userChoice;installPrompt=null}else{$('installStatus').textContent='iPhone：請按 Safari 分享圖示，再選「加入主畫面」。Android：請開瀏覽器選單，選「安裝應用程式」。'}});

  async function boot(){
    try{
      const response=await fetch('amitabha-sutra-cards.json');
      if(!response.ok)throw new Error(`HTTP ${response.status}`);
      const data=await response.json();
      cards=data.cards;
      if(cards.length!==138)throw new Error('圖文資料不是 138 條');
      draw();
      $('siteUrl').textContent=location.href;
      if(!recognitionClass())voiceStatus('此瀏覽器不支援語音辨識，請使用＋1手動計數。');
      if(!state.introSeen)$('introDialog').showModal();
    }catch(error){
      console.error(error);
      voiceStatus('圖文資料載入失敗，請確認網路後重新整理。');
      $('plusButton').disabled=true;
    }
    if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(console.error);
  }
  boot();
})();
