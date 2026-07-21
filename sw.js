const CACHE_NAME = "luz-de-tela-v6";
const OFFLINE_URL = "./";
const ASSETS = [
  "./",
  "index.html",
  "sobre/",
  "sobre/index.html",
  "styles.css?v=6",
  "app.js?v=6",
  "manifest.webmanifest?v=6",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

async function updateCache(request, response) {
  if (!response || !response.ok || response.type !== "basic") return response;

  const cache = await caches.open(CACHE_NAME);
  await cache.put(request, response.clone());
  return response;
}

async function navigationResponse(request) {
  try {
    const response = await fetch(request);
    return updateCache(request, response);
  } catch {
    return (await caches.match(request)) || (await caches.match(OFFLINE_URL));
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(navigationResponse(request));
    return;
  }

  const networkResponse = fetch(request).then((response) => updateCache(request, response));
  event.respondWith(caches.match(request).then((cached) => cached || networkResponse));
  event.waitUntil(networkResponse.catch(() => undefined));
});
