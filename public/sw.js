/* eluue ai agent — minimal service worker.
   Enables PWA installability + offline fallback for the landing page.
   API calls, form posts and cross-origin requests always bypass the cache. */

const CACHE = "eluue-v1";
const OFFLINE_FALLBACK = "/";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.add(OFFLINE_FALLBACK))
      .then(() => self.skipWaiting())
      .catch(() => undefined),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Never serve app/API responses from cache — only the public landing page.
  if (request.mode !== "navigate" || url.pathname !== "/") return;
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(OFFLINE_FALLBACK, copy)).catch(() => undefined);
        }
        return response;
      })
      .catch(() => caches.match(OFFLINE_FALLBACK).then((cached) => cached || Response.error())),
  );
});
