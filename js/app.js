/*
 * Application « Le COR sous l'œil des citoyens »
 * Assemble les sections et branche les données sur le moteur de graphiques.
 */
(function () {
  "use strict";

  const D = window.COR_DATA;
  // Séries officielles générées depuis les Excel du COR. Même objet que
  // window.COR_SERIES (ensureExplorer y ajoute `explorer` à la volée).
  const S = window.COR_SERIES || {};
  const { lineChart, barChart, sankeyChart, chartWidth, el, interpolateY, attachReveal } = window.CORChart;
  let explorerRedraw = null;   // permet de rejouer l'animation du graphe de l'explorateur

  /* ----------------------------------------------------------------------
   * Icônes SVG inline (style « trait », inspiré de Feather Icons, MIT).
   * Remplacent les glyphes Unicode (⤓ ⤢ ✕ …) dont le rendu varie beaucoup
   * d'une plateforme à l'autre.
   * -------------------------------------------------------------------- */
  const ICONS = {
    expand: '<polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
    close: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
    share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="8.59" y1="10.49" x2="15.42" y2="6.51"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>'
  };
  const icon = name =>
    `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;

  /* ----------------------------------------------------------------------
   * 1. Graphique phare : dépenses de retraite en % du PIB, projections
   *    successives superposées.
   *
   *    Sélecteur d'unité (lecteur grand public) : la même courbe en % du PIB
   *    peut être relue en milliards d'euros ou en % de la dépense publique.
   *    On convertit les points puis on les renvoie au moteur avec le bon
   *    suffixe : l'axe, l'infobulle, le tableau et le CSV suivent tout seuls.
   * -------------------------------------------------------------------- */
  let pibUnit = "pct"; // "pct" | "eur" | "share" — unité courante du graphe phare

  // Interpolation linéaire bornée sur des ancres {x, y} triées par x (moteur de
  // graphiques). En dehors de la plage, la valeur de l'extrémité la plus proche
  // est prolongée.
  const interpAt = (points, x) =>
    points && points.length ? interpolateY(points, x) : null;

  // Convertit une valeur en % du PIB vers l'unité demandée pour une année donnée.
  function convertPibValue(pct, x, unit) {
    const m = D.macro || {};
    if (unit === "eur") {
      const pib = interpAt(m.pibMdEuros && m.pibMdEuros.points, x);
      return pib == null ? null : Math.round((pct / 100) * pib);
    }
    if (unit === "share") {
      const dp = interpAt(m.depensePubliquePctPib && m.depensePubliquePctPib.points, x);
      return dp ? (pct / dp) * 100 : null;
    }
    return pct; // "pct"
  }

  // Transforme un tableau de séries (points en % du PIB) vers l'unité demandée.
  // Les étiquettes de fin (`endNote`) sont des millésimes de rapport : elles ne
  // dépendent pas de l'unité et sont conservées telles quelles.
  function convertPibSeries(series, unit) {
    if (unit === "pct") return series;
    return series.map(s => ({
      ...s,
      points: s.points
        .map(p => ({ x: p.x, y: convertPibValue(p.y, p.x, unit) }))
        .filter(p => p.y != null)
    }));
  }

  const PIB_UNIT_SUFFIX = { pct: " %", eur: " Md€", share: " %" };
  const PIB_UNIT_SUBTITLE = {
    pct: "Dépenses de retraite, en % du PIB — scénario de référence de chaque rapport",
    eur: "Dépenses de retraite, en milliards d'euros — scénario de référence de chaque rapport",
    share: "Dépenses de retraite, en % de la dépense publique — scénario de référence de chaque rapport"
  };

  function renderDepensesPib(animate, unit) {
    if (unit) pibUnit = unit;
    const d = S.depensesPib;
    if (!d) return;
    // On retire l'hypothèse de productivité « (prod. 1,3 %) » du libellé : elle
    // alourdit la légende et parle peu au grand public. L'info est expliquée en
    // clair dans le texte « Ce qu'il faut retenir » sous le graphique.
    const stripProd = label => label.replace(/\s*\(prod\.[^)]*\)/, "");
    let series = [
      { ...d.realise, kind: "solid", markers: false },
      ...d.projections.map(p => ({
        label: stripProd(p.label), color: p.color, kind: "dash", points: p.points, endNote: p.endNote
      }))
    ];
    series = convertPibSeries(series, pibUnit);

    // En % du PIB on garde l'échelle d'origine ; sinon on laisse le moteur
    // auto-cadrer l'axe Y (les ordres de grandeur Md€ / % dépense publique
    // n'ont rien à voir avec les bornes 11–15,5 % du PIB).
    const y = pibUnit === "pct"
      ? { min: d.yMin, max: d.yMax, suffix: PIB_UNIT_SUFFIX.pct }
      : { suffix: PIB_UNIT_SUFFIX[pibUnit] };

    lineChart(document.getElementById("chart-pib"), {
      series,
      x: { min: d.xMin, max: d.xMax },
      y,
      ariaLabel: PIB_UNIT_SUBTITLE[pibUnit],
      animate
    });

    // Sous-titre de la carte + avertissement « euros estimés ».
    const card = document.getElementById("chart-pib").closest(".chart-card");
    const sub = card && card.querySelector(".chart-title span");
    if (sub) sub.textContent = PIB_UNIT_SUBTITLE[pibUnit];
    const note = document.getElementById("pib-unit-note");
    if (note) note.hidden = pibUnit !== "eur";
    // Le SVG vient d'être reconstruit : le PNG en cache montre l'unité
    // précédente. On le régénère pour que « Télécharger / Partager » livre bien
    // le graphique affiché (cf. refreshChartPngCache).
    if (card) refreshChartPngCache(card);
  }

  // Câble le sélecteur d'unité (% du PIB / Md€ / % dépense publique) du graphe
  // phare. Idempotent : on ne l'installe qu'une fois.
  function setupPibUnitToggle() {
    const group = document.getElementById("pib-unit-toggle");
    if (!group || group.dataset.wired) return;
    group.dataset.wired = "1";
    group.addEventListener("click", e => {
      const btn = e.target.closest(".unit-btn");
      if (!btn || btn.classList.contains("is-active")) return;
      group.querySelectorAll(".unit-btn").forEach(b => {
        const on = b === btn;
        b.classList.toggle("is-active", on);
        b.setAttribute("aria-pressed", on ? "true" : "false");
      });
      renderDepensesPib(false, btn.dataset.unit);
    });
  }

  /* Helper : graphique « réalisé + projections superposées ». */
  function renderRealiseProjections(elId, block, animate) {
    if (!block) return;
    const series = [
      { ...block.realise, kind: "solid", markers: false },
      ...block.projections.map(p => ({
        label: p.label, color: p.color, kind: "dash", points: p.points, endNote: p.endNote
      }))
    ];
    lineChart(document.getElementById(elId), {
      series,
      x: { min: block.xMin, max: block.xMax },
      y: { min: block.yMin, max: block.yMax, suffix: " %" },
      ariaLabel: block.subtitle,
      animate
    });
  }

  function renderSolde(animate) {
    renderRealiseProjections("chart-solde", S.solde, animate);
  }

  function renderCiseaux(animate) {
    const b = S.ressourcesVsDepenses;
    if (!b) return;
    lineChart(document.getElementById("chart-ciseaux"), {
      series: b.series.map(s => ({ ...s, endNote: s.label })),
      x: { min: b.xMin, max: b.xMax },
      y: { min: b.yMin, max: b.yMax, suffix: " %" },
      ariaLabel: b.subtitle,
      animate
    });
  }

  function renderNiveauVie(animate) {
    renderRealiseProjections("chart-niveau", S.niveauVie, animate);
  }

  /* ----------------------------------------------------------------------
   * 2. Productivité : éventail des scénarios par rapport (range + central).
   *    Graphique « dumbbell » maison : une barre verticale min→max et un
   *    point pour le scénario de référence, pour chaque millésime.
   * -------------------------------------------------------------------- */
  function renderProductivite() {
    const d = D.productivite;
    const container = document.getElementById("chart-prod");
    container.innerHTML = "";
    // Repli quand le conteneur n'a pas de largeur (pré-rendu hors écran) : cf.
    // chartWidth (js/chart.js), qui évite aussi le reflow forcé du pré-rendu.
    const cw = chartWidth(container);
    const W = Math.max(300, Math.min(cw, 920));
    const narrow = W < 480;
    const H = Math.round(narrow ? Math.min(W * 0.9, 340) : 360);
    const M = { top: 30, right: narrow ? 16 : 30, bottom: narrow ? 40 : 50, left: narrow ? 42 : 50 };
    const plotW = W - M.left - M.right;
    const plotH = H - M.top - M.bottom;
    const yMin = 0.0, yMax = 2.0;
    const sy = v => M.top + (1 - (v - yMin) / (yMax - yMin)) * plotH;
    const n = d.rapports.length;
    // Échelle X bord à bord : la bande (l'éventail) remplit tout le cadre et
    // « glisse » d'un côté à l'autre au lieu d'être 11 barres juxtaposées.
    const sx = i => M.left + (n === 1 ? 0.5 : i / (n - 1)) * plotW;

    const BLEU = "#1f4e79", ROUGE = "#d62728"; // = tokens --bleu / --rouge du site

    // Même fabrique d'éléments SVG que le moteur de graphiques (js/chart.js).
    const mk = el;
    const svg = mk("svg", {
      viewBox: `0 0 ${W} ${H}`, class: "chart-svg", role: "img", "aria-label": d.subtitle
    });

    // --- Défs : dégradé horizontal bleu→rouge (bascule centrée sur 2022) +
    //     découpe « révélation » pour un balayage gauche→droite à l'ouverture. ---
    const rnd = Math.random().toString(36).slice(2, 8);
    const gradId = "prod-grad-" + rnd;
    const revealId = "prod-reveal-" + rnd;
    const defs = mk("defs", {});
    const iBascule = d.rapports.findIndex(r => r.year >= 2022); // 1re année « rouge »
    const fBascule = iBascule < 0 ? 1 : (n === 1 ? 0.5 : iBascule / (n - 1));
    const grad = mk("linearGradient", {
      id: gradId, gradientUnits: "userSpaceOnUse",
      x1: M.left, y1: 0, x2: M.left + plotW, y2: 0
    });
    // Transition douce de part et d'autre de la bascule : le glissement de
    // couleur EST le message (« à partir de 2022, tout l'éventail glisse »).
    const g0 = Math.max(0, fBascule - 0.04), g1 = Math.min(1, fBascule + 0.04);
    [[0, BLEU], [g0, BLEU], [g1, ROUGE], [1, ROUGE]].forEach(([o, c]) => {
      grad.appendChild(mk("stop", { offset: (o * 100).toFixed(1) + "%", "stop-color": c }));
    });
    defs.appendChild(grad);
    const revealClip = mk("clipPath", { id: revealId });
    // Rect « visible par défaut » (état statique) ; masqué puis rejoué à
    // l'ouverture via __revealReset/__revealPlay (cf. js/cards.js).
    const revealW = plotW + M.right;
    const revealRect = mk("rect", { x: M.left, y: 0, width: revealW, height: H, class: "reveal-rect" });
    revealClip.appendChild(revealRect);
    defs.appendChild(revealClip);
    svg.appendChild(defs);

    // --- Grille Y + axe X (hors révélation : toujours visibles) ---
    for (let v = 0.0; v <= 2.0001; v += 0.5) {
      const y = sy(v);
      svg.appendChild(mk("line", { x1: M.left, y1: y, x2: M.left + plotW, y2: y, class: "chart-grid" }));
      const t = mk("text", { x: M.left - 8, y: y + 4, class: "chart-axis-label", "text-anchor": "end" });
      t.textContent = v.toFixed(1).replace(".", ",") + " %";
      svg.appendChild(t);
    }
    svg.appendChild(mk("line", { x1: M.left, y1: M.top + plotH, x2: M.left + plotW, y2: M.top + plotH, class: "chart-axis" }));
    d.rapports.forEach((r, i) => {
      if (!narrow || i % 2 === 0) {
        const yl = mk("text", { x: sx(i), y: M.top + plotH + 24, class: "chart-axis-label", "text-anchor": "middle" });
        yl.textContent = r.year;
        svg.appendChild(yl);
      }
    });

    // --- Calque animé (bande + bascule + courbe + points + étiquettes) ---
    const layer = mk("g", { "clip-path": `url(#${revealId})` });

    // Contours de l'éventail : frontière haute (max) et basse (min). Segments
    // droits, comme le reste du moteur (js/chart.js buildClippedPath en « L »).
    const upper = d.rapports.map((r, i) => `${sx(i).toFixed(1)},${sy(r.max).toFixed(1)}`);
    const lower = d.rapports.map((r, i) => `${sx(i).toFixed(1)},${sy(r.min).toFixed(1)}`);
    // Bande = aller (max) + retour (min inversé), remplie au dégradé.
    const bandD = `M${upper.join(" L")} L${lower.slice().reverse().join(" L")} Z`;
    layer.appendChild(mk("path", { d: bandD, fill: `url(#${gradId})`, "fill-opacity": 0.2, stroke: "none" }));
    // Frontières haute et basse (traits pleins, dégradé) pour la netteté.
    [upper, lower].forEach(pts => {
      layer.appendChild(mk("path", {
        d: `M${pts.join(" L")}`, fill: "none", stroke: `url(#${gradId})`,
        "stroke-width": 1.5, "stroke-linejoin": "round", "stroke-linecap": "round", opacity: 0.9
      }));
    });

    // Marque « bascule 2022 » : là où le bleu vire au rouge.
    if (iBascule > 0) {
      const xb = sx(iBascule);
      layer.appendChild(mk("line", {
        x1: xb, y1: M.top, x2: xb, y2: M.top + plotH,
        stroke: ROUGE, "stroke-width": 1, "stroke-dasharray": "3 4", opacity: 0.5
      }));
      const bl = mk("text", { x: xb, y: M.top - 10, class: "chart-break-label", fill: ROUGE, "text-anchor": narrow ? "end" : "middle" });
      bl.textContent = "bascule 2022";
      layer.appendChild(bl);
    }

    // Courbe de référence (par-dessus) : la chute 1,3 → 1,0 → 0,7.
    const refPts = d.rapports.map((r, i) => `${sx(i).toFixed(1)},${sy(r.central).toFixed(1)}`);
    layer.appendChild(mk("path", {
      d: `M${refPts.join(" L")}`, fill: "none", stroke: `url(#${gradId})`,
      "stroke-width": 2.5, "stroke-linejoin": "round", "stroke-linecap": "round"
    }));

    // Points + étiquettes UNIQUEMENT aux décrochages (met en avant les 2 baisses).
    let prev = null;
    d.rapports.forEach((r, i) => {
      const x = sx(i), y = sy(r.central);
      const color = r.year >= 2022 ? ROUGE : BLEU;
      layer.appendChild(mk("circle", { cx: x, cy: y, r: 5, fill: color, stroke: "#fff", "stroke-width": 2 }));
      if (prev === null || r.central !== prev) {
        const anchor = i === 0 ? "start" : (i === n - 1 ? "end" : "middle");
        const lx = i === 0 ? x + 2 : (i === n - 1 ? x - 2 : x);
        const ct = mk("text", { x: lx, y: y - 12, class: "chart-endnote", fill: color, "text-anchor": anchor });
        ct.textContent = r.central.toFixed(1).replace(".", ",");
        layer.appendChild(ct);
      }
      prev = r.central;
    });

    svg.appendChild(layer);
    container.appendChild(svg);

    // Révélation : balayage gauche→droite (le temps qui passe, 2016 → 2026),
    // rejoué à l'ouverture de la carte. Exactement le même mouvement que le
    // moteur en courbes — il expose __revealReset / __revealPlay sur le
    // conteneur, que le carrousel pilote (cf. js/cards.js).
    attachReveal(container, revealRect, revealW);

    const cap = document.createElement("p");
    cap.className = "chart-inline-legend";
    cap.innerHTML = `${window.CORChart.swatch(BLEU, "bar")} éventail des scénarios (min → max)<br>${window.CORChart.swatch(ROUGE)} scénario de référence — la ligne descend de 1,3 % à 0,7 %<br>dégradé bleu→rouge : à partir de 2022, tout l'éventail glisse vers le bas`;
    container.appendChild(cap);
  }

  /* ----------------------------------------------------------------------
   * 3. Fécondité : hypothèse vs réalité.
   * -------------------------------------------------------------------- */
  function renderFecondite(animate) {
    const d = S.fecondite;
    if (!d) return;
    const series = [
      { ...d.realise, kind: "solid", markers: true },
      ...d.hypotheses.map(h => ({ label: h.label, color: h.color, kind: "dash", points: h.points, endNote: h.endNote }))
    ];
    lineChart(document.getElementById("chart-fecondite"), {
      series,
      x: { min: d.xMin, max: d.xMax },
      y: { min: d.yMin, max: d.yMax, suffix: "" },
      ariaLabel: d.subtitle,
      animate
    });
  }

  /* ----------------------------------------------------------------------
   * 4. Productivité : hypothèse vs réalité.
   * -------------------------------------------------------------------- */
  function renderProductiviteReel(animate) {
    const d = S.productiviteReel;
    if (!d) return;
    const series = [
      { ...d.realise, kind: "solid", markers: true },
      ...d.hypotheses.map(h => ({ label: h.label, color: h.color, kind: "dash", points: h.points, endNote: h.endNote }))
    ];
    lineChart(document.getElementById("chart-prod-reel"), {
      series,
      x: { min: d.xMin, max: d.xMax },
      y: { min: d.yMin, max: d.yMax, suffix: " %" },
      ariaLabel: d.subtitle,
      animate
    });
  }

  /* ----------------------------------------------------------------------
   * Fiscalisation des retraites : le financement par l'impôt (ITAF + CSG)
   * qui monte, 2022 → 2025. Une seule courbe (montant en Md€).
   * -------------------------------------------------------------------- */
  function renderFiscalisation(animate) {
    const d = D.fiscalisation;
    if (!d) return;
    const series = [{ ...d.realise, kind: "solid", markers: true }];
    lineChart(document.getElementById("chart-fiscalisation"), {
      series,
      x: { min: d.xMin, max: d.xMax },
      y: { min: d.yMin, max: d.yMax, suffix: " Md€" },
      ariaLabel: d.subtitle,
      animate
    });
  }

  /* ----------------------------------------------------------------------
   * Sankey de la section financement : « D'où vient l'argent des retraites ? »
   * Structure des ressources (gauche) → Système de retraite → emplois (droite).
   *
   * DISTINCTION OFFICIEL / CALCULÉ (exigence : ne montrer que des chiffres
   * officiels, et signaler tout calcul) — cf. D.sankeyFinancement :
   *   - Parts (%) par année 2004→2025  : OFFICIELLES (COR, fig. 2.11).
   *   - Montants 2025 en Md€           : OFFICIELS (COR, tableau 2.2).
   *   - Montants des autres années Md€ : CALCULÉS (parts × PIB INSEE) → signalés.
   * L'unité est au choix du lecteur : « Parts (%) » (officiel, toutes années)
   * ou « Milliards € » (officiel en 2025, calculé ailleurs).
   * -------------------------------------------------------------------- */
  let sankeyYear = 2025;       // 2004 … 2025
  let sankeyUnit = "pct";      // "pct" (%) par défaut : 100 % officiel, toutes années | "mds" (Md€)

  // Construit la config du moteur Sankey pour une année et une unité.
  function buildSankeyCfg(year, unit, mini) {
    const s = D.sankeyFinancement;
    if (!s) return null;
    const y = Number(year);
    const shares = s.sharesPct[y];
    if (!shares) return null;
    const total = s.totalMds[y];
    const pct = unit === "pct";
    // En %, on garde la valeur NON arrondie (le moteur arrondit pour l'affichage) :
    // sommer des parts déjà arrondies donnerait un total faux (ex. 100,1 %).
    const sources = s.sources.map(d => ({
      key: d.key, label: d.label, short: d.short, color: d.color, labelDy: d.labelDy,
      value: pct ? shares[d.key] : Math.round((shares[d.key] / 100) * total)
    })).filter(n => n.value > 0);

    // Côté « où va l'argent ». Officiel par groupe de régimes en 2025 (rapport
    // 2026) ; pour les autres années, aucune ventilation officielle → un seul
    // nœud agrégé « prestations versées » (= total, officiel en % du PIB).
    let regimes, solde = 0, singleTarget = false;
    if (y === s.officialYear && s.regimes2025) {
      const sumMds = s.regimes2025.reduce((a, b) => a + b.mds, 0);
      regimes = s.regimes2025.map(r => ({
        key: r.key, label: r.label, short: r.short, color: r.color, labelDy: r.labelDy,
        value: pct ? (r.mds / sumMds) * 100 : Math.round(r.mds)
      }));
      if (!pct) {
        const sumSrc = sources.reduce((a, b) => a + b.value, 0);
        const sumReg = regimes.reduce((a, b) => a + b.value, 0);
        solde = sumSrc - sumReg;   // < 0 ⇒ besoin de financement (déficit)
      }
    } else {
      // Pas de ventilation officielle par régime : une seule destination.
      // singleTarget ⇒ le moteur fusionne le nœud central et la destination
      // (une seule barre à droite, plus lisible).
      singleTarget = true;
      regimes = [{
        key: "pensions", label: "Prestations versées (dépenses du système)",
        short: "Pensions versées", color: "#334155",
        value: pct ? 100 : Math.round(total)
      }];
    }

    return {
      sources, regimes, solde, singleTarget,
      soldeLabel: { deficit: "Besoin de financement", shortDeficit: "Déficit", excedent: "Excédent", shortExcedent: "Excédent" },
      centerLabel: "Système de retraite",
      unit: pct ? " %" : " Md€",
      decimals: pct ? 1 : 0,
      showShare: false,   // jamais de « · X % » en plus du montant (Md€ = Md€ seul)
      yearLabel: String(y),
      mini: !!mini,
      ariaLabel: "Structure des ressources des retraites — " + y +
        (pct ? " (parts en %)" : " (en milliards d’euros)")
    };
  }
  // Source dynamique : dit clairement ce qui est officiel et ce qui est calculé.
  function sankeySourceNote(year, unit) {
    if (unit === "pct")
      return "Parts officielles — COR, rapport 2026 (figure 2.11, structure des ressources 2004–2025, d’après les rapports à la CCSS).";
    if (Number(year) === D.sankeyFinancement.officialYear)
      return "Montants officiels — COR, tableau 2.2 (ressources 2025 = 422,23 Md€). Dépenses par groupe de régimes : COR, rapport 2026.";
    return "⚠️ Montants CALCULÉS, non publiés tels quels par le COR : parts officielles (COR) × PIB nominal INSEE de l’année. " +
      "Seules les parts en % (et l’année 2025 en Md€) sont des chiffres officiels du COR.";
  }

  function renderFinancementSankey() {
    const host = document.getElementById("chart-sankey");
    if (!host) return;
    const cfg = buildSankeyCfg(sankeyYear, sankeyUnit, false);
    if (!cfg) return;
    sankeyChart(host, cfg);
    const lbl = document.getElementById("sankey-year-label");
    if (lbl) lbl.textContent = String(sankeyYear);
    const src = document.getElementById("sankey-source");
    if (src) src.textContent = sankeySourceNote(sankeyYear, sankeyUnit);
    // Année ou unité changée : le diagramme a été reconstruit, le PNG en cache
    // ne correspond plus à ce qui est affiché.
    const card = host.closest(".chart-card");
    if (card) refreshChartPngCache(card);
  }

  // Contrôles : sélecteur d'unité (Parts % / Milliards €) + liste déroulante
  // d'année (2004→2025). Choix volontairement sans ambiguïté (une seule année
  // affichée à la fois, unité explicite).
  function setupSankeyControls() {
    const s = D.sankeyFinancement;
    if (!s) return;
    const unitWrap = document.getElementById("sankey-unit-toggle");
    if (unitWrap && !unitWrap.__built) {
      unitWrap.__built = true;
      unitWrap.addEventListener("click", e => {
        const b = e.target.closest(".unit-btn");
        if (!b) return;
        sankeyUnit = b.dataset.unit;
        unitWrap.querySelectorAll(".unit-btn").forEach(x => {
          const on = x === b;
          x.classList.toggle("is-active", on);
          x.setAttribute("aria-pressed", on ? "true" : "false");
        });
        renderFinancementSankey();
      });
    }
    const sel = document.getElementById("sankey-year");
    if (sel && !sel.__built) {
      sel.__built = true;
      buildYearSelect(sel, s.years);
    }
  }

  // Liste déroulante d'année personnalisée (bouton + listbox stylable aux
  // couleurs du site), en remplacement du <select> natif dont la liste ouverte
  // n'est pas stylable en CSS. Entièrement accessible au clavier et compatible
  // lecteur d'écran (rôles listbox/option, aria-expanded/aria-selected).
  function buildYearSelect(root, years) {
    const btn = root.querySelector(".cor-select__btn");
    const valEl = root.querySelector(".cor-select__value");
    const list = root.querySelector(".cor-select__list");
    if (!btn || !valEl || !list) return;

    list.innerHTML = years.map(y =>
      `<li role="option" data-value="${y}" id="sankey-year-opt-${y}"` +
      `${y === sankeyYear ? ' aria-selected="true" class="is-selected"' : ""}>${y}</li>`
    ).join("");
    const options = Array.from(list.querySelectorAll('[role="option"]'));

    function setValue(y, focusBtn) {
      sankeyYear = Number(y);
      root.dataset.value = String(y);
      valEl.textContent = String(y);
      options.forEach(o => {
        const on = o.dataset.value === String(y);
        o.classList.toggle("is-selected", on);
        if (on) o.setAttribute("aria-selected", "true");
        else o.removeAttribute("aria-selected");
      });
      close(focusBtn);
      renderFinancementSankey();
    }

    function isOpen() { return btn.getAttribute("aria-expanded") === "true"; }

    function activeOption() {
      return options.find(o => o.dataset.value === String(sankeyYear)) || options[0];
    }

    function open() {
      if (isOpen()) return;
      btn.setAttribute("aria-expanded", "true");
      list.hidden = false;
      const cur = activeOption();
      list.setAttribute("aria-activedescendant", cur.id);
      options.forEach(o => o.classList.toggle("is-active", o === cur));
      cur.scrollIntoView({ block: "nearest" });
      list.focus();
    }

    function close(focusBtn) {
      if (!isOpen() && list.hidden) { if (focusBtn) btn.focus(); return; }
      btn.setAttribute("aria-expanded", "false");
      list.hidden = true;
      list.removeAttribute("aria-activedescendant");
      options.forEach(o => o.classList.remove("is-active"));
      if (focusBtn) btn.focus();
    }

    function moveActive(delta) {
      const cur = options.find(o => o.classList.contains("is-active")) || activeOption();
      let i = options.indexOf(cur) + delta;
      i = Math.max(0, Math.min(options.length - 1, i));
      const next = options[i];
      options.forEach(o => o.classList.toggle("is-active", o === next));
      list.setAttribute("aria-activedescendant", next.id);
      next.scrollIntoView({ block: "nearest" });
    }

    btn.addEventListener("click", () => { isOpen() ? close(false) : open(); });

    btn.addEventListener("keydown", e => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        open();
      }
    });

    list.addEventListener("click", e => {
      const opt = e.target.closest('[role="option"]');
      if (opt) setValue(opt.dataset.value, true);
    });

    list.addEventListener("keydown", e => {
      switch (e.key) {
        case "ArrowDown": e.preventDefault(); moveActive(1); break;
        case "ArrowUp": e.preventDefault(); moveActive(-1); break;
        case "Home": e.preventDefault(); moveActive(-options.length); break;
        case "End": e.preventDefault(); moveActive(options.length); break;
        case "Enter":
        case " ": {
          e.preventDefault();
          const cur = options.find(o => o.classList.contains("is-active"));
          if (cur) setValue(cur.dataset.value, true);
          break;
        }
        case "Escape": e.preventDefault(); close(true); break;
        case "Tab": close(false); break;
        default: break;
      }
    });

    document.addEventListener("click", e => {
      if (isOpen() && !root.contains(e.target)) close(false);
    });
  }

  /* ----------------------------------------------------------------------
   * Explorateur d'indicateurs : un thème + un indicateur = un graphique.
   * -------------------------------------------------------------------- */
  function renderExplorer() {
    const exp = S.explorer;
    if (!exp || !exp.themes.length) return;
    const themesEl = document.getElementById("explorer-themes");
    const chipsEl = document.getElementById("explorer-indicators");
    themesEl.innerHTML = "";
    let currentId = null;
    explorerRedraw = animate => { if (currentId) drawIndicator(currentId, animate); };

    function drawIndicator(iid, animate) {
      const ind = exp.indicators[iid];
      if (!ind) return;
      currentId = iid;
      document.getElementById("exp-label").textContent = ind.label;
      document.getElementById("exp-desc").textContent = ind.desc || "";
      document.getElementById("exp-source").textContent = "Source : " + (ind.source || "COR.");
      chipsEl.querySelectorAll(".exp-chip").forEach(c => {
        const on = c.dataset.id === iid;
        c.classList.toggle("active", on);
        c.setAttribute("aria-pressed", on ? "true" : "false");
      });
      if (ind.chartType === "bar") {
        barChart(document.getElementById("chart-explorer"), {
          series: ind.series,
          categories: ind.categories || [],
          barMode: ind.barMode || "grouped",
          waterfall: ind.waterfall || false,
          x: { label: ind.xLabel || "Catégorie" },
          y: { min: ind.yMin, max: ind.yMax, suffix: ind.suffix || "" },
          ariaLabel: ind.label,
          animate
        });
      } else {
        lineChart(document.getElementById("chart-explorer"), {
          // Millésime en bout de courbe pour les indicateurs « rapports
          // superposés », comme sur le graphique phare (« Rapport 2016 » → 2016).
          series: ind.series.map(s => {
            const m = /^Rapport (\d{4})/.exec(s.label);
            return m && !s.endNote ? { ...s, endNote: m[1] } : s;
          }),
          x: { min: ind.xMin, max: ind.xMax, label: ind.xLabel || "Année" },
          y: { min: ind.yMin, max: ind.yMax, suffix: ind.suffix || "" },
          y2: ind.y2,
          categories: ind.categories,
          ariaLabel: ind.label,
          animate
        });
      }
      // Le contenu de la carte explorateur a changé : on régénère son cache PNG
      // (en temps mort) pour que le téléchargement reflète l'indicateur courant.
      const card = document.getElementById("chart-explorer").closest(".chart-card");
      if (card) refreshChartPngCache(card);
    }

    function buildChips(theme) {
      chipsEl.innerHTML = "";
      theme.indicators.forEach(iid => {
        const ind = exp.indicators[iid];
        const btn = document.createElement("button");
        btn.className = "exp-chip";
        btn.type = "button";
        btn.setAttribute("aria-pressed", "false");
        btn.dataset.id = iid;
        btn.textContent = ind.label;
        btn.addEventListener("click", () => drawIndicator(iid));
        chipsEl.appendChild(btn);
      });
      drawIndicator(theme.indicators[0]);
    }

    exp.themes.forEach((theme, idx) => {
      const tab = document.createElement("button");
      tab.className = "exp-tab" + (idx === 0 ? " active" : "");
      tab.type = "button";
      tab.setAttribute("aria-pressed", idx === 0 ? "true" : "false");
      tab.textContent = theme.name;
      tab.addEventListener("click", () => {
        themesEl.querySelectorAll(".exp-tab").forEach(t => {
          t.classList.remove("active");
          t.setAttribute("aria-pressed", "false");
        });
        tab.classList.add("active");
        tab.setAttribute("aria-pressed", "true");
        buildChips(theme);
      });
      themesEl.appendChild(tab);
    });
    buildChips(exp.themes[0]);
  }

  /* ----------------------------------------------------------------------
   * Comparaison internationale : barres horizontales empilées (pub/privé).
   * -------------------------------------------------------------------- */
  function renderInternational() {
    const d = S.international;
    if (!d) return;
    const host = document.getElementById("chart-international");
    host.innerHTML = "";
    const mk = el;   // fabrique d'éléments SVG partagée (js/chart.js)
    const cs = d.countries;
    const cw = chartWidth(host);
    const W = Math.max(300, Math.min(cw, 920));
    const narrow = W < 480;
    const rowH = narrow ? 34 : 30, top = 16, bottom = 38;
    const left = narrow ? 90 : 104, right = narrow ? 40 : 58;
    const H = top + bottom + cs.length * rowH;
    const maxV = Math.ceil(Math.max(...cs.map(c => c.total)) + 1);
    const sx = v => left + (v / maxV) * (W - left - right);
    const svg = mk("svg", { viewBox: `0 0 ${W} ${H}`, class: "chart-svg", role: "img",
      "aria-label": "Dépenses de retraite par pays en % du PIB" });

    for (let v = 0; v <= maxV; v += 5) {
      svg.appendChild(mk("line", { x1: sx(v), y1: top, x2: sx(v), y2: top + cs.length * rowH, class: "chart-grid" }));
      const t = mk("text", { x: sx(v), y: top + cs.length * rowH + 20, class: "chart-axis-label", "text-anchor": "middle" });
      t.textContent = v + " %"; svg.appendChild(t);
    }
    const fmt = v => String(v).replace(".", ",") + " %";
    // Contexte de mesure : on n'inscrit une étiquette que si elle tient dans son segment.
    const meas = document.createElement("canvas").getContext("2d");
    meas.font = "700 11px 'Segoe UI', system-ui, Arial, sans-serif";
    // Étiquette de part (publique/privée) centrée dans son segment — seulement
    // si le segment est assez large pour l'accueillir sans déborder.
    const segLabel = (xa, xb, y, text, fill) => {
      if (meas.measureText(text).width + 8 > xb - xa) return;
      const t = mk("text", { x: (xa + xb) / 2, y: y + 4, "text-anchor": "middle",
        "font-size": 11, "font-weight": 700, fill });
      t.textContent = text; svg.appendChild(t);
    };
    cs.forEach((c, i) => {
      const y = top + i * rowH + rowH / 2;
      const isFR = c.name === "France";
      const lbl = mk("text", { x: left - 10, y: y + 4, "text-anchor": "end",
        class: "chart-axis-label", fill: isFR ? "#c2185b" : "#1c2530",
        "font-weight": isFR ? 800 : 500 });
      lbl.textContent = c.name; svg.appendChild(lbl);
      const h = 16;
      svg.appendChild(mk("rect", { x: left, y: y - h / 2, width: sx(c.pub) - left, height: h,
        fill: isFR ? "#1f4e79" : "#5b7fa6", rx: 2 }));
      svg.appendChild(mk("rect", { x: sx(c.pub), y: y - h / 2, width: sx(c.total) - sx(c.pub), height: h,
        fill: isFR ? "#7fb0e0" : "#c2d4e8", rx: 2 }));
      // Parts publique (sur fond foncé, en blanc) et privée (sur fond clair, en foncé).
      segLabel(left, sx(c.pub), y, fmt(c.pub), "#ffffff");
      segLabel(sx(c.pub), sx(c.total), y, fmt(c.priv), "#1c2530");
      const val = mk("text", { x: sx(c.total) + 6, y: y + 4, class: "chart-endnote",
        fill: isFR ? "#c2185b" : "#5b6671", "text-anchor": "start" });
      val.textContent = fmt(c.total); svg.appendChild(val);
    });
    host.appendChild(svg);
    const leg = document.createElement("p");
    leg.className = "chart-inline-legend";
    leg.innerHTML = `${window.CORChart.swatch("#1f4e79")} Dépenses publiques<br>${window.CORChart.swatch("#7fb0e0")} Dépenses privées`;
    host.appendChild(leg);
  }

  /* ----------------------------------------------------------------------
   * Simulateur des 3 leviers : l'utilisateur dose âge / cotisations / pensions.
   * Modèle (illustratif) : effets additifs, calibrés sur les montants COR pour
   * équilibrer le système en 2070 via un seul levier.
   * -------------------------------------------------------------------- */
  function renderLeviers() {
    const L = S.leviers;
    if (!L) return;
    const id = x => document.getElementById(x);
    const f1 = v => (Math.round(v * 10) / 10).toString().replace(".", ",");
    const ageFullMonths = L.age.full_years * 12;
    const cotFull = L.cotis.full_pts;
    const penFull = L.pension.full_pct;
    const elAge = id("lv-age"), elCot = id("lv-cot"), elPen = id("lv-pen");
    if (!elAge) return;

    function update() {
      const months = +elAge.value;
      const cotPts = +elCot.value / 10;
      const penPct = +elPen.value / 2;
      const ageTxt = "+" + months + " mois";
      const cotTxt = "+" + f1(cotPts) + " pt";
      const penTxt = "−" + f1(penPct) + " %";
      id("lv-age-out").textContent = ageTxt;
      id("lv-cot-out").textContent = cotTxt;
      id("lv-pen-out").textContent = penTxt;
      // Le curseur porte des ENTIERS d'un pas arbitraire (dixièmes de point,
      // demi-points) : sans `aria-valuetext`, le lecteur d'écran annonce « 24 »
      // là où l'écran affiche « +2,4 pt ». On lui donne la même chaîne qu'à
      // l'œil — celle qu'on vient de calculer, donc jamais désynchronisée.
      elAge.setAttribute("aria-valuetext", ageTxt);
      elCot.setAttribute("aria-valuetext", cotTxt);
      elPen.setAttribute("aria-valuetext", penTxt);
      id("lv-age-note").textContent =
        "âge effectif de départ : " + f1(L.age.ref) + " → " + f1(L.age.ref + months / 12) + " ans";
      id("lv-cot-note").textContent =
        "taux de prélèvement : " + f1(L.cotis.ref) + " % → " + f1(L.cotis.ref + cotPts) + " %";
      id("lv-pen-note").textContent =
        "pension / salaire : " + f1(L.pension.ref_pct) + " % → " + f1(L.pension.ref_pct * (1 - penPct / 100)) + " %";

      const closed = (months / ageFullMonths + cotPts / cotFull + penPct / penFull) * 100;
      const fill = id("gauge-fill"), msg = id("gauge-msg");
      fill.style.width = Math.min(closed, 100) + "%";
      if (closed < 95) {
        fill.className = "gauge-fill";
        msg.innerHTML = `Déficit comblé à <strong>${Math.round(closed)} %</strong> — il en reste ${Math.round(100 - closed)} %.`;
      } else if (closed <= 110) {
        fill.className = "gauge-fill ok";
        msg.innerHTML = `✓ <strong>Système équilibré en 2070&nbsp;!</strong> (comblé à ${Math.round(closed)} %)`;
      } else {
        fill.className = "gauge-fill over";
        msg.innerHTML = `Vous en faites plus que nécessaire (<strong>${Math.round(closed)} %</strong>) — possible excédent.`;
      }
    }
    [elAge, elCot, elPen].forEach(e => e.addEventListener("input", update));
    id("lv-source").textContent = "Source : " + L.source +
      " — calibrage : seul, chaque levier équilibre avec +" + f1(L.age.full_years) +
      " an d'âge, +" + f1(L.cotis.full_pts) + " pts de cotisation, ou −" + f1(L.pension.full_pct) + " % de pensions.";
    update();
  }

  /* ----------------------------------------------------------------------
   * 5. Tableau des hypothèses.
   * -------------------------------------------------------------------- */
  function renderTable() {
    const d = D.hypothesesTable;
    const wrap = document.getElementById("hyp-table");
    let html = "<table><thead><tr>";
    d.colonnes.forEach(c => html += `<th>${c}</th>`);
    html += "</tr></thead><tbody>";
    d.lignes.forEach(row => {
      html += "<tr>";
      row.forEach((cell, i) => html += i === 0 ? `<th scope="row">${cell}</th>` : `<td>${cell}</td>`);
      html += "</tr>";
    });
    html += "</tbody></table>";
    wrap.innerHTML = html;
  }

  /* ----------------------------------------------------------------------
   * 6. Sources.
   * -------------------------------------------------------------------- */
  function renderSources() {
    const ul = document.getElementById("sources-list");
    D.sources.forEach(s => {
      const li = document.createElement("li");
      li.innerHTML = `<a href="${s.url}" target="_blank" rel="noopener">${s.titre}</a>`;
      ul.appendChild(li);
    });
  }

  /* ----------------------------------------------------------------------
   * Rendu des graphiques par SECTION.
   * Construire les neuf graphiques SVG au chargement saturait le thread principal
   * (Total Blocking Time) et enchaînait les reflows. Chaque section n'est donc
   * tracée qu'une fois — au pré-rendu en temps mort (prerenderAllCharts) ou à la
   * première ouverture de sa carte — puis jamais re-tracée, sauf changement réel
   * de largeur de fenêtre (rotation) : la mise en page d'un graphique dépend de
   * la largeur (seuil « étroit », marges d'axes, étiquettes).
   * -------------------------------------------------------------------- */
  let resizeTimer;

  // Section → tracés de ses graphiques. Source unique, utilisée pour le premier
  // rendu (renderSectionOnce) comme pour le re-rendu (renderAllCharts).
  // `animate:false` partout : le tracé des courbes n'est pas lancé ici, il est
  // rejoué à l'ouverture de la carte via __revealPlay (cf. js/cards.js).
  const SECTION_CHARTS = {
    depenses: [renderDepensesPib],
    deficit: [renderSolde, renderCiseaux],
    productivite: [renderProductivite],
    realite: [renderFecondite, renderProductiviteReel],
    niveau: [renderNiveauVie],
    financement: [renderFiscalisation, renderFinancementSankey],
    monde: [renderInternational],
    explorer: [ensureExplorer]
    // simulateur / hypotheses / methode : contenu statique ou déjà câblé au chargement.
  };
  const drawSection = (id, animate) =>
    (SECTION_CHARTS[id] || []).forEach(draw => draw(animate));

  // Sections déjà tracées (pré-rendu au repos OU 1re ouverture).
  const sectionRendered = new Set();
  function renderSectionOnce(id) {
    if (sectionRendered.has(id)) return;
    sectionRendered.add(id);
    if (id === "financement") setupSankeyControls();
    drawSection(id, false);
  }

  // Re-trace les sections déjà construites (changement de largeur de fenêtre,
  // rotation d'écran) : sans cela, les SVG gardent la mise en page calculée pour
  // l'ancienne largeur et le viewBox se contente de les étirer.
  function renderAllCharts(animate) {
    sectionRendered.forEach(id => {
      // L'explorateur a son propre re-tracé (explorerRedraw) : il ne doit pas
      // être reconstruit ici (ses onglets seraient dupliqués).
      if (id !== "explorer") drawSection(id, animate);
    });
  }

  // Charge un script à la demande (une seule fois, résultat mémoïsé). Sert au
  // chargement paresseux des données de l'explorateur, sorties du chargement
  // initial pour alléger le téléchargement et le JSON.parse de la page.
  const scriptCache = new Map();
  function loadScript(src) {
    if (scriptCache.has(src)) return scriptCache.get(src);
    const p = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("Échec du chargement : " + src));
      document.head.appendChild(s);
    });
    scriptCache.set(src, p);
    return p;
  }

  // Charge (une seule fois) les données de l'explorateur puis le construit.
  // Sorti de init() pour pouvoir aussi être déclenché à la demande par le mode
  // carousel (js/cards.js) quand on ouvre la carte « Explorer ».
  // Mémoïse la promesse pour que le garde soit synchrone : sans cela, plusieurs
  // appels concurrents (observateur de défilement, carousel, CORApp) déclenchés
  // avant la fin du chargement passeraient tous le garde et construiraient
  // l'explorateur en double (boutons de thèmes dupliqués).
  let explorerPromise = null;

  // Message posé dans le titre de la carte de l'explorateur tant qu'il n'y a pas
  // de graphique à montrer (chargement en cours, ou échec). `#exp-label` affiche
  // « — » dans le HTML statique : sans cela, un réseau lent ou coupé laisse une
  // carte vide et muette.
  function explorerNotice(msg) {
    const label = document.getElementById("exp-label");
    if (label) label.textContent = msg;
    const desc = document.getElementById("exp-desc");
    if (desc) desc.textContent = "";
  }

  function ensureExplorer() {
    if (explorerPromise) return explorerPromise;
    explorerNotice("Chargement des indicateurs…");
    explorerPromise = loadScript("./data/cor-explorer.generated.js").then(() => {
      if (window.COR_EXPLORER) S.explorer = window.COR_EXPLORER.explorer;
      // Script chargé mais vide (fichier tronqué par un cache intermédiaire) :
      // `renderExplorer` sortirait sans rien afficher, laissant le message de
      // chargement à l'écran. On bascule sur le message d'erreur.
      if (!S.explorer || !S.explorer.themes || !S.explorer.themes.length) {
        throw new Error("Données de l'explorateur absentes");
      }
      renderExplorer();
      setupChartTools();
    }).catch(() => {
      // On remet la promesse à null AVANT de proposer le réessai : le rappel
      // repasse alors par un vrai chargement (le cache de `loadScript` est lui
      // aussi purgé, sinon la promesse rejetée serait resservie telle quelle).
      explorerPromise = null;
      scriptCache.delete("./data/cor-explorer.generated.js");
      explorerNotice("Indicateurs indisponibles — vérifiez votre connexion.");
      toast("Impossible de charger les indicateurs.", "Réessayer", ensureExplorer);
    });
    return explorerPromise;
  }

  /* ----------------------------------------------------------------------
   * Finitions : toast (notifications) et export PNG.
   * -------------------------------------------------------------------- */
  function toast(msg, actionLabel, fn) {
    const t = document.getElementById("toast");
    document.getElementById("toast-msg").textContent = msg;
    const a = document.getElementById("toast-action");
    if (actionLabel) {
      a.hidden = false; a.textContent = actionLabel;
      a.onclick = () => { if (fn) fn(); t.hidden = true; };
    } else {
      a.hidden = true;
      setTimeout(() => { t.hidden = true; }, 2600);
    }
    t.hidden = false;
  }

  // Style minimal embarqué pour que le PNG exporté garde grille, axes et libellés.
  const EXPORT_CSS =
    "text{font-family:'Segoe UI',Arial,sans-serif}" +
    ".chart-grid{stroke:#e7ecf2}.chart-axis{stroke:#b9c4d0}.chart-tick{stroke:#b9c4d0}" +
    ".chart-axis-label{fill:#5b6671;font-size:12px}.chart-endnote{font-size:12px;font-weight:700}" +
    ".chart-ref-line{stroke:#d62728;stroke-dasharray:4 4}.chart-focus-line{display:none}";

  const EXPORT_FONT = "'Segoe UI', Arial, sans-serif";

  // Découpe un texte en lignes tenant dans une largeur donnée.
  function wrapLines(ctx, text, maxW) {
    const words = String(text).split(/\s+/).filter(Boolean);
    const lines = []; let line = "";
    words.forEach(w => {
      const t = line ? line + " " + w : w;
      if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; }
      else line = t;
    });
    if (line) lines.push(line);
    return lines;
  }

  // Entrées de légende d'une carte : [{ color, dash, label }] — couleur nulle
  // pour un simple texte. Les libellés complets sont pris dans l'attribut
  // title (la légende affichée peut être raccourcie sur mobile).
  function legendEntries(card) {
    const items = [...card.querySelectorAll(".chart-legend .legend-item")];
    if (items.length) {
      return items.map(it => {
        const line = it.querySelector(".legend-swatch line");
        return {
          color: line ? line.getAttribute("stroke") : null,
          dash: !!(line && line.getAttribute("stroke-dasharray")),
          label: (it.title || it.textContent).replace(/\s+/g, " ").trim()
        };
      });
    }
    const inline = card.querySelector(".chart-inline-legend");
    if (!inline) return [];
    const entries = []; let cur = null;
    inline.childNodes.forEach(n => {
      if (n.nodeType === 1 && n.classList && n.classList.contains("legend-swatch")) {
        const l = n.querySelector("line");
        cur = { color: l ? l.getAttribute("stroke") : null, dash: !!(l && l.getAttribute("stroke-dasharray")), label: "" };
        entries.push(cur);
      } else if (cur) {
        cur.label += n.textContent;
      } else if (n.textContent.trim()) {
        cur = { color: null, dash: false, label: n.textContent };
        entries.push(cur);
      }
    });
    entries.forEach(e => { e.label = e.label.replace(/\s+/g, " ").replace(/^[\s·]+|[\s·]+$/g, "").trim(); });
    return entries.filter(e => e.label);
  }

  // Rendu PNG complet d'un graphique : titre, sous-titre, graphique, légende et
  // source — l'image se suffit à elle-même une fois partagée. Renvoie une
  // Promise<Blob> (ou null en cas d'échec). L'enregistrement est volontairement
  // séparé (saveBlob) pour se faire de façon synchrone dans le geste
  // utilisateur, à partir du blob pré-généré (voir downloadChartPng).
  function renderChartPngBlob(card, svg) {
    return new Promise(resolve => {
    if (!svg) { resolve(null); return; }
    const vb = svg.viewBox && svg.viewBox.baseVal;
    const cw = (vb && vb.width) || svg.clientWidth || 760;
    const ch = (vb && vb.height) || svg.clientHeight || 440;
    const W = Math.max(cw, 640);
    const chartH = ch * (W / cw);
    const pad = 20, innerW = W - 2 * pad;

    const txt = sel => { const e = card.querySelector(sel); return e ? e.textContent.replace(/\s+/g, " ").trim() : ""; };
    const title = txt(".chart-title strong");
    const subtitle = txt(".chart-title span");
    const source = txt(".chart-source");
    const legend = legendEntries(card);
    const credit = "Le COR sous l'œil des citoyens — wald52.github.io/Le-COR";

    // Pré-calcul de la mise en page avec un contexte de mesure.
    const meas = document.createElement("canvas").getContext("2d");
    meas.font = "700 17px " + EXPORT_FONT;
    const titleLines = wrapLines(meas, title, innerW);
    meas.font = "12.5px " + EXPORT_FONT;
    const subLines = wrapLines(meas, subtitle, innerW);
    meas.font = "11.5px " + EXPORT_FONT;
    const rows = [];
    {
      let x = 0, row = [];
      legend.forEach(e => {
        const swW = e.color ? 30 : 0;
        const wEntry = swW + meas.measureText(e.label).width + 22;
        if (x + wEntry > innerW && row.length) { rows.push(row); row = []; x = 0; }
        row.push(Object.assign({ x: x }, e));
        x += wEntry;
      });
      if (row.length) rows.push(row);
    }
    meas.font = "italic 10.5px " + EXPORT_FONT;
    const srcLines = wrapLines(meas, source, innerW);

    const H = pad + titleLines.length * 22 + 6 + subLines.length * 17 +
      8 + chartH + 6 + rows.length * 19 + 10 + srcLines.length * 15 + 6 + 14 + pad;

    // Image SVG du graphique, styles embarqués (axes, libellés…).
    const clone = svg.cloneNode(true);
    clone.querySelectorAll(".reveal-rect").forEach(r => r.setAttribute("width", 99999));
    const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
    style.textContent = EXPORT_CSS;
    clone.insertBefore(style, clone.firstChild);
    const xml = new XMLSerializer().serializeToString(clone);
    // Data-URL en clair (pas de base64) : `btoa(unescape(encodeURIComponent(…)))`
    // reposait sur `unescape`, déprécié, et enchaînait deux conversions de toute
    // la chaîne. Une URL blob: serait plus légère encore, mais la CSP de la page
    // n'autorise que `img-src 'self' data:` — et l'élargir pour un export n'en
    // vaut pas le prix.
    const svgUrl = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(xml);
    const img = new Image();
    img.onload = () => {
      const s = 2;
      const c = document.createElement("canvas");
      c.width = Math.round(W * s); c.height = Math.round(H * s);
      const ctx = c.getContext("2d");
      ctx.scale(s, s);
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, H);
      ctx.textBaseline = "top";
      let y = pad;
      ctx.fillStyle = "#1f4e79"; ctx.font = "700 17px " + EXPORT_FONT;
      titleLines.forEach(l => { ctx.fillText(l, pad, y); y += 22; });
      y += 6;
      ctx.fillStyle = "#5b6671"; ctx.font = "12.5px " + EXPORT_FONT;
      subLines.forEach(l => { ctx.fillText(l, pad, y); y += 17; });
      y += 8;
      ctx.drawImage(img, 0, y, W, chartH);
      y += chartH + 6;
      ctx.font = "11.5px " + EXPORT_FONT;
      rows.forEach(row => {
        row.forEach(e => {
          let x = pad + e.x;
          if (e.color) {
            ctx.strokeStyle = e.color; ctx.lineWidth = 3; ctx.lineCap = "round";
            ctx.setLineDash(e.dash ? [5, 3] : []);
            ctx.beginPath(); ctx.moveTo(x, y + 6); ctx.lineTo(x + 22, y + 6); ctx.stroke();
            ctx.setLineDash([]);
            x += 30;
          }
          ctx.fillStyle = "#1c2530";
          ctx.fillText(e.label, x, y);
        });
        y += 19;
      });
      y += 10;
      ctx.fillStyle = "#5b6671"; ctx.font = "italic 10.5px " + EXPORT_FONT;
      srcLines.forEach(l => { ctx.fillText(l, pad, y); y += 15; });
      y += 6;
      ctx.fillStyle = "#9aa7b4"; ctx.font = "10px " + EXPORT_FONT;
      ctx.fillText(credit, pad, y);
      c.toBlob(b => resolve(b || null));
    };
    img.onerror = () => { console.warn("Export PNG : échec du rendu SVG"); resolve(null); };
    img.src = svgUrl;
    });
  }

  // Enregistre l'image PNG (blob) d'un graphique. Appelé de façon synchrone dans
  // le geste utilisateur (le blob est pré-généré en cache, cf. plus bas).
  //
  // Sur mobile (Android / iOS), un <a download> programmatique d'une URL blob:
  // est très souvent IGNORÉ silencieusement par Chrome Android : le clic ne
  // déclenche aucun téléchargement (constaté : bouton tapé, aucune notification).
  // On passe donc par l'API Web Share, qui partage/enregistre un vrai fichier
  // image de façon fiable (« Enregistrer l'image », « Télécharger », envoi vers
  // une appli…). Sur desktop, où le téléchargement direct marche bien, on garde
  // le <a download> classique pour ne pas changer l'expérience.
  function isMobileDevice() {
    return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || "");
  }

  // Sur mobile, l'image passe par la feuille de partage native (Web Share) :
  // le bouton dit « Partager » (icône de partage) plutôt que « Télécharger ».
  function saveActionLabel() { return isMobileDevice() ? "Partager" : "Télécharger"; }
  function saveActionIcon() { return isMobileDevice() ? "share" : "download"; }

  // Enregistre un blob (image PNG ou fichier CSV) sous `filename`. Doit être
  // appelé de façon synchrone dans le geste utilisateur — c'est la condition
  // pour que Web Share s'ouvre (le blob de l'image vient donc du cache).
  function saveBlob(blob, filename) {
    if (!blob) return;
    if (isMobileDevice() && navigator.canShare) {
      try {
        const file = new File([blob], filename, { type: blob.type });
        if (navigator.canShare({ files: [file] })) {
          // .catch() : l'utilisateur peut annuler la feuille de partage → on ignore.
          navigator.share({ files: [file], title: filename.replace(/\.[a-z0-9]+$/i, "") })
            .catch(() => {});
          return;
        }
      } catch (e) { /* repli sur le téléchargement classique ci-dessous */ }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // On diffère la révocation pour ne pas invalider l'URL avant que le
    // navigateur ait saisi le blob.
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  // Cache du PNG par carte : { token, filename, blob }. La pré-génération en
  // temps mort (ensureSectionPngCache) garantit qu'au clic le blob est prêt,
  // donc partageable/téléchargeable de façon synchrone dans le geste utilisateur.
  // On garde le blob (et non une URL objet) : Web Share et <a download> le
  // consomment tous deux, et l'on évite toute course à la révocation d'URL.
  let pngCacheToken = 0;
  function ensureChartPngCache(card) {
    const svg = card.querySelector(".chart-svg");
    if (!svg) return;
    const filename = "cor-" + slug(cardTitle(card)) + ".png";
    const token = ++pngCacheToken;
    card.__png = { token, filename, pending: true };
    renderChartPngBlob(card, svg).then(blob => {
      // Un rendu plus récent a été lancé entre-temps : on abandonne celui-ci.
      if (!card.__png || card.__png.token !== token) return;
      card.__png = { token, filename, blob: blob || null, pending: false };
    });
  }

  // Le SVG d'une carte vient d'être reconstruit (changement d'unité, d'année ou
  // d'indicateur) : le PNG en cache montre encore l'état précédent. On le
  // régénère en temps mort, pour que le bouton « Télécharger / Partager » reste
  // synchrone ET fidèle à ce qui est affiché.
  function refreshChartPngCache(card) {
    card.__png = null;
    const ric = window.requestIdleCallback
      ? cb => window.requestIdleCallback(cb, { timeout: 2000 })
      : cb => setTimeout(cb, 300);
    ric(() => ensureChartPngCache(card));
  }

  // Prépare le cache PNG des cartes d'une section, une carte par temps mort.
  // Appelé à l'ouverture de la vue détail — seul endroit d'où le bouton
  // Enregistrer est accessible — et plus au chargement de la page : rasteriser
  // toutes les cartes au démarrage gonflait le Total Blocking Time, et les
  // cartes pré-rendues après son délai n'étaient de toute façon jamais mises en
  // cache (downloadChartPng générait alors à la volée, en perdant le geste
  // synchrone attendu par Web Share sur mobile).
  function ensureSectionPngCache(root) {
    const ric = window.requestIdleCallback || (fn => setTimeout(fn, 200));
    const cards = Array.from(root.querySelectorAll(".chart-card"));
    const step = () => {
      const card = cards.shift();
      if (!card) return;
      // `__png` présent = cache déjà généré (ou en cours) et non invalidé par
      // un redimensionnement : on ne rasterise pas deux fois la même carte.
      if (card.querySelector(".chart-svg") && !card.__png) ensureChartPngCache(card);
      ric(step);
    };
    ric(step);
  }

  // Après un redimensionnement, les SVG re-rendus ne correspondent plus aux PNG
  // en cache : on invalide tout, la prochaine ouverture de détail (ou le repli à
  // la volée de downloadChartPng) régénérera ce qui est nécessaire.
  function invalidateChartPngCaches() {
    document.querySelectorAll(".chart-card").forEach(card => { card.__png = null; });
  }

  // Enregistre le PNG d'une carte. Privilégie le blob déjà en cache (geste
  // synchrone → Web Share / téléchargement toujours autorisés) ; à défaut, génère
  // à la volée (premier appel, le cache servant les suivants).
  function downloadChartPng(card, svg, filename) {
    const c = card.__png;
    if (c && c.blob && c.filename === filename) { saveBlob(c.blob, filename); return; }
    renderChartPngBlob(card, svg).then(blob => saveBlob(blob, filename));
  }

  function cardTitle(card) {
    const t = card.querySelector(".chart-title strong");
    return t ? t.textContent.trim() : "Graphique COR";
  }

  // Sérialise les séries d'un graphique en CSV. Séparateur « ; » et virgule
  // décimale (format attendu par Excel en français), précédé d'un BOM UTF-8 pour
  // que les accents des libellés s'affichent correctement.
  function chartCsv(cfg) {
    const series = (cfg.series || []).filter(s => s.points && s.points.length);
    // Axe catégoriel (barres) : 1re colonne = libellé de catégorie ; sinon axe d'années.
    const cats = cfg.categories;
    const xs = cats
      ? cats.map((_, i) => i)
      : [...new Set(series.flatMap(s => s.points.map(p => p.x)))].sort((a, b) => a - b);
    const esc = v => { v = String(v); return /[;"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    const num = v => String(Math.round(v * 100) / 100).replace(".", ",");
    const lines = [[cfg.x?.label || (cats ? "Catégorie" : "Année"), ...series.map(s => s.label)].map(esc).join(";")];
    xs.forEach(x => {
      const cells = [String(cats ? cats[x] : x)];
      series.forEach(s => { const p = s.points.find(p => p.x === x); cells.push(p ? num(p.y) : ""); });
      lines.push(cells.map(esc).join(";"));
    });
    return "\uFEFF" + lines.join("\r\n");
  }

  // `root` restreint la recherche des `.chart-card` (par défaut : tout le
  // document). Le mode carousel passe la <section> ouverte → plus de re-scan
  // global du DOM à chaque ouverture de détail. Ne mesure PAS la réservation de
  // titre (reserveTitleSpaceForTools) : celle-ci est calculée une seule fois au
  // pré-rendu et au redimensionnement, hors du chemin critique d'ouverture.
  function setupChartTools(root = document) {
    root.querySelectorAll(".chart-card").forEach((card, i) => {
      if (!card.querySelector("svg") || card.querySelector(".chart-tools")) return;
      const bar = document.createElement("div");
      bar.className = "chart-tools";
      const zoom = document.createElement("button");
      zoom.className = "chart-tool"; zoom.type = "button";
      zoom.innerHTML = icon("expand") + '<span class="tlabel">Agrandir</span>';
      zoom.title = "Agrandir ce graphique"; zoom.setAttribute("aria-label", "Agrandir ce graphique");
      zoom.addEventListener("click", () => openZoom(card));
      const dl = document.createElement("button");
      dl.className = "chart-tool"; dl.type = "button";
      const label = saveActionLabel();
      dl.innerHTML = icon(saveActionIcon()) + '<span class="tlabel">' + label + "</span>";
      dl.title = label + " ce graphique en image"; dl.setAttribute("aria-label", label + " l'image (PNG)");
      dl.addEventListener("click", () => {
        downloadChartPng(card, card.querySelector(".chart-svg"), "cor-" + slug(cardTitle(card)) + ".png");
      });
      bar.appendChild(zoom); bar.appendChild(dl);
      card.appendChild(bar);
    });
  }

  // Export CSV rattaché au tableau de données : le bouton `.data-csv` est créé
  // par buildDataTable (js/chart.js) à chaque rendu. On le câble une seule fois
  // par délégation, ce qui survit aux reconstructions du tableau (resize).
  function setupDataExports() {
    document.addEventListener("click", e => {
      const btn = e.target.closest(".data-csv");
      if (!btn) return;
      const host = btn.closest(".chart-host");
      const card = btn.closest(".chart-card");
      if (!host || !host.__cfg || !host.__cfg.series || !host.__cfg.series.length) return;
      const csv = new Blob([chartCsv(host.__cfg)], { type: "text/csv;charset=utf-8" });
      saveBlob(csv, "cor-" + slug(cardTitle(card)) + ".csv");
    });
  }

  // Ajoute à chaque titre de section un bouton « copier le lien » vers son
  // ancre, pour partager directement un graphique ou un passage précis.
  function setupSectionLinks() {
    document.querySelectorAll("main section[id]").forEach(sec => {
      const h = sec.querySelector("h2");
      if (!h || h.querySelector(".anchor-link")) return;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "anchor-link";
      btn.title = "Copier le lien vers cette section";
      btn.setAttribute("aria-label", "Copier le lien vers la section : " + h.textContent.trim());
      btn.innerHTML = icon("link");
      btn.addEventListener("click", async () => {
        const url = location.origin + location.pathname + "#" + sec.id;
        try { await navigator.clipboard.writeText(url); toast("Lien de la section copié ✓"); }
        catch (e) {
          if (history.replaceState) history.replaceState(null, "", "#" + sec.id);
          toast("Copie impossible — utilisez l'URL de la barre d'adresse.");
        }
      });
      h.appendChild(btn);
    });
  }

  // Sur grand écran, la barre d'outils (Agrandir / Télécharger) est en absolu en haut à
  // droite : sans précaution, un titre long passe dessous et devient illisible.
  // On mesure sa largeur réelle (qui dépend de la police du système) et on
  // l'expose au CSS via --chart-tools-w, qui réserve d'autant la droite du titre
  // (cf. `.chart-title strong` dans style.css, propriété HÉRITÉE).
  // Sous 760px la barre passe en pied de carte (en flux) : aucune réservation.
  //
  // Toutes les barres d'outils sont identiques (mêmes deux boutons) → on ne mesure
  // qu'UNE seule barre et on pose la variable sur :root, d'où elle est héritée par
  // tous les titres. Une seule lecture de `offsetWidth` au total (au lieu d'une par
  // carte) → plus de reflow forcé répété. Calculée une fois au pré-rendu et
  // recalculée uniquement au redimensionnement de largeur (cf. init).
  //
  // En mode carrousel, les sections vivent dans le réservoir masqué
  // #story-sections (display:none) : une barre qui s'y trouve mesure 0 (même
  // problème d'ancêtre masqué que chartWidth dans chart.js). On cherche donc
  // une barre visible et, à défaut, on mesure un clone hors écran.
  function reserveTitleSpaceForTools() {
    const root = document.documentElement.style;
    const desktop = !window.matchMedia("(max-width: 760px)").matches;
    if (!desktop) { root.setProperty("--chart-tools-w", "0px"); return; }
    const bars = document.querySelectorAll(".chart-tools");
    for (const bar of bars) {
      if (bar.offsetWidth > 0) { root.setProperty("--chart-tools-w", bar.offsetWidth + "px"); return; }
    }
    if (!bars.length) return;
    const clone = bars[0].cloneNode(true);
    // `right:auto` est indispensable : la feuille de style pose `right:12px` sur
    // .chart-tools, et un absolu avec left ET right définis est étiré entre les
    // deux (largeur ≈ viewport + 9999px au lieu de celle des boutons).
    clone.style.cssText = "position:absolute;visibility:hidden;left:-9999px;top:0;right:auto";
    document.body.appendChild(clone);
    root.setProperty("--chart-tools-w", clone.offsetWidth + "px");
    clone.remove();
  }

  function slug(s) {
    return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "graphique";
  }

  function openZoom(card) {
    const modal = document.getElementById("zoom-modal");
    const body = document.getElementById("zoom-body");
    document.getElementById("zoom-title").textContent = cardTitle(card);
    body.innerHTML = "";
    // Mémorise le déclencheur (bouton « Agrandir ») pour lui rendre le focus à
    // la fermeture : sans cela, l'utilisateur clavier perd sa place.
    modal.__opener = document.activeElement;
    modal.showModal();                 // <dialog> natif : focus piégé, Échap géré
    document.body.style.overflow = "hidden";

    const host = card.querySelector(".chart-host");
    if (host && host.__zoomRender) {
      // Re-trace le graphique à la taille de la vue agrandie : les textes
      // restent nets et lisibles (au lieu d'étirer une copie de l'image).
      const target = document.createElement("div");
      target.className = "chart-host";
      body.appendChild(target);
      host.__zoomRender(target);
    } else {
      const svg = card.querySelector(".chart-svg");
      if (!svg) return;
      const clone = svg.cloneNode(true);
      clone.querySelectorAll(".reveal-rect").forEach(r => r.setAttribute("width", 99999));
      clone.removeAttribute("height"); clone.style.width = "100%"; clone.style.height = "auto";
      body.appendChild(clone);
    }
    const zdl = document.getElementById("zoom-dl");
    zdl.innerHTML = icon(saveActionIcon()) + "<span>" + saveActionLabel() + " PNG</span>";
    zdl.onclick = () =>
      downloadChartPng(card, body.querySelector(".chart-svg"), "cor-" + slug(cardTitle(card)) + ".png");
  }

  function setupZoom() {
    const modal = document.getElementById("zoom-modal");
    if (!modal) return;
    document.getElementById("zoom-close").addEventListener("click", () => modal.close());
    modal.addEventListener("click", e => { if (e.target === modal) modal.close(); });
    modal.addEventListener("close", () => {
      document.body.style.overflow = "";
      document.getElementById("zoom-body").innerHTML = "";
      // Rend le focus au bouton qui a ouvert la vue agrandie.
      if (modal.__opener && modal.__opener.focus) modal.__opener.focus();
      modal.__opener = null;
    });
  }

  /* ----------------------------------------------------------------------
   * Contenu « statique » des sections (simulateur, tableau des hypothèses,
   * sources, ancres, zoom) : tout vit dans le réservoir caché du carrousel et
   * n'est visible qu'à l'ouverture d'une vue détail. Le construire dans init()
   * gonflait la tâche DOMContentLoaded (Total Blocking Time) : on l'étale en
   * temps mort, avec un rattrapage synchrone si un détail s'ouvre avant.
   * `staticStepIdx` garantit que chaque morceau ne s'exécute qu'une fois,
   * quel que soit le chemin (temps mort ou ouverture immédiate).
   * -------------------------------------------------------------------- */
  const staticSteps = [renderLeviers, renderTable, renderSources, setupSectionLinks, setupZoom];
  let staticStepIdx = 0;
  // Rattrapage synchrone : appelé par renderSection avant la 1re ouverture d'un détail.
  function ensureStaticContent() {
    while (staticStepIdx < staticSteps.length) staticSteps[staticStepIdx++]();
  }
  // Étalement : un morceau par temps mort (même motif que prerenderAllCharts).
  function scheduleStaticContent() {
    const ric = window.requestIdleCallback || (fn => setTimeout(fn, 1));
    const step = () => {
      if (staticStepIdx >= staticSteps.length) return;
      staticSteps[staticStepIdx++]();
      ric(step);
    };
    ric(step);
  }

  function init() {
    // La présentation est le carrousel (js/cards.js) : il pilote le rendu des
    // graphiques (prerenderAllCharts au repos, renderSection à l'ouverture d'une
    // carte). init() ne fait que câbler les outils communs ; le contenu des
    // sections (scheduleStaticContent) et le tracé des graphiques sont différés.
    scheduleStaticContent();
    setupChartTools();
    setupDataExports();
    setupPibUnitToggle();
    // Sur mobile, le repli/déploiement de la barre d'adresse pendant le
    // défilement déclenche des « resize » qui ne changent que la hauteur :
    // on ne re-rend que si la largeur a réellement changé (rotation,
    // redimensionnement de fenêtre), et sans rejouer les animations.
    let lastWidth = window.innerWidth;
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (window.innerWidth === lastWidth) return;
        lastWidth = window.innerWidth;
        renderAllCharts(false);
        if (explorerRedraw) explorerRedraw(false);
        reserveTitleSpaceForTools();
        invalidateChartPngCaches();
      }, 200);
    });

    // Enregistrement du service worker (PWA). Stratégie « réseau d'abord » :
    // les visiteurs ont toujours la dernière version, pas besoin de notification.
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker.register("./sw.js").catch(() => {});
      });
    }

    setupInstallPrompt();
  }

  /* ----------------------------------------------------------------------
   * Invite d'installation de la PWA, après engagement du visiteur.
   * On attend 4 « interactions » — ouvertures de carte ou navigations, via
   * l'événement « cor:interaction » émis par js/cards.js — avant de proposer
   * l'installation, pour ne pas harceler dès l'arrivée. L'UI est construite en
   * DOM (aucun <script> inline → conforme à la CSP de la page).
   * -------------------------------------------------------------------- */
  function setupInstallPrompt() {
    const INSTALL_THRESHOLD = 4;
    let deferredPrompt = null;   // l'événement beforeinstallprompt mis de côté
    let banner = null;           // la bannière affichée, ou null

    const isStandalone = () =>
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true;
    // iOS/iPadOS : pas de beforeinstallprompt → on affichera des instructions.
    // iPadOS 13+ se présente comme un Mac tactile, d'où le second test.
    const isIOS = () =>
      /iphone|ipad|ipod/i.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

    const flag = key => {
      try { return localStorage.getItem(key) === "1"; } catch { return false; }
    };
    const setFlag = key => {
      try { localStorage.setItem(key, "1"); } catch { /* stockage indisponible */ }
    };
    const count = () => {
      try { return parseInt(localStorage.getItem("cor-interactions") || "0", 10) || 0; }
      catch { return 0; }
    };

    document.addEventListener("cor:interaction", () => {
      const n = count() + 1;
      try { localStorage.setItem("cor-interactions", String(n)); } catch { /* ignore */ }
      if (n >= INSTALL_THRESHOLD) maybeShow();
    });

    window.addEventListener("beforeinstallprompt", e => {
      e.preventDefault();        // on garde la main sur le moment d'afficher l'invite
      deferredPrompt = e;
      maybeShow();
    });

    window.addEventListener("appinstalled", () => {
      setFlag("cor-install-done");
      hide();
    });

    function maybeShow() {
      if (banner) return;                                   // déjà affichée
      if (isStandalone() || flag("cor-install-done") || flag("cor-install-dismissed")) return;
      if (count() < INSTALL_THRESHOLD) return;
      // On a besoin soit de l'invite native différée, soit d'être sur iOS
      // (où l'installation se fait manuellement, via des instructions).
      if (!deferredPrompt && !isIOS()) return;
      show(!deferredPrompt && isIOS());
    }

    function show(iosMode) {
      banner = document.createElement("div");
      banner.className = "cor-install";
      banner.setAttribute("role", "dialog");
      banner.setAttribute("aria-label", "Installer l'application");

      const logo = document.createElement("img");
      logo.className = "cor-install-logo";
      logo.src = "./icons/icon-192.png";
      logo.alt = "";
      logo.width = 40;
      logo.height = 40;

      const text = document.createElement("div");
      text.className = "cor-install-text";
      const tagline = iosMode
        ? "Appuyez sur " + icon("share") + " Partager, puis « Sur l'écran d'accueil »."
        : "Accès rapide et consultation hors-ligne, même en avion.";
      text.innerHTML = "<strong>Installer l'application</strong><span>" + tagline + "</span>";

      const actions = document.createElement("div");
      actions.className = "cor-install-actions";
      if (!iosMode) {
        const installBtn = document.createElement("button");
        installBtn.type = "button";
        installBtn.className = "cor-install-btn";
        installBtn.textContent = "Installer";
        installBtn.addEventListener("click", async () => {
          if (!deferredPrompt) { hide(); return; }
          deferredPrompt.prompt();
          try { await deferredPrompt.userChoice; } catch { /* ignore */ }
          deferredPrompt = null;
          hide();
        });
        actions.appendChild(installBtn);
      }

      const closeBtn = document.createElement("button");
      closeBtn.type = "button";
      closeBtn.className = "cor-install-close";
      closeBtn.setAttribute("aria-label", "Fermer");
      closeBtn.innerHTML = icon("close");
      closeBtn.addEventListener("click", () => {
        setFlag("cor-install-dismissed");   // ne plus solliciter
        hide();
      });

      banner.append(logo, text, actions, closeBtn);
      document.body.appendChild(banner);
      requestAnimationFrame(() => banner && banner.classList.add("is-visible"));
    }

    function hide() {
      if (!banner) return;
      const el = banner;
      banner = null;
      el.classList.remove("is-visible");
      el.addEventListener("transitionend", () => el.remove(), { once: true });
      setTimeout(() => el.remove(), 400);   // filet si transitionend ne se déclenche pas
    }

    // Seuil déjà atteint lors d'une visite précédente : on retentera dès que
    // beforeinstallprompt arrive (ou immédiatement sur iOS).
    maybeShow();
  }

  /* ----------------------------------------------------------------------
   * API publique pour le mode carousel (js/cards.js).
   * `renderSection` (re)dessine le ou les graphiques d'une section à partir
   * de son id (celui des <section> de index.html). Le mode carousel déplace la
   * <section> dans sa vue détail puis appelle cette fonction : les graphiques se
   * tracent à pleine taille, interactifs, et les outils (agrandir / télécharger)
   * sont recâblés. Une seule source de vérité — pas de duplication du rendu.
   * -------------------------------------------------------------------- */
  window.CORApp = {
    renderSection(id) {
      // Ouverture d'un détail avant la fin des temps morts : on rattrape le
      // contenu statique (simulateur, tableau, sources, ancres, zoom) d'un coup.
      ensureStaticContent();
      renderSectionOnce(id);   // rendu une seule fois : pas de re-tracé (donc pas de saut)
      // Restreint la (re)pose des outils à la section ouverte → plus de re-scan
      // global du DOM. La réservation d'espace du titre (--chart-tools-w) n'est
      // recalculée ici que si elle n'a encore jamais été posée (carte ouverte
      // avant la fin du pré-rendu) : les ouvertures suivantes gardent leur
      // chemin critique sans reflow forcé.
      const sec = document.getElementById(id) || document;
      setupChartTools(sec);
      if (!document.documentElement.style.getPropertyValue("--chart-tools-w")) {
        reserveTitleSpaceForTools();
      }
      // Cache PNG des cartes de la section ouverte, en temps mort : le bouton
      // Enregistrer garde son geste synchrone (Web Share mobile) sans que la
      // rasterisation ne pèse sur le chargement de la page.
      ensureSectionPngCache(sec);
    },
    ensureExplorer,
    // Pré-rend TOUS les graphiques au repos (échelonné en requestIdleCallback), une seule
    // fois, pour qu'ils soient déjà à leur taille finale dès la 1re ouverture d'une carte —
    // sinon le conteneur passe de min-height:300px à la hauteur du SVG au rendu différé
    // (« redimensionnement » juste avant le tracé). Les courbes gardent leur tracé : il est
    // rejoué à l'ouverture via __revealReset/__revealPlay, sans reconstruire le SVG.
    prerenderAllCharts() {
      const ids = ["presentation", "depenses", "deficit", "productivite", "realite", "niveau", "financement", "monde"];
      const ric = window.requestIdleCallback || (fn => setTimeout(fn, 1));
      let i = 0;
      const step = () => {
        if (i >= ids.length) { setupChartTools(); reserveTitleSpaceForTools(); return; }
        renderSectionOnce(ids[i++]);
        ric(step);
      };
      ric(step);
    }
  };

  /* Export de test — no-op dans le navigateur (`module` y est indéfini) ; seuls
   * les tests unitaires Node (tests/unit/) le lisent pour vérifier ces fonctions
   * pures en isolation. N'altère en rien l'exécution du site. */
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { chartCsv, slug };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
