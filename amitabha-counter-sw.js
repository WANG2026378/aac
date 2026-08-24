const CACHE = 'amitabha-counter-v1';
const ASSETS = [
  './amitabha-counter.html',
  './amitabha-counter.webmanifest',
  './icons/amitabha-icon-192.png',
  './icons/amitabha-icon-512.png',
  './icons/amitabha-icon-1024.png'
];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
});
