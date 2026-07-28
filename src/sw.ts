// Service Worker (V3/3б). Тривиальный пред-кэш оболочки: на install кладём в кэш index.html,
// хэшированные app-бандлы, манифест и иконки; отдаём из кэша (cache-first). Сетевых данных у
// приложения нет вообще (V2, данные в IndexedDB), поэтому стратегий кроме пред-кэша не нужно.
//
// __PRECACHE__ и __CACHE_VERSION__ подставляются при сборке (scripts/build.ts) из реального
// содержимого dist: меняется app.[hash] → меняется список и версия → меняются байты sw.js →
// браузер видит новый SW → перекэширует оболочку.
export {};

declare const __PRECACHE__: string[];
declare const __CACHE_VERSION__: string;

// self в SW — ServiceWorkerGlobalScope; в проекте lib=DOM, поэтому обращаемся через каст, не
// подключая конфликтующую lib "webworker". API кэшей/fetch есть и в DOM lib.
interface SWEvent {
  waitUntil(p: Promise<unknown>): void;
  request: Request;
  respondWith(r: Response | Promise<Response>): void;
}
const sw = self as unknown as {
  addEventListener(type: string, listener: (e: SWEvent) => void): void;
  skipWaiting(): Promise<void>;
  clients: { claim(): Promise<void> };
};

const CACHE = `auditor-${__CACHE_VERSION__}`;

sw.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(__PRECACHE__)).then(() => sw.skipWaiting()));
});

sw.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => sw.clients.claim()),
  );
});

sw.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  e.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).catch(() => {
        // Офлайн и нет в кэше: для навигаций отдаём кэшированную оболочку, иначе — сетевую ошибку.
        if (req.mode === 'navigate') return caches.match('./index.html').then((r) => r ?? Response.error());
        return Response.error();
      });
    }),
  );
});
