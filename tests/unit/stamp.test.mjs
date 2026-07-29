/*
 * Invariants de l'estampillage de version (tools/stamp-assets.mjs, sw.js).
 *
 * Ce que ces tests protègent : la garantie qu'une page ne mélange jamais des
 * fichiers de générations différentes repose entièrement sur le fait qu'une URL
 * estampillée désigne un contenu immuable. Deux façons de casser cela sans s'en
 * apercevoir — le site continue de fonctionner, seule l'invalidation du cache
 * meurt en silence :
 *   1. un asset modifié sans relancer `npm run build:min` (estampille périmée,
 *      les visiteurs gardent l'ancien fichier en cache) ;
 *   2. une nouvelle référence ajoutée à la main sans estampille (fichier hors
 *      génération, donc susceptible de dépareiller).
 * Le garde-fou anti-dérive de la CI attrape (1) en rejouant la génération ; ces
 * tests attrapent les deux, sans navigateur, et documentent l'invariant.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = p => readFileSync(join(root, p), "utf8");
const hashOf = p =>
  createHash("sha256").update(readFileSync(join(root, p))).digest("hex").slice(0, 8);

// Fichiers qui référencent des assets : les documents servis et les deux
// scripts minifiés qui chargent des ressources à la demande.
const REFERRERS = ["index.html", "legal.html", "404.html", "js/app.min.js", "js/cards.min.js"];

// Les familles dont l'incohérence mutuelle casse le site — celles que
// tools/stamp-assets.mjs doit estampiller. Les icônes de marque et le manifeste
// en sont volontairement exclus (une icône dépareillée ne casse rien).
const MUST_STAMP = /^\.\/(css|js|data|images)\//;

// Toute référence `./chemin` éventuellement suivie de `?v=hachage`.
const REF = /\.\/(?:css|js|data|images|icons)\/[\w./-]+?\.(?:css|js|webp|svg|png)(\?v=[0-9a-f]{8})?/g;

function referencesOf(file) {
  return [...read(file).matchAll(REF)].map(m => ({ url: m[0], path: m[0].split("?")[0], stamp: m[1] }));
}

test("toute référence estampillée porte le hachage réel de son contenu", () => {
  for (const file of REFERRERS) {
    for (const { url, path, stamp } of referencesOf(file)) {
      if (!stamp) continue;
      assert.equal(
        stamp,
        `?v=${hashOf(path.slice(2))}`,
        `${file} : « ${url} » est périmé — lancez « npm run build:min ».`,
      );
    }
  }
});

test("tout asset de code, de données ou de contenu est estampillé", () => {
  for (const file of REFERRERS) {
    for (const { url, path, stamp } of referencesOf(file)) {
      if (!MUST_STAMP.test(path)) continue;
      assert.ok(stamp, `${file} : « ${url} » n'est pas estampillé — lancez « npm run build:min ».`);
    }
  }
});

test("le service worker précache exactement les URLs que les pages demandent", () => {
  const sw = read("sw.js");
  assert.match(sw, /const VERSION = "[0-9a-f]{8}";/, "sw.js : bloc généré absent ou non régénéré.");

  // Le seul bloc généré : ailleurs, sw.js cite « ./index.html » (repli de
  // navigation), qui n'est pas une entrée de la liste de précache.
  const list = sw.match(/const ASSETS = \[([\s\S]*?)\];/);
  assert.ok(list, "sw.js : liste de précache introuvable.");
  const precached = new Set([...list[1].matchAll(/"(\.\/[^"]*)"/g)].map(m => m[1]));
  for (const file of REFERRERS) {
    for (const { url, stamp } of referencesOf(file)) {
      if (!stamp) continue;
      assert.ok(precached.has(url), `sw.js ne précache pas « ${url} » (référencé par ${file}).`);
    }
  }
});

test("les URLs de page et les ancres de section ne sont jamais estampillées", () => {
  // La promesse faite aux visiteurs : mêmes adresses qu'avant. Un estampillage
  // qui déborderait sur un document ou un lien d'ancre changerait des URLs
  // publiques (liens partagés, favoris, référencement).
  for (const file of ["index.html", "legal.html", "404.html"]) {
    const html = read(file);
    assert.doesNotMatch(html, /href="\.\/(index\.html|legal\.html|404\.html|)\?v=/, `${file} : URL de page estampillée.`);
    assert.doesNotMatch(html, /href="[^"]*#[\w-]+\?v=/, `${file} : ancre de section estampillée.`);
  }
});
