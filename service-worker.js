const CACHE_NAME = "pocketsathi-v7";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/styles.css",
  "./js/app.js",
  "./icons/icon.svg",
  "./icons/favicon.svg",
  "./icons/favicon.png",
  "./icons/icon-512.png",
  "./icons/icon-192.png",
  "./icons/icon-96.png",
  "./icons/apple-touch-icon.png",
  "./icons/splash.svg",
  "./icons/splash-640x1136.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) => Promise.all(
      names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))
    ))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((response) => {
          if (!response || response.status !== 200 || response.type === "opaque") return response;
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => null);

      if (cached) return cached;

      return network.then((response) => {
        if (response) return response;
        if (event.request.mode === "navigate") return caches.match("./index.html");
        return new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } });
      });
    })
  );
});
