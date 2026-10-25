/* TOOLS BC1+BC2+SBD — service worker: mở được khi mất mạng, tự lấy bản mới khi có mạng */
const CACHE = 'tools-bc1-bc2-sbd-4.10';
const CORE = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png', './icons/favicon-64.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('tools-bc1-bc2-sbd-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (u.origin !== self.location.origin) return;
  // Trang chính: ưu tiên mạng (luôn có bản mới nhất), mất mạng thì dùng bản đã lưu
  if (r.mode === 'navigate' || u.pathname.endsWith('/') || u.pathname.endsWith('/index.html')) {
    e.respondWith(fetch(r).then(res => {
      if (res.ok) { const cp = res.clone(); caches.open(CACHE).then(c => c.put('./index.html', cp)); }
      return res;
    }).catch(() => caches.match('./index.html')));
    return;
  }
  // Biểu tượng, manifest: dùng bản đã lưu, không có thì lấy từ mạng
  e.respondWith(caches.match(r).then(m => m || fetch(r)));
});
