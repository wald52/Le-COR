/*
 * Moteur de graphique en courbes — SVG pur, sans dépendance.
 * Pensé pour reproduire le style « projections superposées » (façon PIIE) :
 *  - courbe pleine pour le réalisé, courbes pointillées pour les projections,
 *  - étiquette de fin de courbe,
 *  - infobulle partagée au survol,
 *  - mise en évidence d'une courbe au survol de la légende,
 *  - responsive via viewBox.
 */
(function () {
  "use strict";

  // État de l'animation de tracé (révélation des courbes).
  let ANIMATE = true;
  const running = new Set();
  const reducedMotion = () =>
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function setAnimate(on) {
    ANIMATE = on;
    if (!on) {
      Array.from(running).forEach(f => { if (f.cancel) f.cancel(); f(); });
      running.clear();
    }
  }

  const NS = "http://www.w3.org/2000/svg";
  const el = (name, attrs = {}) => {
    const node = document.createElementNS(NS, name);
    for (const k in attrs) node.setAttribute(k, attrs[k]);
    return node;
  };

  // Espacement « joli » pour les graduations d'un axe.
  function niceTicks(min, max, count) {
    const span = max - min;
    const raw = span / count;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const norm = raw / mag;
    let step;
    if (norm < 1.5) step = 1;
    else if (norm < 3) step = 2;
    else if (norm < 7) step = 5;
    else step = 10;
    step *= mag;
    const ticks = [];
    const start = Math.ceil(min / step) * step;
    for (let v = start; v <= max + 1e-9; v += step) {
      ticks.push(Math.round(v * 1000) / 1000);
    }
    return ticks;
  }

  function buildPath(pts) {
    return pts.map((p, i) => (i === 0 ? "M" : "L") + p.x + "," + p.y).join(" ");
  }

  /*
   * Pastille de légende en SVG inline (attributs stroke/fill).
   * Important : certains navigateurs (Samsung Internet en « mode sombre »)
   * réécrivent les couleurs CSS (backgrounds…) mais pas les attributs SVG.
   * En dessinant les pastilles comme les courbes (attributs SVG), la légende
   * garde toujours exactement les mêmes couleurs que les courbes.
   */
  function swatchHTML(color, kind) {
    const dash = kind === "dash" ? ' stroke-dasharray="5 3"' : "";
    return `<svg class="legend-swatch" width="20" height="6" viewBox="0 0 20 6" aria-hidden="true">` +
      `<line x1="1" y1="3" x2="19" y2="3" stroke="${color}" stroke-width="3" stroke-linecap="round"${dash}/></svg>`;
  }
  function dotHTML(color) {
    return `<svg class="tt-dot" width="9" height="9" viewBox="0 0 9 9" aria-hidden="true">` +
      `<circle cx="4.5" cy="4.5" r="4.5" fill="${color}"/></svg>`;
  }

  // Tableau de données repliable sous le graphique — alternative accessible
  // (lecteurs d'écran, malvoyants) et gage de transparence.
  function buildDataTable(container, cfg, suffix) {
    const years = [...new Set(cfg.series.flatMap(s => s.points.map(p => p.x)))].sort((a, b) => a - b);
    if (!years.length) return;
    const first = years[0], last = years[years.length - 1];
    const kept = years.filter(y => y % 5 === 0 || y === first || y === last);
    const at = (s, y) => {
      const p = s.points.find(p => p.x === y);
      return p ? String(Math.round(p.y * 10) / 10).replace(".", ",") + suffix : "—";
    };
    let html = `<details class="data-details"><summary class="data-toggle">Voir les données (tableau)</summary>` +
      `<div class="data-table-wrap"><table><caption class="visually-hidden">${cfg.ariaLabel || "Données du graphique"}</caption>` +
      `<thead><tr><th scope="col">Année</th>`;
    cfg.series.forEach(s => { html += `<th scope="col">${s.label}</th>`; });
    html += "</tr></thead><tbody>";
    kept.forEach(y => {
      html += `<tr><th scope="row">${y}</th>`;
      cfg.series.forEach(s => { html += `<td>${at(s, y)}</td>`; });
      html += "</tr>";
    });
    html += "</tbody></table></div></details>";
    container.insertAdjacentHTML("beforeend", html);
  }

  /**
   * Crée un graphique en courbes.
   * @param {HTMLElement} container
   * @param {Object} cfg
   *   cfg.series : [{ label, color, kind:'solid'|'dash', points:[{x,y}], endNote, markers }]
   *   cfg.x : { min, max, label }
   *   cfg.y : { min, max, label, suffix }
   */
  function lineChart(container, cfg) {
    container.innerHTML = "";

    // Dimensions responsives : on cale le viewBox sur la largeur réelle du
    // conteneur pour que les textes restent à taille lisible (≈ px) partout,
    // au lieu d'un SVG fixe réduit (illisible sur mobile).
    const cw = Math.round(container.getBoundingClientRect().width) || 760;
    const W = Math.max(300, Math.min(cw, 920));
    const narrow = W < 480;
    const hasEnd = cfg.series.some(s => s.endNote || s.endLabel);
    const M = {
      top: 16,
      right: hasEnd ? (narrow ? 46 : 92) : (narrow ? 14 : 24),
      bottom: narrow ? 34 : 46,
      left: narrow ? 46 : 52
    };
    const H = Math.round(narrow ? Math.min(W * 0.98, 380) : Math.min(W * 0.52, 440));
    const plotW = W - M.left - M.right;
    const plotH = H - M.top - M.bottom;

    // Bornes
    const allX = cfg.series.flatMap(s => s.points.map(p => p.x));
    const allY = cfg.series.flatMap(s => s.points.map(p => p.y));
    const xMin = cfg.x?.min ?? Math.min(...allX);
    const xMax = cfg.x?.max ?? Math.max(...allX);
    const yMin = cfg.y?.min ?? Math.min(...allY);
    const yMax = cfg.y?.max ?? Math.max(...allY);
    const suffix = cfg.y?.suffix ?? "";

    const sx = v => M.left + ((v - xMin) / (xMax - xMin)) * plotW;
    const sy = v => M.top + (1 - (v - yMin) / (yMax - yMin)) * plotH;

    const svg = el("svg", {
      viewBox: `0 0 ${W} ${H}`,
      class: "chart-svg",
      role: "img",
      "aria-label": cfg.ariaLabel || "Graphique en courbes"
    });

    // Zone de découpe : les courbes ne débordent jamais du cadre de tracé.
    const rnd = Math.random().toString(36).slice(2, 8);
    const clipId = "plotclip-" + rnd;
    const defs = el("defs");
    const clip = el("clipPath", { id: clipId });
    clip.appendChild(el("rect", { x: M.left, y: M.top, width: plotW, height: plotH }));
    defs.appendChild(clip);
    // Découpe « révélation » pour animer le tracé de gauche à droite.
    const revealId = "reveal-" + rnd;
    const revealClip = el("clipPath", { id: revealId });
    const revealW = W - M.left;             // couvre aussi les étiquettes de fin
    const revealRect = el("rect", { x: M.left, y: 0, width: revealW, height: H, class: "reveal-rect" });
    revealClip.appendChild(revealRect);
    defs.appendChild(revealClip);
    svg.appendChild(defs);
    const seriesLayer = el("g", { "clip-path": `url(#${revealId})` });

    // --- Grille + axe Y ---
    const yTicks = niceTicks(yMin, yMax, 5);
    yTicks.forEach(t => {
      const y = sy(t);
      svg.appendChild(el("line", {
        x1: M.left, y1: y, x2: M.left + plotW, y2: y, class: "chart-grid"
      }));
      const lbl = el("text", { x: M.left - 8, y: y + 4, class: "chart-axis-label", "text-anchor": "end" });
      lbl.textContent = String(Math.round(t * 10) / 10).replace(".", ",") + suffix;
      svg.appendChild(lbl);
    });

    // --- Axe X ---
    const xTicks = niceTicks(xMin, xMax, narrow ? 4 : 6).filter(t => t >= xMin && t <= xMax);
    xTicks.forEach(t => {
      const x = sx(t);
      svg.appendChild(el("line", {
        x1: x, y1: M.top + plotH, x2: x, y2: M.top + plotH + 5, class: "chart-tick"
      }));
      const lbl = el("text", { x: x, y: M.top + plotH + 22, class: "chart-axis-label", "text-anchor": "middle" });
      lbl.textContent = String(t).replace(/\s/g, "");
      svg.appendChild(lbl);
    });

    // Axe de base
    svg.appendChild(el("line", {
      x1: M.left, y1: M.top + plotH, x2: M.left + plotW, y2: M.top + plotH, class: "chart-axis"
    }));

    // --- Courbes ---
    const seriesNodes = [];
    cfg.series.forEach((s, idx) => {
      const scaled = s.points.map(p => ({ x: sx(p.x), y: sy(p.y), raw: p }));
      const g = el("g", { class: "chart-series", "data-idx": idx });

      const path = el("path", {
        d: buildPath(scaled),
        fill: "none",
        stroke: s.color,
        "stroke-width": s.kind === "solid" ? 3 : 2.2,
        "stroke-linejoin": "round",
        "stroke-linecap": "round"
      });
      if (s.kind === "dash") path.setAttribute("stroke-dasharray", "7 5");
      path.setAttribute("clip-path", `url(#${clipId})`);
      g.appendChild(path);

      // Points de marquage (optionnels) — utile pour le dernier point.
      if (s.markers !== false) {
        const last = scaled[scaled.length - 1];
        g.appendChild(el("circle", { cx: last.x, cy: last.y, r: 3.5, fill: s.color }));
      }

      // Étiquette de fin de courbe (label + valeur), façon PIIE.
      if (s.endNote || s.endLabel) {
        const last = scaled[scaled.length - 1];
        const txt = el("text", {
          x: Math.min(last.x + 8, W - 4),
          y: last.y + 4,
          class: "chart-endnote",
          fill: s.color,
          "text-anchor": "start"
        });
        txt.textContent = s.endNote || s.endLabel;
        g.appendChild(txt);
      }

      seriesLayer.appendChild(g);
      seriesNodes.push({ cfg: s, node: g, scaled });
    });
    svg.appendChild(seriesLayer);

    // --- Animation « tracé » (révélation gauche → droite) ---
    if (ANIMATE && !reducedMotion() && cfg.animate !== false) {
      revealRect.setAttribute("width", 0);
      const dur = 1100, t0 = performance.now();
      let raf;
      const finish = () => { revealRect.setAttribute("width", revealW); running.delete(finish); };
      const step = now => {
        const k = Math.max(0, Math.min(1, (now - t0) / dur));
        revealRect.setAttribute("width", revealW * (1 - Math.pow(1 - k, 3)));
        if (k < 1) raf = requestAnimationFrame(step); else running.delete(finish);
      };
      finish.cancel = () => cancelAnimationFrame(raf);
      running.add(finish);
      raf = requestAnimationFrame(step);
    }

    // --- Infobulle au survol ---
    const focusLine = el("line", { class: "chart-focus-line", y1: M.top, y2: M.top + plotH, x1: -10, x2: -10, opacity: 0 });
    svg.appendChild(focusLine);

    const tip = document.createElement("div");
    tip.className = "chart-tooltip";
    tip.style.opacity = 0;
    container.style.position = "relative";
    container.appendChild(tip);

    const overlay = el("rect", {
      x: M.left, y: M.top, width: plotW, height: plotH, fill: "transparent", "pointer-events": "all"
    });

    function valueAt(series, xv) {
      const pts = series.points;
      if (xv <= pts[0].x) return null;
      if (xv >= pts[pts.length - 1].x) return null;
      for (let i = 1; i < pts.length; i++) {
        if (xv <= pts[i].x) {
          const a = pts[i - 1], b = pts[i];
          const t = (xv - a.x) / (b.x - a.x);
          return a.y + t * (b.y - a.y);
        }
      }
      return null;
    }

    overlay.addEventListener("mousemove", evt => {
      const rect = svg.getBoundingClientRect();
      const px = (evt.clientX - rect.left) / rect.width * W;
      const xv = xMin + ((px - M.left) / plotW) * (xMax - xMin);
      const xr = Math.round(xv);
      focusLine.setAttribute("x1", sx(xr));
      focusLine.setAttribute("x2", sx(xr));
      focusLine.setAttribute("opacity", 1);

      let rows = `<div class="tt-year">${xr}</div>`;
      let any = false;
      cfg.series.forEach(s => {
        const v = valueAt(s, xr);
        if (v != null) {
          any = true;
          rows += `<div class="tt-row">${dotHTML(s.color)}${s.label} : <strong>${String(Math.round(v * 10) / 10).replace(".", ",")}${suffix}</strong></div>`;
        }
      });
      if (!any) { tip.style.opacity = 0; return; }
      tip.innerHTML = rows;
      tip.style.opacity = 1;
      // Positionnement de l'infobulle
      const leftPx = (sx(xr) / W) * rect.width;
      tip.style.left = Math.min(leftPx + 14, rect.width - tip.offsetWidth - 8) + "px";
      tip.style.top = "12px";
    });
    overlay.addEventListener("mouseleave", () => {
      tip.style.opacity = 0;
      focusLine.setAttribute("opacity", 0);
    });
    svg.appendChild(overlay);

    container.appendChild(svg);

    // --- Légende interactive ---
    if (cfg.legend !== false) {
      const legend = document.createElement("div");
      legend.className = "chart-legend";
      seriesNodes.forEach((sn, idx) => {
        const item = document.createElement("button");
        item.className = "legend-item" + (sn.cfg.kind === "solid" ? " is-solid" : "");
        item.type = "button";
        item.innerHTML = swatchHTML(sn.cfg.color, sn.cfg.kind) + `<span>${sn.cfg.label}</span>`;
        const dim = on => {
          seriesNodes.forEach(o => {
            o.node.style.opacity = on && o !== sn ? 0.18 : 1;
          });
        };
        item.addEventListener("mouseenter", () => dim(true));
        item.addEventListener("mouseleave", () => dim(false));
        item.addEventListener("focus", () => dim(true));
        item.addEventListener("blur", () => dim(false));
        legend.appendChild(item);
      });
      container.appendChild(legend);
    }

    if (cfg.table !== false) buildDataTable(container, cfg, suffix);

    // Permet à la vue agrandie de re-tracer le graphique à sa propre taille
    // (textes nets et lisibles) au lieu d'étirer une copie de l'image.
    container.__zoomRender = target =>
      lineChart(target, Object.assign({}, cfg, { animate: false, table: false }));

    return svg;
  }

  window.CORChart = { lineChart, setAnimate, isAnimating: () => ANIMATE, swatch: swatchHTML };
})();
