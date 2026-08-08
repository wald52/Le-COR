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
  // Le compte a baissé de 92 à ~70 en retirant les numéros de figure de la
  // prose : cinq phrases « Panorama … (Fig 5.x) » n'en font plus qu'une, la
  // figure étant désormais portée par `prov`, exacte par construction. Le seuil
  // n'est là que pour détecter une perte massive de libellés.
  assert.ok(sources.size >= 60, `seulement ${sources.size} libellés collectés`);
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

test("chaque indicateur de l'explorateur sait de quel fichier il vient", () => {
  // La provenance est notée par tools/extract_cor.py au moment où il ouvre le
  // classeur. Un indicateur qui la perd retombe sur « quelque part dans un
  // rapport de 260 pages » — exactement ce qu'on voulait supprimer.
  const indicateurs = evalData("data/cor-explorer.generated.js").COR_EXPLORER.explorer.indicators;
  const sans = Object.keys(indicateurs).filter(k => !(indicateurs[k].prov || []).length);
  assert.deepEqual(sans, [], "indicateurs sans provenance");
});

test("toute provenance désigne un fichier réellement publié par le COR", () => {
  const SRC = evalData("data/cor-sources.generated.js").COR_SOURCES;
  const orphelins = [];
  const visite = node => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) return node.forEach(visite);
    Object.keys(node).forEach(k => {
      if (k === "prov" && Array.isArray(node[k])) {
        node[k].forEach(([rapport, role]) => {
          if (!(SRC.fichiers[rapport] || {})[role]) orphelins.push(rapport + "/" + role);
        });
      } else visite(node[k]);
    });
  };
  visite(evalData("data/cor-explorer.generated.js").COR_EXPLORER);
  visite(evalData("data/cor-series.generated.js").COR_SERIES);
  visite(evalData("data/data.js").COR_DATA);
  assert.deepEqual([...new Set(orphelins)], [], "provenances sans fichier correspondant");
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
