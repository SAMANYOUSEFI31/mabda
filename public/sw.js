/*
 * Mabda's service worker (decisions.md §۵۳ PWA). It makes the app installable and opens it without a network, and it never pretends:
 * - /api is never cached: knowledge is always the server's latest (CLAUDE.md rule 3). Offline, the app shows its own error and «دوباره».
 * - the page: network first; offline, the last page that loaded (the app shell), which then says it cannot reach the server.
 * - built files (/assets/*, hashed names): cache first, they never change under one name. Fonts and icons: cache, refreshed in the background.
 */
const CACHE = 'mabda-shell-v1';

self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.add('/')).catch(() => {})); self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put('/', copy)); } return res; })
      .catch(() => caches.match('/').then((r) => r || new Response('<!doctype html><html lang="fa" dir="rtl"><meta charset="utf-8"><title>مبدأ</title><body style="font-family:system-ui;padding:2rem">به اینترنت وصل نیستی. وقتی وصل شدی، دوباره باز کن.</body></html>', { headers: { 'content-type': 'text/html; charset=utf-8' } }))));
    return;
  }
  if (url.pathname.startsWith('/assets/')) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); } return res; })));
    return;
  }
  if (url.pathname.startsWith('/fonts/') || url.pathname.startsWith('/icons/') || url.pathname === '/favicon.svg') {
    e.respondWith(caches.match(req).then((hit) => {
      const fresh = fetch(req).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); } return res; }).catch(() => hit);
      return hit || fresh;
    }));
  }
});
