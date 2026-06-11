/*
 * Service worker — rend le site installable et utilisable hors-ligne (PWA).
 * Stratégie : « cache d'abord » pour les ressources de l'application
 * (le site est statique), avec mise à jour en arrière-plan.
 */
const CACHE = "le-cor-citoyen-v16";
const ASSETS = [
  "./",
  "./index.html",
  "./legal.html",
  "./css/style.css",
  "./js/chart.js",
  "./js/app.js",
  "./data/data.js",
  "./data/cor-series.generated.js",
  "./manifest.webmanifest",
  "./icons/icon.svg"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then(cached => {
      const network = fetch(event.request)
        .then(resp => {
          // On ne met en cache que les réponses valides de même origine.
          if (resp && resp.status === 200 && resp.type === "basic") {
            const copy = resp.clone();
            caches.open(CACHE).then(c => c.put(event.request, copy));
          }
          return resp;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
