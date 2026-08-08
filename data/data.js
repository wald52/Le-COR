/*
 * Données du projet « Le COR sous l'œil des citoyens »
 * -----------------------------------------------------
 * Ce fichier rassemble les séries affichées par le site.
 *
 * PRINCIPE DE TRANSPARENCE
 * Chaque série indique sa source. On distingue deux niveaux :
 *   - "sourced"      : valeur reprise telle quelle d'un document du COR / de l'INSEE.
 *   - "interpolated" : point intermédiaire reconstitué pour tracer la courbe
 *                      (les extrémités, elles, sont sourcées). Voir l'onglet
 *                      « Méthode & sources ».
 *
 * PÉRIMÈTRE
 * Les séries extraites automatiquement des fichiers Excel du COR vivent dans
 * data/cor-series.generated.js (window.COR_SERIES) : elles ne sont PAS
 * dupliquées ici. Ce fichier ne porte que les séries saisies à la main.
 *
 * COMMENT METTRE À JOUR ?
 * Les fichiers Excel du COR contiennent les séries complètes année par année.
 * Pour remplacer une courbe par les chiffres exacts, il suffit d'éditer le
 * tableau "points" correspondant ci-dessous : aucune autre modification de code
 * n'est nécessaire.
 */

window.COR_DATA = {

  /* =========================================================================
   * 1. HYPOTHÈSE DE PRODUCTIVITÉ — le grand revirement
   *    Les scénarios de productivité du travail à long terme, rapport par
   *    rapport. C'est l'hypothèse qui a le plus changé… et qui fait tout
   *    basculer dans les projections financières.
   * ====================================================================== */
  productivite: {
    title: "Le COR a discrètement abaissé son hypothèse de productivité",
    subtitle: "Croissance annuelle de la productivité du travail retenue à long terme (en %)",
    yLabel: "% / an",
    note: "Jusqu'en 2021, l'éventail allait de 1,0 % à 1,8 % (et même 2,0 % en 2016). À partir de 2022, le COR décale tous ses scénarios vers le bas (0,7 % à 1,6 %), puis retient 0,7 % comme référence en 2025 — confirmé en 2026.",
    source: "COR, rapports annuels 2016 à 2026 (scénarios de productivité des fichiers de résultats).",
    // Pour chaque rapport : éventail des scénarios + scénario de référence.
    rapports: [
      { year: 2016, min: 1.0, max: 2.0, central: 1.3 },
      { year: 2017, min: 1.0, max: 1.8, central: 1.3 },
      { year: 2018, min: 1.0, max: 1.8, central: 1.3 },
      { year: 2019, min: 1.0, max: 1.8, central: 1.3 },
      { year: 2020, min: 1.0, max: 1.8, central: 1.3 },
      { year: 2021, min: 1.0, max: 1.8, central: 1.3 },
      { year: 2022, min: 0.7, max: 1.6, central: 1.3 },
      { year: 2023, min: 0.7, max: 1.6, central: 1.0 },
      { year: 2024, min: 0.7, max: 1.3, central: 1.0 },
      { year: 2025, min: 0.4, max: 1.0, central: 0.7 },
      { year: 2026, min: 0.4, max: 1.0, central: 0.7 }
    ]
  },

  /* =========================================================================
   * 2. FISCALISATION DES RETRAITES — la part « impôts » qui monte
   *    Impôts et taxes affectés + CSG (ITAF) finançant les retraites, en Md€.
   *    Sert à illustrer la bascule progressive des cotisations vers l'impôt.
   *    Valeurs : feuille « Tab 2.2 » des rapports COR 2023 à 2026 (millésimes
   *    de données 2022 → 2025).
   * ====================================================================== */
  fiscalisation: {
    title: "La fiscalisation des retraites monte",
    subtitle: "Financement fiscal (impôts, taxes affectés et CSG), en Md€",
    yLabel: "Md€",
    yMin: 45,
    yMax: 70,
    xMin: 2022,
    xMax: 2025,
    source:
      "COR, rapports annuels 2023 à 2026 — ITAF et CSG, millésimes de données 2022 à 2025.",
    realise: {
      label: "Impôts et taxes affectés + CSG",
      color: "#7b1fa2",
      kind: "solid",
      endNote: "≈65 Md€",
      points: [
        { x: 2022, y: 52.2 },
        { x: 2023, y: 54.5 },
        { x: 2024, y: 62.2 },
        { x: 2025, y: 64.7 }
      ]
    }
  },

  /* =========================================================================
   * 3. STRUCTURE DES RESSOURCES — « d'où vient l'argent des retraites ? »
   *    Sankey de la carte d'accueil. Distinction stricte officiel / calculé :
   *    - Parts (%) par année 2004→2025 : OFFICIELLES (COR, rapport 2026, fig. 2.11).
   *    - Montants 2025 en Md€ : OFFICIELS (COR, tableau 2.2 = 422,23 Md€).
   *    - Montants des autres années en Md€ : CALCULÉS (parts × PIB nominal INSEE),
   *      NON publiés tels quels par le COR — signalé dans la source du graphique.
   *    - Dépenses par groupe de régimes 2025 : COR, rapport 2026 (% du PIB).
   *    Voir aussi la section #financement (inchangée) pour le détail 2025.
   * ====================================================================== */
  sankeyFinancement: {
    title: "D’où vient l’argent des retraites ?",
    subtitle: "Structure des ressources du système de retraite",
    years: [2004, 2005, 2006, 2007, 2008, 2009, 2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025],
    defaultYear: 2025,
    // Provenance fine, au format de tools/extract_cor.py : [rapport, rôle du
    // fichier, onglet]. Elle change avec l'unité affichée — les parts en % et
    // les montants en Md€ ne sortent pas du même onglet — d'où deux entrées.
    provParts: [["cor-2026", "donnees-p2", "Fig 2.11"]],
    provMontants: [["cor-2026", "donnees-p2", "Tab 2.2"]],
    sources: [
      { key: "cotisations", label: "Cotisations sociales", short: "Cotisations", color: "#1f4e79" },
      { key: "equilibreFPE", label: "Contribution d'équilibre (FPE)", short: "Équilibre FPE", color: "#2f6fb0" },
      { key: "itaf", label: "Impôts & taxes affectés (ITAF, CSG)", short: "Impôts & CSG", color: "#c2185b" },
      { key: "subvSpeciaux", label: "Subventions aux régimes spéciaux", short: "Subv. spéciaux", color: "#e8731c" },
      { key: "transferts", label: "Transferts d'autres organismes", short: "Transferts", color: "#6aa84f", labelDy: 2 },
      { key: "autresProduits", label: "Produits financiers & autres", short: "Autres produits", color: "#9c27b0", labelDy: 7 },
    ],
    // Parts officielles de la structure des ressources — COR, rapport 2026
    // (figure 2.11, « rapports à la CCSS 2002-2025 »), en %. Officiel, chaque année.
    sharesPct: {
      2004: { cotisations: 65.593, equilibreFPE: 14.01, itaf: 7.125, subvSpeciaux: 2.365, transferts: 8.485, autresProduits: 2.422 },
      2005: { cotisations: 65.226, equilibreFPE: 14.117, itaf: 7.737, subvSpeciaux: 1.988, transferts: 8.173, autresProduits: 2.759 },
      2006: { cotisations: 64.669, equilibreFPE: 14.261, itaf: 9.859, subvSpeciaux: 2.377, transferts: 5.716, autresProduits: 3.118 },
      2007: { cotisations: 64.345, equilibreFPE: 14.237, itaf: 10.174, subvSpeciaux: 2.42, transferts: 5.114, autresProduits: 3.711 },
      2008: { cotisations: 66.358, equilibreFPE: 12.65, itaf: 10.984, subvSpeciaux: 2.507, transferts: 5.566, autresProduits: 1.935 },
      2009: { cotisations: 66.412, equilibreFPE: 12.785, itaf: 10.267, subvSpeciaux: 2.435, transferts: 5.407, autresProduits: 2.694 },
      2010: { cotisations: 67.55, equilibreFPE: 12.943, itaf: 9.985, subvSpeciaux: 2.637, transferts: 5.132, autresProduits: 1.754 },
      2011: { cotisations: 66.872, equilibreFPE: 13.097, itaf: 11.655, subvSpeciaux: 2.734, transferts: 4.949, autresProduits: 0.693 },
      2012: { cotisations: 65.15, equilibreFPE: 13.012, itaf: 11.549, subvSpeciaux: 2.763, transferts: 5.43, autresProduits: 2.096 },
      2013: { cotisations: 64.675, equilibreFPE: 12.617, itaf: 12.066, subvSpeciaux: 2.669, transferts: 5.763, autresProduits: 2.21 },
      2014: { cotisations: 65.036, equilibreFPE: 12.518, itaf: 12.141, subvSpeciaux: 2.593, transferts: 6.064, autresProduits: 1.649 },
      2015: { cotisations: 65.11, equilibreFPE: 12.325, itaf: 11.936, subvSpeciaux: 2.576, transferts: 6.382, autresProduits: 1.67 },
      2016: { cotisations: 65.615, equilibreFPE: 12.334, itaf: 11.964, subvSpeciaux: 2.523, transferts: 6.319, autresProduits: 1.244 },
      2017: { cotisations: 66.656, equilibreFPE: 12.027, itaf: 11.459, subvSpeciaux: 2.429, transferts: 6.627, autresProduits: 0.801 },
      2018: { cotisations: 65.828, equilibreFPE: 11.925, itaf: 11.343, subvSpeciaux: 2.392, transferts: 6.522, autresProduits: 1.989 },
      2019: { cotisations: 65.655, equilibreFPE: 11.792, itaf: 13.002, subvSpeciaux: 2.271, transferts: 4.781, autresProduits: 2.499 },
      2020: { cotisations: 65.749, equilibreFPE: 12.596, itaf: 13.846, subvSpeciaux: 2.432, transferts: 5.302, autresProduits: 0.076 },
      2021: { cotisations: 65.815, equilibreFPE: 11.718, itaf: 13.385, subvSpeciaux: 2.196, transferts: 5.213, autresProduits: 1.672 },
      2022: { cotisations: 66.045, equilibreFPE: 11.659, itaf: 14.033, subvSpeciaux: 2.074, transferts: 4.899, autresProduits: 1.289 },
      2023: { cotisations: 65.461, equilibreFPE: 11.457, itaf: 14.081, subvSpeciaux: 1.988, transferts: 4.817, autresProduits: 2.196 },
      2024: { cotisations: 65.461, equilibreFPE: 11.457, itaf: 14.081, subvSpeciaux: 1.988, transferts: 4.817, autresProduits: 2.196 },
      2025: { cotisations: 65.614, equilibreFPE: 11.676, itaf: 15.322, subvSpeciaux: 1.82, transferts: 3.898, autresProduits: 1.669 },
    },
    // Total des ressources en Md€. 2025 = OFFICIEL (COR, tableau 2.2 = 422,23).
    // Autres années = CALCULÉ (ressources en % du PIB officielles × PIB nominal INSEE).
    totalMds: { 2004: 209.3, 2005: 217.2, 2006: 227.0, 2007: 237.0, 2008: 246.1, 2009: 255.6, 2010: 251.6, 2011: 261.4, 2012: 275.7, 2013: 287.3, 2014: 295.6, 2015: 300.1, 2016: 307.2, 2017: 317.6, 2018: 323.8, 2019: 332.2, 2020: 326.0, 2021: 344.5, 2022: 366.0, 2023: 381.9, 2024: 403.3, 2025: 422.23 },
    officialYear: 2025,
    // Côté « où va l’argent » : dépenses par groupe de régimes en 2025 —
    // COR, rapport 2026 (% du PIB officiels ; Md€ = × PIB INSEE, donc calculés).
    regimes2025: [
      { key: "lura", label: "Régime général (LURA : CNAV + indép.)", short: "Régime général", color: "#1f4e79", pctPib: 6.002, mds: 180.7 },
      { key: "comp", label: "Régimes complémentaires (AGIRC-ARRCO…)", short: "Complémentaires", color: "#e8731c", pctPib: 4.026, mds: 121.2 },
      { key: "fpe", label: "Fonction publique d'État (FPE)", short: "Fonction publ. État", color: "#6aa84f", pctPib: 2.154, mds: 64.8 },
      { key: "cnracl", label: "CNRACL (collectivités, hôpitaux)", short: "CNRACL", color: "#c2185b", pctPib: 0.973, mds: 29.3 },
      { key: "special", label: "Régimes spéciaux", short: "Régimes spéciaux", color: "#9c27b0", pctPib: 0.636, mds: 19.1, labelDy: 4 },
      { key: "nonsal", label: "Non-salariés (base)", short: "Non-salariés", color: "#2f6fb0", pctPib: 0.326, mds: 9.8 },
    ],
    // Détail officiel des ressources 2025 en Md€ — COR, tableau 2.2 (pour le tableau).
    detail2025: [
      { label: "Cotisations salariés", mds: 100.88 },
      { label: "Cotisations employeurs (hors opérateurs État)", mds: 154.58 },
      { label: "Cotisations non-salariés", mds: 14.51 },
      { label: "Cotisations des opérateurs de l'État", mds: 7.07 },
      { label: "Contributions d'équilibre", mds: 49.3 },
      { label: "Subventions d'équilibre (régimes spéciaux)", mds: 7.69 },
      { label: "CSG", mds: 21.94 },
      { label: "ITAF sur revenus d'activité", mds: 17.94 },
      { label: "ITAF sur la consommation", mds: 17.43 },
      { label: "Autres ITAF", mds: 7.39 },
      { label: "Transferts CNAF", mds: 11.25 },
      { label: "Transferts Unédic", mds: 3.88 },
      { label: "Autres transferts externes", mds: 1.34 },
      { label: "Produits financiers", mds: 5.64 },
      { label: "Autres produits", mds: 1.41 },
    ],
    source:
      "Parts (%) : COR, rapport 2026 (structure des ressources 2004–2025, d’après les rapports à la CCSS). Montants 2025 en Md€ : COR, rapport 2026 (422,23 Md€, officiels). Montants des AUTRES années en Md€ : CALCULÉS (parts officielles × PIB nominal INSEE), NON publiés tels quels par le COR. Dépenses par régime 2025 : COR, rapport 2026.",
  },

  /* =========================================================================
   * 4. DONNÉES MACRO DE RÉFÉRENCE — pour traduire le « % du PIB » en euros
   *    et en « % de la dépense publique ».
   *
   *    Le graphique phare (« part des retraites dans le PIB ») peut être affiché
   *    en trois unités au choix du lecteur :
   *      - % du PIB                (donnée brute du COR)
   *      - milliards d'euros (Md€) = (% du PIB / 100) × PIB de l'année
   *      - % de la dépense publique = (% PIB retraites) / (dépense publique en
   *                                    % du PIB) × 100
   *
   *    Convention identique au reste du fichier : extrémités sourcées, points
   *    intermédiaires servant à l'interpolation. Au-delà de 2025, le PIB en
   *    euros est une ESTIMATION « euros courants » (croissance réelle + inflation
   *    des hypothèses du COR) — affichée à titre indicatif, avec avertissement.
   * ====================================================================== */
  macro: {
    // PIB nominal de la France, en Md€.
    // Passé (≤ 2025) : INSEE, comptes nationaux (PIB en valeur).
    // Futur (> 2025) : estimation « euros courants » à partir des hypothèses
    // macro du scénario de référence du COR (productivité + inflation).
    pibMdEuros: {
      source:
        "INSEE, comptes nationaux (PIB en valeur). Au-delà de 2025 : estimation " +
        "« euros courants » à partir des hypothèses macro du COR (rapport juin 2026).",
      sourcedTo: 2025,
      points: [
        { x: 2002, y: 1549 }, { x: 2005, y: 1772 }, { x: 2008, y: 1995 },
        { x: 2010, y: 1998 }, { x: 2012, y: 2089 }, { x: 2014, y: 2150 },
        { x: 2016, y: 2230 }, { x: 2018, y: 2360 }, { x: 2019, y: 2438 },
        { x: 2020, y: 2318 }, // creux Covid
        { x: 2021, y: 2501 }, { x: 2022, y: 2658 }, { x: 2023, y: 2822 },
        { x: 2024, y: 2921 }, { x: 2025, y: 3010 },
        // Au-delà : euros courants estimés (≈ +2,5 %/an nominal), à titre indicatif.
        { x: 2030, y: 3400 }, { x: 2040, y: 4360 }, { x: 2050, y: 5580 },
        { x: 2060, y: 7150 }, { x: 2070, y: 9150 }
      ]
    },
    // Dépense publique totale des administrations, en % du PIB.
    // Sert au calcul du « % de la dépense publique ».
    depensePubliquePctPib: {
      source:
        "INSEE / Eurostat — dépenses des administrations publiques, en % du PIB. " +
        "Au-delà de 2025 : ratio supposé approximativement stable.",
      sourcedTo: 2025,
      points: [
        { x: 2002, y: 52.6 }, { x: 2008, y: 53.3 }, { x: 2010, y: 56.4 },
        { x: 2014, y: 57.2 }, { x: 2019, y: 55.4 },
        { x: 2020, y: 61.4 }, // pic Covid
        { x: 2022, y: 58.1 }, { x: 2023, y: 57.3 }, { x: 2024, y: 57.1 },
        { x: 2025, y: 57.0 },
        // Futur : ratio supposé approximativement stable.
        { x: 2040, y: 56.5 }, { x: 2070, y: 56.0 }
      ]
    }
  },

  /* =========================================================================
   * 5. TABLEAU SYNTHÈSE DES HYPOTHÈSES DU SCÉNARIO DE RÉFÉRENCE
   * ====================================================================== */
  hypothesesTable: {
    title: "Les hypothèses du scénario de référence, rapport par rapport",
    source: "COR, rapports annuels 2019 à 2026.",
    colonnes: ["Rapport", "Productivité (LT)", "Fécondité", "Solde migratoire", "Chômage (LT)"],
    lignes: [
      ["2019", "1,3 %", "1,95", "+70 000 / an", "7,0 %"],
      ["2021", "1,3 %", "1,95", "+70 000 / an", "7,0 %"],
      ["2022", "1,3 %", "1,80", "+70 000 / an", "7,0 %"],
      ["2023", "1,0 %", "1,80", "+70 000 / an", "7,0 %"],
      ["2024", "1,0 %", "1,80", "+70 000 / an", "7,0 %"],
      ["2025", "0,7 %", "1,80", "+70 000 / an", "7,0 %"],
      ["2026", "0,7 %", "1,45", "+150 000 / an", "7,0 %"]
    ]
  },

  /* =========================================================================
   * 6. REGISTRE DES DOCUMENTS CITÉS
   *
   *    Chaque phrase « Source : … » du site nommait un document sans jamais y
   *    conduire : au lecteur d'aller le chercher sur cor-retraites.fr. Ce
   *    registre donne à chaque document cité une adresse officielle, et
   *    js/app.js transforme au rendu les mentions du texte en liens (voir
   *    SOURCE_REFS là-bas). Les ~125 phrases de source du site — celles de
   *    index.html comme celles des fichiers générés — n'ont donc pas à être
   *    réécrites une par une.
   *
   *    Schéma : identifiant → { titre, url, org, annee, biblio }
   *      - identifiant : STABLE. La table d'alias de js/app.js le vise, et la
   *        règle des millésimes du COR construit « cor-<année> » : renommer un
   *        `cor-2026` casse silencieusement tous les liens de cette année.
   *      - annee  : millésime du document (null pour un site institutionnel) ;
   *        sert au tri de la bibliographie, du plus récent au plus ancien.
   *      - biblio : false = document lié dans le texte mais absent de la liste
   *        « Méthode & sources ». Réservé aux rapports antérieurs à 2016, que
   *        le site n'exploite pas encore : ils restent joignables par la page
   *        « tous les rapports » plutôt que d'allonger la liste de 15 entrées.
   *
   *    Les 31 rapports du COR correspondent un pour un aux 31 sous-dossiers de
   *    « data/Données du COR/ », qui en archive les PDF et les Excel.
   * ====================================================================== */
  documents: {
    /* --- Portails ------------------------------------------------------- */
    "cor-rapports": {
      titre: "COR — tous les rapports (page officielle)",
      url: "https://www.cor-retraites.fr/documents/rapports-du-cor",
      org: "COR", annee: null
    },
    "cor-site": {
      titre: "Site officiel du Conseil d'orientation des retraites",
      url: "https://www.cor-retraites.fr/",
      org: "COR", annee: null
    },

    /* --- Rapports annuels et thématiques du COR ------------------------- */
    "cor-2026": {
      titre: "Rapport annuel du COR — juin 2026 (rapport, synthèse et données Excel)",
      url: "https://www.cor-retraites.fr/rapports-du-cor/rapport-annuel-cor-juin-2026-evolutions-perspectives-retraites-france",
      org: "COR", annee: 2026
    },
    "cor-droits-familiaux-2025": {
      titre: "COR — « Droits familiaux et conjugaux » (novembre 2025)",
      url: "https://www.cor-retraites.fr/rapports-du-cor/droits-familiaux-conjugaux",
      org: "COR", annee: 2025
    },
    "cor-2025": {
      titre: "Rapport annuel du COR — juin 2025",
      url: "https://www.cor-retraites.fr/rapports-du-cor/rapport-annuel-cor-juin-2025-evolutions-perspectives-retraites-france",
      org: "COR", annee: 2025
    },
    "cor-2025-pdf": {
      titre: "Rapport annuel du COR — juin 2025 (PDF intégral)",
      url: "https://www.cor-retraites.fr/sites/default/files/2025-06/RA_2025_def_publi.pdf",
      org: "COR", annee: 2025
    },
    "cor-2025-synthese": {
      titre: "Synthèse du rapport annuel du COR — juin 2025",
      url: "https://www.cor-retraites.fr/sites/default/files/2025-06/Synth%C3%A8se_Def_.pdf",
      org: "COR", annee: 2025
    },
    "cor-2024": {
      titre: "Rapport annuel du COR — juin 2024",
      url: "https://www.cor-retraites.fr/rapports-du-cor/rapport-annuel-cor-juin-2024-evolutions-perspectives-retraites-france",
      org: "COR", annee: 2024
    },
    "cor-2023": {
      titre: "Rapport annuel du COR — juin 2023",
      url: "https://www.cor-retraites.fr/rapports-du-cor/rapport-annuel-cor-juin-2023-evolutions-perspectives-retraites-france",
      org: "COR", annee: 2023
    },
    "cor-2022": {
      titre: "Rapport annuel du COR — septembre 2022 (nouveaux scénarios de productivité)",
      url: "https://www.cor-retraites.fr/rapports-du-cor/rapport-annuel-cor-septembre-2022-evolutions-perspectives-retraites-france",
      org: "COR", annee: 2022
    },
    "cor-2022-synthese": {
      titre: "Synthèse du rapport annuel du COR — septembre 2022",
      url: "https://www.cor-retraites.fr/sites/default/files/2023-01/Synth%C3%A8se.pdf",
      org: "COR", annee: 2022
    },
    "cor-productivite-2023": {
      titre: "COR — Les évolutions de la productivité du travail (document de travail)",
      url: "https://www.cor-retraites.fr/sites/default/files/2023-12/Doc_02_%C3%A9volutions%20pass%C3%A9es%20et%20r%C3%A9centes%20de%20la%20productivit%C3%A9.pdf",
      org: "COR", annee: 2023
    },
    "cor-2021": {
      titre: "Rapport annuel du COR — juin 2021",
      url: "https://www.cor-retraites.fr/rapports-du-cor/rapport-annuel-cor-juin-2021-evolutions-perspectives-retraites-france",
      org: "COR", annee: 2021
    },
    "cor-panorama-2020": {
      titre: "COR — « Panorama des systèmes de retraite en France et à l'étranger » (décembre 2020)",
      url: "https://www.cor-retraites.fr/rapports-du-cor/panorama-systemes-retraite-france-a-letranger",
      org: "COR", annee: 2020
    },
    "cor-2020": {
      titre: "Rapport annuel du COR — novembre 2020",
      url: "https://www.cor-retraites.fr/rapports-du-cor/rapport-annuel-cor-novembre-2020-evolutions-perspectives-retraites-france",
      org: "COR", annee: 2020
    },
    "cor-horizon-2030": {
      titre: "COR — « Perspectives des retraites en France à l'horizon 2030 » (novembre 2019)",
      url: "https://www.cor-retraites.fr/rapports-du-cor/rapport-cor-novembre-2019-perspectives-retraites-france-a-lhorizon-2030",
      org: "COR", annee: 2019
    },
    "cor-2019": {
      titre: "Rapport annuel du COR — juin 2019",
      url: "https://www.cor-retraites.fr/rapports-du-cor/rapport-cor-2019-evolutions-perspectives-retraites-france",
      org: "COR", annee: 2019
    },
    "cor-2018": {
      titre: "Rapport annuel du COR — juin 2018",
      url: "https://www.cor-retraites.fr/rapports-du-cor/rapport-cor-2018-evolutions-perspectives-retraites-france",
      org: "COR", annee: 2018
    },
    "cor-thematique-2017": {
      titre: "COR — « Perspectives financières jusqu'en 2070 : sensibilité aux hypothèses, résultats par régime » (novembre 2017)",
      url: "https://www.cor-retraites.fr/rapports-du-cor/rapport-thematique-novembre-2017-retraites-perspectives-financieres-jusquen-2070",
      org: "COR", annee: 2017
    },
    "cor-2017": {
      titre: "Rapport annuel du COR — juin 2017",
      url: "https://www.cor-retraites.fr/rapports-du-cor/rapport-cor-2017-evolutions-perspectives-retraites-france",
      org: "COR", annee: 2017
    },
    "cor-2016": {
      titre: "Rapport annuel du COR — juin 2016",
      url: "https://www.cor-retraites.fr/rapports-du-cor/rapport-cor-2016-evolutions-perspectives-retraites-france",
      org: "COR", annee: 2016
    },
    "cor-thematique-2015": {
      titre: "COR — « Les retraités : un état des lieux de leur situation en France » (novembre 2015)",
      url: "https://www.cor-retraites.fr/rapports-du-cor/rapport-thematique-novembre-2015-retraites-etat-lieux-leur-situation-france",
      org: "COR", annee: 2015, biblio: false
    },
    "cor-2015": {
      titre: "Rapport annuel du COR — juin 2015",
      url: "https://www.cor-retraites.fr/rapports-du-cor/rapport-cor-2015-evolutions-perspectives-retraites-france",
      org: "COR", annee: 2015, biblio: false
    },
    "cor-2014": {
      titre: "Rapport annuel du COR — juin 2014",
      url: "https://www.cor-retraites.fr/rapports-du-cor/rapport-cor-2014-evolutions-perspectives-retraites-france",
      org: "COR", annee: 2014, biblio: false
    },
    "cor-2013": {
      titre: "12e rapport du COR — janvier 2013 (état des lieux du système français)",
      url: "https://www.cor-retraites.fr/rapports-du-cor/12e-rapport-cor-janvier-2013-retraites-etat-lieux-systeme-francais",
      org: "COR", annee: 2013, biblio: false
    },
    "cor-2012": {
      titre: "Rapport du COR — décembre 2012 (perspectives 2020, 2040 et 2060)",
      url: "https://www.cor-retraites.fr/rapports-du-cor/rapport-cor-decembre-2012-retraites-perspectives-2020-2040-2060",
      org: "COR", annee: 2012, biblio: false
    },
    "cor-compensation-2011": {
      titre: "Rapport du COR — octobre 2011 (rénovation des mécanismes de compensation)",
      url: "https://www.cor-retraites.fr/rapports-du-cor/rapport-cor-2011-retraites-renovation-mecanismes-compensation",
      org: "COR", annee: 2011, biblio: false
    },
    "cor-polypensionnes-2011": {
      titre: "Rapport du COR — septembre 2011 (situation des polypensionnés)",
      url: "https://www.cor-retraites.fr/rapports-du-cor/rapport-cor-2011-retraites-situation-polypensionnes",
      org: "COR", annee: 2011, biblio: false
    },
    "cor-2010": {
      titre: "Rapport du COR — avril 2010 (perspectives actualisées à moyen et long terme)",
      url: "https://www.cor-retraites.fr/rapports-du-cor/rapport-cor-2010-retraites-perspectives-actualisees-a-moyen-long-terme-vue-rendez",
      org: "COR", annee: 2010, biblio: false
    },
    "cor-notionnels-2010": {
      titre: "Rapport du COR — janvier 2010 (annuités, points ou comptes notionnels)",
      url: "https://www.cor-retraites.fr/rapports-du-cor/rapport-cor-janvier-2010-retraites-annuites-points-comptes-notionnels-options",
      org: "COR", annee: 2010, biblio: false
    },
    "cor-2008": {
      titre: "Rapport du COR — décembre 2008 (droits familiaux et conjugaux)",
      url: "https://www.cor-retraites.fr/rapports-du-cor/rapport-cor-retraites-droits-familiaux-conjugaux",
      org: "COR", annee: 2008, biblio: false
    },
    "cor-fiches-2007": {
      titre: "Rapport du COR — novembre 2007 (20 fiches d'actualisation pour le rendez-vous de 2008)",
      url: "https://www.cor-retraites.fr/rapports-du-cor/rapport-cor-retraites-20-fiches-dactualisation-pour-rendez-vous-2008",
      org: "COR", annee: 2007, biblio: false
    },
    "cor-2007": {
      titre: "Rapport du COR — janvier 2007 (questions et orientations pour 2008)",
      url: "https://www.cor-retraites.fr/rapports-du-cor/rapport-cor-janvier-2007-retraites-questions-orientations-pour-2008",
      org: "COR", annee: 2007, biblio: false
    },
    "cor-2006": {
      titre: "Rapport du COR — mars 2006 (perspectives 2020 et 2050)",
      url: "https://www.cor-retraites.fr/rapports-du-cor/rapport-cor-mars-2006-retraites-perspectives-2020-2050",
      org: "COR", annee: 2006, biblio: false
    },
    "cor-2004": {
      titre: "Rapport du COR — juin 2004 (les réformes en France et à l'étranger ; le droit à l'information)",
      url: "https://www.cor-retraites.fr/rapports-du-cor/rapport-cor-juin-2004-retraites-reformes-france-a-letranger-droit-a-linformation",
      org: "COR", annee: 2004, biblio: false
    },
    "cor-2003": {
      titre: "Rapport du COR — mars 2003 (cumul emploi-retraite)",
      url: "https://www.cor-retraites.fr/rapports-du-cor/6-mars-2003-rapport-cumul-emploi-retraite",
      org: "COR", annee: 2003, biblio: false
    },
    "cor-2001": {
      titre: "Premier rapport du COR — décembre 2001 (renouveler le contrat social entre les générations)",
      url: "https://www.cor-retraites.fr/rapports-du-cor/rapport-cor-decembre-2001-retraites-renouveler-contrat-social-entre-generations",
      org: "COR", annee: 2001, biblio: false
    },

    /* --- Institutions productrices de données -------------------------- */
    insee: {
      titre: "INSEE — Institut national de la statistique et des études économiques",
      url: "https://www.insee.fr/", org: "INSEE", annee: null
    },
    ocde: {
      titre: "OCDE — Organisation de coopération et de développement économiques",
      url: "https://www.oecd.org/fr/", org: "OCDE", annee: null
    },
    socx: {
      titre: "OCDE — base SOCX (dépenses sociales)",
      url: "https://www.oecd.org/en/data/datasets/social-expenditure-database-socx.html",
      org: "OCDE", annee: null
    },
    drees: {
      titre: "DREES — Direction de la recherche, des études, de l'évaluation et des statistiques",
      url: "https://drees.solidarites-sante.gouv.fr/", org: "DREES", annee: null
    },
    eurostat: {
      titre: "Eurostat — office statistique de l'Union européenne",
      url: "https://ec.europa.eu/eurostat", org: "Eurostat", annee: null
    },
    fipeco: {
      titre: "FIPECO — La situation et les perspectives des régimes de retraite",
      url: "https://www.fipeco.fr/fiche/La-situation-et-les-perspectives-des-r%C3%A9gimes-de-retraite",
      org: "FIPECO", annee: null
    },

    /* --- Sources de la section « les 50 Md€ » --------------------------- */
    "bayrou-2025": {
      titre: "F. Bayrou — déclaration de politique générale du 14 janvier 2025",
      url: "https://www.vie-publique.fr/discours/296842-francois-bayrou-14012025-declaration-politique-generale-l",
      org: "Vie-publique.fr", annee: 2025
    },
    "beaufret-2023": {
      titre: "J.-P. Beaufret — « Retraites obligatoires et déficits publics » (document présenté au COR, 2023)",
      url: "https://www.cor-retraites.fr/sites/default/files/2023-09/Doc_06_Retraites%20obligatoires_d%C3%A9ficits%20publics.pdf",
      org: "COR", annee: 2023
    },
    molinari: {
      titre: "Institut économique Molinari",
      url: "https://www.institutmolinari.org/", org: "Molinari", annee: null
    },
    "molinari-2023": {
      titre: "Institut économique Molinari — « Les retraites expliquent la moitié des déficits publics » (2023)",
      url: "https://www.institutmolinari.org/2023/10/06/deficit-des-regimes-de-retraite-un-lourd-impact-sur-les-finances-publiques-2/",
      org: "Molinari", annee: 2023
    },
    "molinari-2024": {
      titre: "Institut économique Molinari — « Le déficit des retraites est de 53 milliards d'euros en 2023 » (2024)",
      url: "https://www.institutmolinari.org/2024/06/12/le-deficit-des-retraites-est-de-53-milliards-deuros-en-2023-depuis-2002-le-cor-a-occulte-943-milliards-de-deficits-representant-en-moyenne-2-du-pib-par-an/",
      org: "Molinari", annee: 2024
    },
    "fondapol-2025": {
      titre: "Fondapol — Contribution à la mission flash de clarification du financement des retraites (2025)",
      url: "https://www.fondapol.org/etude/contribution-a-la-mission-flash-de-clarification-du-financement-des-retraites/",
      org: "Fondapol", annee: 2025
    },
    "grande-conversation": {
      titre: "La Grande Conversation — « Les retraites et l'équité entre générations : histoire d'un déni »",
      url: "https://www.lagrandeconversation.com/societe/les-retraites-et-lequite-entre-generations-histoire-dun-deni/",
      org: "La Grande Conversation", annee: 2024
    },
    "senat-2024-10-08": {
      titre: "Sénat — compte rendu de la séance du 8 octobre 2024",
      url: "https://www.senat.fr/seances/s202410/s20241008/s20241008005.html",
      org: "Sénat", annee: 2024
    }
  }
};
