/*
 * Tests unitaires du repérage des documents cités (js/app.js, matchRefs).
 *
 * Les phrases « Source : … » du site ne sont pas réécrites : elles sont
 * reconnues au rendu et reliées au registre COR_DATA.documents. Ces tests
 * portent donc autant sur ce qui DOIT être lié que sur ce qui ne doit surtout
 * pas l'être — un lien parasite sur « figure 2.11 » ou sur la convention
 * comptable « COR » serait pire que pas de lien du tout.
 *
 * `matchRefs` est pure : on lui injecte le registre, car le bac à sable de test
 * stubbe window.COR_DATA avec un objet vide.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadScript } from "./_sandbox.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const win = {};
new Function("window", readFileSync(join(root, "data/data.js"), "utf8"))(win);
const DOCS = win.COR_DATA.documents;

const { matchRefs } = loadScript("js/app.js");

// Renvoie [[texte lié, identifiant], …] — plus lisible qu'un tableau d'offsets.
const refs = text => matchRefs(text, DOCS).map(r => [text.slice(r.start, r.end), r.id]);

test("plage de millésimes : un seul lien, vers la page qui liste les rapports", () => {
  assert.deepEqual(
    refs("Source : COR, rapports annuels 2016–2026 — données officielles."),
    [["rapports annuels 2016–2026", "cor-rapports"]]
  );
});

test("plage écrite avec « à » (forme employée dans data.js)", () => {
  assert.deepEqual(
    refs("COR, rapports annuels 2016 à 2026 (scénarios de productivité)."),
    [["rapports annuels 2016 à 2026", "cor-rapports"]]
  );
});

test("millésime unique : lien vers le rapport de cette année-là", () => {
  assert.deepEqual(refs("COR, rapport annuel 2016 — dépenses en % du PIB."), [
    ["rapport annuel 2016", "cor-2016"],
  ]);
  assert.deepEqual(refs("COR, rapport 2026 (fig. 1.10) — données officielles."), [
    ["rapport 2026", "cor-2026"],
  ]);
  assert.deepEqual(refs("COR, rapport annuel juin 2026 — feuille « Tab 2.2 »."), [
    ["rapport annuel juin 2026", "cor-2026"],
  ]);
});

test("énumération de millésimes : un lien par rapport cité", () => {
  assert.deepEqual(refs("Source : COR, rapports 2019, 2025 et 2026 — officielles."), [
    ["rapports 2019", "cor-2019"],
    ["2025", "cor-2025"],
    ["2026", "cor-2026"],
  ]);
  assert.deepEqual(
    refs("l'Insee a révisé la série entre les rapports 2024 et 2025 (≈2 points)").map(r => r[1]),
    ["insee", "cor-2024", "cor-2025"]
  );
});

test("rapports thématiques cités par leur titre entre guillemets", () => {
  assert.deepEqual(refs("COR, rapport « Droits familiaux et conjugaux » 2025 (Fig 1.17)."), [
    ["rapport « Droits familiaux et conjugaux » 2025", "cor-droits-familiaux-2025"],
  ]);
  assert.deepEqual(
    refs("COR, « Panorama des systèmes de retraite … » 2020 (Fig 5.7).").map(r => r[1]),
    ["cor-panorama-2020"]
  );
  assert.deepEqual(
    refs("COR, rapport « Perspectives … résultats par régime » 2017 (Tableau_4).").map(r => r[1]),
    ["cor-thematique-2017"]
  );
});

test("aucun lien sur une année nue : figures, feuilles Excel, horizons", () => {
  assert.deepEqual(refs("figure 2.11, structure des ressources 2004–2025"), []);
  assert.deepEqual(refs("feuille « Tab 2.2 » (données 2022 à 2025)"), []);
  assert.deepEqual(refs("perspectives financières jusqu'en 2070 ; horizon 2070"), []);
  assert.deepEqual(refs("COR, rapport 2026 (fig. 2.24)").map(r => r[1]), ["cor-2026"]);
});

test("« COR » entre guillemets est une convention comptable, pas un titre", () => {
  assert.deepEqual(refs("conventions comptables : « COR » jusqu'en 2019, EPR ensuite"), []);
});

test("« rapports à la CCSS 2002-2025 » n'est pas une plage de rapports du COR", () => {
  assert.deepEqual(
    refs("COR, rapports à la CCSS 2002-2025 ; comptabilité nationale Insee base 2020.").map(r => r[1]),
    ["insee"]
  );
});

test("un document n'est lié qu'une fois par phrase", () => {
  const t =
    "Source : COR, rapports annuels 2023–2026 — officielles (Insee et DGI). " +
    "Précaution : l'Insee a révisé la série observée entre les rapports 2024 et 2025.";
  assert.equal(refs(t).filter(r => r[1] === "insee").length, 1);
});

test("un millésime absent du registre ne produit pas de lien mort", () => {
  assert.deepEqual(refs("COR, rapport annuel 2005 — millésime non archivé."), []);
  // 2011 compte deux rapports thématiques et aucun rapport annuel : la mention
  // est ambiguë, mieux vaut pas de lien qu'un lien arbitraire.
  assert.deepEqual(refs("COR, rapport 2011."), []);
});

test("institutions et citations nommées de la section « 50 Md€ »", () => {
  const t =
    "Sources : F. Bayrou, déclaration de politique générale, 14 janv. 2025 ; " +
    "« Retraites obligatoires et déficits publics », J.-P. Beaufret (2023) ; " +
    "Institut économique Molinari (« les retraites expliquent la moitié des déficits publics », " +
    "2023 ; déficit 53 Md€ en 2023, 2024) ; Fondapol (financement des retraites, 2025) ; " +
    "La Grande Conversation ; débats au Sénat (séance du 8 oct. 2024). Données Insee.";
  assert.deepEqual(refs(t).map(r => r[1]), [
    "bayrou-2025",
    "beaufret-2023",
    "molinari",
    "molinari-2023",
    "molinari-2024",
    "fondapol-2025",
    "grande-conversation",
    "senat-2024-10-08",
    "insee",
  ]);
});

test("OCDE, base SOCX, DREES, Eurostat, FIPECO", () => {
  assert.deepEqual(
    refs("OCDE, base SOCX, repris par le COR — rapport 2026.").map(r => r[1]),
    ["ocde", "socx", "cor-2026"]
  );
  assert.deepEqual(refs("DREES ; Eurostat ; FIPECO.").map(r => r[1]), ["drees", "eurostat", "fipeco"]);
});

test("espaces insécables des &nbsp; de index.html", () => {
  // Les chaînes ci-dessous portent de vrais U+00A0 (insécable) et U+202F (fine
  // insécable), tels que les rend un &nbsp; de index.html.
  assert.deepEqual(
    refs("Source : COR, rapports annuels 2023–2026").map(r => r[1]),
    ["cor-rapports"]
  );
  assert.deepEqual(refs("COR, rapport annuel 2019").map(r => r[1]), ["cor-2019"]);
});

test("les repérages ne se chevauchent jamais", () => {
  const t =
    "Source : COR, rapports annuels 2016–2026 — INSEE, rapport 2026, base SOCX, " +
    "rapport « Droits familiaux et conjugaux » 2025.";
  const found = matchRefs(t, DOCS);
  for (let i = 1; i < found.length; i++) {
    assert.ok(found[i].start >= found[i - 1].end, "un repérage empiète sur le précédent");
  }
});

test("registre vide : aucun lien, aucune erreur", () => {
  assert.deepEqual(matchRefs("COR, rapport annuel 2016 — INSEE.", {}), []);
});
