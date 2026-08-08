/* ==========================================================
   ★★★ 部署後把下面這行的網址換成你的 Google Apps Script 網址 ★★★
   （只要改這一個地方，全站的流量記錄、留言板、流量表都會生效）
   範例：https://script.google.com/macros/s/AKfycb.....xyz/exec
   留空字串的話，流量不會被記錄，網站其他功能一切照常。
   ========================================================== */
window.AAC_API_URL = 'https://script.google.com/macros/s/AKfycby_kqk1LBUOK2QQLjkA3u21FPWw5wh3JQIOlDCYtSUM-ppwVLJQHmPYMkZcHvHebifi/exec';

/* ---------- 流量記錄（失敗一律靜默，絕不影響教學工具） ---------- */
(function () {
  try {
    if (!window.AAC_API_URL) return;

    // 訪客代號：隨機字串，只存在這台裝置，不含任何個人資料
    var vid = '';
    try {
      vid = localStorage.getItem('aac_vid_v1') || '';
      if (!vid) {
        vid = 'v' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
        localStorage.setItem('aac_vid_v1', vid);
      }
    } catch (e) { vid = 'anon'; }

    // 同一頁 30 分鐘內只記一次，避免重複整理灌水
    var page = (location.pathname.split('/').pop() || 'index.html');
    if (page.indexOf('.') < 0) page = 'index.html';
    try {
      var mark = 'aac_hit_' + page;
      var prev = Number(sessionStorage.getItem(mark) || 0);
      if (prev && Date.now() - prev < 1800000) return;
      sessionStorage.setItem(mark, String(Date.now()));
    } catch (e) {}

    var ua = navigator.userAgent;
    var dev = 'Desktop';
    if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) dev = 'iPad';
    else if (/iPhone|iPod/.test(ua)) dev = 'iPhone';
    else if (/Android/.test(ua)) dev = 'Android';
    else if (/Macintosh/.test(ua)) dev = 'Mac';
    else if (/Windows/.test(ua)) dev = 'Windows';

    var url = window.AAC_API_URL
      + '?act=hit'
      + '&p=' + encodeURIComponent(page)
      + '&vid=' + encodeURIComponent(vid)
      + '&ref=' + encodeURIComponent(document.referrer || '')
      + '&dev=' + encodeURIComponent(dev)
      + '&t=' + Date.now();

    // 用圖片請求送出：不需要 CORS、不需要讀回應、任何瀏覽器都支援
    var img = new Image();
    img.onerror = function () {};
    img.onload = function () {};
    img.src = url;
  } catch (e) {}
})();

/* ---------- 原有的離線包註冊 ---------- */
(function () {
  if (!('serviceWorker' in navigator)) return;

  function requestPersistentStorage() {
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persist().catch(function () {});
    }
  }

  function askWorkerToCache(registration) {
    var worker = registration.active || navigator.serviceWorker.controller;
    if (!worker) return;
    worker.postMessage({ type: 'CACHE_OFFLINE_PACK' });
  }

  function registerOfflinePack() {
    navigator.serviceWorker.register('sw.js', { scope: './' }).then(function () {
      requestPersistentStorage();
      return navigator.serviceWorker.ready;
    }).then(function (registration) {
      askWorkerToCache(registration);
      try {
        localStorage.setItem('aacOfflinePackRequested', String(Date.now()));
      } catch (e) {}
    }).catch(function () {});
  }

  if (document.readyState === 'complete') {
    registerOfflinePack();
  } else {
    window.addEventListener('load', registerOfflinePack);
  }
})();
