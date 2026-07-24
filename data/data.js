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
      "COR, rapports annuels 2023 à 2026 — feuille « Tab 2.2 » (ITAF et CSG, millésimes de données 2022 à 2025).",
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
      "Parts (%) : COR, rapport 2026 (figure 2.11, structure des ressources 2004–2025, d’après les rapports à la CCSS). Montants 2025 en Md€ : COR, tableau 2.2 (422,23 Md€, officiels). Montants des AUTRES années en Md€ : CALCULÉS (parts officielles × PIB nominal INSEE), NON publiés tels quels par le COR. Dépenses par régime 2025 : COR, rapport 2026.",
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
   * 6. SOURCES
   * ====================================================================== */
  sources: [
    {
      titre: "Rapport annuel du COR — juin 2026 (rapport, synthèse et données Excel)",
      url: "https://www.cor-retraites.fr/rapports-du-cor/rapport-annuel-cor-juin-2026-evolutions-perspectives-retraites-france"
    },
    {
      titre: "Rapport annuel du COR — juin 2025",
      url: "https://www.cor-retraites.fr/sites/default/files/2025-06/RA_2025_def_publi.pdf"
    },
    {
      titre: "Synthèse du rapport annuel du COR — juin 2025",
      url: "https://www.cor-retraites.fr/sites/default/files/2025-06/Synth%C3%A8se_Def_.pdf"
    },
    {
      titre: "Synthèse du rapport annuel du COR — septembre 2022 (nouveaux scénarios de productivité)",
      url: "https://www.cor-retraites.fr/sites/default/files/2023-01/Synth%C3%A8se.pdf"
    },
    {
      titre: "COR — Les évolutions de la productivité du travail (document de travail)",
      url: "https://www.cor-retraites.fr/sites/default/files/2023-12/Doc_02_%C3%A9volutions%20pass%C3%A9es%20et%20r%C3%A9centes%20de%20la%20productivit%C3%A9.pdf"
    },
    {
      titre: "Site officiel du Conseil d'orientation des retraites",
      url: "https://www.cor-retraites.fr/"
    },
    {
      titre: "FIPECO — La situation et les perspectives des régimes de retraite",
      url: "https://www.fipeco.fr/fiche/La-situation-et-les-perspectives-des-r%C3%A9gimes-de-retraite"
    }
  ]
};
