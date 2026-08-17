/*
 * Filet anti-dérive : les chiffres de la PROSE contre les données générées.
 * ------------------------------------------------------------------------
 * Les graphiques lisent `data/*.generated.js`, extraits des Excel du COR par
 * `tools/extract_cor.py`. Les phrases, elles, portent leurs chiffres EN DUR :
 * « les dépenses grimperaient à ~15,3 % du PIB », « 422 Md€ au total »,
 * « −2,4 % du PIB projeté en 2070 »…
 *
 * Conséquence sans ce test : au prochain rapport annuel, on relance
 * l'extraction, les COURBES se mettent à jour, et les PHRASES continuent
 * d'annoncer les chiffres de l'an dernier. Le site se contredit lui-même, en
 * silence, sur le seul terrain où il joue sa crédibilité. C'est exactement la
 * panne muette que `sources-coverage.test.mjs` neutralise pour les libellés de
 * source, et `stamp.test.mjs` pour les estampilles de version.
 *
 * Trois garanties, indépendantes :
 *
 *   1. EXACTITUDE — pour chaque fait de la table, le chiffre publié est un
 *      arrondi valide de la valeur officielle recalculée depuis les données.
 *   2. ANCRAGE — l'extrait de page cité par le fait est toujours là, mot pour
 *      mot. Si la phrase est réécrite, le fait doit être relu : on ne laisse pas
 *      une vérification pointer dans le vide.
 *   3. COUVERTURE — tout nombre suivi d'une unité, dans la prose d'index.html
 *      et dans les cartes de js/cards.js, est soit rattaché à un fait, soit
 *      déclaré non dérivé avec sa raison. Un chiffre neuf ne peut donc pas
 *      entrer dans la page sans surveillance.
 *
 * Ajouter un chiffre à la page = ajouter son fait ici (ou sa ligne dans
 * `NON_DÉRIVÉS`). C'est le prix, et c'est le but.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { figuresHtml, figuresDesCartes, versNombre, décimales, normalise } from "./_prose.mjs";

const racine = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const lire = p => readFileSync(join(racine, p), "utf8");
const évaluer = p => {
  const win = {};
  new Function("window", lire(p))(win);
  return win;
};

const SÉRIES = évaluer("data/cor-series.generated.js").COR_SERIES;
const DONNÉES = évaluer("data/data.js").COR_DATA;

const SOURCES = {
  "index.html": lire("index.html"),
  "js/cards.js": lire("js/cards.js"),
};

/* ======================================================================
 * Accès aux données officielles.
 * ==================================================================== */

/** Valeur d'une série à une abscisse donnée (échec explicite si absente). */
function à(série, x) {
  const pt = série.points.find(p => p.x === x);
  assert.ok(pt, "point x=" + x + " absent de la série " + JSON.stringify(série.label));
  return pt.y;
}

/** Projection d'un millésime de rapport donné. */
function projection(graphe, millésime) {
  const p = graphe.projections.find(q => q.year === millésime);
  assert.ok(p, "aucune projection du rapport " + millésime);
  return p;
}

/** Millésime du dernier rapport présent dans les données. */
const DERNIER_RAPPORT = Math.max(...SÉRIES.depensesPib.projections.map(p => p.year));

/** Série nommée du graphe ressources/dépenses. */
const rvd = label => {
  const s = SÉRIES.ressourcesVsDepenses.series.find(x => x.label === label);
  assert.ok(s, "série " + JSON.stringify(label) + " absente de ressourcesVsDepenses");
  return s;
};

/** Hypothèse de productivité (scénario central) retenue par un rapport. */
const productivité = millésime => {
  const r = DONNÉES.productivite.rapports.find(x => x.year === millésime);
  assert.ok(r, "productivité du rapport " + millésime + " absente");
  return r;
};

/** Colonne du tableau de bord des hypothèses, pour un millésime. */
const hypothèse = (millésime, colonne) => {
  const i = DONNÉES.hypothesesTable.colonnes.indexOf(colonne);
  assert.ok(i > 0, "colonne " + JSON.stringify(colonne) + " absente du tableau");
  const ligne = DONNÉES.hypothesesTable.lignes.find(l => l[0] === String(millésime));
  assert.ok(ligne, "ligne " + millésime + " absente du tableau des hypothèses");
  return ligne[i];
};

const SANKEY = DONNÉES.sankeyFinancement;
const ANNÉE_SANKEY = String(SANKEY.officialYear);
const TOTAL_RESSOURCES = SANKEY.totalMds[ANNÉE_SANKEY];

/*
 * Les quatre blocs de la barre de structure. La page REGROUPE certains postes
 * du COR (contributions d'équilibre + subventions aux régimes spéciaux d'un
 * côté, transferts + produits financiers de l'autre) : le regroupement est
 * annoncé sous le graphique, on le rejoue ici plutôt que de le supposer.
 */
const BLOCS = {
  cotisations: ["cotisations"],
  fiscal: ["itaf"],
  équilibre: ["equilibreFPE", "subvSpeciaux"],
  transferts: ["transferts", "autresProduits"],
};

const partSankey = (bloc, année = ANNÉE_SANKEY) => {
  const parts = SANKEY.sharesPct[année];
  assert.ok(parts, "parts du sankey absentes pour " + année);
  return BLOCS[bloc].reduce((somme, clé) => somme + parts[clé], 0);
};

const montantSankey = bloc => (partSankey(bloc) / 100) * TOTAL_RESSOURCES;

/** Poste nommé du détail 2025 des ressources. */
const poste = étiquette => {
  const d = SANKEY.detail2025.find(x => x.label === étiquette);
  assert.ok(d, "poste " + JSON.stringify(étiquette) + " absent de detail2025");
  return d.mds;
};

/**
 * La valeur la plus ÉLOIGNÉE du chiffre publié parmi plusieurs millésimes.
 *
 * Sert aux phrases qui couvrent deux rapports d'un seul chiffre (« ~83 % pour
 * les rapports 2023-2024 »). En retenant le pire cas, la dérive de l'un OU de
 * l'autre fait sortir de la tolérance — retenir le premier venu laisserait
 * l'autre glisser sans bruit.
 */
const lePlusÉloigné = (publié, valeurs) => {
  const cible = versNombre(publié);
  return valeurs.reduce((a, b) => (Math.abs(b - cible) > Math.abs(a - cible) ? b : a));
};

/* ======================================================================
 * LA TABLE DES FAITS.
 *
 * Un fait = { id, fichier, extrait, publié, exact }
 *   extrait : fragment VERBATIM de la page (entités `&nbsp;` comprises) qui
 *             contient le chiffre. C'est l'ancre : il pointe la phrase exacte
 *             dont le fait répond.
 *   publié  : le chiffre tel qu'il est écrit, normalisé (insécables → espace).
 *   exact   : la valeur officielle, recalculée depuis les données générées.
 *   écartMax + pourquoi : uniquement quand l'arrondi publié s'écarte de la
 *             règle par défaut — un demi-pas du dernier chiffre affiché, ce qui
 *             accepte l'arrondi au plus proche comme la troncature.
 * ==================================================================== */

const FAITS = [
  /* ---- Hypothèse de productivité (COR_DATA.productivite) ---- */
  {
    id: "productivité.central-jusqu-2022",
    extrait: "<strong>1,3 %</strong> par an dans les rapports jusqu'en 2022",
    publié: "1,3 %",
    exact: () => productivité(2022).central,
  },
  {
    id: "productivité.central-2023-2024",
    extrait: "<strong>1,0 %</strong> en 2023-2024",
    publié: "1,0 %",
    exact: () => lePlusÉloigné("1,0 %", [productivité(2023).central, productivité(2024).central]),
  },
  {
    id: "productivité.central-depuis-2025",
    extrait: "puis <strong>0,7 %</strong> depuis 2025.",
    publié: "0,7 %",
    exact: () => lePlusÉloigné("0,7 %", [productivité(2025).central, productivité(2026).central]),
  },
  {
    id: "productivité.scénario-2021",
    extrait: "(scénario 1,3 %) projetaient des dépenses",
    publié: "1,3 %",
    exact: () => productivité(2021).central,
  },
  {
    id: "productivité.bascule-0-7",
    extrait: "<strong>0,7 %</strong> faisait remonter la projection",
    publié: "0,7 %",
    exact: () => productivité(2025).central,
  },
  {
    id: "productivité.note-de-source",
    extrait: "(1,3&nbsp;% avant 2023)",
    publié: "1,3 %",
    exact: () => productivité(2022).central,
  },
  {
    id: "productivité.éventail-bas",
    extrait: "des scénarios de 1,0&nbsp;% à 1,8&nbsp;%",
    publié: "1,0 %",
    // L'éventail « d'avant 2022 » tel que la phrase le décrit : 2017-2021. Le
    // rapport 2016 est écarté SCIEMMENT (son maximum était 2,0 %), et la phrase
    // suivante de la page le dit.
    exact: () => Math.min(...[2017, 2018, 2019, 2020, 2021].map(a => productivité(a).min)),
  },
  {
    id: "productivité.éventail-haut",
    extrait: "des scénarios de 1,0&nbsp;% à 1,8&nbsp;%",
    publié: "1,8 %",
    exact: () => Math.max(...[2017, 2018, 2019, 2020, 2021].map(a => productivité(a).max)),
  },
  {
    id: "productivité.référence-2025",
    extrait: "puis retenu 0,7&nbsp;% comme référence en 2025",
    publié: "0,7 %",
    exact: () => productivité(2025).central,
  },
  {
    id: "productivité.longtemps-retenue",
    extrait: "en dessous des 1,3&nbsp;% longtemps retenus",
    publié: "1,3 %",
    exact: () => productivité(2021).central,
  },
  {
    id: "productivité.glossaire-avant",
    extrait: "abaissé son hypothèse de 1,3 % à 0,7 %",
    publié: "1,3 %",
    exact: () => productivité(2022).central,
  },
  {
    id: "productivité.glossaire-après",
    extrait: "abaissé son hypothèse de 1,3 % à 0,7 %",
    publié: "0,7 %",
    exact: () => productivité(DERNIER_RAPPORT).central,
  },

  /* ---- Dépenses en % du PIB (COR_SERIES.depensesPib) ---- */
  {
    id: "dépenses.projection-2021",
    extrait: "jusqu'à ~12,3 % du PIB en 2070",
    publié: "12,3 %",
    exact: () => à(projection(SÉRIES.depensesPib, 2021), 2070),
  },
  {
    id: "dépenses.projection-2025",
    extrait: "faisait remonter la projection à ~14,2 %",
    publié: "14,2 %",
    exact: () => à(projection(SÉRIES.depensesPib, 2025), 2070),
  },
  {
    id: "dépenses.projection-2026",
    extrait: "les dépenses grimperaient à <strong>~15,3 % du PIB",
    publié: "15,3 %",
    exact: () => à(projection(SÉRIES.depensesPib, DERNIER_RAPPORT), 2070),
  },
  {
    id: "dépenses.ciseaux-2070",
    extrait: "<strong>dépenses qui remontent</strong> (15,3 % en 2070)",
    publié: "15,3 %",
    exact: () => à(rvd("Dépenses"), 2070),
  },

  /* ---- Solde du système (COR_SERIES.solde) ---- */
  {
    id: "solde.meilleur-2022",
    extrait: "<strong>+0,9 % du PIB</strong> (rapport 2022)",
    publié: "+0,9 %",
    exact: () => à(projection(SÉRIES.solde, 2022), 2070),
  },
  {
    id: "solde.pire-2026",
    extrait: "(rapport 2022) à <strong>−2,4 %</strong>",
    publié: "−2,4 %",
    exact: () => à(projection(SÉRIES.solde, DERNIER_RAPPORT), 2070),
  },
  {
    id: "solde.projection-2025",
    extrait: "contre −1,4 % en 2025",
    publié: "−1,4 %",
    exact: () => à(projection(SÉRIES.solde, 2025), 2070),
  },
  {
    id: "solde.projection-2023-2024",
    extrait: "≈−0,8 % en 2023-2024",
    publié: "−0,8 %",
    exact: () =>
      lePlusÉloigné("−0,8 %", [
        à(projection(SÉRIES.solde, 2023), 2070),
        à(projection(SÉRIES.solde, 2024), 2070),
      ]),
  },
  {
    id: "solde.long-terme-constat",
    extrait: "(−2,4&nbsp;% du PIB projeté en 2070)",
    publié: "−2,4 %",
    exact: () => à(projection(SÉRIES.solde, DERNIER_RAPPORT), 2070),
  },
  {
    id: "solde.long-terme-décryptage",
    extrait: "(solde projeté à −2,4&nbsp;% du PIB en 2070)",
    publié: "−2,4 %",
    exact: () => à(projection(SÉRIES.solde, DERNIER_RAPPORT), 2070),
  },

  /* ---- Ressources contre dépenses (COR_SERIES.ressourcesVsDepenses) ---- */
  {
    id: "ressources.projection-2070",
    extrait: "(12,9 % du PIB en 2070",
    publié: "12,9 %",
    exact: () => à(rvd("Ressources"), 2070),
  },
  {
    id: "ressources.aujourd-hui",
    extrait: "contre 14,0 %",
    publié: "14,0 %",
    // « aujourd'hui » = l'année du rapport en cours, pas une année figée : la
    // phrase suivra ainsi le prochain millésime sans réécriture.
    exact: () => à(rvd("Ressources"), DERNIER_RAPPORT),
  },

  /* ---- Niveau de vie relatif (COR_SERIES.niveauVie) ---- */
  {
    id: "niveauVie.rapports-2023-2024",
    extrait: "~83 % en 2070 pour les rapports 2023-2024",
    publié: "83 %",
    exact: () =>
      lePlusÉloigné("83 %", [
        à(projection(SÉRIES.niveauVie, 2023), 2070),
        à(projection(SÉRIES.niveauVie, 2024), 2070),
      ]),
  },
  {
    id: "niveauVie.rapport-2025",
    extrait: "~87 % pour 2025",
    publié: "87 %",
    exact: () => à(projection(SÉRIES.niveauVie, 2025), 2070),
  },
  {
    id: "niveauVie.rapport-2026",
    extrait: "<strong>~90 %",
    publié: "90 %",
    exact: () => à(projection(SÉRIES.niveauVie, DERNIER_RAPPORT), 2070),
  },

  /* ---- Comparaison internationale (COR_SERIES.international) ---- */
  {
    id: "international.france",
    extrait: "(14,3 % du PIB,",
    publié: "14,3 %",
    exact: () => SÉRIES.international.countries.find(c => c.name === "France").total,
  },

  /* ---- Structure du financement (COR_DATA.sankeyFinancement) ---- */
  {
    id: "financement.total",
    extrait: "422&nbsp;Md€ au total",
    publié: "422 Md€",
    exact: () => TOTAL_RESSOURCES,
  },
  {
    id: "financement.reste-hors-cotisations",
    extrait: "<strong>145&nbsp;Md€</strong>",
    publié: "145 Md€",
    exact: () => TOTAL_RESSOURCES - montantSankey("cotisations"),
  },
  {
    id: "financement.part-fiscale-2004",
    extrait: "<strong>7&nbsp;% en 2004 à",
    publié: "7 %",
    exact: () => partSankey("fiscal", "2004"),
  },
  {
    id: "financement.part-fiscale-2025",
    extrait: "15&nbsp;% en 2025</strong>",
    publié: "15 %",
    exact: () => partSankey("fiscal"),
  },

  // Les quatre parts, telles que les énonce l'`aria-label` de la barre — seule
  // version de l'information pour qui n'a pas l'image.
  {
    id: "financement.aria.cotisations",
    extrait: "cotisations directes 65,6 %",
    publié: "65,6 %",
    exact: () => partSankey("cotisations"),
  },
  {
    id: "financement.aria.fiscal",
    extrait: "financement fiscal 15,3 %",
    publié: "15,3 %",
    exact: () => partSankey("fiscal"),
  },
  {
    id: "financement.aria.équilibre",
    extrait: "subventions d'équilibre 13,5 %",
    publié: "13,5 %",
    exact: () => partSankey("équilibre"),
  },
  {
    id: "financement.aria.transferts",
    extrait: "produits financiers 5,6 %",
    publié: "5,6 %",
    exact: () => partSankey("transferts"),
  },

  // Largeur CSS de chaque segment : c'est le DESSIN de la barre. Une largeur
  // désaccordée de sa part ferait mentir l'image sans toucher au texte.
  {
    id: "financement.largeur.cotisations",
    extrait: 'style="width:65.6%;background:#1f4e79"',
    publié: "65.6%",
    exact: () => partSankey("cotisations"),
  },
  {
    id: "financement.largeur.fiscal",
    extrait: 'style="width:15.3%;background:#7b1fa2"',
    publié: "15.3%",
    exact: () => partSankey("fiscal"),
  },
  {
    id: "financement.largeur.équilibre",
    extrait: 'style="width:13.5%;background:#2f6fb0"',
    publié: "13.5%",
    exact: () => partSankey("équilibre"),
  },
  {
    id: "financement.largeur.transferts",
    extrait: 'style="width:5.6%;background:#ff7f0e"',
    publié: "5.6%",
    exact: () => partSankey("transferts"),
  },

  // Étiquettes affichées DANS les segments : arrondies à l'entier faute de place.
  {
    id: "financement.segment.cotisations",
    extrait: '#1f4e79">66&nbsp;%</div>',
    publié: "66 %",
    exact: () => partSankey("cotisations"),
  },
  {
    id: "financement.segment.fiscal",
    extrait: '#7b1fa2">15&nbsp;%</div>',
    publié: "15 %",
    exact: () => partSankey("fiscal"),
  },
  {
    id: "financement.segment.équilibre",
    extrait: '#2f6fb0">13&nbsp;%</div>',
    publié: "13 %",
    exact: () => partSankey("équilibre"),
  },

  // Légende : part et montant de chaque bloc.
  {
    id: "financement.légende.cotisations-part",
    extrait: "<b>Cotisations directes</b> — 65,6&nbsp;%",
    publié: "65,6 %",
    exact: () => partSankey("cotisations"),
  },
  {
    id: "financement.légende.cotisations-montant",
    extrait: "65,6&nbsp;% <small>(277&nbsp;Md€)</small>",
    publié: "277 Md€",
    exact: () => montantSankey("cotisations"),
  },
  {
    id: "financement.légende.fiscal-part",
    extrait: "généralisée) — 15,3&nbsp;%",
    publié: "15,3 %",
    exact: () => partSankey("fiscal"),
  },
  {
    id: "financement.légende.fiscal-montant",
    extrait: "15,3&nbsp;% <small>(65&nbsp;Md€)</small>",
    publié: "65 Md€",
    exact: () => montantSankey("fiscal"),
  },
  {
    id: "financement.légende.équilibre-part",
    extrait: "régimes spéciaux) — 13,5&nbsp;%",
    publié: "13,5 %",
    exact: () => partSankey("équilibre"),
  },
  {
    id: "financement.légende.équilibre-montant",
    extrait: "13,5&nbsp;% <small>(57&nbsp;Md€)</small>",
    publié: "57 Md€",
    exact: () => montantSankey("équilibre"),
  },
  {
    id: "financement.légende.transferts-part",
    extrait: "produits financiers — 5,6&nbsp;%",
    publié: "5,6 %",
    exact: () => partSankey("transferts"),
  },
  {
    id: "financement.légende.transferts-montant",
    extrait: "5,6&nbsp;% <small>(23&nbsp;Md€)</small>",
    publié: "23 Md€",
    exact: () => montantSankey("transferts"),
    // 23,51 Md€ arrondi au plus proche donnerait 24, et la légende afficherait
    // 277 + 65 + 57 + 24 = 423 Md€ sous un total annoncé à 422. Le dernier bloc
    // absorbe donc l'écart d'arrondi (méthode du plus fort reste) : c'est un
    // choix de présentation, pas une erreur de donnée, et il vaut d'être écrit.
    écartMax: 0.6,
    pourquoi:
      "arrondi ajusté vers le bas pour que la somme des quatre blocs " +
      "affiche exactement le total publié (422 Md€)",
  },
  {
    id: "financement.transferts-cnaf",
    extrait: "<strong>11,2&nbsp;Md€</strong>",
    publié: "11,2 Md€",
    exact: () => poste("Transferts CNAF"),
  },
  {
    id: "financement.transferts-unédic",
    extrait: "<strong>3,9&nbsp;Md€</strong>",
    publié: "3,9 Md€",
    exact: () => poste("Transferts Unédic"),
  },
  {
    id: "financement.fiscalisation",
    extrait: "<strong>64,7&nbsp;Md€</strong>",
    publié: "64,7 Md€",
    // Deux chemins mènent à ce chiffre : le détail des postes fiscaux de 2025 et
    // la série `fiscalisation`. On additionne le détail, et le test structurel
    // plus bas vérifie que les deux concordent.
    exact: () =>
      ["CSG", "ITAF sur revenus d'activité", "ITAF sur la consommation", "Autres ITAF"].reduce(
        (somme, clé) => somme + poste(clé),
        0,
      ),
  },

  /* ---- Hypothèses démographiques ----
   * Sans unité, donc invisibles au balayage de couverture : ces faits sont leur
   * seule protection. Ce sont pourtant les chiffres que le rapport 2026 a le
   * plus bougés. */
  {
    id: "démographie.fécondité-2026",
    extrait: "(fécondité abaissée à 1,45)",
    publié: "1,45",
    exact: () => versNombre(hypothèse(DERNIER_RAPPORT, "Fécondité")),
  },
  {
    id: "démographie.fécondité-2026-bis",
    extrait: "<strong>fécondité abaissée à\n            1,45</strong>",
    publié: "1,45",
    exact: () => versNombre(hypothèse(DERNIER_RAPPORT, "Fécondité")),
  },
  {
    id: "démographie.fécondité-observée",
    extrait: "(≈1,56 en 2025 contre 1,80–1,95 supposé)",
    publié: "1,56",
    exact: () => à(SÉRIES.fecondite.realise, 2025),
  },
  {
    id: "démographie.fécondité-hypothèse-2022-2025",
    extrait: "(≈1,56 en 2025 contre 1,80–1,95 supposé)",
    publié: "1,80",
    exact: () => versNombre(hypothèse(2025, "Fécondité")),
  },
  {
    id: "démographie.fécondité-hypothèse-2019-2021",
    extrait: "(≈1,56 en 2025 contre 1,80–1,95 supposé)",
    publié: "1,95",
    exact: () => versNombre(hypothèse(2021, "Fécondité")),
  },
  {
    id: "démographie.solde-migratoire-2026",
    extrait: "<strong>solde migratoire relevé à\n            +150 000/an</strong>",
    publié: "150 000",
    exact: () => versNombre(hypothèse(DERNIER_RAPPORT, "Solde migratoire").replace("/ an", "")),
  },

  /* ---- Cartes du carrousel (js/cards.js) ----
   * Ce sont les premiers chiffres que voit un visiteur, et ils redisent des
   * claims d'index.html : ils dérivent donc deux fois. */
  {
    id: "cartes.solde-meilleur",
    fichier: "js/cards.js",
    extrait: "le solde projeté en 2070 va de +0,9 %",
    publié: "+0,9 %",
    exact: () => à(projection(SÉRIES.solde, 2022), 2070),
  },
  {
    id: "cartes.solde-pire",
    fichier: "js/cards.js",
    extrait: "va de +0,9 % à −2,4 % du PIB",
    publié: "−2,4 %",
    exact: () => à(projection(SÉRIES.solde, DERNIER_RAPPORT), 2070),
  },
  {
    id: "cartes.productivité-avant",
    fichier: "js/cards.js",
    extrait: '"De 1,3 % à 0,7 %',
    publié: "1,3 %",
    exact: () => productivité(2022).central,
  },
  {
    id: "cartes.productivité-après",
    fichier: "js/cards.js",
    extrait: '"De 1,3 % à 0,7 %',
    publié: "0,7 %",
    exact: () => productivité(DERNIER_RAPPORT).central,
  },
];

/* ======================================================================
 * Chiffres de la prose qui NE dérivent PAS des données du COR.
 *
 * Chacun doit dire d'où il vient. La liste est volontairement pénible à
 * allonger : c'est ce qui empêche d'y glisser un chiffre officiel non vérifié.
 * `contexte` est un fragment verbatim de la page — il limite la dispense aux
 * lignes concernées, au lieu d'exempter le chiffre partout à la fois.
 * ==================================================================== */

const NON_DÉRIVÉS = [
  // — Définitions et repères de lecture —
  {
    figure: "5 ans",
    contexte: "observé en moyenne mobile 5 ans",
    pourquoi: "paramètre de lissage du graphique, pas une donnée du COR",
  },
  {
    figure: "100 %",
    contexte: "À <strong>100 %</strong>, les retraités",
    pourquoi: "définition de la parité de niveau de vie",
  },
  {
    figure: "100 %",
    contexte: "(100 % = parité)",
    pourquoi: "définition de la parité de niveau de vie",
  },
  {
    figure: "100 %",
    contexte: "parité (~100 %) aujourd'hui",
    pourquoi: "définition de la parité de niveau de vie",
  },
  {
    figure: "100 %",
    contexte: "100 % = parité.",
    pourquoi: "définition de la parité, entrée de glossaire",
  },
  {
    figure: "100 %",
    fichier: "js/cards.js",
    contexte: "Proche de la parité aujourd'hui (~100 %)",
    pourquoi: "définition de la parité de niveau de vie",
  },
  {
    figure: "70 %",
    contexte: "passé de ~70 % en 1970",
    pourquoi:
      "repère historique de 1970 — la série générée du niveau de vie ne " +
      "commence qu'en 1996, ce chiffre ne peut donc pas en être tiré",
  },
  {
    figure: "2 €",
    contexte: "à peine <strong>2&nbsp;€ sur 3</strong> viennent des cotisations",
    pourquoi: "reformulation en langage courant de la part de 65,6 %, déjà vérifiée",
  },
  {
    figure: "2 €",
    contexte: "<strong>À peine 2&nbsp;€ sur 3 viennent des cotisations directes</strong>",
    pourquoi: "reformulation en langage courant de la part de 65,6 %, déjà vérifiée",
  },
  {
    figure: "0,1 pt",
    contexte: "≤&nbsp;0,1 pt de PIB",
    pourquoi: "seuil de tolérance de la note méthodologique",
  },

  // — États initiaux des curseurs du simulateur —
  {
    figure: "+0 mois",
    contexte: "<strong id=\"lv-age-out\">+0 mois</strong>",
    pourquoi: "position de départ du curseur, réécrite par js/app.js",
  },
  {
    figure: "+0,0 pt",
    contexte: "<strong id=\"lv-cot-out\">+0,0 pt</strong>",
    pourquoi: "position de départ du curseur, réécrite par js/app.js",
  },
  {
    figure: "−0,0 %",
    contexte: "<strong id=\"lv-pen-out\">−0,0 %</strong>",
    pourquoi: "position de départ du curseur, réécrite par js/app.js",
  },

  /* — Section « dette » : chiffres du DÉBAT PUBLIC —
   *
   * Toute cette section rapporte des affirmations de tiers (F. Bayrou,
   * J. Beaufret, Fondapol, N. Marques / Institut économique Molinari) pour les
   * confronter. Les rattacher aux séries du COR serait un contresens : ce ne
   * sont pas des données du COR, et c'est précisément ce que la section
   * démontre. Leurs sources sont citées dans la page.
   */
  {
    figure: "−5 Md€",
    contexte: "(de l'ordre de −1 à −5&nbsp;Md€) et le vrai",
    pourquoi: "ordre de grandeur du solde courant cité dans le débat",
  },
  {
    figure: "−5 Md€",
    contexte: "(de l'ordre de −1 à −5&nbsp;Md€)&nbsp;: il ne «&nbsp;pèse&nbsp;»",
    pourquoi: "ordre de grandeur du solde courant cité dans le débat",
  },
  {
    figure: "87 Md€",
    contexte: "un déficit réel de ≈&nbsp;87&nbsp;Md€&nbsp;?",
    pourquoi: "chiffrage de la lecture critique « avant subventions d'équilibre »",
  },
  {
    figure: "−87 Md€",
    contexte: "alors ≈ <strong>−87&nbsp;Md€ en 2025",
    pourquoi: "chiffrage de la lecture critique « avant subventions d'équilibre »",
  },
  {
    figure: "2,9 %",
    contexte: "<strong>−87&nbsp;Md€ en 2025 (~2,9&nbsp;% du",
    pourquoi: "chiffrage de la lecture critique, rapporté au PIB",
  },
  {
    figure: "87 Md€",
    contexte: "« déficit caché de 87&nbsp;Md€ »",
    pourquoi: "citation de la lecture critique, discutée dans la même phrase",
  },
  {
    figure: "87 Md€",
    contexte: "voire <strong>≈&nbsp;87&nbsp;Md€ en 2025",
    pourquoi: "chiffrage de la lecture critique",
  },
  {
    figure: "2,9 %",
    contexte: "≈&nbsp;87&nbsp;Md€ en 2025 (~2,9&nbsp;% du PIB)</strong>",
    pourquoi: "chiffrage de la lecture critique, rapporté au PIB",
  },
  {
    figure: "1 000 milliards",
    contexte: "1&nbsp;000&nbsp;milliards d'euros de dette supplémentaire",
    pourquoi: "citation de F. Bayrou",
  },
  {
    figure: "1000 milliards",
    contexte: "Sur environ 1000 milliards d'euros de dette",
    pourquoi: "citation de F. Bayrou, reprise dans l'aria-label du graphique",
  },
  {
    figure: "1 000 Md€",
    contexte: "sur 10&nbsp;ans (~1&nbsp;000&nbsp;Md€)",
    pourquoi: "citation de F. Bayrou",
  },
  {
    figure: "1 000 Md€",
    contexte: "des ~1&nbsp;000&nbsp;Md€ de dette nouvelle",
    pourquoi: "citation de F. Bayrou",
  },
  {
    figure: "10 ans",
    contexte: "Dette publique supplémentaire sur 10&nbsp;ans",
    pourquoi: "fenêtre temporelle de l'affirmation de F. Bayrou",
  },
  {
    figure: "50 %",
    contexte: "les retraites représentent 50&nbsp;% de ce",
    pourquoi: "citation de F. Bayrou",
  },
  {
    figure: "50 %",
    contexte: "François Bayrou attribue 50 % aux retraites",
    pourquoi: "citation de F. Bayrou, reprise dans l'aria-label du graphique",
  },
  {
    figure: "50 %",
    contexte: 'class="struct-seg" style="width:50%;background:#c0392b"',
    pourquoi: "part attribuée aux retraites selon F. Bayrou",
  },
  {
    figure: "50 %",
    contexte: 'class="struct-seg" style="width:50%;background:#7f8c8d"',
    pourquoi: "complément de la part attribuée par F. Bayrou",
  },
  {
    figure: "45 Md€",
    contexte: "<strong>40 à 45&nbsp;Md€ par an</strong>",
    pourquoi: "concours de l'État aux régimes, ordre de grandeur cité dans le débat",
  },
  {
    figure: "45 Md€",
    contexte: "≈&nbsp;40‑45&nbsp;Md€/an de concours de l'État",
    pourquoi: "concours de l'État aux régimes, ordre de grandeur cité dans le débat",
  },
  {
    figure: "45 Md€",
    contexte: "pour équilibrer les régimes (≈&nbsp;40‑45&nbsp;Md€/an)",
    pourquoi: "concours de l'État aux régimes, ordre de grandeur cité dans le débat",
  },
  {
    figure: "45 Md€",
    contexte: "de l'ordre de <strong>40‑45&nbsp;Md€/an</strong>",
    pourquoi: "chiffre avancé par F. Bayrou",
  },
  {
    figure: "500 Md€",
    contexte: "cumulés) — ≈&nbsp;500&nbsp;Md€",
    pourquoi: "moitié des ~1 000 Md€ selon F. Bayrou",
  },
  {
    figure: "500 Md€",
    contexte: "autres dépenses publiques) — ≈&nbsp;500&nbsp;Md€",
    pourquoi: "moitié des ~1 000 Md€ selon F. Bayrou",
  },
  {
    figure: "53 Md€",
    contexte: "à <strong>53&nbsp;Md€ en 2023</strong>",
    pourquoi: "chiffrage de l'Institut économique Molinari",
  },
  {
    figure: "2 %",
    contexte: "en 2023</strong> (~2&nbsp;%",
    pourquoi: "chiffrage de l'Institut économique Molinari, rapporté au PIB",
  },
  {
    figure: "943 Md€",
    contexte: "≈&nbsp;943&nbsp;Md€ de déficits depuis 2002",
    pourquoi: "chiffrage de l'Institut économique Molinari",
  },
  {
    figure: "53 Md€",
    contexte: "déficit 53&nbsp;Md€ en 2023, 2024)",
    pourquoi: "renvoi bibliographique au chiffrage Molinari",
  },
];

/* ======================================================================
 * Outils de localisation.
 * ==================================================================== */

/**
 * Lignes couvertes par un fragment, pour chacune de ses occurrences.
 * `null` si le fragment est absent — l'appelant en fait un échec.
 */
function lignesDe(source, fragment) {
  let i = source.indexOf(fragment);
  if (i === -1) return null;
  const lignes = new Set();
  const hauteur = fragment.split("\n").length - 1;
  while (i !== -1) {
    const première = source.slice(0, i).split("\n").length;
    for (let l = première; l <= première + hauteur; l++) lignes.add(l);
    i = source.indexOf(fragment, i + 1);
  }
  return lignes;
}

const fichierDe = entrée => entrée.fichier || "index.html";

/** Tolérance par défaut : un demi-pas du dernier chiffre publié. */
const toléranceDe = fait =>
  fait.écartMax ?? 0.5 * Math.pow(10, -décimales(fait.publié));

/* ======================================================================
 * 1. EXACTITUDE — le chiffre publié est un arrondi valide de la donnée.
 * ==================================================================== */

test("chaque chiffre publié est un arrondi valide de la donnée officielle", () => {
  const écarts = [];
  for (const fait of FAITS) {
    const attendu = fait.exact();
    assert.ok(
      Number.isFinite(attendu),
      fait.id + " : la donnée officielle est illisible (" + attendu + ")",
    );
    const publié = versNombre(fait.publié);
    const écart = Math.abs(publié - attendu);
    const tolérance = toléranceDe(fait);
    if (écart > tolérance + 1e-9) {
      écarts.push(
        "  " +
          fait.id +
          " : la page dit « " +
          fait.publié +
          " », les données disent " +
          attendu.toFixed(3) +
          " (écart " +
          écart.toFixed(3) +
          " > tolérance " +
          tolérance +
          ")",
      );
    }
  }
  assert.equal(
    écarts.length,
    0,
    "Des chiffres de la page ne correspondent plus aux données générées :\n" +
      écarts.join("\n") +
      "\n\nCorriger la PHRASE dans la page (et son fait ici), ou documenter " +
      "l'arrondi avec `écartMax` + `pourquoi`.",
  );
});

test("toute tolérance élargie est justifiée par écrit", () => {
  for (const fait of FAITS) {
    if (fait.écartMax === undefined) continue;
    const défaut = 0.5 * Math.pow(10, -décimales(fait.publié));
    if (fait.écartMax <= défaut) continue;
    assert.ok(
      fait.pourquoi && fait.pourquoi.length > 20,
      fait.id + " : `écartMax` dépasse l'arrondi normal sans `pourquoi` explicite.",
    );
  }
});

/* ======================================================================
 * 2. ANCRAGE — l'extrait cité est toujours dans la page, mot pour mot.
 * ==================================================================== */

test("chaque fait pointe une phrase qui existe encore", () => {
  const perdus = [];
  for (const fait of FAITS) {
    const fichier = fichierDe(fait);
    const source = SOURCES[fichier];
    assert.ok(source, fait.id + " : fichier inconnu " + fichier);
    if (!source.includes(fait.extrait)) {
      perdus.push("  " + fait.id + " (" + fichier + ") : " + JSON.stringify(fait.extrait));
    }
  }
  assert.equal(
    perdus.length,
    0,
    "Des faits citent une phrase qui n'existe plus :\n" +
      perdus.join("\n") +
      "\n\nLa phrase a été réécrite : relire le chiffre à la source, puis mettre " +
      "`extrait` à jour. Ne jamais se contenter de recopier le nouveau texte.",
  );
});

test("chaque dispense de NON_DÉRIVÉS pointe une phrase qui existe encore", () => {
  const perdus = [];
  for (const entrée of NON_DÉRIVÉS) {
    const source = SOURCES[fichierDe(entrée)];
    if (!source.includes(entrée.contexte)) {
      perdus.push("  " + entrée.figure + " : " + JSON.stringify(entrée.contexte));
    }
  }
  assert.equal(
    perdus.length,
    0,
    "Des dispenses ne correspondent à aucune phrase de la page :\n" +
      perdus.join("\n") +
      "\n\nSi le passage a disparu, retirer la dispense — sinon elle couvrira " +
      "un jour un chiffre qu'elle n'a jamais examiné.",
  );
});

test("chaque dispense dit d'où vient le chiffre", () => {
  for (const entrée of NON_DÉRIVÉS) {
    assert.ok(
      entrée.pourquoi && entrée.pourquoi.length > 15,
      "Dispense sans justification utilisable : " + entrée.figure + " / " + entrée.contexte,
    );
  }
});

/* ======================================================================
 * 3. COUVERTURE — aucun chiffre de la prose n'échappe au filet.
 * ==================================================================== */

/** Index { fichier → [{ figure, lignes }] } des faits et des dispenses. */
function indexer(entrées) {
  const par = {};
  for (const e of entrées) {
    const fichier = fichierDe(e);
    const lignes = lignesDe(SOURCES[fichier], e.extrait ?? e.contexte);
    if (!lignes) continue; // absence déjà signalée par les tests d'ancrage
    (par[fichier] ||= []).push({ figure: normalise(e.figure ?? e.publié), lignes });
  }
  return par;
}

test("aucun chiffre de la prose n'échappe au filet", () => {
  const faits = indexer(FAITS);
  const dispenses = indexer(NON_DÉRIVÉS);

  const cartes = figuresDesCartes(SOURCES["js/cards.js"]);
  assert.ok(
    cartes,
    "Le tableau `const cards = [ … ];` de js/cards.js n'est plus reconnaissable : " +
      "le balayage des cartes ne mesurerait plus rien. Mettre à jour " +
      "`régionDesCartes` dans _prose.mjs.",
  );

  const relevés = {
    "index.html": figuresHtml(SOURCES["index.html"]),
    "js/cards.js": cartes,
  };

  const orphelins = [];
  for (const [fichier, figures] of Object.entries(relevés)) {
    assert.ok(figures.length > 0, "Aucun chiffre relevé dans " + fichier + " : balayage cassé ?");
    for (const { ligne, figure, source } of figures) {
      const couvert = (liste, f) =>
        (liste[fichier] || []).some(e => e.figure === f && e.lignes.has(ligne));
      if (couvert(faits, figure) || couvert(dispenses, figure)) continue;
      orphelins.push(
        "  " + fichier + ":" + ligne + "  « " + figure + " »  (" + source + ")",
      );
    }
  }

  assert.equal(
    orphelins.length,
    0,
    "Des chiffres de la prose ne sont rattachés à rien :\n" +
      orphelins.join("\n") +
      "\n\nSoit ils viennent des données du COR — ajouter un fait dans `FAITS` " +
      "qui les recalcule ; soit non — les inscrire dans `NON_DÉRIVÉS` avec leur " +
      "provenance. C'est ce choix, écrit, qui empêche un chiffre faux de vivre " +
      "dans la page pendant un an.",
  );
});

/* ======================================================================
 * 4. CLAIMS STRUCTURELS — les phrases qui décrivent la FORME des données.
 *
 * Ces affirmations ne portent pas un chiffre mais un rang, un nombre de
 * rapports, un extremum. Elles deviennent fausses au prochain millésime sans
 * qu'aucune valeur publiée n'ait bougé — donc sans qu'aucun test ci-dessus ne
 * réagisse.
 * ==================================================================== */

const EN_LETTRES = {
  neuf: 9,
  dix: 10,
  onze: 11,
  douze: 12,
  treize: 13,
  quatorze: 14,
  quinze: 15,
};

test("« Sur N rapports superposés » compte les projections réellement tracées", () => {
  const attendu = SÉRIES.solde.projections.length;
  for (const fichier of ["index.html", "js/cards.js"]) {
    const m = SOURCES[fichier].match(/Sur (\w+) rapports superposés/);
    assert.ok(m, "la phrase « Sur … rapports superposés » a disparu de " + fichier);
    const dit = EN_LETTRES[m[1]];
    assert.ok(
      dit !== undefined,
      fichier + " : nombre en lettres non reconnu (« " + m[1] + " ») — compléter EN_LETTRES.",
    );
    assert.equal(
      dit,
      attendu,
      fichier +
        " annonce « " +
        m[1] +
        " rapports superposés » alors que le graphique du solde en trace " +
        attendu +
        ". Le prochain rapport annuel rend cette phrase fausse : la mettre à jour.",
    );
  }
});

test("les bornes « va de +0,9 % à −2,4 % » sont bien les extrêmes du solde", () => {
  // Tous les millésimes ne vont pas jusqu'en 2070 : le rapport 2016 s'arrête à
  // 2060. On ne compare que les projections qui atteignent l'horizon dont parle
  // la phrase — sinon le test échouerait sur une série qu'elle ne cite pas.
  const à2070 = SÉRIES.solde.projections
    .filter(p => p.points.some(q => q.x === 2070))
    .map(p => ({ year: p.year, y: à(p, 2070) }));
  assert.ok(à2070.length >= 2, "moins de deux projections atteignent 2070 : phrase à revoir");
  const meilleur = à2070.reduce((a, b) => (b.y > a.y ? b : a));
  const pire = à2070.reduce((a, b) => (b.y < a.y ? b : a));
  assert.equal(
    meilleur.year,
    2022,
    "La page attribue le solde le plus FAVORABLE au rapport 2022 ; c'est " +
      "désormais celui de " +
      meilleur.year +
      ". Réécrire la phrase.",
  );
  assert.equal(
    pire.year,
    DERNIER_RAPPORT,
    "La page présente le dernier rapport comme le plus DÉGRADÉ ; c'est " +
      "désormais celui de " +
      pire.year +
      ". Réécrire la phrase.",
  );
});

test("« 2ᵉ derrière l'Italie » correspond au classement des dépenses", () => {
  const classement = [...SÉRIES.international.countries].sort((a, b) => b.total - a.total);
  assert.ok(
    SOURCES["index.html"].includes("2ᵉ derrière l'Italie"),
    "la phrase « 2ᵉ derrière l'Italie » a disparu : vérifier le classement.",
  );
  assert.equal(
    classement[0].name,
    "Italie",
    "La page dit la France 2ᵉ derrière l'Italie ; le 1er est maintenant " + classement[0].name + ".",
  );
  assert.equal(
    classement[1].name,
    "France",
    "La page dit la France 2ᵉ ; elle est maintenant " +
      (classement.findIndex(c => c.name === "France") + 1) +
      "ᵉ.",
  );
});

test("les deux chemins vers la fiscalisation 2025 concordent", () => {
  // La vignette « 64,7 Md€ » additionne les postes fiscaux du détail 2025 ; la
  // courbe de la section, elle, lit la série `fiscalisation`. Deux sources pour
  // un même chiffre : si elles divergent, l'une des deux est périmée.
  const parLeDétail = ["CSG", "ITAF sur revenus d'activité", "ITAF sur la consommation", "Autres ITAF"].reduce(
    (somme, clé) => somme + poste(clé),
    0,
  );
  const parLaSérie = à(DONNÉES.fiscalisation.realise, SANKEY.officialYear);
  assert.ok(
    Math.abs(parLeDétail - parLaSérie) < 0.05,
    "Le détail des postes fiscaux de " +
      SANKEY.officialYear +
      " donne " +
      parLeDétail.toFixed(2) +
      " Md€, la série `fiscalisation` donne " +
      parLaSérie +
      " Md€.",
  );
});

test("les quatre blocs de la barre de structure couvrent bien tout le total", () => {
  const somme = Object.keys(BLOCS).reduce((s, bloc) => s + partSankey(bloc), 0);
  assert.ok(
    Math.abs(somme - 100) < 0.05,
    "Les quatre blocs de `.struct-bar` totalisent " +
      somme.toFixed(3) +
      " % : un poste des données du COR n'est plus rattaché à un bloc, " +
      "donc absent de la barre et de son aria-label.",
  );
});
