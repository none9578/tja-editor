/* シンプルなService Worker（ネットワーク優先＋キャッシュフォールバック）。
   ホーム画面に追加したアプリをオフラインでも開けるようにする。
   バージョンを上げると古いキャッシュは破棄される。 */
const CACHE = 'tja-editor-v5';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || !req.url.startsWith(self.location.origin)) return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() =>
        caches.match(req).then(
          (hit) =>
            hit ??
            (req.mode === 'navigate'
              ? caches.match('./index.html').then((page) => page ?? Response.error())
              : Response.error()),
        ),
      ),
  );
});
