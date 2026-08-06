/*
 * Service worker — rend le site installable et utilisable hors-ligne (PWA).
 *
 * Trois exigences, tenues ensemble :
 *   a. en avion, sans réseau, le site fonctionne ;
 *   b. en ligne, un rechargement donne toujours la dernière version — sans que
 *      le visiteur ait à vider quoi que ce soit, et sans rechargement
 *      automatique dans son dos ;
 *   c. une page ne mélange JAMAIS des fichiers de générations différentes.
 *
 * Le point (c) est le plus difficile, et il ne se règle pas dans le service
 * worker : il se règle dans les URLs. Les assets sont estampillés d'un hachage
 * de contenu (`?v=…`, posé par tools/stamp-assets.mjs), donc une URL estampillée
 * désigne un contenu IMMUABLE. Le HTML de la génération N ne référence que des
 * URLs N : la cohérence d'une page est acquise par construction, quelle que
 * soit la provenance — réseau ou cache — de chaque fichier.
 *
 * D'où les trois règles ci-dessous :
 *
 *   1. Documents (navigations) → RÉSEAU D'ABORD, avec repli sur le cache.
 *      Recharger en ligne donne le dernier HTML, donc le dernier jeu d'URLs
 *      estampillées. Hors ligne, le cache sert le HTML de la dernière génération
 *      complète, qui ne référence que des URLs de cette génération — présentes.
 *
 *   2. Assets estampillés → CACHE D'ABORD, toutes générations confondues.
 *      Instantané, et sans risque puisque l'URL fixe le contenu.
 *
 *   3. Le reste (manifeste, icônes de marque) → RÉSEAU D'ABORD.
 *      Non estampillé, mais une icône dépareillée ne casse pas le site.
 *
 * Pas de `skipWaiting()` : un onglet resté ouvert continue d'être servi par son
 * service worker et son cache, y compris pour ce qu'il charge tardivement (les
 * données de l'explorateur, les photos des cartes). Le nouveau service worker
 * précache sa génération dès son installation — l'instantané hors-ligne est donc
 * prêt bien avant qu'il prenne la main — et n'active (avec purge des anciens
 * caches) que lorsque plus aucune page de l'ancienne génération n'est ouverte.
 * Aucun rechargement n'est jamais provoqué : le visiteur recharge quand il veut.
 */
/* --- généré par tools/stamp-assets.mjs — ne pas éditer à la main --- */
const VERSION = "f43b3eaa";
const ASSETS = [
  "./",
  "./index.html",
  "./legal.html",
  "./404.html",
  "./css/style.min.css?v=0cca07d5",
  "./css/cards.min.css?v=ba8f2154",
  "./js/chart.min.js?v=938a5649",
  "./js/report.min.js?v=24ebfe11",
  "./data/data.js?v=a8cd02db",
  "./data/cor-series.generated.js?v=4ae8d1db",
  "./data/cor-explorer.generated.js?v=fb26adca",
  "./images/accueil-lecteur-cor.webp?v=aab23ce6",
  "./images/bayrou.webp?v=fec7737e",
  "./images/hypotheses-cockpit.webp?v=d70cd6d1",
  "./images/simulateur-faders.webp?v=5604f607",
  "./images/sources-logos.webp?v=f9424beb",
  "./images/explorer-cards.svg?v=16f0061c",
  "./js/app.min.js?v=5d733938",
  "./js/cards.min.js?v=8ee05b86",
  "./manifest.webmanifest",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable.png",
  "./icons/cor-logo.png",
  "./icons/le-modele-social-francais.webp",
];
/* --- fin du bloc généré --- */

const CACHE = `le-cor-citoyen-${VERSION}`;
const NETWORK_TIMEOUT_MS = 5000;

self.addEventListener("install", event => {
  // `cache: "reload"` : on remplit la génération depuis le réseau, sans passer
  // par le cache HTTP du navigateur, pour que l'instantané soit fidèle.
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(ASSETS.map(url => new Request(url, { cache: "reload" }))))
  );
});

self.addEventListener("activate", event => {
  // Sans `skipWaiting()`, on n'arrive ici que lorsque plus aucune page servie
  // par la génération précédente n'est ouverte : purger les autres caches ne
  // peut donc couper l'herbe sous le pied d'aucune page vivante.
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request));
  } else if (url.searchParams.has("v")) {
    event.respondWith(cacheFirst(request));
  } else {
    event.respondWith(networkFirst(request));
  }
});

// Assets estampillés. `caches.match` sans nom de cache interroge TOUTES les
// générations présentes : une URL estampillée désignant un contenu immuable, la
// servir depuis un cache plus ancien est exact — et évite un aller-retour réseau
// pour les fichiers qu'une nouvelle génération n'a pas modifiés.
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const resp = await fetch(request);
  if (resp && resp.status === 200 && resp.type === "basic") {
    const copy = resp.clone();
    caches.open(CACHE).then(c => c.put(request, copy));
  }
  return resp;
}

// Documents et assets non estampillés.
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
