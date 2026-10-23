/* Shift Hours offline cache.
   The page (and its icons and manifest) are saved on install, so the app opens with no signal after
   the first visit. The page itself is fetched network-first: online you always get the newest copy,
   and it is re-saved each time (only the page itself, and only when it is HTML); offline (or on a slow
   link, after 4 seconds) the saved copy is served. The per diem rate file is network-first too (8 s,
   it is the biggest file), so new rates show on the first visit after they are deployed; saving it
   drops any other rate file (last year's) from the cache. Fonts are served from the cache when they
   are there and refreshed in the background. Other files opened as a page (qr.js, og.png) and
   everything else (the visitor counter) go straight to the network.
   V names the cache; bump it when SHELL changes. A new index.html or rate file needs no bump: the
   browser re-checks this file on every visit and both are re-saved on every online load. */
const V = 'shift-hours-2026-10-23';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png', 'qr.js'];
const FONT_CSS = 'https://fonts.googleapis.com/css2?family=Chivo+Mono:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap';
const isFont = u => u.hostname === 'fonts.googleapis.com' || u.hostname === 'fonts.gstatic.com';
const ROOT = new URL('./', self.location).pathname; // '/' on shifthours.app
const isPage = u => u.pathname === ROOT || u.pathname === ROOT + 'index.html';
const isRates = u => u.pathname.startsWith(ROOT + 'data/') && u.pathname.endsWith('.json');

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(V);
    await c.addAll(SHELL);
    // best effort: the font stylesheet and the font files it names, so type looks right offline too
    try {
      const r = await fetch(FONT_CSS);
      if (r.ok) {
        await c.put(FONT_CSS, r.clone());
        const urls = [...new Set((await r.text()).match(/https:\/\/fonts\.gstatic\.com\/[^)"' ]+/g) || [])];
        await Promise.all(urls.map(async u => { try { const f = await fetch(u); if (f.ok) await c.put(u, f); } catch (x) {} }));
      }
    } catch (x) {}
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== V).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const u = new URL(req.url);
  const own = u.origin === self.location.origin;
  if (!own && !isFont(u)) return;
  if (own && isPage(u)) { e.respondWith(pageFirst(req)); return; }
  if (own && req.mode === 'navigate') return; // another file opened on its own is never saved as the app
  if (own && isRates(u)) { e.respondWith(ratesFirst(e, req)); return; }
  e.respondWith(cachedThenFresh(e, req));
});

// the page: network first, the saved copy after 4 seconds or when the network fails
async function pageFirst(req) {
  const c = await caches.open(V);
  const net = fetch(req).then(r => { if (r && r.ok && /^text\/html/i.test(r.headers.get('content-type') || '')) c.put('index.html', r.clone()); return r; });
  const slow = new Promise(res => setTimeout(() => res(null), 4000));
  const r = await Promise.race([net.catch(() => null), slow]);
  if (r && r.ok) return r;
  const hit = await c.match('index.html');
  if (hit) return hit;
  return net; // nothing saved yet: wait for the network, however long, or fail as the page always did
}

// the rate file: network first (revalidated, so not a stale HTTP-cache copy), the saved copy after 8 seconds
// or when the network fails. A good answer is saved and any other rate file is dropped from the cache.
async function ratesFirst(e, req) {
  const c = await caches.open(V);
  let saved = null;
  const net = fetch(req, { cache: 'no-cache' }).then(r => {
    if (!r || !r.ok) return null;
    saved = c.put(req, r.clone()).then(async () => {
      for (const k of await c.keys()) if (k.url !== req.url && isRates(new URL(k.url))) await c.delete(k);
    }).catch(() => {});
    return r;
  }).catch(() => null);
  e.waitUntil(net.then(() => saved));
  const slow = new Promise(res => setTimeout(() => res(null), 8000));
  const r = await Promise.race([net, slow]);
  if (r) return r;
  const hit = await c.match(req);
  if (hit) return hit;
  return (await net) || new Response('', { status: 504, statusText: 'Offline' });
}

// fonts: what is saved first, refreshed in the background
async function cachedThenFresh(e, req) {
  const c = await caches.open(V);
  const hit = await c.match(req);
  const net = fetch(req).then(r => { if (r && (r.ok || r.type === 'opaque')) c.put(req, r.clone()); return r; }).catch(() => null);
  if (hit) { e.waitUntil(net); return hit; }
  const r = await net;
  return r || new Response('', { status: 504, statusText: 'Offline' });
}
