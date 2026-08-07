/*
 * Tests unitaires du registre des documents cités (data/data.js, `documents`).
 *
 * Le registre est la seule source de vérité des liens de source : les mentions
 * du texte le visent par identifiant, et la bibliographie de « Méthode &
 * sources » en est dérivée. Une entrée mal formée casse donc silencieusement
 * des liens dans les deux sens.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const win = {};
new Function("window", readFileSync(join(root, "data/data.js"), "utf8"))(win);
const DOCS = win.COR_DATA.documents;
const entries = Object.entries(DOCS);

test("chaque entrée porte un titre et une URL https", () => {
  entries.forEach(([id, d]) => {
    assert.ok(d.titre && d.titre.trim(), `${id} : titre vide`);
    assert.match(d.url, /^https:\/\//, `${id} : URL non https`);
  });
});

test("les documents du COR pointent bien vers cor-retraites.fr", () => {
  entries
    .filter(([id]) => id.startsWith("cor-"))
    .forEach(([id, d]) => {
      assert.match(d.url, /^https:\/\/www\.cor-retraites\.fr\//, `${id} : hors du site du COR`);
    });
});

test("les 31 rapports archivés dans data/ ont tous leur page officielle", () => {
  const rapports = entries.filter(([, d]) => d.org === "COR" && d.annee !== null);
  // 31 rapports + 3 documents complémentaires (PDF du rapport 2025, les deux
  // synthèses) + le document de travail sur la productivité + la note Beaufret.
  assert.ok(rapports.length >= 31, `seulement ${rapports.length} documents du COR`);
});

test("un millésime annuel « cor-<année> » existe pour chaque année exploitée", () => {
  // La règle des millésimes de js/app.js construit l'identifiant « cor-<année> ».
  // Les années effectivement citées par le site vont de 2016 à 2026.
  for (let y = 2016; y <= 2026; y++) {
    assert.ok(DOCS["cor-" + y], `cor-${y} manquant : « rapport ${y} » ne serait pas lié`);
  }
});

test("aucune URL en double (deux identifiants pour un même document)", () => {
  const seen = new Map();
  entries.forEach(([id, d]) => {
    assert.ok(!seen.has(d.url), `${id} et ${seen.get(d.url)} partagent la même URL`);
    seen.set(d.url, id);
  });
});

test("la bibliographie dérivée n'est ni vide ni bavarde", () => {
  const biblio = entries.filter(([, d]) => d.biblio !== false);
  assert.ok(biblio.length >= 20, "bibliographie trop courte");
  assert.ok(biblio.length <= 40, "bibliographie trop longue : revoir les drapeaux biblio");
});
