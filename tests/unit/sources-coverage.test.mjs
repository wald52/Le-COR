/*
 * Filet anti-dérive : toute phrase de source affichée par le site doit produire
 * au moins un lien.
 *
 * Les libellés de source vivent en grande partie dans data/cor-*.generated.js,
 * régénérés par tools/extract_cor.py depuis les Excel du COR. Si une future
 * extraction reformule ces phrases, la table d'alias de js/app.js cesse de les
 * reconnaître — sans rien casser de visible. Ce test transforme cette panne
 * silencieuse en échec de CI.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadScript } from "./_sandbox.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = p => readFileSync(join(root, p), "utf8");
const evalData = p => {
  const win = {};
  new Function("window", read(p))(win);
  return win;
};

const DOCS = evalData("data/data.js").COR_DATA.documents;
const { matchRefs } = loadScript("js/app.js");

// Collecte récursive de toutes les valeurs portées par une clé `source`.
function collectSources(node, out) {
  if (!node || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    node.forEach(v => collectSources(v, out));
    return out;
  }
  Object.keys(node).forEach(k => {
    const v = node[k];
    if (k === "source" && typeof v === "string") out.add(v);
    else collectSources(v, out);
  });
  return out;
}

const sources = new Set();
collectSources(evalData("data/cor-explorer.generated.js").COR_EXPLORER, sources);
collectSources(evalData("data/cor-series.generated.js").COR_SERIES, sources);
collectSources(evalData("data/data.js").COR_DATA, sources);

test("les libellés de source des données produisent tous au moins un lien", () => {
  assert.ok(sources.size >= 90, `seulement ${sources.size} libellés collectés`);
  const orphelins = [...sources].filter(s => matchRefs(s, DOCS).length === 0);
  assert.deepEqual(orphelins, [], "libellés qu'aucune règle ne reconnaît");
});

test("tout identifiant repéré existe dans le registre", () => {
  [...sources].forEach(s => {
    matchRefs(s, DOCS).forEach(r => {
      assert.ok(DOCS[r.id], `« ${s} » vise ${r.id}, absent du registre`);
    });
  });
});

test("les phrases de source écrites dans index.html sont couvertes", () => {
  const html = read("index.html");
  const paragraphes = [...html.matchAll(/<p class="chart-source"[^>]*>([\s\S]*?)<\/p>/g)]
    .map(m =>
      m[1]
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .trim()
    )
    // Deux paragraphes sont des coquilles vides remplies en JS (#lv-source,
    // #exp-source) : leur contenu est couvert par le test des données.
    .filter(t => t.length);
  assert.equal(paragraphes.length, 14);
  const orphelins = paragraphes.filter(t => matchRefs(t, DOCS).length === 0);
  assert.deepEqual(orphelins, [], "paragraphes de source sans aucun lien");
});
