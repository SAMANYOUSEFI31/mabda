/*
 * Mabda's service worker (decisions.md §۵۳ PWA). It makes the app installable and opens it without a network, and it never pretends:
 * - /api is never cached: knowledge is always the server's latest (CLAUDE.md rule 3). Offline, the app shows its own error and «دوباره».
 * - the page: network first; offline, the last page that loaded (the app shell), which then says it cannot reach the server.
 * - built files (/assets/*, hashed names): cache first, they never change under one name. Fonts and icons: cache, refreshed in the background.
 * - one build's files at a time (§۵۳ پس از ممیزی): built files go into a cache named after the build (the hash of the entry script in the
 *   page). When a newer page arrives, the caches of older builds are deleted, so a device does not keep every past version.
 */
const SHELL = 'mabda-shell-v2';
const ASSETS = 'mabda-assets-';
let build = null; // the build the last page that loaded belongs to

const buildOf = (html) => { const m = /\/assets\/(index-[\w-]+)\.js/.exec(html); return m ? m[1] : null; };
/** keep the shell and this build's files; delete every other Mabda cache (older builds, the v1 cache) */
const prune = (keep) => caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== ASSETS + keep).map((k) => caches.delete(k))));
const currentBuild = async () => {
  if (build) return build;
  const page = await caches.match('/', { cacheName: SHELL });
  build = page ? buildOf(await page.text()) : null;
  return build;
};

self.addEventListener('install', (e) => { e.waitUntil(caches.open(SHELL).then((c) => c.add('/')).catch(() => {})); self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil(currentBuild().then((b) => (b ? prune(b) : caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== SHELL && !k.startsWith(ASSETS)).map((k) => caches.delete(k)))))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        e.waitUntil(copy.clone().text().then((html) => {
          const b = buildOf(html);
          return caches.open(SHELL).then((c) => c.put('/', copy)).then(() => { if (b && b !== build) { build = b; return prune(b); } return undefined; });
        }).catch(() => {}));
      }
      return res;
    })
      .catch(() => caches.match('/', { cacheName: SHELL }).then((r) => r || new Response('<!doctype html><html lang="fa" dir="rtl"><meta charset="utf-8"><title>مبدأ</title><body style="font-family:system-ui;padding:2rem">به اینترنت وصل نیستی. وقتی وصل شدی، دوباره باز کن.</body></html>', { headers: { 'content-type': 'text/html; charset=utf-8' } }))));
    return;
  }
  if (url.pathname.startsWith('/assets/')) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); e.waitUntil(currentBuild().then((b) => (b ? caches.open(ASSETS + b).then((c) => c.put(req, copy)) : undefined)).catch(() => {})); }
      return res;
    })));
    return;
  }
  if (url.pathname.startsWith('/fonts/') || url.pathname.startsWith('/icons/') || url.pathname === '/favicon.svg') {
    e.respondWith(caches.match(req).then((hit) => {
      const fresh = fetch(req).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(SHELL).then((c) => c.put(req, copy)); } return res; }).catch(() => hit);
      return hit || fresh;
    }));
  }
});
