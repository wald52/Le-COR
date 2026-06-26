#!/usr/bin/env node
/*
 * Minifie les feuilles de style et les scripts auteur du site en artefacts
 * `*.min.css` / `*.min.js` chargés par les pages.
 *
 * Pourquoi : Lighthouse signale `unminified-css` / `unminified-javascript`, et
 * le poids/parsing des 3 scripts retarde le rendu de la 1re carte (élément LCP).
 * On garde les sources lisibles (versionnées, lintées) et on sert la version
 * minifiée — même logique que les artefacts `data/*.generated.js` du dépôt.
 *
 * Les `*.min.*` produits sont committés (le site n'a pas d'étape de build au
 * déploiement). Réexécuter après toute modif d'un CSS/JS source :
 *   node tools/minify-assets.mjs
 * Dépendance : esbuild  (npm i -g esbuild ; non requis à l'exécution du site).
 *
 * Note : esbuild ne renomme PAS les identifiants de plus haut niveau d'un
 * fichier classique (non-module) ; les globaux partagés entre scripts
 * (CORChart, COR_DATA…) sont donc préservés. Les tests Playwright le vérifient.
 */
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// [source, sortie] — uniquement les fichiers auteur (pas les data générées).
const TARGETS = [
  ["css/style.css", "css/style.min.css"],
  ["css/cards.css", "css/cards.min.css"],
  ["js/chart.js", "js/chart.min.js"],
  ["js/app.js", "js/app.min.js"],
  ["js/cards.js", "js/cards.min.js"],
];

for (const [src, out] of TARGETS) {
  // CLI esbuild (sur le PATH) : minifie sans bundler, donc sans renommer les
  // identifiants de plus haut niveau d'un fichier classique.
  execFileSync(
    "esbuild",
    [join(root, src), "--minify", "--legal-comments=none", `--outfile=${join(root, out)}`],
    { stdio: ["ignore", "ignore", "inherit"] },
  );
  console.log(`${src} → ${out}`);
}
