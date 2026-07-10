/* 離線外殼快取：連網時 HTML 優先拿新版，斷網才使用快取 */
var CACHE = 'reader_shell_v3';
var APP_FILES = ['reader.html', 'reader-icon.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      return Promise.all(APP_FILES.map(function (file) {
        return fetch(file).then(function (res) {
          if (res && res.ok) return c.put(file, res);
        })['catch'](function () {
          /* 某個預快取檔暫時抓不到時，不讓新版 service worker 安裝失敗 */
        });
      }));
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

function offlineHtml() {
  return new Response(
    '<!doctype html><html lang="zh-Hant"><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>小說閱讀</title>' +
    '<body style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;padding:32px;line-height:1.7;color:#222;background:#f7f4ec">' +
    '<h1>小說閱讀暫時無法開啟</h1>' +
    '<p>目前沒有網路，而且這台 iPad 還沒有存到完整離線頁面。</p>' +
    '<p>請先連上網路打開一次閱讀器，之後就能離線使用。</p>' +
    '</body></html>',
    { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

function cachedHtmlOrFallback(req) {
  return caches.match(req).then(function (hit) {
    if (hit) return hit;
    return caches.match('reader.html');
  }).then(function (hit) {
    return hit || offlineHtml();
  })['catch'](function () {
    return offlineHtml();
  });
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
        if (res && res.ok) {
          var copy1 = res.clone();
          var copy2 = res.clone();
          caches.open(CACHE).then(function (c) {
            c.put(req, copy1);
            c.put('reader.html', copy2);
          });
          return res;
        }
        return cachedHtmlOrFallback(req);
      })['catch'](function () {
        return cachedHtmlOrFallback(req);
      })
    );
    return;
  }

  /* 其他檔案維持快取優先、背景更新 */
  e.respondWith(
    caches.match(req).then(function (hit) {
      var net = fetch(req).then(function (res) {
        return saveToCache(req, res);
      })['catch'](function () {
        return hit || new Response('', { status: 504, statusText: 'Offline' });
      });
      return hit || net;
    })['catch'](function () {
      return new Response('', { status: 504, statusText: 'Offline' });
    })
  );
});
