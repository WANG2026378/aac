/* 離線外殼快取：連網時 HTML 優先拿新版，斷網才使用快取 */
var CACHE = 'reader_shell_v2';
var APP_FILES = ['reader.html', 'reader-icon.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      return c.addAll(APP_FILES);
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (key) {
        if (key !== CACHE && key.indexOf('reader_shell_') === 0) {
          return caches['delete'](key);
        }
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

function saveToCache(req, res) {
  if (res && res.ok) {
    var copy = res.clone();
    caches.open(CACHE).then(function (c) { c.put(req, copy); });
  }
  return res;
}

/* HTML 用網路優先：iPad 連網打開會立刻看到新版；斷網再退回快取 */
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var accept = req.headers.get('accept') || '';
  var isHtml = req.mode === 'navigate' || accept.indexOf('text/html') >= 0;
  if (isHtml) {
    e.respondWith(
      fetch(req).then(function (res) {
        return saveToCache(req, res);
      })['catch'](function () {
        return caches.match(req).then(function (hit) {
          return hit || caches.match('reader.html');
        });
      })
    );
    return;
  }

  /* 其他檔案維持快取優先、背景更新 */
  e.respondWith(
    caches.match(req).then(function (hit) {
      var net = fetch(req).then(function (res) {
        return saveToCache(req, res);
      })['catch'](function () { return hit; });
      return hit || net;
    })
  );
});
