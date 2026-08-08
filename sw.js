/* iPad offline pack for the teaching portal. */
importScripts('offline-files.js');

var VERSION = '20260809-cleanup-v6';
var CACHE_PREFIX = 'aac-teaching-';
var STATIC_CACHE = CACHE_PREFIX + 'static-' + VERSION;
var RUNTIME_CACHE = CACHE_PREFIX + 'runtime-' + VERSION;
var CORE_FILES = self.AAC_CORE_FILES || ['index.html'];
var OFFLINE_FILES = self.AAC_OFFLINE_FILES || CORE_FILES;
var externalImageHosts = {
  'commons.wikimedia.org': true,
  'upload.wikimedia.org': true,
  'api.qrserver.com': true
};
var warmingOfflinePack = null;

function requestFor(url) {
  return new Request(url, { cache: 'reload' });
}

function cacheOne(cache, url) {
  return fetch(requestFor(url)).then(function (response) {
    if (response && (response.ok || response.type === 'opaque')) {
      return cache.put(url, response.clone());
    }
  }).catch(function () {});
}

function cacheList(files, cacheName) {
  return caches.open(cacheName).then(function (cache) {
    return files.reduce(function (chain, file) {
      return chain.then(function () { return cacheOne(cache, file); });
    }, Promise.resolve());
  });
}

function cacheResponse(cacheName, request, response) {
  if (!response || (!response.ok && response.type !== 'opaque')) return response;
  var copy = response.clone();
  caches.open(cacheName).then(function (cache) {
    cache.put(request, copy).catch(function () {});
  });
  return response;
}

function offlineHtml() {
  return new Response(
    '<!doctype html><html lang="zh-Hant"><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>教學網離線中</title>' +
    '<body style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;padding:28px;line-height:1.7;color:#1f2937;background:#fff7ed">' +
    '<h1>目前沒有網路</h1>' +
    '<p>這台 iPad 還沒完成離線包。請先連上網路，打開教學網首頁一次，等待一會兒後再離線使用。</p>' +
    '</body></html>',
    { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

function cachedHtml(request) {
  return caches.match(request, { ignoreSearch: true }).then(function (hit) {
    return hit || caches.match('index.html');
  }).then(function (hit) {
    return hit || offlineHtml();
  });
}

function networkFirstHtml(request) {
  return fetch(request).then(function (response) {
    return cacheResponse(STATIC_CACHE, request, response);
  }).catch(function () {
    return cachedHtml(request);
  });
}

function cacheFirst(request) {
  return caches.match(request, { ignoreSearch: true }).then(function (hit) {
    if (hit) {
      fetch(request).then(function (response) {
        cacheResponse(RUNTIME_CACHE, request, response);
      }).catch(function () {});
      return hit;
    }
    return fetch(request).then(function (response) {
      return cacheResponse(RUNTIME_CACHE, request, response);
    });
  }).catch(function () {
    return new Response('', { status: 504, statusText: 'Offline' });
  });
}

function shouldCacheExternalImage(requestUrl, request) {
  return request.destination === 'image' && externalImageHosts[requestUrl.hostname];
}

self.addEventListener('install', function (event) {
  event.waitUntil(
    cacheList(CORE_FILES, STATIC_CACHE).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (key) {
        var isOldPortalCache = key.indexOf(CACHE_PREFIX) === 0 && key !== STATIC_CACHE && key !== RUNTIME_CACHE;
        var isOldReaderCache = key.indexOf('reader_shell_') === 0;
        if (isOldPortalCache || isOldReaderCache) return caches.delete(key);
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener('message', function (event) {
  if (!event.data || event.data.type !== 'CACHE_OFFLINE_PACK') return;
  if (!warmingOfflinePack) {
    warmingOfflinePack = cacheList(OFFLINE_FILES, STATIC_CACHE).then(function () {
      warmingOfflinePack = null;
    }).catch(function () {
      warmingOfflinePack = null;
    });
  }
  event.waitUntil(warmingOfflinePack);
});

self.addEventListener('fetch', function (event) {
  var request = event.request;
  if (request.method !== 'GET') return;

  var requestUrl = new URL(request.url);
  var accept = request.headers.get('accept') || '';
  var isHtml = request.mode === 'navigate' || accept.indexOf('text/html') >= 0;

  if (requestUrl.origin === location.origin) {
    event.respondWith(isHtml ? networkFirstHtml(request) : cacheFirst(request));
    return;
  }

  if (shouldCacheExternalImage(requestUrl, request)) {
    event.respondWith(cacheFirst(request));
  }
});
