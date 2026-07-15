/*
 * Chargeur de test pour les scripts « classiques » du site.
 * ---------------------------------------------------------
 * Les fichiers `js/*.js` sont des IIFE conçues pour le navigateur (`<script>`),
 * pas des modules Node. Pour tester leurs fonctions pures en isolation, on
 * exécute le source dans un contexte `node:vm` muni de stubs inertes (window,
 * document, navigator…), puis on lit l'objet exposé par le bloc
 * `if (typeof module !== "undefined") module.exports = { … }` présent au bas de
 * chaque IIFE (no-op dans le navigateur, car `module` y est indéfini).
 *
 * Au CHARGEMENT, ces scripts n'exécutent que des définitions de fonctions :
 * `chart.js` ne touche `window` qu'à la toute fin ; `app.js` déstructure
 * `window.CORChart`/`window.COR_DATA` en tête et, en pied, ne déclenche PAS
 * `init()` tant que `document.readyState === "loading"` (stub ci-dessous). Aucun
 * DOM réel n'est requis.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

// On compile le source en fonction dont les stubs (window, document…) sont des
// PARAMÈTRES — à la façon de l'enrobage CommonJS. `compileFunction` s'exécute
// dans le realm courant (pas un contexte vm séparé), donc les tableaux/objets
// renvoyés partagent les prototypes du test : `assert.deepEqual` (strict) les
// compare correctement, sans échec « not reference-equal » inter-realms.
const PARAMS = ["window", "document", "navigator", "location", "console", "module", "exports", "setTimeout", "clearTimeout"];

export function loadScript(relPath) {
  const code = readFileSync(join(root, relPath), "utf8");
  const noop = () => {};
  const el = () => ({ style: {}, setAttribute: noop, appendChild: noop, removeChild: noop, addEventListener: noop, classList: { add: noop, remove: noop } });

  const win = {
    COR_DATA: {},
    COR_SERIES: {},
    CORChart: { lineChart: noop, barChart: noop, sankeyChart: noop, swatch: () => "" },
    matchMedia: () => ({ matches: false, addEventListener: noop, addListener: noop }),
    addEventListener: noop,
  };
  const doc = {
    readyState: "loading", // empêche app.js de lancer init() au chargement
    addEventListener: noop,
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: el,
    body: { appendChild: noop, removeChild: noop, style: {} },
  };
  const module = { exports: {} };
  const loc = { hash: "", href: "http://localhost/" };

  const fn = vm.compileFunction(code, PARAMS, { filename: relPath });
  fn(win, doc, { userAgent: "node" }, loc, console, module, module.exports, setTimeout, clearTimeout);
  return module.exports;
}
