#!/usr/bin/env node
/*
 * Estampille les URLs d'assets d'un hachage de contenu, puis régénère la liste
 * de précache du service worker.
 *
 * Pourquoi : sans cela, `./js/app.min.js` désigne un contenu différent selon le
 * moment. Une page peut alors mélanger des fichiers de générations différentes
 * — un `app.min.js` d'hier avec des données d'aujourd'hui — et se casser alors
 * que chaque génération, prise entière, fonctionne. Aucune stratégie de cache
 * ne peut corriger cela : c'est l'URL qui est ambiguë.
 *
 * Avec `?v=<hachage>`, une URL désigne un contenu IMMUABLE. Deux générations du
 * site ne se disputent plus jamais la même URL : une page servie par le HTML de
 * la génération N ne demande que des URLs N. La cohérence n'est plus surveillée,
 * elle est structurelle. Le service worker peut dès lors servir ces URLs en
 * « cache d'abord » (instantané) sans risque de mélange — voir sw.js.
 *
 * `?v=` est une chaîne de requête : le serveur sert le même fichier au même
 * chemin, et `./images/bayrou.webp` reste accessible tel quel. Rien ne casse
 * côté liens directs. Les URLs de page (`./`, `./legal.html`) et les ancres de
 * section (`#dette`…) ne sont JAMAIS touchées.
 *
 * Lancé par `npm run build:min`, après tools/minify-assets.mjs (il réécrit les
 * `*.min.*` produits). Idempotent : relancer sans rien changer ne produit aucune
 * diff. Le workflow CI « Qualité » le rejoue et échoue si le dépôt a dérivé.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const readBin = p => readFileSync(join(root, p));
const readText = p => readFileSync(join(root, p), "utf8");
const writeText = (p, s) => writeFileSync(join(root, p), s);

// 8 hexa de SHA-256 : 4 milliards de valeurs pour ~20 fichiers, la collision
// n'est pas un risque à cette échelle, et l'URL reste lisible.
const hashOf = buf => createHash("sha256").update(buf).digest("hex").slice(0, 8);

/* --------------------------------------------------------------------------
 * Quoi estampiller.
 *
 * Estampillés : tout ce qui porte la logique, les données et le contenu — les
 * fichiers dont l'incohérence mutuelle casse le site.
 *
 * Non estampillés : le manifeste et les icônes de marque. Le manifeste référence
 * ses icônes par des chemins nus ; les estampiller dans le HTML sans réécrire le
 * manifeste créerait deux URLs pour un même fichier. Et une icône dépareillée ne
 * peut pas casser le site — c'est précisément le critère. Elles restent
 * précachées et servies en « réseau d'abord », comme avant.
 * ----------------------------------------------------------------------- */

// Assets estampillés qui ne référencent aucun autre asset : hachables tels quels.
const LEAF = [
  "css/style.min.css",
  "css/cards.min.css",
  "js/chart.min.js",
  "js/report.min.js",
  "data/data.js",
  "data/cor-series.generated.js",
  "data/cor-explorer.generated.js",
  "data/cor-sources.generated.js",
  "images/accueil-lecteur-cor.webp",
  "images/bayrou.webp",
  "images/hypotheses-cockpit.webp",
  "images/simulateur-faders.webp",
  "images/sources-logos.webp",
  "images/explorer-cards.webp",
];

// Assets estampillés qui référencent EUX-MÊMES d'autres assets estampillés :
// `app.min.js` charge les données de l'explorateur à la demande, `cards.min.js`
// pose les photos des cartes à l'ouverture. On réécrit leurs littéraux AVANT de
// les hacher — sinon le hachage ne décrirait pas le contenu réellement servi.
const DEPENDENT = ["js/app.min.js", "js/cards.min.js"];

// Précachés mais non estampillés (cf. commentaire ci-dessus).
const UNSTAMPED = [
  "manifest.webmanifest",
  "icons/icon.svg",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable.png",
  "icons/cor-logo.png",
  "icons/le-modele-social-francais.webp",
];

// Documents navigables : jamais estampillés (ce sont les URLs publiques), mais
// précachés et servis en « réseau d'abord ».
const DOCUMENTS = ["index.html", "legal.html", "404.html"];

/* --------------------------------------------------------------------------
 * Réécriture des références.
 * ----------------------------------------------------------------------- */

const stamped = new Map(); // "css/style.min.css" → "./css/style.min.css?v=ab12cd34"

const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function stamp(path) {
  stamped.set(path, `./${path}?v=${hashOf(readBin(path))}`);
}

// Remplace `./<chemin>` — avec ou sans `?v=…` déjà présent — par l'URL estampillée.
// Le `?v=` optionnel dans le motif est ce qui rend l'outil idempotent : relancer
// sur un fichier déjà estampillé réécrit le même résultat, sans empiler.
function rewrite(text) {
  for (const [path, url] of stamped) {
    text = text.replace(new RegExp(`${escapeRe(`./${path}`)}(\\?v=[0-9a-f]+)?`, "g"), url);
  }
  return text;
}

// 1. Feuilles : hachables directement.
for (const path of LEAF) stamp(path);

// 2. Dépendants : réécrire leurs littéraux, puis hacher le résultat. À ce stade
//    `stamped` ne contient que les feuilles, donc aucun ordre à arbitrer entre
//    `app.min.js` et `cards.min.js` (ils ne se référencent pas l'un l'autre).
for (const path of DEPENDENT) {
  writeText(path, rewrite(readText(path)));
  stamp(path);
}

// 3. Documents : réécrire toutes les références (les URLs de page et les ancres
//    `#…` ne correspondent à aucun chemin d'asset, elles sont donc intactes).
for (const path of DOCUMENTS) writeText(path, rewrite(readText(path)));

/* --------------------------------------------------------------------------
 * Génération du bloc de précache de sw.js.
 * ----------------------------------------------------------------------- */

// « ./ » d'abord : c'est l'URL de la page d'accueil, distincte de `index.html`
// pour le cache, et celle qu'ouvre la PWA installée (`start_url` du manifeste).
const ASSETS = ["./", ...DOCUMENTS.map(p => `./${p}`), ...stamped.values(), ...UNSTAMPED.map(p => `./${p}`)];

// VERSION nomme la génération, donc le cache. Elle couvre AUSSI les documents et
// les assets non estampillés : une correction de texte dans `index.html` ne
// change aucun hachage d'asset, mais doit tout de même ouvrir un cache neuf pour
// que l'instantané hors-ligne soit celui de la version publiée.
const fingerprint = [...DOCUMENTS, ...UNSTAMPED]
  .map(p => `${p}:${hashOf(readBin(p))}`)
  .concat([...stamped.values()])
  .sort()
  .join("\n");
const VERSION = hashOf(Buffer.from(fingerprint));

const BEGIN = "/* --- généré par tools/stamp-assets.mjs — ne pas éditer à la main --- */";
const END = "/* --- fin du bloc généré --- */";

const block = [
  BEGIN,
  `const VERSION = "${VERSION}";`,
  "const ASSETS = [",
  ...ASSETS.map(u => `  ${JSON.stringify(u)},`),
  "];",
  END,
].join("\n");

const sw = readText("sw.js");
const begin = sw.indexOf(BEGIN);
const end = sw.indexOf(END);
if (begin === -1 || end === -1) {
  console.error("sw.js : marqueurs du bloc généré introuvables.");
  process.exit(1);
}
writeText("sw.js", sw.slice(0, begin) + block + sw.slice(end + END.length));

console.log(`Génération ${VERSION} — ${stamped.size} assets estampillés, ${ASSETS.length} entrées précachées.`);
