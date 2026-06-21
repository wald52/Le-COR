/*
 * build-explorer-card.cjs
 * -----------------------------------------------------------------------------
 * Génère images/explorer-cards.svg : l'illustration de la carte « Explorer tous
 * les indicateurs » du carousel.
 *
 * Principe : une pile dense de vignettes-courbes légèrement inclinées et
 * chevauchantes, couvrant tout le cadre sans laisser apparaître le fond. Chaque
 * vignette reprend un indicateur RÉEL de l'explorateur (window.COR_EXPLORER) —
 * sa ou ses séries, avec leurs couleurs d'origine. Les 67 indicateurs sont tous
 * représentés.
 *
 * Régénérer après une mise à jour des données :
 *     node tools/build-explorer-card.cjs
 *
 * Sortie déterministe (graine fixe) : le même jeu de données produit le même SVG.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "images", "explorer-cards.svg");

// --- Chargement des données (les fichiers posent des globales sur `window`) ---
global.window = {};
eval(fs.readFileSync(path.join(ROOT, "data", "cor-explorer.generated.js"), "utf8"));
const EXP = global.window.COR_EXPLORER.explorer;
const INDIC = EXP.indicators;
const THEMES = EXP.themes; // [{ name, indicators: [clé, …] }, …]

// Nombre de séries « traçables » d'un indicateur (≥ 2 points) — sert à privilégier
// les indicateurs aux courbes les plus riches dans chaque thème.
const richness = (key) => {
  const ind = INDIC[key];
  if (!ind || !ind.series) return 0;
  return ind.series.filter((s) => s.points && s.points.length >= 2).length;
};

// Sélection ÉQUILIBRÉE de ~N indicateurs : round-robin sur les 9 thèmes, en prenant
// dans chacun ses indicateurs du plus riche au moins riche. Donne un échantillon
// représentatif et stable, résilient à une évolution des données.
function selectKeys(n) {
  const pools = THEMES.map((t) =>
    (t.indicators || [])
      .filter((k) => INDIC[k] && richness(k) > 0)
      .sort((a, b) => richness(b) - richness(a))
  );
  const out = [];
  for (let pass = 0; out.length < n; pass++) {
    let progressed = false;
    for (const pool of pools) {
      if (pass < pool.length) {
        out.push(pool[pass]);
        progressed = true;
        if (out.length >= n) break;
      }
    }
    if (!progressed) break; // plus rien à piocher
  }
  return out;
}

const KEYS = selectKeys(24); // 24 indicateurs équilibrés sur les 9 thèmes

const r3 = (n) => Math.round(n * 1000) / 1000;

// PRNG déterministe (mulberry32) pour le jitter « cartes jetées ».
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = rng(20260621);

// --- Une série -> path Bézier lissé dans la boîte locale [-X,X] x [Y,-Y] -------
function pathFor(points, X, Y) {
  const pts = (points || []).filter((p) => p && isFinite(p.x) && isFinite(p.y));
  if (pts.length < 2) return null;
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const xmin = Math.min(...xs), xmax = Math.max(...xs);
  const ymin = Math.min(...ys), ymax = Math.max(...ys);
  const sx = (x) => (xmax === xmin ? 0 : -X + ((x - xmin) / (xmax - xmin)) * 2 * X);
  const sy = (y) => (ymax === ymin ? 0 : Y - ((y - ymin) / (ymax - ymin)) * 2 * Y);
  let P = pts.map((p) => ({ x: sx(p.x), y: sy(p.y) }));
  // Sous-échantillonne à ~10 points pour des courbes propres et un SVG léger.
  const MAX = 10;
  if (P.length > MAX) {
    const step = (P.length - 1) / (MAX - 1), q = [];
    for (let i = 0; i < MAX; i++) q.push(P[Math.round(i * step)]);
    P = q;
  }
  // Catmull-Rom -> Bézier cubique.
  let d = `M ${r3(P[0].x)} ${r3(P[0].y)}`;
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[i - 1] || P[i], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2] || P[i + 1];
    const c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${r3(c1x)} ${r3(c1y)}, ${r3(c2x)} ${r3(c2y)}, ${r3(p2.x)} ${r3(p2.y)}`;
  }
  return d;
}

// Choisit jusqu'à 2 séries représentatives d'un indicateur (variété de couleur).
function pickSeries(ind) {
  const s = (ind.series || []).filter((x) => x.points && x.points.length >= 2);
  if (s.length === 0) return [];
  if (s.length === 1) return [s[0]];
  return [s[0], s[s.length - 1]]; // observé/1er + dernière projection
}

// --- Disposition : grille décalée 4 x 6 = 24, chevauchement léger -------------
const W = 680, H = 1040;
const COLS = 4, ROWS = 6;
const stepX = (W - 80) / (COLS - 1);   // ~200
const stepY = (H - 60) / (ROWS - 1);   // ~196
const CARD_W = 256, CARD_H = 188;      // > pas => recouvrement, aucun trou
const hw = CARD_W / 2, hh = CARD_H / 2;
const bx = (CARD_W - 34) / 2, by = (CARD_H - 30) / 2; // boîte courbe (marge interne)

let cards = "";
let k = 0; // index sur les 24 indicateurs sélectionnés (exactement 4×6 slots)
for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++) {
    const ind = INDIC[KEYS[k % KEYS.length]];
    k++;
    const stagger = (r % 2) * stepX * 0.5; // rangées impaires décalées (effet pile)
    const cx = 40 + c * stepX + stagger - stepX * 0.25 + (rnd() - 0.5) * 26;
    const cy = 30 + r * stepY + (rnd() - 0.5) * 20;
    const rot = (rnd() - 0.5) * 10;        // ±5°
    const series = pickSeries(ind);
    let paths = "";
    series.forEach((se, idx) => {
      const d = pathFor(se.points, bx, by);
      if (!d) return;
      const col = se.color || "#64748b";
      const op = idx === 0 ? "1" : "0.62";
      paths += `\n        <path d="${d}" stroke="${col}" stroke-opacity="${op}"/>`;
    });
    cards += `
      <g transform="translate(${r3(cx)} ${r3(cy)}) rotate(${r3(rot)})" filter="url(#sh)">
        <rect x="${-hw}" y="${-hh}" width="${CARD_W}" height="${CARD_H}" rx="11" fill="#ffffff" stroke="#e2e8f0" stroke-width="1.4"/>${paths}
      </g>`;
  }
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-hidden="true" preserveAspectRatio="xMidYMin slice">
  <title>Une pile de vignettes-courbes : une sélection d'indicateurs de l'explorateur du COR couvrant les neuf thèmes (démographie, emploi, pensions, finances, comparaisons internationales…), chacun tracé à partir de ses séries réelles et de leurs couleurs d'origine.</title>
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.35" y2="1">
      <stop offset="0" stop-color="#f1f5f9"/><stop offset="1" stop-color="#dde5ee"/>
    </linearGradient>
    <radialGradient id="vg" cx="0.5" cy="0.42" r="0.8">
      <stop offset="0" stop-color="#1e293b" stop-opacity="0"/><stop offset="0.82" stop-color="#1e293b" stop-opacity="0"/><stop offset="1" stop-color="#1e293b" stop-opacity="0.12"/>
    </radialGradient>
    <filter id="sh" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="7" stdDeviation="8" flood-color="#0f172a" flood-opacity="0.30"/>
    </filter>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <g fill="none" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round">${cards}
  </g>
  <rect width="${W}" height="${H}" fill="url(#vg)"/>
</svg>
`;

fs.writeFileSync(OUT, svg);
console.log(`Écrit ${OUT} — ${(svg.length / 1024).toFixed(1)} Ko, ${COLS * ROWS} vignettes, ${KEYS.length} indicateurs.`);
