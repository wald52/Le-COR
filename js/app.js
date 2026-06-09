/*
 * Application « Le COR sous l'œil des citoyens »
 * Assemble les sections et branche les données sur le moteur de graphiques.
 */
(function () {
  "use strict";

  const D = window.COR_DATA;
  const { lineChart } = window.CORChart;

  /* ----------------------------------------------------------------------
   * 1. Graphique phare : dépenses de retraite en % du PIB, projections
   *    successives superposées.
   * -------------------------------------------------------------------- */
  function renderDepensesPib() {
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
      ariaLabel: d.subtitle
    });
  }

  /* Helper : graphique « réalisé + projections superposées ». */
  function renderRealiseProjections(elId, block) {
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
      ariaLabel: block.subtitle
    });
  }

  function renderSolde() {
    renderRealiseProjections("chart-solde", window.COR_SERIES && window.COR_SERIES.solde);
  }

  function renderCiseaux() {
    const b = window.COR_SERIES && window.COR_SERIES.ressourcesVsDepenses;
    if (!b) return;
    lineChart(document.getElementById("chart-ciseaux"), {
      series: b.series.map(s => ({ ...s, endNote: s.label })),
      x: { min: b.xMin, max: b.xMax },
      y: { min: b.yMin, max: b.yMax, suffix: " %" },
      ariaLabel: b.subtitle
    });
  }

  function renderNiveauVie() {
    const b = window.COR_SERIES && window.COR_SERIES.niveauVie;
    if (!b) return;
    lineChart(document.getElementById("chart-niveau"), {
      series: [
        { ...b.realise, kind: "solid", markers: false },
        { ...b.projection, kind: "dash", endNote: "87,5 %" }
      ],
      x: { min: b.xMin, max: b.xMax },
      y: { min: b.yMin, max: b.yMax, suffix: " %" },
      ariaLabel: b.subtitle
    });
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
    const W = 760, H = 360;
    const M = { top: 30, right: 30, bottom: 50, left: 50 };
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
      const color = i >= 2 ? "#d62728" : "#1f4e79"; // bascule visible à partir de 2022
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
      const ct = mk("text", { x: x + 12, y: sy(r.central) - 8, class: "chart-endnote", fill: color });
      ct.textContent = r.central.toFixed(1).replace(".", ",");
      svg.appendChild(ct);
      // Étiquette année
      const yl = mk("text", { x: x, y: M.top + plotH + 24, class: "chart-axis-label", "text-anchor": "middle" });
      yl.textContent = r.year;
      svg.appendChild(yl);
    });

    svg.appendChild(mk("line", { x1: M.left, y1: M.top + plotH, x2: M.left + plotW, y2: M.top + plotH, class: "chart-axis" }));
    container.appendChild(svg);

    const cap = document.createElement("p");
    cap.className = "chart-inline-legend";
    cap.innerHTML = `<span class="legend-swatch" style="--c:#1f4e79"></span> éventail des scénarios &nbsp;·&nbsp; le point = scénario de référence &nbsp;·&nbsp; <span class="legend-swatch" style="--c:#d62728"></span> à partir de 2022, tout l'éventail glisse vers le bas`;
    container.appendChild(cap);
  }

  /* ----------------------------------------------------------------------
   * 3. Fécondité : hypothèse vs réalité.
   * -------------------------------------------------------------------- */
  function renderFecondite() {
    const d = (window.COR_SERIES && window.COR_SERIES.fecondite) || D.fecondite;
    const series = [
      { ...d.realise, kind: "solid", markers: true },
      ...d.hypotheses.map(h => ({ label: h.label, color: h.color, kind: "dash", points: h.points, endNote: h.endNote }))
    ];
    lineChart(document.getElementById("chart-fecondite"), {
      series,
      x: { min: d.xMin, max: d.xMax },
      y: { min: d.yMin, max: d.yMax, suffix: "" },
      ariaLabel: d.subtitle
    });
  }

  /* ----------------------------------------------------------------------
   * 4. Productivité : hypothèse vs réalité.
   * -------------------------------------------------------------------- */
  function renderProductiviteReel() {
    const d = (window.COR_SERIES && window.COR_SERIES.productiviteReel) || D.productiviteReel;
    const series = [
      { ...d.realise, kind: "solid", markers: true },
      ...d.hypotheses.map(h => ({ label: h.label, color: h.color, kind: "dash", points: h.points, endNote: h.endNote }))
    ];
    lineChart(document.getElementById("chart-prod-reel"), {
      series,
      x: { min: d.xMin, max: d.xMax },
      y: { min: d.yMin, max: d.yMax, suffix: " %" },
      ariaLabel: d.subtitle
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

    function drawIndicator(iid) {
      const ind = exp.indicators[iid];
      if (!ind) return;
      document.getElementById("exp-label").textContent = ind.label;
      document.getElementById("exp-desc").textContent = ind.desc || "";
      document.getElementById("exp-source").textContent = "Source : " + (ind.source || "COR.");
      chipsEl.querySelectorAll(".exp-chip").forEach(c =>
        c.classList.toggle("active", c.dataset.id === iid));
      lineChart(document.getElementById("chart-explorer"), {
        series: ind.series,
        x: { min: ind.xMin, max: ind.xMax },
        y: { min: ind.yMin, max: ind.yMax, suffix: ind.suffix || "" },
        ariaLabel: ind.label
      });
    }

    function buildChips(theme) {
      chipsEl.innerHTML = "";
      theme.indicators.forEach(iid => {
        const ind = exp.indicators[iid];
        const btn = document.createElement("button");
        btn.className = "exp-chip";
        btn.type = "button";
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
      tab.textContent = theme.name;
      tab.addEventListener("click", () => {
        currentTheme = theme;
        themesEl.querySelectorAll(".exp-tab").forEach(t => t.classList.remove("active"));
        tab.classList.add("active");
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
    const W = 760, rowH = 30, top = 16, bottom = 38, left = 104, right = 58;
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
      const val = mk("text", { x: sx(c.total) + 6, y: y + 4, class: "chart-endnote",
        fill: isFR ? "#c2185b" : "#5b6671", "text-anchor": "start" });
      val.textContent = String(c.total).replace(".", ",") + " %"; svg.appendChild(val);
    });
    host.appendChild(svg);
    const leg = document.createElement("p");
    leg.className = "chart-inline-legend";
    leg.innerHTML = `<span class="legend-swatch" style="--c:#1f4e79"></span> Dépenses publiques &nbsp;·&nbsp; <span class="legend-swatch" style="--c:#7fb0e0"></span> Dépenses privées &nbsp;·&nbsp; <strong style="color:#c2185b">France</strong> en surbrillance`;
    host.appendChild(leg);
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
   * Re-rendu au redimensionnement (debounce) — les infobulles dépendent
   * de la taille rendue.
   * -------------------------------------------------------------------- */
  let resizeTimer;
  function renderAllCharts() {
    renderDepensesPib();
    renderSolde();
    renderCiseaux();
    renderNiveauVie();
    renderProductivite();
    renderFecondite();
    renderProductiviteReel();
  }

  function init() {
    renderAllCharts();
    renderExplorer();
    renderInternational();
    renderTable();
    renderSources();
    setupNav();
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(renderAllCharts, 200);
    });

    // Enregistrement du service worker (PWA).
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
