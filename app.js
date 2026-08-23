(() => {
  const KEY = 'mantra-counter-v2';
  const REPORT_URL = 'https://forms.gle/y3PFSTd6pXGs1bYH7';
  const $ = id => document.getElementById(id);
  const els = {count:$('count'), progress:$('progress'), bar:document.querySelector('[role=progressbar]'), status:$('status'), round:$('round-label'), voice:$('voice-button'), voiceStatus:$('voice-status'), complete:$('completion'), dedicationReminder:$('dedication-reminder'), person:$('person-name'), dedication:document.querySelectorAll('.dedication-name'), completionName:$('completion-name'), nameDialog:$('name-dialog'), nameInput:$('name-input'), reportBox:$('report-box'), reportCount:$('report-count'), report:$('report-link')};
  let state = {count:0, round:1, completedRounds:0, roundCounted:false, fontScale:1, name:''};
  try { state = {...state, ...JSON.parse(localStorage.getItem(KEY))}; } catch (_) {}
  state.count = Math.max(0, Math.min(108, Number(state.count) || 0));
  function save(){ localStorage.setItem(KEY, JSON.stringify(state)); }
  state.completedRounds = Math.max(0, Number(state.completedRounds) || 0);
  state.roundCounted = Boolean(state.roundCounted) || state.count === 108;
  state.fontScale = Math.max(.85, Math.min(1.65, Number(state.fontScale) || 1));
  function render(){ const c=state.count, name=state.name||'善信'; document.documentElement.style.setProperty('--reading-scale',state.fontScale); els.count.value=els.count.textContent=c; els.progress.style.width=(c/108*100)+'%'; els.bar.setAttribute('aria-valuenow',c); els.round.textContent=`第 ${state.round} 輪・累積圓滿 ${state.completedRounds} 圈`; els.person.textContent=els.completionName.textContent=name; els.dedication.forEach(el=>el.textContent=name); els.status.textContent=c===108?`本輪已圓滿，累積 ${state.completedRounds} 圈。`:c ? `已完成 ${c} 遍，繼續持誦。`:'慢慢持誦，心安自在。'; els.reportCount.textContent=`已計數完成 ${state.completedRounds} 圈`; save(); }
  function change(n, fromVoice=false){ const before=state.count; state.count=Math.max(0,Math.min(108,state.count+n)); const justCompleted=before<108 && state.count===108 && !state.roundCounted; if(justCompleted) state.completedRounds++; if(state.count===108) state.roundCounted=true; render(); if(justCompleted){ els.complete.hidden=false; if(navigator.vibrate) navigator.vibrate([100,80,160]); } if(fromVoice) els.voiceStatus.textContent=`已辨識一遍真言，現在是 ${state.count}／108。`; }
  $('plus').onclick=()=>change(1); $('minus').onclick=()=>change(-1); $('reset').onclick=()=>{if(confirm('要將本輪計數歸零嗎？')){state.count=0;render();}};
  $('font-smaller').onclick=()=>{state.fontScale=Math.max(.85,+(state.fontScale-.1).toFixed(2));render();};
  $('font-larger').onclick=()=>{state.fontScale=Math.min(1.65,+(state.fontScale+.1).toFixed(2));render();};
  $('next-round').onclick=()=>{if(state.count!==108){alert('請完成本輪 108 遍後，再開始下一輪。');return;}if(confirm('本輪已圓滿。要開始下一輪嗎？')){state.count=0;state.roundCounted=false;state.round++;render();}};
  $('close-completion').onclick=()=>els.complete.hidden=true;
  $('close-dedication').onclick=()=>els.dedicationReminder.hidden=true;
  function openNameDialog(){els.nameInput.value=state.name;els.nameDialog.hidden=false;setTimeout(()=>els.nameInput.focus(),0);}
  $('edit-name').onclick=openNameDialog;
  $('name-form').onsubmit=e=>{e.preventDefault();const name=els.nameInput.value.trim();if(!name)return;state.name=name;render();els.nameDialog.hidden=true;};
  if(REPORT_URL){els.report.href=REPORT_URL;els.reportBox.hidden=false;}
  render();
  if(!state.name) openNameDialog();
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if(!Recognition){els.voice.disabled=true;els.voice.textContent='此瀏覽器不支援語音辨識';els.voiceStatus.textContent='此裝置或瀏覽器未提供網頁語音辨識，請改用手動計數。';return;}
  let recognition, listening=false, lastCountAt=0, countedEndings=new Map();
  function begin(){recognition=new Recognition();countedEndings=new Map();recognition.lang='zh-TW';recognition.continuous=true;recognition.interimResults=true;recognition.maxAlternatives=1;
    recognition.onstart=()=>{listening=true;els.voice.textContent='⏹ 停止持誦';els.voice.classList.add('listening');els.voiceStatus.textContent='正在聆聽；請完整持誦一遍真言。';};
    recognition.onresult=e=>{for(let i=e.resultIndex;i<e.results.length;i++){const transcript=e.results[i][0].transcript;const text=transcript.replace(/[，。 、]/g,'');const endings=text.match(/隨.?心.{0,2}滿.?願|隨心|滿願|一遍圓滿|完成一遍/g)||[];const alreadyCounted=countedEndings.get(i)||0;const newEndings=Math.max(0,endings.length-alreadyCounted);if(newEndings && Date.now()-lastCountAt>700){countedEndings.set(i,endings.length);lastCountAt=Date.now();change(newEndings,true);els.voiceStatus.textContent=`已即時辨識到結尾，現在是 ${state.count}／108。`;}else if(e.results[i].isFinal && !endings.length)els.voiceStatus.textContent=`聽到：「${transcript}」；每遍結尾請清楚唸「隨心滿願藥師佛」。`;}};
    recognition.onerror=e=>{const messages={'not-allowed':'麥克風權限未允許。請在瀏覽器設定中允許麥克風後再試。','service-not-allowed':'語音服務未獲允許，請改用手動計數。','no-speech':'沒有聽到語音，請靠近麥克風再試。','network':'語音辨識服務暫時無法連線；手動計數仍可使用。'};els.voiceStatus.textContent=messages[e.error]||`語音辨識無法使用（${e.error}）。請改用手動計數。`;};
    recognition.onend=()=>{if(listening){try{recognition.start();}catch(_){}}else{els.voice.textContent='🎙️ 開始持誦';els.voice.classList.remove('listening');}}; recognition.start(); }
  function stop(){listening=false;recognition && recognition.stop();els.voiceStatus.textContent='已停止聆聽。請接著唸回向文。';if(state.count>0)els.dedicationReminder.hidden=false;}
  els.voice.onclick=()=>listening?stop():begin();
  if('serviceWorker' in navigator) window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
})();
