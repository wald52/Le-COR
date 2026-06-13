/*
 * Service worker — rend le site installable et utilisable hors-ligne (PWA).
 * Stratégie : « réseau d'abord » pour que les visiteurs aient toujours la
 * dernière version (le navigateur revalide via ETag, donc 304 quasi gratuit
 * si rien n'a changé), avec repli sur le cache si le réseau est absent.
 */
const CACHE = "le-cor-citoyen-v32";
const NETWORK_TIMEOUT_MS = 5000;
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
    caches.open(CACHE)
      .then(cache => cache.addAll(ASSETS.map(url => new Request(url, { cache: "reload" }))))
      .then(() => self.skipWaiting())
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
  event.respondWith(networkFirst(event.request));
});

async function networkFirst(request) {
  try {
    const resp = await fetchWithTimeout(request.url, NETWORK_TIMEOUT_MS);
    // On ne met en cache que les réponses valides de même origine.
    if (resp && resp.status === 200 && resp.type === "basic") {
      const copy = resp.clone();
      caches.open(CACHE).then(c => c.put(request, copy));
    }
    return resp;
  } catch (e) {
    const cached = await caches.match(request);
    if (cached) return cached;
    if (request.mode === "navigate") {
      const index = await caches.match("./index.html");
      if (index) return index;
    }
    throw e;
  }
}

// "no-cache" : le navigateur revalide auprès du serveur (ETag → 304 si
// inchangé). Le timeout couvre les réseaux « zombies » qui pendent sans
// échouer : passé ce délai, on retombe sur le cache.
function fetchWithTimeout(url, ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { cache: "no-cache", signal: ctrl.signal })
    .finally(() => clearTimeout(timer));
}
