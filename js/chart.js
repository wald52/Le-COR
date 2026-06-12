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

  // Liang-Barsky : découpe un segment contre un rectangle.
  // Renvoie { x1,y1,x2,y2, entry,exit } ou null si hors zone.
  function clipSegment(ax, ay, bx, by, x0, x1, y0, y1) {
    const dx = bx - ax, dy = by - ay;
    let t0 = 0, t1 = 1;
    function clip(p, q) {
      if (p === 0) return q >= 0;
      const r = q / p;
      if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
      else        { if (r < t0) return false; if (r < t1) t1 = r; }
      return true;
    }
    if (!clip(-dx, ax - x0) || !clip(dx, x1 - ax) ||
        !clip(-dy, ay - y0) || !clip(dy, y1 - ay)) return null;
    if (t0 >= t1) return null;
    return {
      x1: ax + t0*dx, y1: ay + t0*dy,
      x2: ax + t1*dx, y2: ay + t1*dy,
      entry: t0 > 1e-9, exit: t1 < 1 - 1e-9
    };
  }

  // Construit le chemin SVG en découpant les segments hors de la zone de tracé.
  // Chaque sortie hors zone produit une rupture dans le chemin.
  function buildClippedPath(pts, x0, x1, y0, y1) {
    if (pts.length < 2) return '';
    const cmds = [];
    let open = false;
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i - 1], q = pts[i];
      const s = clipSegment(p.x, p.y, q.x, q.y, x0, x1, y0, y1);
      if (!s) { open = false; continue; }
      if (!open || s.entry) { cmds.push(`M${s.x1},${s.y1}`); open = true; }
      cmds.push(`L${s.x2},${s.y2}`);
      if (s.exit) open = false;
    }
    return cmds.join(' ');
  }

  // Interpolation linéaire de la valeur Y d'une série à un X donné.
  function interpolateY(points, x) {
    if (!points.length) return null;
    if (x <= points[0].x) return points[0].y;
    if (x >= points[points.length - 1].x) return points[points.length - 1].y;
    for (let i = 1; i < points.length; i++) {
      if (x <= points[i].x) {
        const t = (x - points[i - 1].x) / (points[i].x - points[i - 1].x);
        return points[i - 1].y + t * (points[i].y - points[i - 1].y);
      }
    }
    return null;
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

    // Calcul anticipé des bornes Y et de la hauteur de tracé (ne dépendent pas
    // de la marge droite) pour décider si chaque étiquette peut tenir à
    // l'intérieur du graphique plutôt que dans la marge droite.
    const allY_pre = cfg.series.flatMap(s => s.points.map(p => p.y));
    const yMin_pre = cfg.y?.min ?? Math.min(...allY_pre);
    const yMax_pre = cfg.y?.max ?? Math.max(...allY_pre);
    const allX_pre = cfg.series.flatMap(s => s.points.map(p => p.x));
    const xMin_pre = cfg.x?.min ?? Math.min(...allX_pre);
    const xMax_pre = cfg.x?.max ?? Math.max(...allX_pre);

    // Axe interrompu : une valeur très au-delà des bornes Y (plus d'une
    // demi-amplitude en dehors, ex. choc Covid du rapport 2020 sur une échelle
    // −1/2,5) est affichée dans une bande « coupée » au-dessus ou en dessous
    // du tracé, séparée par un signe de coupure, plutôt que d'écraser toute
    // l'échelle ou de masquer la valeur.
    const yPadFar = (yMax_pre - yMin_pre) / 2;
    const isFarHigh = v => v > yMax_pre + yPadFar;
    const isFarLow = v => v < yMin_pre - yPadFar;
    const BAND_H = 26;  // hauteur d'une bande hors échelle (px SVG)
    const BAND_GAP = 9; // coupure visuelle entre bande et zone de tracé
    const bandTop = allY_pre.some(isFarHigh) ? BAND_H : 0;
    const bandBot = allY_pre.some(isFarLow) ? BAND_H : 0;

    const H = Math.round(narrow ? Math.min(W * 0.98, 380) : Math.min(W * 0.52, 440)) + bandTop + bandBot;
    const plotH_pre = H - 16 - bandTop - bandBot - (narrow ? 34 : 46); // top=16, bottom fixe
    const toSvgY = v => 16 + bandTop + (1 - (v - yMin_pre) / (yMax_pre - yMin_pre)) * plotH_pre;

    // Espace minimal (px SVG) entre une étiquette intérieure et toute autre
    // courbe pour que l'étiquette reste lisible sans chevauchement.
    const CHAR_W = 6.8;
    const MIN_CLEAR = narrow ? 14 : 16;

    // Pour chaque série : 'inside' si toutes les autres courbes sont à plus de
    // MIN_CLEAR px au niveau du dernier point, 'outside' sinon, 'none' sans label.
    const labelMode = cfg.series.map(s => {
      if (!s.endNote && !s.endLabel) return "none";
      const lastPt = s.points[s.points.length - 1];
      if (!lastPt) return "outside";
      // Une série qui s'arrête avant le bord droit aurait son étiquette
      // « extérieure » au milieu du tracé, parmi les courbes : on la place en
      // mode intérieur, qui garantit un écart minimal avec les courbes.
      if (lastPt.x < xMax_pre - 0.02 * (xMax_pre - xMin_pre)) return "inside";
      const thisY = toSvgY(lastPt.y);
      for (const os of cfg.series) {
        if (os === s) continue;
        const oy = interpolateY(os.points, lastPt.x);
        if (oy === null) continue;
        if (Math.abs(toSvgY(oy) - thisY) < MIN_CLEAR) return "outside";
      }
      return "inside";
    });

    // La marge droite ne doit couvrir que les étiquettes extérieures.
    const outsideEndLen = Math.max(0, ...cfg.series.map((s, i) =>
      labelMode[i] === "outside" ? String(s.endNote || s.endLabel || "").length : 0
    ));
    const M = {
      top: 16 + bandTop,
      right: outsideEndLen > 0
        ? Math.min(Math.max(outsideEndLen * CHAR_W + 14, narrow ? 40 : 56), narrow ? 96 : 124)
        : (narrow ? 8 : 14),
      bottom: (narrow ? 34 : 46) + bandBot,
      // Marge gauche élargie en présence de coupures d'axe : les étiquettes Y
      // sont repoussées à gauche des zigzags posés sur l'axe.
      left: (narrow ? 42 : 46) + (bandTop || bandBot ? 10 : 0)
    };
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

    // Position Y, bandes comprises : une valeur très hors échelle est posée à
    // hauteur fixe au milieu de sa bande (l'écart réel n'est pas à l'échelle,
    // c'est tout le sens de la coupure ; la valeur exacte est affichée à côté).
    const yTopBand = M.top - BAND_GAP - (BAND_H - BAND_GAP) / 2;
    const yBotBand = M.top + plotH + BAND_GAP + (BAND_H - BAND_GAP) / 2;
    const syAll = v => isFarHigh(v) ? yTopBand : isFarLow(v) ? yBotBand : sy(v);

    const svg = el("svg", {
      viewBox: `0 0 ${W} ${H}`,
      class: "chart-svg",
      role: "img",
      "aria-label": cfg.ariaLabel || "Graphique en courbes"
    });

    // Découpe « révélation » pour animer le tracé de gauche à droite.
    // Les courbes restent dans le cadre grâce au découpage algorithmique (buildClippedPath).
    const rnd = Math.random().toString(36).slice(2, 8);
    const defs = el("defs");
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
      const lbl = el("text", { x: M.left - (bandTop || bandBot ? 18 : 8), y: y + 4, class: "chart-axis-label", "text-anchor": "end" });
      lbl.textContent = String(Math.round(t * 10) / 10).replace(".", ",") + suffix;
      svg.appendChild(lbl);
    });

    // --- Axe X ---
    // La ligne d'axe est posée sous la bande hors échelle du bas (le point
    // extrême reste ainsi au-dessus de l'abscisse) ; la borne basse de
    // l'échelle principale reste matérialisée par sa ligne de grille.
    const xAxisY = M.top + plotH + bandBot;
    const xTicks = niceTicks(xMin, xMax, narrow ? 4 : 6).filter(t => t >= xMin && t <= xMax);
    xTicks.forEach(t => {
      const x = sx(t);
      svg.appendChild(el("line", {
        x1: x, y1: xAxisY, x2: x, y2: xAxisY + 5, class: "chart-tick"
      }));
      const lbl = el("text", { x: x, y: xAxisY + 22, class: "chart-axis-label", "text-anchor": "middle" });
      lbl.textContent = String(t).replace(/\s/g, "");
      svg.appendChild(lbl);
    });

    // Axe de base
    svg.appendChild(el("line", {
      x1: M.left, y1: xAxisY, x2: M.left + plotW, y2: xAxisY, class: "chart-axis"
    }));

    // Signe de coupure d'axe : double zigzag parallèle séparé d'un interstice
    // (symbole classique d'échelle interrompue), posé près de l'axe à gauche.
    // La même marque est reprise sur chaque courbe au franchissement de la
    // coupure (voir le tracé des séries).
    const zigzag = (cx, cy, w, attrs) => el("path", Object.assign({
      d: `M${cx - w / 2},${cy} L${cx - w / 8},${cy - 2.8} L${cx + w / 8},${cy + 2.8} L${cx + w / 2},${cy}`,
      fill: "none", "stroke-linejoin": "round", "stroke-linecap": "round"
    }, attrs));
    // Marque posée à cheval sur l'axe Y ; les étiquettes de l'axe sont
    // décalées à gauche (marge élargie) pour ne pas la chevaucher.
    const breakMark = yCut => [-3, 3].forEach(off =>
      svg.appendChild(zigzag(M.left, yCut + off, 20, { class: "chart-axis-break" })));
    if (bandTop) breakMark(M.top - BAND_GAP / 2);
    if (bandBot) breakMark(M.top + plotH + BAND_GAP / 2);

    // --- Courbes ---
    const seriesNodes = [];
    cfg.series.forEach((s, idx) => {
      const scaled = s.points.map(p => ({
        x: sx(p.x), y: syAll(p.y),
        far: isFarHigh(p.y) || isFarLow(p.y), raw: p
      }));
      const g = el("g", { class: "chart-series", "data-idx": idx });

      // La courbe est découpée séparément dans la zone principale et dans
      // chaque bande hors échelle : l'interstice entre les deux matérialise
      // la coupure de l'axe.
      let d = buildClippedPath(scaled, M.left, M.left + plotW, M.top, M.top + plotH);
      if (bandTop) d += " " + buildClippedPath(scaled, M.left, M.left + plotW, M.top - BAND_H, M.top - BAND_GAP);
      if (bandBot) d += " " + buildClippedPath(scaled, M.left, M.left + plotW, M.top + plotH + BAND_GAP, M.top + plotH + BAND_H);
      const path = el("path", {
        d: d.trim(),
        fill: "none",
        stroke: s.color,
        "stroke-width": s.kind === "solid" ? 3 : 2.2,
        "stroke-linejoin": "round",
        "stroke-linecap": "round"
      });
      if (s.kind === "dash") path.setAttribute("stroke-dasharray", "7 5");
      g.appendChild(path);

      // Marque de coupure (double zigzag) sur la courbe à chaque
      // franchissement d'une bande hors échelle.
      const cuts = [];
      if (bandTop) cuts.push(M.top - BAND_GAP / 2);
      if (bandBot) cuts.push(M.top + plotH + BAND_GAP / 2);
      for (let i = 1; i < scaled.length; i++) {
        const p = scaled[i - 1], q = scaled[i];
        cuts.forEach(mid => {
          if (Math.min(p.y, q.y) > mid || Math.max(p.y, q.y) < mid) return;
          const t = (mid - p.y) / (q.y - p.y);
          const cx = p.x + t * (q.x - p.x);
          [-3, 3].forEach(off => g.appendChild(zigzag(cx, mid + off, 14, {
            stroke: s.color, "stroke-width": 1.6
          })));
        });
      }

      // Valeurs hors échelle : point + valeur exacte affichés dans la bande.
      scaled.forEach(sp => {
        if (!sp.far) return;
        g.appendChild(el("circle", { cx: sp.x, cy: sp.y, r: 3, fill: s.color }));
        const t = el("text", {
          x: sp.x + 6, y: sp.y + 4,
          class: "chart-endnote", fill: s.color
        });
        t.textContent = String(sp.raw.y).replace(".", ",").replace("-", "−") + suffix;
        g.appendChild(t);
      });

      // Points de marquage (optionnels) — utile pour le dernier point.
      if (s.markers !== false) {
        const last = scaled[scaled.length - 1];
        g.appendChild(el("circle", { cx: last.x, cy: last.y, r: 3.5, fill: s.color }));
      }

      // Étiquette de fin de courbe (label + valeur), façon PIIE.
      // Mode 'inside' : l'étiquette se termine juste avant le point final
      // (text-anchor=end), ce qui évite d'agrandir la marge droite.
      // Mode 'outside' : comportement classique, dans la marge droite.
      let endNoteEl = null;
      if (s.endNote || s.endLabel) {
        const last = scaled[scaled.length - 1];
        const mode = labelMode[idx];
        const xPos = mode === "inside"
          ? last.x - 8
          : Math.min(last.x + 8, W - M.right + 6);
        endNoteEl = el("text", {
          x: xPos,
          y: last.y + 4,
          class: "chart-endnote",
          fill: s.color,
          "text-anchor": mode === "inside" ? "end" : "start"
        });
        endNoteEl.textContent = s.endNote || s.endLabel;
        g.appendChild(endNoteEl);
      }

      seriesLayer.appendChild(g);
      seriesNodes.push({ cfg: s, node: g, scaled, endNoteEl, idx });
    });
    svg.appendChild(seriesLayer);

    // Écart minimal entre le texte d'une étiquette intérieure et les courbes :
    // le texte s'étend vers la gauche depuis le point final, il ne doit donc
    // reposer sur aucune courbe le long de son emprise horizontale. On
    // échantillonne toutes les courbes sur cette emprise et on décale le texte
    // au-dessus ou en dessous, à la position libre la plus proche.
    const LABEL_H = 12;     // hauteur approximative du texte (px SVG)
    const LABEL_CLEAR = 6;  // écart minimal entre le bord du texte et une courbe
    const placedInside = []; // étiquettes intérieures déjà posées : {x1, x2, cy}
    seriesNodes.forEach(sn => {
      if (!sn.endNoteEl || labelMode[sn.idx] !== "inside") return;
      const last = sn.scaled[sn.scaled.length - 1];
      const textW = (sn.endNoteEl.textContent || "").length * CHAR_W;
      const x2 = last.x - 8;
      const x1 = Math.max(M.left, x2 - textW);
      // Ordonnées (SVG) de toutes les courbes sur l'emprise du texte.
      const obstacles = [];
      const stepX = Math.max(4, (x2 - x1) / 12);
      seriesNodes.forEach(o => {
        const pts = o.scaled;
        const lo = pts[0].x, hi = pts[pts.length - 1].x;
        for (let x = x1; x <= x2 + 0.01; x += stepX) {
          if (x < lo || x > hi) continue;
          obstacles.push(interpolateY(pts, x));
        }
      });
      const need = LABEL_H / 2 + LABEL_CLEAR;
      const clearanceAt = cy => obstacles.length
        ? Math.min(...obstacles.map(oy => Math.abs(oy - cy)))
        : Infinity;
      // Les autres étiquettes intérieures dont l'emprise horizontale recoupe
      // celle-ci sont aussi des obstacles (texte sur texte = illisible).
      const labelFree = cy => placedInside.every(p =>
        p.x2 < x1 || p.x1 > x2 || Math.abs(p.cy - cy) >= LABEL_H + 2
      );
      let center = null;
      let best = { cy: last.y - need, clear: -Infinity };
      for (let d = need; d <= 80 && center === null; d += 2) {
        for (const cy of [last.y - d, last.y + d]) {
          if (cy - LABEL_H / 2 < M.top + 2 || cy + LABEL_H / 2 > M.top + plotH - 2) continue;
          if (!labelFree(cy)) continue;
          const clear = clearanceAt(cy);
          if (clear >= need) { center = cy; break; }
          if (clear > best.clear) best = { cy, clear };
        }
      }
      if (center === null) center = best.cy;
      sn.endNoteEl.setAttribute("y", center + 4);
      placedInside.push({ x1, x2, cy: center });
      // Trait de liaison si le texte a dû s'éloigner nettement de la courbe.
      if (Math.abs(center - last.y) > 18) {
        const above = center < last.y;
        seriesLayer.appendChild(el("line", {
          x1: last.x, y1: above ? last.y - 4 : last.y + 4,
          x2: last.x, y2: above ? center + 2 : center - 8,
          stroke: sn.cfg.color, "stroke-width": 1, opacity: 0.55
        }));
      }
    });

    // Anti-chevauchement : les étiquettes extérieures (marge droite) sont
    // écartées verticalement d'un pas minimal, puis ramenées dans la zone de
    // tracé. Les étiquettes intérieures sont déjà placées ci-dessus avec un
    // écart garanti vis-à-vis des courbes : on n'y retouche plus.
    const placed = seriesNodes
      .filter(sn => sn.endNoteEl && labelMode[sn.idx] === "outside")
      .map(sn => {
        const last = sn.scaled[sn.scaled.length - 1];
        const y0 = +sn.endNoteEl.getAttribute("y");
        return {
          el: sn.endNoteEl,
          y: y0,
          origY: y0,
          cx: last.x,
          cy: last.y,
          mode: labelMode[sn.idx]
        };
      })
      .sort((a, b) => a.y - b.y);
    if (placed.length > 0) {
      const minGap = narrow ? 11 : 13;
      const topY = M.top + 8, bottomY = M.top + plotH + 4;
      for (let i = 1; i < placed.length; i++) {
        if (placed[i].y - placed[i - 1].y < minGap) placed[i].y = placed[i - 1].y + minGap;
      }
      for (let i = placed.length - 1; i >= 0; i--) {
        if (placed[i].y > bottomY) placed[i].y = bottomY;
        if (i < placed.length - 1 && placed[i + 1].y - placed[i].y < minGap) placed[i].y = placed[i + 1].y - minGap;
      }
      placed.forEach(p => p.el.setAttribute("y", Math.max(p.y, topY)));

      // Trait de liaison fin quand l'étiquette a été décalée de plus de 12 px
      // pour que l'œil retrouve facilement la courbe associée.
      placed.forEach(p => {
        const finalY = +p.el.getAttribute("y");
        if (Math.abs(finalY - p.origY) <= 12) return;
        const color = p.el.getAttribute("fill");
        const above = finalY < p.cy;
        const connector = el("line", {
          x1: p.cx, y1: above ? p.cy - 4 : p.cy + 4,
          x2: p.cx, y2: above ? finalY + 2 : finalY - 10,
          stroke: color,
          "stroke-width": 1,
          opacity: 0.55
        });
        seriesLayer.appendChild(connector);
      });
    }

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
      // Sur petit écran, les libellés du type « Rapport 2023 (réf. 1,0 %) »
      // sont raccourcis à l'année pour tenir sur une seule ligne ; le libellé
      // complet reste disponible (title, infobulle, tableau de données).
      const shortFor = label => {
        if (!narrow) return label;
        const m = /^(Rapport|Projection|Hypothèse)\b/.test(label) &&
          label.match(/(19|20)\d{2}(\s*→\s*(19|20)\d{2})?/);
        return m ? m[0] : label;
      };
      // Quand les libellés sont réduits à l'année, une ligne d'en-tête rappelle
      // que ces courbes sont des projections (et non des données observées).
      let groupDone = false;
      const groupHeader = label => {
        const d = document.createElement("div");
        d.className = "legend-group";
        d.textContent = /^Hypothèse/.test(label) ? "Hypothèses des rapports :" : "Projections des rapports :";
        return d;
      };
      seriesNodes.forEach((sn, idx) => {
        const text = shortFor(sn.cfg.label);
        if (text !== sn.cfg.label && !groupDone) {
          legend.appendChild(groupHeader(sn.cfg.label));
          groupDone = true;
        }
        const item = document.createElement("button");
        item.className = "legend-item" +
          (sn.cfg.kind === "solid" ? " is-solid" : "") +
          (text === sn.cfg.label ? " is-long" : "");
        item.type = "button";
        item.title = sn.cfg.label;
        item.innerHTML = swatchHTML(sn.cfg.color, sn.cfg.kind) + `<span>${text}</span>`;
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
