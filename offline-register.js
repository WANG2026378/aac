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
