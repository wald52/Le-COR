/*
 * Application « Le COR sous l'œil des citoyens »
 * Assemble les sections et branche les données sur le moteur de graphiques.
 */
(function () {
  "use strict";

  const D = window.COR_DATA;
  const { lineChart } = window.CORChart;
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
    link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    phone: '<rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>'
  };
  const icon = name =>
    `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;

  /* ----------------------------------------------------------------------
   * 1. Graphique phare : dépenses de retraite en % du PIB, projections
   *    successives superposées.
   * -------------------------------------------------------------------- */
  function renderDepensesPib(animate) {
    // Données officielles générées depuis les Excel du COR si disponibles,
    // sinon valeurs d'amorçage de data.js.
    const d = (window.COR_SERIES && window.COR_SERIES.depensesPib) || D.depensesPib;
    const series = [
      { ...d.realise, kind: "solid", markers: false },
      ...d.projections.map(p => ({
        label: p.label, color: p.color, kind: "dash", points: p.points, endNote: p.endNote
      }))
    ];
    lineChart(document.getElementById("chart-pib"), {
      series,
      x: { min: d.xMin, max: d.xMax },
      y: { min: d.yMin, max: d.yMax, suffix: " %" },
      ariaLabel: d.subtitle,
      animate
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
    renderRealiseProjections("chart-solde", window.COR_SERIES && window.COR_SERIES.solde, animate);
  }

  function renderCiseaux(animate) {
    const b = window.COR_SERIES && window.COR_SERIES.ressourcesVsDepenses;
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
    renderRealiseProjections("chart-niveau", window.COR_SERIES && window.COR_SERIES.niveauVie, animate);
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
    const NS = "http://www.w3.org/2000/svg";
    const cw = Math.round(container.getBoundingClientRect().width) || 760;
    const W = Math.max(300, Math.min(cw, 920));
    const narrow = W < 480;
    const H = Math.round(narrow ? Math.min(W * 0.9, 340) : 360);
    const M = { top: 24, right: narrow ? 16 : 30, bottom: narrow ? 40 : 50, left: narrow ? 42 : 50 };
    const plotW = W - M.left - M.right;
    const plotH = H - M.top - M.bottom;
    const yMin = 0.0, yMax = 2.0;
    const sy = v => M.top + (1 - (v - yMin) / (yMax - yMin)) * plotH;
    const n = d.rapports.length;
    const sx = i => M.left + ((i + 0.5) / n) * plotW;

    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.setAttribute("class", "chart-svg");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", d.subtitle);

    const mk = (name, attrs) => {
      const e = document.createElementNS(NS, name);
      for (const k in attrs) e.setAttribute(k, attrs[k]);
      return e;
    };

    // Grille Y
    for (let v = 0.0; v <= 2.0001; v += 0.5) {
      const y = sy(v);
      svg.appendChild(mk("line", { x1: M.left, y1: y, x2: M.left + plotW, y2: y, class: "chart-grid" }));
      const t = mk("text", { x: M.left - 8, y: y + 4, class: "chart-axis-label", "text-anchor": "end" });
      t.textContent = v.toFixed(1).replace(".", ",") + " %";
      svg.appendChild(t);
    }

    // Repère visuel : l'ancien plancher (1,0 %) devient un scénario central.
    const refY = sy(1.0);
    const refLine = mk("line", { x1: M.left, y1: refY, x2: M.left + plotW, y2: refY, class: "chart-ref-line" });
    svg.appendChild(refLine);

    d.rapports.forEach((r, i) => {
      const x = sx(i);
      const color = r.year >= 2022 ? "#d62728" : "#1f4e79"; // bascule visible à partir de 2022
      // Barre min→max
      svg.appendChild(mk("line", {
        x1: x, y1: sy(r.max), x2: x, y2: sy(r.min),
        stroke: color, "stroke-width": 10, "stroke-linecap": "round", opacity: 0.25
      }));
      // Bornes
      [r.min, r.max].forEach(v => {
        svg.appendChild(mk("line", { x1: x - 9, y1: sy(v), x2: x + 9, y2: sy(v), stroke: color, "stroke-width": 2 }));
      });
      // Point central (scénario de référence)
      svg.appendChild(mk("circle", { cx: x, cy: sy(r.central), r: 6, fill: color }));
      const ctAttrs = narrow
        ? { x: x, y: sy(r.central) - 12, class: "chart-endnote", fill: color, "text-anchor": "middle" }
        : { x: x + 12, y: sy(r.central) - 8, class: "chart-endnote", fill: color };
      const ct = mk("text", ctAttrs);
      ct.textContent = r.central.toFixed(1).replace(".", ",");
      svg.appendChild(ct);
      // Étiquette année (une sur deux quand l'écran est étroit)
      if (!narrow || i % 2 === 0) {
        const yl = mk("text", { x: x, y: M.top + plotH + 24, class: "chart-axis-label", "text-anchor": "middle" });
        yl.textContent = r.year;
        svg.appendChild(yl);
      }
    });

    svg.appendChild(mk("line", { x1: M.left, y1: M.top + plotH, x2: M.left + plotW, y2: M.top + plotH, class: "chart-axis" }));
    container.appendChild(svg);

    const cap = document.createElement("p");
    cap.className = "chart-inline-legend";
    cap.innerHTML = `${window.CORChart.swatch("#1f4e79")} éventail des scénarios &nbsp;·&nbsp; le point = scénario de référence &nbsp;·&nbsp; ${window.CORChart.swatch("#d62728")} à partir de 2022, tout l'éventail glisse vers le bas`;
    container.appendChild(cap);
  }

  /* ----------------------------------------------------------------------
   * 3. Fécondité : hypothèse vs réalité.
   * -------------------------------------------------------------------- */
  function renderFecondite(animate) {
    const d = (window.COR_SERIES && window.COR_SERIES.fecondite) || D.fecondite;
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
    const d = (window.COR_SERIES && window.COR_SERIES.productiviteReel) || D.productiviteReel;
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
   * Explorateur d'indicateurs : un thème + un indicateur = un graphique.
   * -------------------------------------------------------------------- */
  function renderExplorer() {
    const exp = window.COR_SERIES && window.COR_SERIES.explorer;
    if (!exp || !exp.themes.length) return;
    const themesEl = document.getElementById("explorer-themes");
    const chipsEl = document.getElementById("explorer-indicators");
    let currentTheme = exp.themes[0];

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
      lineChart(document.getElementById("chart-explorer"), {
        // Millésime en bout de courbe pour les indicateurs « rapports
        // superposés », comme sur le graphique phare (« Rapport 2016 » → 2016).
        series: ind.series.map(s => {
          const m = /^Rapport (\d{4})/.exec(s.label);
          return m && !s.endNote ? { ...s, endNote: m[1] } : s;
        }),
        x: { min: ind.xMin, max: ind.xMax },
        y: { min: ind.yMin, max: ind.yMax, suffix: ind.suffix || "" },
        ariaLabel: ind.label,
        animate
      });
      // Le contenu de la carte explorateur a changé : on régénère son cache PNG
      // (en temps mort) pour que le téléchargement reflète l'indicateur courant.
      const card = document.getElementById("chart-explorer").closest(".chart-card");
      if (card) {
        if (window.requestIdleCallback) window.requestIdleCallback(() => ensureChartPngCache(card), { timeout: 2000 });
        else setTimeout(() => ensureChartPngCache(card), 300);
      }
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
        currentTheme = theme;
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
    buildChips(currentTheme);
  }

  /* ----------------------------------------------------------------------
   * Comparaison internationale : barres horizontales empilées (pub/privé).
   * -------------------------------------------------------------------- */
  function renderInternational() {
    const d = window.COR_SERIES && window.COR_SERIES.international;
    if (!d) return;
    const host = document.getElementById("chart-international");
    host.innerHTML = "";
    const NS = "http://www.w3.org/2000/svg";
    const mk = (n, a) => { const e = document.createElementNS(NS, n); for (const k in a) e.setAttribute(k, a[k]); return e; };
    const cs = d.countries;
    const cw = Math.round(host.getBoundingClientRect().width) || 760;
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
    leg.innerHTML = `${window.CORChart.swatch("#1f4e79")} Dépenses publiques &nbsp;·&nbsp; ${window.CORChart.swatch("#7fb0e0")} Dépenses privées`;
    host.appendChild(leg);
  }

  /* ----------------------------------------------------------------------
   * Simulateur des 3 leviers : l'utilisateur dose âge / cotisations / pensions.
   * Modèle (illustratif) : effets additifs, calibrés sur les montants COR pour
   * équilibrer le système en 2070 via un seul levier.
   * -------------------------------------------------------------------- */
  function renderLeviers() {
    const L = window.COR_SERIES && window.COR_SERIES.leviers;
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
      id("lv-age-out").textContent = "+" + months + " mois";
      id("lv-cot-out").textContent = "+" + f1(cotPts) + " pt";
      id("lv-pen-out").textContent = "−" + f1(penPct) + " %";
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
   * Navigation : surlignage de la section active + menu mobile.
   * -------------------------------------------------------------------- */
  function setupNav() {
    const links = Array.from(document.querySelectorAll(".nav-link"));
    const map = new Map(links.map(l => [l.getAttribute("href").slice(1), l]));
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          links.forEach(l => l.classList.remove("active"));
          const link = map.get(e.target.id);
          if (link) link.classList.add("active");
        }
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    document.querySelectorAll("section[id]").forEach(s => obs.observe(s));

    const toggle = document.getElementById("nav-toggle");
    const menu = document.getElementById("nav-menu");
    toggle.addEventListener("click", () => menu.classList.toggle("open"));
    menu.addEventListener("click", e => { if (e.target.matches(".nav-link")) menu.classList.remove("open"); });
  }

  /* ----------------------------------------------------------------------
   * Rendu différé des graphiques (« lazy »).
   * Construire les neuf graphiques SVG au chargement saturait le thread
   * principal (Total Blocking Time) et enchaînait les reflows. On ne construit
   * désormais chaque graphique qu'à l'approche du viewport : le chargement reste
   * léger, et le reste du travail s'étale au fil du défilement.
   * -------------------------------------------------------------------- */
  let resizeTimer;
  const CHARTS = [
    { id: "chart-pib", draw: renderDepensesPib },
    { id: "chart-solde", draw: renderSolde },
    { id: "chart-ciseaux", draw: renderCiseaux },
    { id: "chart-niveau", draw: renderNiveauVie },
    { id: "chart-prod", draw: () => renderProductivite() },
    { id: "chart-fecondite", draw: renderFecondite },
    { id: "chart-prod-reel", draw: renderProductiviteReel },
    { id: "chart-international", draw: () => renderInternational() }
  ];
  const chartsDrawn = new Set();

  function idle(fn) {
    if (window.requestIdleCallback) window.requestIdleCallback(fn, { timeout: 2000 });
    else setTimeout(fn, 300);
  }

  // Construit un graphique puis câble ses outils (agrandir / télécharger) et
  // pré-génère son PNG en temps mort.
  function drawChart(entry, animate) {
    entry.draw(animate);
    chartsDrawn.add(entry.id);
    setupChartTools();
    const host = document.getElementById(entry.id);
    const card = host && host.closest(".chart-card");
    if (card) idle(() => ensureChartPngCache(card));
  }

  // Re-rend les graphiques DÉJÀ construits (animation rejouée, redimensionnement).
  function renderAllCharts(animate) {
    CHARTS.forEach(entry => { if (chartsDrawn.has(entry.id)) entry.draw(animate); });
  }

  // Exécute `cb` quand l'élément approche du viewport (ou tout de suite si
  // IntersectionObserver est indisponible).
  function whenVisible(el, cb) {
    if (!el) return;
    if (!("IntersectionObserver" in window)) { cb(); return; }
    const io = new IntersectionObserver((entries, obs) => {
      entries.forEach(e => { if (e.isIntersecting) { obs.disconnect(); cb(); } });
    }, { rootMargin: "300px 0px" });
    io.observe(el);
  }

  /* ----------------------------------------------------------------------
   * Finitions : toast, partage, installation PWA, haut de page, export PNG.
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

  function setupShareInstall() {
    const share = document.getElementById("btn-share");
    if (share) {
      share.hidden = false;
      const data = { title: document.title, text: "Ceci est mon COR — le COR change-t-il d'avis sur nos retraites ?", url: location.href };
      if (navigator.share) {
        share.innerHTML = icon("share") + "<span>Partager</span>";
        share.addEventListener("click", () => navigator.share(data).catch(() => {}));
      } else {
        share.innerHTML = icon("link") + "<span>Copier le lien</span>";
        share.addEventListener("click", async () => {
          try { await navigator.clipboard.writeText(location.href); toast("Lien copié dans le presse-papier ✓"); }
          catch (e) { toast("Copie impossible — copiez l'URL manuellement."); }
        });
      }
    }
    let deferred = null;
    const install = document.getElementById("btn-install");
    if (install) install.innerHTML = icon("phone") + "<span>Installer l'app</span>";
    window.addEventListener("beforeinstallprompt", e => {
      e.preventDefault(); deferred = e; if (install) install.hidden = false;
    });
    if (install) install.addEventListener("click", async () => {
      if (!deferred) return;
      deferred.prompt(); await deferred.userChoice; deferred = null; install.hidden = true;
    });
    window.addEventListener("appinstalled", () => { if (install) install.hidden = true; });
  }

  function setupToTop() {
    const tt = document.getElementById("to-top");
    if (!tt) return;
    window.addEventListener("scroll", () => {
      tt.classList.toggle("show", window.scrollY > 600);
    }, { passive: true });
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
  // séparé (saveChartImage) pour se faire de façon synchrone dans le geste
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
    img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(xml)));
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

  function saveChartImage(blob, filename) {
    if (!blob) return;
    if (isMobileDevice() && navigator.canShare) {
      try {
        const file = new File([blob], filename, { type: "image/png" });
        if (navigator.canShare({ files: [file] })) {
          // Doit rester dans le geste utilisateur : OK car le blob vient du cache.
          // .catch() : l'utilisateur peut annuler la feuille de partage → on ignore.
          navigator.share({ files: [file], title: filename.replace(/\.png$/i, "") })
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
  // temps mort (scheduleChartPngCache) garantit qu'au clic le blob est prêt,
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

  // Régénère le cache PNG de toutes les cartes ayant un graphique, en temps mort.
  function scheduleChartPngCache() {
    const run = () => document.querySelectorAll(".chart-card").forEach(card => {
      if (card.querySelector(".chart-svg")) ensureChartPngCache(card);
    });
    if (window.requestIdleCallback) window.requestIdleCallback(run, { timeout: 2000 });
    else setTimeout(run, 300);
  }

  // Enregistre le PNG d'une carte. Privilégie le blob déjà en cache (geste
  // synchrone → Web Share / téléchargement toujours autorisés) ; à défaut, génère
  // à la volée (premier appel, le cache servant les suivants).
  function downloadChartPng(card, svg, filename) {
    const c = card.__png;
    if (c && c.blob && c.filename === filename) { saveChartImage(c.blob, filename); return; }
    renderChartPngBlob(card, svg).then(blob => saveChartImage(blob, filename));
  }

  function cardTitle(card) {
    const t = card.querySelector(".chart-title strong");
    return t ? t.textContent.trim() : "Graphique COR";
  }

  function setupChartTools() {
    document.querySelectorAll(".chart-card").forEach((card, i) => {
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
    reserveTitleSpaceForTools();
  }

  // Sur grand écran, la barre d'outils (Agrandir / Télécharger) est en absolu en haut à
  // droite : sans précaution, un titre long passe dessous et devient illisible.
  // On mesure sa largeur réelle (qui dépend de la police du système) et on
  // l'expose au CSS via --chart-tools-w, qui réserve d'autant la droite du titre.
  // Sous 760px la barre passe en pied de carte (en flux) : aucune réservation.
  function reserveTitleSpaceForTools() {
    const desktop = !window.matchMedia("(max-width: 760px)").matches;
    document.querySelectorAll(".chart-card").forEach(card => {
      const bar = card.querySelector(".chart-tools");
      if (bar) card.style.setProperty("--chart-tools-w", desktop ? bar.offsetWidth + "px" : "0px");
    });
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
    });
  }

  function init() {
    // Aucun graphique n'est au-dessus de la ligne de flottaison : on les
    // construit tous (y compris le graphique phare) à l'approche du viewport.
    // Le chargement initial ne dessine ainsi aucun SVG — le thread principal
    // reste libre (Total Blocking Time bas) et le travail s'étale au défilement.
    CHARTS.forEach(entry =>
      whenVisible(document.getElementById(entry.id), () => drawChart(entry, true)));
    whenVisible(document.getElementById("chart-explorer"), () => {
      renderExplorer();
      setupChartTools();
    });
    renderLeviers();
    renderTable();
    renderSources();
    setupNav();
    setupShareInstall();
    setupToTop();
    setupChartTools();
    setupZoom();
    scheduleChartPngCache();
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
        scheduleChartPngCache();
      }, 200);
    });

    // Enregistrement du service worker (PWA). Stratégie « réseau d'abord » :
    // les visiteurs ont toujours la dernière version, pas besoin de notification.
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker.register("./sw.js").catch(() => {});
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
