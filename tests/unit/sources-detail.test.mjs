/*
 * Tests unitaires de la queue de précision (js/app.js, provenanceParts).
 *
 * Nommer le rapport ne suffisait pas : sa page officielle porte une vingtaine de
 * fichiers, et le lecteur devait deviner lequel puis y retrouver la figure. La
 * queue dit le classeur, l'onglet et la page. Ces tests portent surtout sur ce
 * qu'elle doit REFUSER de dire : une page devinée envoie le lecteur sur la
 * mauvaise figure, ce qui est pire que pas de page du tout.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadScript } from "./_sandbox.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const win = {};
new Function("window", readFileSync(join(root, "data/cor-sources.generated.js"), "utf8"))(win);
const SRC = win.COR_SOURCES;

const { sheetKey, provenanceParts } = loadScript("js/app.js");

test("sheetKey : les onglets numérotés du COR, dans leurs quatre orthographes", () => {
  assert.equal(sheetKey("Fig 2.11"), "fig:2.11");
  assert.equal(sheetKey("fig. 2.24"), "fig:2.24");
  assert.equal(sheetKey("Tab 2.5"), "tab:2.5");
  assert.equal(sheetKey("Tableau_4"), "tab:4");
  assert.equal(sheetKey("Fig.4.C"), "fig:4.C");
});

test("sheetKey : un onglet sans numéro ne désigne aucune figure", () => {
  assert.equal(sheetKey("Âge conjoncturel"), null);
  assert.equal(sheetKey("Dépenses_OCDE"), null);
  assert.equal(sheetKey("Solde dépenses ressources"), null);
  assert.equal(sheetKey(""), null);
  assert.equal(sheetKey(undefined), null);
});

test("millésime unique : classeur, onglet et page", () => {
  const p = provenanceParts([["cor-2026", "donnees-p2", "Fig 2.11"]], SRC);
  assert.equal(p.fichier.nom, "Données juin 2026 - partie 2");
  assert.match(p.fichier.url, /^https:\/\/www\.cor-retraites\.fr\/.*\.xlsx$/);
  assert.equal(p.onglet, "Fig 2.11");
  assert.ok(p.page > 0, "la page de la figure doit être connue");
  assert.equal(p.pageUrl, SRC.fichiers["cor-2026"].rapport.url + "#page=" + p.page);
});

test("superposition de millésimes : l'onglet nommé une fois, le classeur le plus récent", () => {
  const prov = [
    ["cor-2016", "donnees-indicateurs", "Fig 2.18"],
    ["cor-2021", "donnees-p2", "Fig 2.18"],
    ["cor-2026", "donnees-p2", "Fig 2.18"],
  ];
  const p = provenanceParts(prov, SRC);
  assert.equal(p.fichier.nom, "Données juin 2026 - partie 2", "le classeur lié est le plus récent");
  assert.equal(p.onglet, "Fig 2.18");
});

test("onglets différents d'un millésime à l'autre : aucun onglet n'est nommé", () => {
  // Nommer celui du dernier rapport laisserait croire qu'il vaut pour tous.
  const p = provenanceParts([
    ["cor-2025", "donnees-p2", "Fig 2.17"],
    ["cor-2026", "donnees-p2", "Fig 2.18"],
  ], SRC);
  assert.equal(p.onglet, null);
  assert.equal(p.page, null);
});

test("onglet sans numéro de figure : pas de renvoi de page", () => {
  const p = provenanceParts([["cor-2026", "donnees-synthese", "Dépenses_OCDE"]], SRC);
  assert.equal(p.onglet, "Dépenses_OCDE");
  assert.equal(p.page, null, "aucune page ne doit être devinée");
  assert.equal(p.pageUrl, null);
});

test("rôle ou rapport inconnu : pas de queue plutôt qu'un lien mort", () => {
  assert.equal(provenanceParts([["cor-2026", "donnees-p9", "Fig 2.11"]], SRC), null);
  assert.equal(provenanceParts([["cor-1999", "donnees-p1", "Fig 1.1"]], SRC), null);
});

test("provenance absente ou vide : null, sans erreur", () => {
  assert.equal(provenanceParts([], SRC), null);
  assert.equal(provenanceParts(undefined, SRC), null);
  assert.equal(provenanceParts([["cor-2026", "donnees-p2", "Fig 2.11"]], null), null);
});
