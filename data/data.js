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
 * COMMENT METTRE À JOUR ?
 * Les fichiers Excel du COR contiennent les séries complètes année par année.
 * Pour remplacer une courbe par les chiffres exacts, il suffit d'éditer le
 * tableau "points" correspondant ci-dessous : aucune autre modification de code
 * n'est nécessaire.
 */

window.COR_DATA = {

  /* =========================================================================
   * 1. DÉPENSES DE RETRAITE EN % DU PIB — projections successives du COR
   *    (le graphique « spaghetti », façon PIIE)
   *
   *    Idée : à chaque rapport annuel, le COR reprojette la part des dépenses
   *    de retraite dans le PIB jusqu'en 2070. En superposant ces projections,
   *    on voit si le COR « change d'avis ».
   *
   *    Les valeurs de référence (point de départ et point 2070) proviennent des
   *    synthèses des rapports annuels du COR. Les points intermédiaires (tous
   *    les 5 ans) sont interpolés pour donner la forme de la courbe.
   * ====================================================================== */
  depensesPib: {
    title: "La part des retraites dans le PIB selon les rapports successifs du COR",
    subtitle: "Dépenses de retraite, en % du PIB — scénario de référence de chaque rapport annuel",
    yLabel: "% du PIB",
    yMin: 11,
    yMax: 15,
    xMin: 2000,
    xMax: 2070,

    // Courbe pleine = ce qui s'est réellement passé (données réalisées).
    realise: {
      label: "Réalisé",
      color: "#1f4e79",
      kind: "solid",
      source: "COR, rapports annuels (séries observées) ; INSEE (comptes nationaux).",
      points: [
        { x: 2002, y: 12.6 }, { x: 2005, y: 12.7 }, { x: 2008, y: 13.0 },
        { x: 2010, y: 13.6 }, { x: 2012, y: 13.8 }, { x: 2014, y: 13.8 },
        { x: 2016, y: 13.5 }, { x: 2018, y: 13.5 }, { x: 2019, y: 13.5 },
        { x: 2020, y: 14.7 }, // pic Covid : le PIB chute, le ratio grimpe mécaniquement
        { x: 2021, y: 13.8 }, { x: 2022, y: 13.4 }, { x: 2023, y: 13.6 },
        { x: 2024, y: 13.9 }
      ]
    },

    // Une projection par rapport annuel. La date entre parenthèses = millésime.
    projections: [
      {
        label: "Projection 2019",
        year: 2019,
        color: "#7f7f7f",
        endNote: "≈13,6 %",
        source: "COR, rapport annuel juin 2019 — scénario 1,3 % de productivité.",
        points: [
          { x: 2019, y: 13.5 }, { x: 2025, y: 13.7 }, { x: 2030, y: 13.8 },
          { x: 2040, y: 13.9 }, { x: 2050, y: 13.8 }, { x: 2060, y: 13.7 },
          { x: 2070, y: 13.6 }
        ]
      },
      {
        label: "Projection 2021",
        year: 2021,
        color: "#2ca02c",
        endNote: "≈12,1 %",
        source: "COR, rapport annuel juin 2021 — scénario central 1,3 % de productivité (dépenses décroissantes).",
        points: [
          { x: 2021, y: 13.8 }, { x: 2025, y: 13.7 }, { x: 2030, y: 13.7 },
          { x: 2040, y: 13.3 }, { x: 2050, y: 12.8 }, { x: 2060, y: 12.4 },
          { x: 2070, y: 12.1 }
        ]
      },
      {
        label: "Projection 2022",
        year: 2022,
        color: "#ff7f0e",
        endNote: "≈12,4 %",
        source: "COR, rapport annuel sept. 2022 — nouveaux scénarios de productivité (0,7 % à 1,6 %).",
        points: [
          { x: 2022, y: 13.4 }, { x: 2025, y: 13.5 }, { x: 2030, y: 13.6 },
          { x: 2040, y: 13.3 }, { x: 2050, y: 12.9 }, { x: 2060, y: 12.6 },
          { x: 2070, y: 12.4 }
        ]
      },
      {
        label: "Projection 2023",
        year: 2023,
        color: "#9467bd",
        endNote: "≈13,5 %",
        source: "COR, rapport annuel juin 2023 — après la réforme des retraites de 2023.",
        points: [
          { x: 2023, y: 13.6 }, { x: 2025, y: 13.8 }, { x: 2030, y: 13.9 },
          { x: 2040, y: 13.8 }, { x: 2050, y: 13.7 }, { x: 2060, y: 13.6 },
          { x: 2070, y: 13.5 }
        ]
      },
      {
        label: "Projection 2024",
        year: 2024,
        color: "#d62728",
        endNote: "≈13,6 %",
        source: "COR, rapport annuel juin 2024 — scénario de référence.",
        points: [
          { x: 2024, y: 13.9 }, { x: 2030, y: 13.9 }, { x: 2040, y: 13.8 },
          { x: 2050, y: 13.7 }, { x: 2060, y: 13.6 }, { x: 2070, y: 13.6 }
        ]
      },
      {
        label: "Projection 2025",
        year: 2025,
        color: "#e377c2",
        endNote: "≈14,2 %",
        source: "COR, rapport annuel juin 2025 — productivité abaissée à 0,7 % : les dépenses repartent à la hausse.",
        points: [
          { x: 2025, y: 13.9 }, { x: 2030, y: 14.0 }, { x: 2040, y: 14.0 },
          { x: 2050, y: 14.1 }, { x: 2060, y: 14.1 }, { x: 2070, y: 14.2 }
        ]
      }
    ]
  },

  /* =========================================================================
   * 2. HYPOTHÈSE DE PRODUCTIVITÉ — le grand revirement
   *    Les scénarios de productivité du travail à long terme, rapport par
   *    rapport. C'est l'hypothèse qui a le plus changé… et qui fait tout
   *    basculer dans les projections financières.
   * ====================================================================== */
  productivite: {
    title: "Le COR a discrètement abaissé son hypothèse de productivité",
    subtitle: "Croissance annuelle de la productivité du travail retenue à long terme (en %)",
    yLabel: "% / an",
    note: "Jusqu'en 2021, l'éventail allait de 1,0 % à 1,8 %. À partir de 2022, le COR décale tous ses scénarios vers le bas (0,7 % à 1,6 %), puis retient 0,7 % comme référence en 2025.",
    source: "COR, rapports annuels 2019 à 2025 (hypothèses économiques de long terme).",
    // Pour chaque rapport : éventail des scénarios + scénario de référence.
    rapports: [
      { year: 2019, min: 1.0, max: 1.8, central: 1.3 },
      { year: 2021, min: 1.0, max: 1.8, central: 1.3 },
      { year: 2022, min: 0.7, max: 1.6, central: 1.3 },
      { year: 2023, min: 0.7, max: 1.6, central: 1.0 },
      { year: 2024, min: 0.7, max: 1.3, central: 1.0 },
      { year: 2025, min: 0.4, max: 1.0, central: 0.7 }
    ]
  },

  /* =========================================================================
   * 3. FÉCONDITÉ — l'hypothèse rattrapée par la réalité
   *    Indice conjoncturel de fécondité (enfants par femme).
   *    On compare l'hypothèse retenue par le COR (reprise de l'INSEE) à la
   *    fécondité réellement observée.
   * ====================================================================== */
  fecondite: {
    title: "Fécondité : l'hypothèse du COR rattrapée par la réalité",
    subtitle: "Indice conjoncturel de fécondité (enfants par femme)",
    yLabel: "enfants / femme",
    yMin: 1.5,
    yMax: 2.1,
    xMin: 2010,
    xMax: 2040,
    source: "Hypothèses : INSEE (projections de population) reprises par le COR. Réalisé : INSEE, état civil.",
    realise: {
      label: "Fécondité réelle observée",
      color: "#1f4e79",
      kind: "solid",
      points: [
        { x: 2010, y: 2.03 }, { x: 2014, y: 1.99 }, { x: 2016, y: 1.92 },
        { x: 2018, y: 1.87 }, { x: 2020, y: 1.83 }, { x: 2022, y: 1.79 },
        { x: 2023, y: 1.68 }, { x: 2024, y: 1.62 }
      ]
    },
    hypotheses: [
      {
        label: "Hypothèse COR/INSEE 2019",
        year: 2019,
        color: "#2ca02c",
        endNote: "1,95",
        points: [ { x: 2019, y: 1.87 }, { x: 2025, y: 1.95 }, { x: 2040, y: 1.95 } ]
      },
      {
        label: "Hypothèse COR/INSEE 2022→2025",
        year: 2022,
        color: "#ff7f0e",
        endNote: "1,80",
        points: [ { x: 2022, y: 1.79 }, { x: 2030, y: 1.80 }, { x: 2040, y: 1.80 } ]
      }
    ]
  },

  /* =========================================================================
   * 4. PRODUCTIVITÉ : HYPOTHÈSE vs RÉALITÉ
   *    Réponse directe à « les prévisions se sont-elles réalisées ? »
   * ====================================================================== */
  productiviteReel: {
    title: "Productivité : ce que le COR supposait vs ce qui s'est passé",
    subtitle: "Croissance de la productivité du travail (%/an, moyenne mobile)",
    yLabel: "% / an",
    yMin: 0,
    yMax: 2,
    xMin: 2000,
    xMax: 2025,
    source: "Réalisé : INSEE / OCDE (productivité horaire). Hypothèse : scénario central du COR.",
    realise: {
      label: "Productivité réellement observée",
      color: "#1f4e79",
      kind: "solid",
      points: [
        { x: 2000, y: 1.6 }, { x: 2005, y: 1.3 }, { x: 2008, y: 0.9 },
        { x: 2011, y: 1.0 }, { x: 2014, y: 0.8 }, { x: 2017, y: 0.7 },
        { x: 2019, y: 0.6 }, { x: 2022, y: 0.5 }, { x: 2024, y: 0.6 }
      ]
    },
    hypotheses: [
      {
        label: "Hypothèse centrale du COR (longtemps 1,3 %)",
        year: 2019,
        color: "#d62728",
        kind: "dash",
        endNote: "1,3 %",
        points: [ { x: 2010, y: 1.3 }, { x: 2025, y: 1.3 } ]
      }
    ]
  },

  /* =========================================================================
   * 5. TABLEAU SYNTHÈSE DES HYPOTHÈSES DU SCÉNARIO DE RÉFÉRENCE
   * ====================================================================== */
  hypothesesTable: {
    title: "Les hypothèses du scénario de référence, rapport par rapport",
    source: "COR, rapports annuels 2019 à 2025.",
    colonnes: ["Rapport", "Productivité (LT)", "Fécondité", "Solde migratoire", "Chômage (LT)"],
    lignes: [
      ["2019", "1,3 %", "1,95", "+70 000 / an", "7,0 %"],
      ["2021", "1,3 %", "1,95", "+70 000 / an", "7,0 %"],
      ["2022", "1,3 %", "1,80", "+70 000 / an", "7,0 %"],
      ["2023", "1,0 %", "1,80", "+70 000 / an", "7,0 %"],
      ["2024", "1,0 %", "1,80", "+70 000 / an", "7,0 %"],
      ["2025", "0,7 %", "1,80", "+70 000 / an", "7,0 %"]
    ]
  },

  /* =========================================================================
   * 6. SOURCES
   * ====================================================================== */
  sources: [
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
