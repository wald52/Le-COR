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
    if (kind === "bar")
      return `<svg class="legend-swatch" width="14" height="12" viewBox="0 0 14 12" aria-hidden="true">` +
        `<rect x="1" y="1" width="12" height="10" rx="1.5" fill="${color}"/></svg>`;
    const dash = kind === "dash" ? ' stroke-dasharray="5 3"' : "";
    return `<svg class="legend-swatch" width="20" height="6" viewBox="0 0 20 6" aria-hidden="true">` +
      `<line x1="1" y1="3" x2="19" y2="3" stroke="${color}" stroke-width="3" stroke-linecap="round"${dash}/></svg>`;
  }
  function dotHTML(color) {
    return `<svg class="tt-dot" width="9" height="9" viewBox="0 0 9 9" aria-hidden="true">` +
      `<circle cx="4.5" cy="4.5" r="4.5" fill="${color}"/></svg>`;
  }
  // Construit une ligne d'infobulle (pastille + libellé + valeur). Le libellé
  // peut revenir à la ligne ; seule la valeur reste insécable.
  function tipRow(color, label, value) {
    return `<div class="tt-row">${dotHTML(color)}<span class="tt-txt">${label} : <strong>${value}</strong></span></div>`;
  }
  // Place l'infobulle près de l'ancre `anchorPx` (abscisse en pixels CSS dans
  // le repère du conteneur) en la gardant toujours visible : on la met de
  // préférence à droite du repère, on bascule à gauche s'il manque de place,
  // puis on borne aux marges. Corrige le rognage sur mobile, où l'infobulle
  // pouvait sortir du cadre lorsqu'elle était plus large que le graphique.
  function placeTip(tip, rect, anchorPx) {
    const margin = 8, gap = 14, tw = tip.offsetWidth;
    let left = anchorPx + gap;
    if (left + tw + margin > rect.width) left = anchorPx - gap - tw;
    left = Math.max(margin, Math.min(left, rect.width - tw - margin));
    tip.style.left = left + "px";
    tip.style.top = "12px";
  }

  // Tableau de données repliable sous le graphique — alternative accessible
  // (lecteurs d'écran, malvoyants) et gage de transparence.
  function buildDataTable(container, cfg, suffix) {
    // Axe catégoriel (barres, profils par âge) : lignes = catégories, sans
    // filtrage par pas de 5 ; sinon axe d'années comme avant.
    const cats = cfg.categories;
    const xs = cats
      ? cats.map((_, i) => i)
      : [...new Set(cfg.series.flatMap(s => s.points.map(p => p.x)))].sort((a, b) => a - b);
    if (!xs.length) return;
    const kept = cats
      ? xs
      : xs.filter(y => y % 5 === 0 || y === xs[0] || y === xs[xs.length - 1]);
    const rowLabel = x => (cats ? cats[x] : x);
    const at = (s, x) => {
      // Une série rattachée à l'axe secondaire porte son propre suffixe (ex. %).
      const sfx = s.axis === "right" ? (cfg.y2?.suffix ?? suffix) : suffix;
      const p = s.points.find(p => p.x === x);
      return p ? String(Math.round(p.y * 10) / 10).replace(".", ",") + sfx : "—";
    };
    let html = `<details class="data-details"><summary class="data-toggle">Voir les données (tableau)</summary>` +
      `<div class="data-table-wrap"><table><caption class="visually-hidden">${cfg.ariaLabel || "Données du graphique"}</caption>` +
      `<thead><tr><th scope="col">${cfg.x?.label || (cats ? "Catégorie" : "Année")}</th>`;
    cfg.series.forEach(s => { html += `<th scope="col">${s.label}</th>`; });
    html += "</tr></thead><tbody>";
    kept.forEach(x => {
      html += `<tr><th scope="row">${rowLabel(x)}</th>`;
      cfg.series.forEach(s => { html += `<td>${at(s, x)}</td>`; });
      html += "</tr>";
    });
    html += "</tbody></table></div>";
    // Bouton de téléchargement CSV, rattaché au tableau (apparaît une fois le
    // <details> ouvert). Pas de gestionnaire ici : le clic est traité par
    // délégation dans app.js (setupDataExports), ce qui le rend résistant aux
    // re-rendus du graphique (redimensionnement) qui reconstruisent ce markup.
    html += `<button type="button" class="data-csv">` +
      `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">` +
      `<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>` +
      `Télécharger les données (CSV)</button></details>`;
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
    // Annule l'animation (en cours ou en attente de visibilité) d'un rendu
    // précédent : sa boucle rAF continuerait sinon sur un SVG orphelin.
    if (container.__revealCancel) container.__revealCancel();
    container.innerHTML = "";

    // Dimensions responsives : on cale le viewBox sur la largeur réelle du
    // conteneur pour que les textes restent à taille lisible (≈ px) partout,
    // au lieu d'un SVG fixe réduit (illisible sur mobile).
    // Repli quand le conteneur n'a pas de largeur (pré-rendu hors écran, carte
    // masquée) : on estime d'après la fenêtre pour tomber du bon côté du seuil
    // `narrow` (480 px) — sinon une constante (ex. 760) forcerait le ratio large
    // sur mobile et le graphique s'afficherait aplati une fois mis à l'échelle.
    const cw = Math.round(container.getBoundingClientRect().width) || Math.min(window.innerWidth, 920);
    const W = Math.max(300, Math.min(cw, 920));
    const narrow = W < 480;
    // Axe x catégoriel (profils par âge…) : les graduations sont les libellés
    // de `categories` et non des années ; le tooltip indexe par catégorie.
    const cats = cfg.categories || null;

    // Axe Y secondaire (à droite) optionnel : les séries marquées
    // `axis:"right"` sont tracées sur leur propre échelle (cfg.y2), ce qui
    // permet de superposer une grandeur d'unité différente (ex. une part en %)
    // sans écraser l'échelle principale. Sans série « droite », rien ne change.
    const isRight = s => s.axis === "right";
    const hasY2 = cfg.series.some(isRight);
    const leftSeries = cfg.series.filter(s => !isRight(s));
    const rightSeries = cfg.series.filter(isRight);
    const y2Suffix = cfg.y2?.suffix ?? "";

    // Calcul anticipé des bornes Y et de la hauteur de tracé (ne dépendent pas
    // de la marge droite) pour décider si chaque étiquette peut tenir à
    // l'intérieur du graphique plutôt que dans la marge droite.
    const allY_pre = leftSeries.flatMap(s => s.points.map(p => p.y));
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

    // Point de fin « visible » d'une série : les données peuvent dépasser la
    // fenêtre X du graphique (ex. hypothèses 2070 sur un tracé arrêté à 2050).
    // Les marqueurs et étiquettes de fin s'ancrent alors au bord droit (valeur
    // interpolée à xMax), pas sur le dernier point brut, qui serait hors cadre.
    const endAnchor = s => {
      const last = s.points[s.points.length - 1];
      if (!last || last.x <= xMax_pre) return last;
      const y = interpolateY(s.points, xMax_pre);
      return y === null ? last : { x: xMax_pre, y };
    };

    // Pour chaque série : 'inside' si toutes les autres courbes sont à plus de
    // MIN_CLEAR px au niveau du dernier point, 'outside' sinon, 'none' sans label.
    const labelMode = cfg.series.map(s => {
      if (!s.endNote && !s.endLabel) return "none";
      const lastPt = endAnchor(s);
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
    // Marge gauche : doit contenir la PLUS LONGUE étiquette de l'axe Y, suffixe
    // compris. Les valeurs avec une unité large (ex. « 70 Md€ ») débordaient
    // sinon le bord gauche du cadre et étaient rognées. On dimensionne donc la
    // marge sur la longueur réelle des libellés plutôt que sur une valeur fixe.
    const yTicksPre = niceTicks(yMin_pre, yMax_pre, 5);
    const ySuffixPre = cfg.y?.suffix ?? "";
    const yLabelLen = Math.max(...yTicksPre.map(t =>
      (String(Math.round(t * 10) / 10).replace(".", ",") + ySuffixPre).length));
    const leftForLabels = Math.ceil(yLabelLen * CHAR_W) + (narrow ? 12 : 14);
    // Bornes anticipées de l'axe secondaire + marge droite nécessaire à ses
    // étiquettes (sinon « 30 % » déborderait hors cadre comme à gauche).
    const allY2_pre = rightSeries.flatMap(s => s.points.map(p => p.y));
    const y2Min_pre = hasY2 ? (cfg.y2?.min ?? Math.min(...allY2_pre)) : 0;
    const y2Max_pre = hasY2 ? (cfg.y2?.max ?? Math.max(...allY2_pre)) : 1;
    const rightForLabels = hasY2
      ? Math.ceil(Math.max(...niceTicks(y2Min_pre, y2Max_pre, 5).map(t =>
          (String(Math.round(t * 10) / 10).replace(".", ",") + y2Suffix).length)) * CHAR_W)
        + (narrow ? 12 : 14)
      : 0;
    const M = {
      top: 16 + bandTop,
      right: Math.max(rightForLabels, outsideEndLen > 0
        ? Math.min(Math.max(outsideEndLen * CHAR_W + 14, narrow ? 40 : 56), narrow ? 96 : 124)
        : (narrow ? 8 : 14)),
      bottom: (narrow ? 34 : 46) + bandBot,
      // Marge gauche élargie en présence de coupures d'axe : les étiquettes Y
      // sont repoussées à gauche des zigzags posés sur l'axe.
      left: Math.max(narrow ? 42 : 46, leftForLabels) + (bandTop || bandBot ? 10 : 0)
    };
    const plotW = W - M.left - M.right;
    const plotH = H - M.top - M.bottom;

    // Bornes
    const allX = cfg.series.flatMap(s => s.points.map(p => p.x));
    const allY = leftSeries.flatMap(s => s.points.map(p => p.y));
    const xMin = cfg.x?.min ?? Math.min(...allX);
    const xMax = cfg.x?.max ?? Math.max(...allX);
    const yMin = cfg.y?.min ?? Math.min(...allY);
    const yMax = cfg.y?.max ?? Math.max(...allY);
    const suffix = cfg.y?.suffix ?? "";
    const y2Min = hasY2 ? (cfg.y2?.min ?? Math.min(...allY2_pre)) : 0;
    const y2Max = hasY2 ? (cfg.y2?.max ?? Math.max(...allY2_pre)) : 1;

    const sx = v => M.left + ((v - xMin) / (xMax - xMin)) * plotW;
    const sy = v => M.top + (1 - (v - yMin) / (yMax - yMin)) * plotH;
    const sy2 = v => M.top + (1 - (v - y2Min) / (y2Max - y2Min)) * plotH;
    // Résolveurs par série : suffixe et hors-échelle dépendent de l'axe auquel
    // la série est rattachée. Les séries « droite » ne passent jamais par les
    // bandes hors échelle (elles ont leur propre cadrage, cf. syAllOf).
    const suffixOf = s => (isRight(s) ? y2Suffix : suffix);

    // Position Y, bandes comprises : une valeur très hors échelle est posée à
    // hauteur fixe au milieu de sa bande (l'écart réel n'est pas à l'échelle,
    // c'est tout le sens de la coupure ; la valeur exacte est affichée à côté).
    const yTopBand = M.top - BAND_GAP - (BAND_H - BAND_GAP) / 2;
    const yBotBand = M.top + plotH + BAND_GAP + (BAND_H - BAND_GAP) / 2;
    const syAll = v => isFarHigh(v) ? yTopBand : isFarLow(v) ? yBotBand : sy(v);
    // Variante par série : une série de droite est toujours « dans le cadre »
    // sur son échelle, sans bande hors échelle ni signe de coupure.
    const syAllOf = s => (isRight(s) ? sy2 : syAll);
    const isFarS = (s, v) => !isRight(s) && (isFarHigh(v) || isFarLow(v));

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

    // Contrôles de révélation exposés sur le conteneur : le carrousel pré-rend le
    // graphique au repos (à sa taille finale, pas de redimensionnement à l'ouverture)
    // puis CACHE la courbe avant la montée de la feuille (__revealReset) et la TRACE
    // une fois la feuille arrivée (__revealPlay) — sur le SVG déjà rendu, sans le
    // reconstruire. Indépendant du bloc d'animation auto (page à défilement) ci-dessous.
    let revealRaf;
    const playReveal = () => {
      cancelAnimationFrame(revealRaf);
      const t0 = performance.now();
      const step = now => {
        const k = Math.max(0, Math.min(1, (now - t0) / 1100));
        revealRect.setAttribute("width", revealW * (1 - Math.pow(1 - k, 3)));
        if (k < 1) revealRaf = requestAnimationFrame(step);
      };
      revealRaf = requestAnimationFrame(step);
    };
    container.__revealReset = () => { cancelAnimationFrame(revealRaf); revealRect.setAttribute("width", 0); };
    container.__revealPlay = playReveal;

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

    // --- Axe Y secondaire (à droite) ---
    // Graduations (crans) et étiquettes à droite du cadre, teintées de la
    // couleur de la série concernée pour signaler « cette courbe se lit sur
    // l'échelle de droite ». Pas de ligne d'axe verticale ni de grille (l'axe
    // gauche n'en a pas non plus) : on garde une lecture homogène, légère.
    if (hasY2) {
      const y2Color = (rightSeries[0] && rightSeries[0].color) || "#5b6f93";
      niceTicks(y2Min, y2Max, 5).forEach(t => {
        const y = sy2(t);
        svg.appendChild(el("line", {
          x1: M.left + plotW, y1: y, x2: M.left + plotW + 5, y2: y, class: "chart-tick",
          style: `stroke:${y2Color}`
        }));
        const lbl = el("text", {
          x: M.left + plotW + (narrow ? 7 : 9), y: y + 4,
          class: "chart-axis-label", "text-anchor": "start", style: `fill:${y2Color}`
        });
        lbl.textContent = String(Math.round(t * 10) / 10).replace(".", ",") + y2Suffix;
        svg.appendChild(lbl);
      });
    }

    // --- Axe X ---
    // La ligne d'axe est posée sous la bande hors échelle du bas (le point
    // extrême reste ainsi au-dessus de l'abscisse) ; la borne basse de
    // l'échelle principale reste matérialisée par sa ligne de grille.
    const xAxisY = M.top + plotH + bandBot;
    const xTicks = cats
      ? cats.map((_, i) => i)
      : niceTicks(xMin, xMax, narrow ? 4 : 6).filter(t => t >= xMin && t <= xMax);
    xTicks.forEach(t => {
      const x = sx(t);
      svg.appendChild(el("line", {
        x1: x, y1: xAxisY, x2: x, y2: xAxisY + 5, class: "chart-tick"
      }));
      const txt = cats ? String(cats[t]) : String(t).replace(/\s/g, "");
      // Étiquette centrée sur la graduation, SAUF aux extrémités : centrée, la
      // moitié droite du dernier millésime (ex. « 2025 ») déborde du viewBox et
      // est rognée (.chart-svg { overflow:hidden }), surtout sur mobile où la
      // marge droite est minime. On aligne donc la 1re étiquette à gauche et la
      // dernière à droite lorsqu'elles déborderaient, pour les garder entières.
      const halfW = (txt.length * CHAR_W) / 2;
      const anchor = x + halfW > W - 2 ? "end" : x - halfW < 2 ? "start" : "middle";
      const lbl = el("text", { x: x, y: xAxisY + 22, class: "chart-axis-label", "text-anchor": anchor });
      lbl.textContent = txt;
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
      const syS = syAllOf(s);
      const scaled = s.points.map(p => ({
        x: sx(p.x), y: syS(p.y),
        far: isFarS(s, p.y), raw: p
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
        t.textContent = String(sp.raw.y).replace(".", ",").replace("-", "−") + suffixOf(s);
        g.appendChild(t);
      });

      // Point de fin visible (au bord droit si la série dépasse xMax).
      const endRaw = endAnchor(s);
      const endScaled = endRaw ? { x: sx(endRaw.x), y: syS(endRaw.y) } : null;

      // Points de marquage (optionnels) — utile pour le dernier point.
      if (s.markers !== false && endScaled) {
        g.appendChild(el("circle", { cx: endScaled.x, cy: endScaled.y, r: 3.5, fill: s.color }));
      }

      // Étiquette de fin de courbe (label + valeur), façon PIIE.
      // Mode 'inside' : l'étiquette se termine juste avant le point final
      // (text-anchor=end), ce qui évite d'agrandir la marge droite.
      // Mode 'outside' : comportement classique, dans la marge droite.
      let endNoteEl = null;
      if ((s.endNote || s.endLabel) && endScaled) {
        const last = endScaled;
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
      seriesNodes.push({ cfg: s, node: g, scaled, endScaled, endNoteEl, idx });
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
    const edgeX = M.left + plotW * 0.98; // ancrage « au bord droit »
    seriesNodes.forEach(sn => {
      if (!sn.endNoteEl || labelMode[sn.idx] !== "inside") return;
      const last = sn.endScaled;
      // Couloir d'ordre : sans borne, la recherche au-dessus/en dessous peut
      // poser l'étiquette de l'autre côté d'une courbe voisine, et les
      // millésimes se croisent (ex. « 2026 » rendu sous la courbe 2025).
      // Deux contraintes : ne jamais dépasser le point final d'une autre
      // série étiquetée au bord droit, et rester du bon côté des étiquettes
      // intérieures déjà posées. Le couloir reste large pour que la
      // recherche de dégagement garde ses chances (un couloir trop étroit
      // finirait par poser le texte sur sa propre courbe).
      const EDGE_GAP = LABEL_H / 2 + 2;
      let corTop = M.top + 2 + LABEL_H / 2;
      let corBot = M.top + plotH - 2 - LABEL_H / 2;
      const atEdge = last.x >= edgeX;
      if (atEdge) {
        seriesNodes.forEach(o => {
          if (o === sn || !o.endScaled || labelMode[o.idx] === "none") return;
          if (o.endScaled.x < edgeX) return;
          if (o.endScaled.y < last.y) corTop = Math.max(corTop, o.endScaled.y + EDGE_GAP);
          else if (o.endScaled.y > last.y) corBot = Math.min(corBot, o.endScaled.y - EDGE_GAP);
        });
        placedInside.forEach(p => {
          if (p.anchorY == null || p.anchorY === last.y) return;
          if (p.anchorY < last.y) corTop = Math.max(corTop, p.cy + LABEL_H);
          else corBot = Math.min(corBot, p.cy - LABEL_H);
        });
      }
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
          if (cy < corTop || cy > corBot) continue;
          if (cy - LABEL_H / 2 < M.top + 2 || cy + LABEL_H / 2 > M.top + plotH - 2) continue;
          if (!labelFree(cy)) continue;
          const clear = clearanceAt(cy);
          if (clear >= need) { center = cy; break; }
          if (clear > best.clear) best = { cy, clear };
        }
      }
      if (center === null) {
        // Aucune position dégagée dans le couloir. Si la marge droite est
        // déjà réservée (autres étiquettes extérieures) et que le repli
        // poserait le texte sur une courbe, on bascule l'étiquette en mode
        // extérieur : la passe d'empilement gère les paquets serrés en
        // préservant l'ordre des courbes.
        center = corTop > corBot
          ? (corTop + corBot) / 2
          : Math.min(Math.max(best.cy, corTop), corBot);
        if (outsideEndLen > 0 && clearanceAt(center) < EDGE_GAP) {
          labelMode[sn.idx] = "outside";
          sn.endNoteEl.setAttribute("x", Math.min(last.x + 8, W - M.right + 6));
          sn.endNoteEl.setAttribute("y", last.y + 4);
          sn.endNoteEl.setAttribute("text-anchor", "start");
          return;
        }
      }
      sn.endNoteEl.setAttribute("y", center + 4);
      placedInside.push({ x1, x2, cy: center, anchorY: atEdge ? last.y : null });
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
        const last = sn.endScaled;
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
      const minGap = narrow ? 13 : 14;
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
    // Le tracé ne démarre qu'à l'entrée du graphique dans la zone visible :
    // chaque graphique est ainsi vu en train de se dessiner, une seule fois,
    // au lieu de s'animer hors écran dès le chargement de la page.
    if (ANIMATE && !reducedMotion() && cfg.animate !== false) {
      revealRect.setAttribute("width", 0);
      const dur = 1100;
      let raf, obs;
      const done = () => { running.delete(finish); container.__revealCancel = null; };
      const finish = () => {
        if (obs) { obs.disconnect(); obs = null; }
        revealRect.setAttribute("width", revealW);
        done();
      };
      finish.cancel = () => {
        if (obs) { obs.disconnect(); obs = null; }
        cancelAnimationFrame(raf);
      };
      const start = () => {
        const t0 = performance.now();
        const step = now => {
          const k = Math.max(0, Math.min(1, (now - t0) / dur));
          revealRect.setAttribute("width", revealW * (1 - Math.pow(1 - k, 3)));
          if (k < 1) raf = requestAnimationFrame(step); else done();
        };
        raf = requestAnimationFrame(step);
      };
      running.add(finish);
      container.__revealCancel = () => { finish.cancel(); done(); };
      if ("IntersectionObserver" in window) {
        obs = new IntersectionObserver(entries => {
          if (entries.some(e => e.isIntersecting)) {
            obs.disconnect(); obs = null;
            start();
          }
        }, { threshold: 0.15 });
        obs.observe(svg);
      } else {
        start();
      }
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
      // Hors de la plage de données de la série : rien à afficher. Bornes
      // INCLUSES (< et > stricts) : à la première comme à la dernière année,
      // on renvoie la valeur du point exact. Avec <=/>=, l'infobulle restait
      // vide pile sur ces années (bug du survol sur la dernière année).
      if (xv < pts[0].x || xv > pts[pts.length - 1].x) return null;
      for (let i = 1; i < pts.length; i++) {
        if (xv <= pts[i].x) {
          const a = pts[i - 1], b = pts[i];
          const t = (xv - a.x) / (b.x - a.x);
          return a.y + t * (b.y - a.y);
        }
      }
      return pts[pts.length - 1].y;
    }

    overlay.addEventListener("mousemove", evt => {
      const rect = svg.getBoundingClientRect();
      const px = (evt.clientX - rect.left) / rect.width * W;
      const xv = xMin + ((px - M.left) / plotW) * (xMax - xMin);
      let xr = Math.round(xv);
      if (cats) xr = Math.max(0, Math.min(cats.length - 1, xr));
      focusLine.setAttribute("x1", sx(xr));
      focusLine.setAttribute("x2", sx(xr));
      focusLine.setAttribute("opacity", 1);

      let rows = `<div class="tt-year">${cats ? cats[xr] : xr}</div>`;
      let any = false;
      cfg.series.forEach(s => {
        const v = valueAt(s, xr);
        if (v != null) {
          any = true;
          rows += tipRow(s.color, s.label, `${String(Math.round(v * 10) / 10).replace(".", ",")}${suffixOf(s)}`);
        }
      });
      if (!any) { tip.style.opacity = 0; return; }
      tip.innerHTML = rows;
      tip.style.opacity = 1;
      placeTip(tip, rect, (sx(xr) / W) * rect.width);
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

    // Config conservée pour l'export CSV des données (cf. app.js).
    container.__cfg = cfg;

    return svg;
  }

  /**
   * Crée un graphique en barres (axe x catégoriel).
   * @param {HTMLElement} container
   * @param {Object} cfg
   *   cfg.categories : ["Retraités", …] — libellés ordonnés de l'axe x
   *   cfg.series : [{ label, color, points:[{x,y}], total }] — x = index de catégorie
   *   cfg.barMode : "grouped" (défaut) | "stacked"
   *   cfg.y : { min, max, suffix }
   * Réutilise les helpers communs (el, niceTicks, swatchHTML, dotHTML,
   * buildDataTable) et le motif d'animation/tooltip de lineChart.
   */
  function barChart(container, cfg) {
    if (container.__revealCancel) container.__revealCancel();
    container.innerHTML = "";

    // Repli largeur : cf. lineChart — la fenêtre (≈ appareil) plutôt qu'une
    // constante, pour que le pré-rendu hors écran tombe du bon côté de `narrow`.
    const cw = Math.round(container.getBoundingClientRect().width) || Math.min(window.innerWidth, 920);
    const W = Math.max(300, Math.min(cw, 920));
    const narrow = W < 480;
    const cats = cfg.categories || [];
    const n = cats.length;
    const waterfall = !!cfg.waterfall;
    const stacked = cfg.barMode === "stacked";
    const suffix = cfg.y?.suffix ?? "";
    const CHAR_W = 6.8;

    const barSeries = cfg.series.filter(s => !s.total);
    const totalSeries = cfg.series.filter(s => s.total);
    const valAt = (s, i) => { const p = s.points.find(p => p.x === i); return p ? p.y : null; };

    // Bornes Y : on inclut toujours 0 ; en empilé, les cumuls +/− séparés ;
    // en cascade, on suit la trajectoire cumulée.
    let lo = 0, hi = 0;
    if (waterfall && barSeries.length) {
      let cum = 0;
      barSeries[0].points.forEach(p => {
        if (p.total) { hi = Math.max(hi, p.y); lo = Math.min(lo, p.y); }
        else { const b = cum + p.y; hi = Math.max(hi, cum, b); lo = Math.min(lo, cum, b); cum = b; }
      });
    } else {
      for (let i = 0; i < n; i++) {
        if (stacked) {
          let pos = 0, neg = 0;
          barSeries.forEach(s => { const v = valAt(s, i); if (v == null) return; if (v >= 0) pos += v; else neg += v; });
          hi = Math.max(hi, pos); lo = Math.min(lo, neg);
        } else {
          barSeries.forEach(s => { const v = valAt(s, i); if (v == null) return; hi = Math.max(hi, v); lo = Math.min(lo, v); });
        }
        totalSeries.forEach(s => { const v = valAt(s, i); if (v == null) return; hi = Math.max(hi, v); lo = Math.min(lo, v); });
      }
    }
    const pad = (hi - lo) * 0.08 || 1;
    const yMax = cfg.y?.max ?? hi + pad;
    const yMin = cfg.y?.min ?? (lo < 0 ? lo - pad : 0);

    // Marges : gauche pour les libellés d'axe Y, bas pour les libellés de
    // catégories. Ces derniers sont désormais horizontaux et répartis sur
    // plusieurs lignes (retour à la ligne) plutôt que pivotés : c'est plus
    // lisible, surtout sur mobile.
    const yTicks = niceTicks(yMin, yMax, 5);
    const yLabelLen = Math.max(...yTicks.map(t =>
      (String(Math.round(t * 10) / 10).replace(".", ",") + suffix).length));
    const leftForLabels = Math.ceil(yLabelLen * CHAR_W) + (narrow ? 12 : 14);
    const rightM = narrow ? 10 : 16;
    const left0 = Math.max(narrow ? 42 : 46, leftForLabels);
    const bandWApprox = (W - left0 - rightM) / Math.max(n, 1);

    // Découpe d'un libellé en lignes tenant dans la largeur d'une bande.
    // On coupe sur les espaces (et après les « / »). Un mot insécable plus
    // large que la bande reste sur sa propre ligne (léger débordement toléré).
    const LBL_LH = 13; // interligne (px) des libellés de catégories
    const LBL_CHAR = 6.2; // largeur moyenne d'un caractère à ~11px
    const wrapMaxChars = Math.max(5, Math.floor(bandWApprox * 1.12 / LBL_CHAR));
    const wrapLabel = text => {
      // On autorise une coupure après « / » et « - » (le séparateur reste
      // collé au mot précédent), sinon sur les espaces.
      const tokens = String(text).replace(/([/-])/g, "$1 ").split(/\s+/).filter(Boolean);
      const lines = [];
      let cur = "";
      const flush = () => { if (cur) { lines.push(cur); cur = ""; } };
      tokens.forEach(tok => {
        // Mot insécable plus large que la bande : coupé au caractère.
        if (tok.length > wrapMaxChars && !/[/-]$/.test(tok)) {
          flush();
          for (let i = 0; i < tok.length; i += wrapMaxChars) lines.push(tok.slice(i, i + wrapMaxChars));
          return;
        }
        const sep = cur && !/[/-]$/.test(cur) ? " " : "";
        if (cur && (cur + sep + tok).length > wrapMaxChars) { flush(); cur = tok; }
        else { cur += sep + tok; }
      });
      flush();
      return lines.length ? lines : [String(text)];
    };
    const catLines = cats.map(wrapLabel);
    const maxLines = Math.max(1, ...catLines.map(l => l.length));

    const baseBottom = narrow ? 34 : 40;
    const M = {
      top: 16,
      right: rightM,
      bottom: Math.max(baseBottom, 16 + (maxLines - 1) * LBL_LH + 8),
      left: left0
    };
    const plotW = W - M.left - M.right;
    const H = Math.round(narrow ? Math.min(W * 0.98, 380) : Math.min(W * 0.56, 460)) + Math.max(0, M.bottom - baseBottom);
    const plotH = H - M.top - M.bottom;

    const sy = v => M.top + (1 - (v - yMin) / (yMax - yMin)) * plotH;
    const bandW = plotW / Math.max(n, 1);
    const y0 = sy(0);

    const svg = el("svg", {
      viewBox: `0 0 ${W} ${H}`, class: "chart-svg", role: "img",
      "aria-label": cfg.ariaLabel || "Graphique en barres"
    });

    // Pas d'animation pour les diagrammes en barres : seules les courbes (lineChart)
    // se tracent. Les barres s'affichent d'emblée, sans clip de révélation.
    const seriesLayer = el("g");

    // --- Grille + axe Y ---
    yTicks.forEach(t => {
      const y = sy(t);
      svg.appendChild(el("line", { x1: M.left, y1: y, x2: M.left + plotW, y2: y, class: "chart-grid" }));
      const lbl = el("text", { x: M.left - 8, y: y + 4, class: "chart-axis-label", "text-anchor": "end" });
      lbl.textContent = String(Math.round(t * 10) / 10).replace(".", ",") + suffix;
      svg.appendChild(lbl);
    });

    // --- Axe X catégoriel (libellés horizontaux, multi-lignes) ---
    const xAxisY = M.top + plotH;
    cats.forEach((c, i) => {
      const cx = M.left + (i + 0.5) * bandW;
      const lbl = el("text", {
        x: cx, y: xAxisY + 16, class: "chart-axis-label chart-cat-label",
        "text-anchor": "middle"
      });
      catLines[i].forEach((line, k) => {
        const ts = el("tspan", { x: cx, dy: k === 0 ? 0 : LBL_LH });
        ts.textContent = line;
        lbl.appendChild(ts);
      });
      svg.appendChild(lbl);
    });
    // Ligne de référence (zéro si l'échelle traverse 0, sinon l'axe de base).
    svg.appendChild(el("line", { x1: M.left, y1: y0, x2: M.left + plotW, y2: y0, class: "chart-axis" }));

    // --- Barres ---
    const seriesNodes = [];
    const rectFor = (x, w, a, b, color) => el("rect", {
      x: x, width: Math.max(0, w), y: Math.min(sy(a), sy(b)),
      height: Math.abs(sy(a) - sy(b)), fill: color, rx: 1.5
    });
    // Cascade : barres flottantes partant du cumul précédent (vert = hausse,
    // rouge = baisse), connecteurs pointillés, barre « total » repartant de 0.
    if (waterfall && barSeries.length) {
      const s = barSeries[0];
      const POS = "#2e7d32", NEG = "#c62828", TOT = "#1f4e79";
      const g = el("g", { class: "chart-series", "data-idx": 0 });
      let cum = 0, prevRightX = null;
      for (let i = 0; i < n; i++) {
        const p = s.points.find(pt => pt.x === i);
        if (!p) continue;
        const v = p.y, bw = bandW * 0.6, x = M.left + i * bandW + (bandW - bw) / 2;
        const a = p.total ? 0 : cum;
        const b = p.total ? v : cum + v;
        const color = p.total ? TOT : (v >= 0 ? POS : NEG);
        if (prevRightX != null && !p.total)
          g.appendChild(el("line", { x1: prevRightX, y1: sy(a), x2: x, y2: sy(a), stroke: "#9aa7b4", "stroke-width": 1, "stroke-dasharray": "3 3" }));
        g.appendChild(rectFor(x, bw, a, b, color));
        const t = el("text", { x: x + bw / 2, y: Math.min(sy(a), sy(b)) - 4, class: "chart-endnote", fill: color, "text-anchor": "middle" });
        t.textContent = (p.total ? "" : (v >= 0 ? "+" : "−")) + String(Math.abs(Math.round(v * 100) / 100)).replace(".", ",") + suffix;
        g.appendChild(t);
        if (p.total) { prevRightX = null; } else { cum = b; prevRightX = x + bw; }
      }
      seriesLayer.appendChild(g);
      seriesNodes.push({ cfg: s, node: g });
    } else
    barSeries.forEach((s, idx) => {
      const g = el("g", { class: "chart-series", "data-idx": idx });
      for (let i = 0; i < n; i++) {
        const v = valAt(s, i);
        if (v == null) continue;
        const bx0 = M.left + i * bandW;
        if (stacked) {
          const bw = bandW * 0.62, x = bx0 + (bandW - bw) / 2;
          // cumul (recalculé jusqu'à cette série) pour empiler +/−.
          let pos = 0, neg = 0;
          for (const s2 of barSeries) {
            const v2 = valAt(s2, i);
            if (v2 == null) { if (s2 === s) break; else continue; }
            if (s2 === s) { g.appendChild(rectFor(x, bw, v2 >= 0 ? pos : neg, (v2 >= 0 ? pos : neg) + v2, s.color)); break; }
            if (v2 >= 0) pos += v2; else neg += v2;
          }
        } else {
          const inner = bandW * 0.74, gap0 = (bandW - inner) / 2, bw = inner / barSeries.length;
          // couleur par barre si le point la porte (ex. instantané pays, France saillante)
          const pc = (s.points.find(pt => pt.x === i) || {}).color || s.color;
          g.appendChild(rectFor(bx0 + gap0 + idx * bw + 1, bw - 2, 0, v, pc));
        }
      }
      seriesLayer.appendChild(g);
      seriesNodes.push({ cfg: s, node: g });
    });

    // Série « total » : repère horizontal + valeur au-dessus de chaque barre.
    totalSeries.forEach((s, k) => {
      const g = el("g", { class: "chart-series", "data-idx": barSeries.length + k });
      for (let i = 0; i < n; i++) {
        const v = valAt(s, i);
        if (v == null) continue;
        const bx0 = M.left + i * bandW, bw = bandW * 0.62, x = bx0 + (bandW - bw) / 2;
        g.appendChild(el("line", { x1: x, y1: sy(v), x2: x + bw, y2: sy(v), stroke: s.color, "stroke-width": 2.4, "stroke-linecap": "round" }));
        const t = el("text", { x: bx0 + bandW / 2, y: sy(v) - 5, class: "chart-endnote", fill: s.color, "text-anchor": "middle" });
        t.textContent = String(Math.round(v * 10) / 10).replace(".", ",").replace("-", "−") + suffix;
        g.appendChild(t);
      }
      seriesLayer.appendChild(g);
      seriesNodes.push({ cfg: s, node: g });
    });
    svg.appendChild(seriesLayer);

    // --- Infobulle : survol d'une bande → valeurs de la catégorie ---
    const focusBand = el("rect", { class: "chart-focus-band", y: M.top, height: plotH, x: -10, width: 0, opacity: 0, fill: "#1f2d3d" });
    svg.appendChild(focusBand);
    const tip = document.createElement("div");
    tip.className = "chart-tooltip";
    tip.style.opacity = 0;
    container.style.position = "relative";
    container.appendChild(tip);
    const overlay = el("rect", { x: M.left, y: M.top, width: plotW, height: plotH, fill: "transparent", "pointer-events": "all" });
    overlay.addEventListener("mousemove", evt => {
      const rect = svg.getBoundingClientRect();
      const px = (evt.clientX - rect.left) / rect.width * W;
      let i = Math.floor((px - M.left) / bandW);
      i = Math.max(0, Math.min(n - 1, i));
      focusBand.setAttribute("x", M.left + i * bandW);
      focusBand.setAttribute("width", bandW);
      focusBand.setAttribute("opacity", 0.06);
      let rows = `<div class="tt-year">${cats[i]}</div>`;
      let any = false;
      cfg.series.forEach(s => {
        const v = valAt(s, i);
        if (v != null) {
          any = true;
          rows += tipRow(s.color, s.label, `${String(Math.round(v * 10) / 10).replace(".", ",")}${suffix}`);
        }
      });
      if (!any) { tip.style.opacity = 0; return; }
      tip.innerHTML = rows;
      tip.style.opacity = 1;
      placeTip(tip, rect, ((M.left + (i + 0.5) * bandW) / W) * rect.width);
    });
    overlay.addEventListener("mouseleave", () => { tip.style.opacity = 0; focusBand.setAttribute("opacity", 0); });
    svg.appendChild(overlay);

    container.appendChild(svg);

    // --- Légende interactive (pastilles « barre », atténuation au survol) ---
    // En cascade, une seule série : la couleur des barres (hausse/baisse/total)
    // et les valeurs ± portées au-dessus suffisent, pas de légende.
    if (cfg.legend !== false && !waterfall) {
      const legend = document.createElement("div");
      legend.className = "chart-legend";
      seriesNodes.forEach(sn => {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "legend-item" + (sn.cfg.label.length > 16 ? " is-long" : "");
        item.title = sn.cfg.label;
        item.innerHTML = swatchHTML(sn.cfg.color, "bar") + `<span>${sn.cfg.label}</span>`;
        const dim = on => { seriesNodes.forEach(o => { o.node.style.opacity = on && o !== sn ? 0.18 : 1; }); };
        item.addEventListener("mouseenter", () => dim(true));
        item.addEventListener("mouseleave", () => dim(false));
        item.addEventListener("focus", () => dim(true));
        item.addEventListener("blur", () => dim(false));
        legend.appendChild(item);
      });
      container.appendChild(legend);
    }

    if (cfg.table !== false) buildDataTable(container, cfg, suffix);

    container.__zoomRender = target => barChart(target, Object.assign({}, cfg, { animate: false, table: false }));
    container.__cfg = cfg;
    return svg;
  }

  /**
   * Diagramme de Sankey — SVG pur, sans dépendance.
   * Trois colonnes : sources de financement (gauche) → Système de retraite
   * (nœud central) → régimes qui versent les pensions (droite). La hauteur de
   * chaque nœud et l'épaisseur de chaque ruban sont proportionnelles au montant
   * (en Md€). Sert à répondre « d'où vient l'argent, où va-t-il ? ».
   *
   * @param {HTMLElement} container
   * @param {Object} cfg
   *   cfg.sources : [{ key, label, color, value }]   — nœuds de gauche (Md€)
   *   cfg.regimes : [{ key, label, color, value }]   — nœuds de droite (Md€)
   *   cfg.solde   : number (signé ; < 0 = déficit)   — bouclage du diagramme
   *   cfg.soldeLabel : { deficit, excedent }
   *   cfg.centerLabel : libellé du nœud central
   *   cfg.unit : " Md€" ; cfg.yearLabel : "2025" | "Total 2016–2025"
   *   cfg.mini : true → illustration de fond (sans libellés ni tableau)
   *   cfg.ariaLabel, cfg.table
   */
  function sankeyChart(container, cfg) {
    if (container.__revealCancel) container.__revealCancel();
    container.innerHTML = "";

    const mini = !!cfg.mini;
    const unit = cfg.unit || " Md€";
    const dec = cfg.decimals || 0;          // 0 pour Md€, 1 pour %
    const showShare = cfg.showShare !== false && !cfg.hideShare; // « · X % » à côté du montant
    const fmt = v => {
      const s = dec ? v.toFixed(dec) : String(Math.round(v));
      const [ip, dp] = s.split(".");
      const ipg = ip.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
      return dp ? ipg + "," + dp : ipg;
    };

    // Côté gauche = sources (+ besoin de financement si déficit) ; côté droit =
    // régimes (+ excédent si solde positif). Les deux côtés somment au même T.
    const solde = cfg.solde || 0;
    const left = cfg.sources.map(s => ({ ...s }));
    const right = cfg.regimes.map(s => ({ ...s }));
    const sl = cfg.soldeLabel || {};
    if (solde < -0.05)
      left.push({ key: "solde", label: sl.deficit || "Déficit", short: sl.shortDeficit || "Déficit", color: "#d11", value: -solde, isSolde: true });
    else if (solde > 0.05)
      right.push({ key: "solde", label: sl.excedent || "Excédent", short: sl.shortExcedent || "Excédent", color: "#2e8b57", value: solde, isSolde: true });
    const sum = arr => arr.reduce((a, b) => a + b.value, 0);
    const T = Math.max(sum(left), sum(right)) || 1;

    const cw = Math.round(container.getBoundingClientRect().width) || Math.min(window.innerWidth, 920);
    const W = mini ? 360 : Math.max(300, Math.min(cw, 920));
    const narrow = W < 480;

    // Marges : place pour les libellés (courts) de part et d'autre (hors mini).
    const M = mini
      ? { top: 8, right: 10, bottom: 8, left: 10 }
      : { top: 30, right: narrow ? 104 : 172, bottom: 16, left: narrow ? 104 : 172 };
    const FS = narrow ? 9.5 : 11.5;   // taille de police des libellés
    const NODE_W = mini ? 7 : 12;
    const GAP = mini ? 5 : (narrow ? 13 : 18);
    const maxN = Math.max(left.length, right.length);
    // Hauteur cible de la zone de flux, FIXE : on en déduit l'échelle (px/Md€)
    // pour que le diagramme tienne quelle que soit l'ampleur de T (une année
    // ≈ 300–425 Md€ vs le cumul ≈ 3 500 Md€).
    // Mini : viewBox au ratio de la carte (340×520 ≈ 0,654) pour qu'il remplisse
    // TOUTE la carte (W=360 ⇒ H≈551 ⇒ plotH≈535, un peu plus « portrait » pour
    // garantir le plein-hauteur ; marge latérale résiduelle < 2 px, invisible).
    const plotH = mini ? 540 : (narrow ? 480 : 560);
    const H = Math.round(plotH + M.top + M.bottom);
    const scale = (plotH - (maxN - 1) * GAP) / T;     // px SVG par Md€
    const MIN_H = mini ? 2 : 6;   // hauteur mini d'un nœud (lisibilité des libellés)

    const svg = el("svg", {
      viewBox: `0 0 ${W} ${H}`,
      class: mini ? "sankey" : "sankey chart-svg", role: mini ? "presentation" : "img"
    });
    if (!mini) svg.setAttribute("aria-label", cfg.ariaLabel || "Diagramme de Sankey du financement des retraites");
    // Mini (fond de carte) : le SVG tient ENTIER dans le conteneur (comme
    // object-fit:contain), sans rogner — on veut voir tout le diagramme (fan
    // sources → régimes) pour comprendre d'un coup d'œil de quoi il s'agit.
    if (mini) svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    svg.style.overflow = "visible";
    container.appendChild(svg);

    const colLeftX = M.left;
    const colRightX = W - M.right - NODE_W;
    const centerX = (colLeftX + NODE_W + colRightX) / 2 - NODE_W / 2;
    const centerY = M.top;   // tout est aligné en haut (les écarts ne sont que sur les colonnes latérales)
    // Destination unique (années sans ventilation par régime) : on fusionne le
    // nœud central et la destination → une seule barre à droite (plus lisible).
    const singleTarget = !!cfg.singleTarget;

    // Empile une colonne de nœuds, renvoie [{ ...item, y0, y1, h }].
    function stack(items, x) {
      let y = M.top;
      return items.map(it => {
        const h = Math.max(MIN_H, it.value * scale);
        const node = { ...it, x, y0: y, y1: y + h, h };
        y += h + GAP;
        return node;
      });
    }
    const leftNodes = stack(left, colLeftX);
    const rightNodes = stack(right, colRightX);

    // Tranches sur les bords du nœud central, dans l'ordre des nœuds latéraux.
    function slices(nodes, fromY) {
      let y = fromY;
      const map = {};
      nodes.forEach(n => { const h = n.value * scale; map[n.key] = { y0: y, y1: y + h }; y += h; });
      return map;
    }
    const inSlices = slices(leftNodes, singleTarget ? rightNodes[0].y0 : centerY);
    const outSlices = singleTarget ? null : slices(rightNodes, centerY);

    // Translucidité portée par le GROUPE (et non par chaque ruban) : ainsi le
    // léger recouvrement des rubans « in »/« out » au centre ne cumule pas les
    // opacités (pas de liseré sombre) et le raccord reste propre.
    const gRibbons = el("g", { class: "sk-ribbons", opacity: mini ? 0.5 : 0.42 });
    const gNodes = el("g", { class: "sk-nodes" });
    const gLabels = el("g", { class: "sk-labels" });
    svg.appendChild(gRibbons); svg.appendChild(gNodes); svg.appendChild(gLabels);

    // Ruban entre deux segments verticaux (bord droit d'un nœud → bord gauche).
    function ribbon(x0, a0, a1, x1, b0, b1) {
      const xc = (x0 + x1) / 2;
      return `M${x0},${a0} C${xc},${a0} ${xc},${b0} ${x1},${b0} ` +
             `L${x1},${b1} C${xc},${b1} ${xc},${a1} ${x0},${a1} Z`;
    }

    const ribbonEls = [];
    function addRibbon(node, slice, side) {
      // « in »  : bord droit de la source → axe central (centerX).
      // « out » : axe central (centerX) → bord gauche du régime.
      // Les rubans « out » démarrent 1 px À GAUCHE de centerX pour chevaucher
      // les « in » : les rubans étant OPAQUES (la translucidité est sur le
      // groupe), ce recouvrement ne fonce pas — il masque simplement tout
      // raccord, donc ni trou blanc ni liseré sombre au centre.
      const d = side === "in"
        ? ribbon(colLeftX + NODE_W, node.y0, node.y1, singleTarget ? colRightX : centerX, slice.y0, slice.y1)
        : ribbon(centerX - 1, slice.y0, slice.y1, colRightX, node.y0, node.y1);
      const p = el("path", {
        d, fill: node.color, "fill-opacity": 1, stroke: "none"
      });
      p.__node = node; p.__side = side;
      gRibbons.appendChild(p);
      ribbonEls.push(p);
    }
    leftNodes.forEach(n => addRibbon(n, inSlices[n.key], "in"));
    if (!singleTarget) rightNodes.forEach(n => addRibbon(n, outSlices[n.key], "out"));

    // Aucune barre (rectangle) : on ne garde que les rubans (traits) et les
    // libellés. Les nœuds servent uniquement à positionner rubans et libellés.

    if (!mini) {
      const text = (x, y, str, anchor, cls) => {
        const t = el("text", { x, y, "text-anchor": anchor, class: cls || "sk-label" });
        t.textContent = str; return t;
      };
      const pct = v => Math.round((v / T) * 100);
      function label(n, anchor) {
        const x = anchor === "end" ? n.x - 8 : n.x + NODE_W + 8;
        const cy = (n.y0 + n.y1) / 2;
        const g = el("g");
        const name = text(x, cy - 2, n.short || n.label, anchor, "sk-name" + (n.isSolde ? " is-solde" : ""));
        name.setAttribute("font-size", FS);
        const valTxt = fmt(n.value) + unit + (showShare ? "  ·  " + pct(n.value) + " %" : "");
        const val = text(x, cy + FS + 1, valTxt, anchor, "sk-val");
        val.setAttribute("font-size", FS - 1.5);
        g.appendChild(name); g.appendChild(val);
        gLabels.appendChild(g);
      }
      leftNodes.forEach(n => label(n, "end"));
      rightNodes.forEach(n => label(n, "start"));
      // Libellé du nœud central (au-dessus) — omis en destination unique.
      if (!singleTarget) {
        const ct = text(centerX + NODE_W / 2, centerY - 10, (cfg.centerLabel || "Système de retraite") + " · " + fmt(T) + unit, "middle", "sk-center");
        gLabels.appendChild(ct);
      }
      // En-têtes de colonnes (masqués en étroit : ils chevaucheraient le nœud
      // central ; la légende sous le graphique explique déjà gauche/droite).
      if (!narrow) {
        const hL = text(colLeftX + NODE_W / 2, M.top - 14, "D'où vient l'argent", "middle", "sk-head");
        const hR = text(colRightX + NODE_W / 2, M.top - 14, singleTarget ? "Où il va" : "Où il va (régimes)", "middle", "sk-head");
        gLabels.appendChild(hL); gLabels.appendChild(hR);
      }
    }

    // Survol : met en évidence un flux, estompe les autres (+ infobulle).
    if (!mini) {
      const tip = document.createElement("div");
      tip.className = "chart-tooltip";
      tip.hidden = true;
      container.style.position = container.style.position || "relative";
      container.appendChild(tip);
      const highlight = on => p => {
        // Au survol, l'opacité passe sur chaque ruban (groupe à 1) pour
        // pouvoir accentuer le survolé et estomper les autres ; au repos, on
        // rend les rubans opaques et on rétablit l'opacité du groupe (raccord
        // central propre, sans liseré).
        gRibbons.setAttribute("opacity", on ? 1 : 0.42);
        ribbonEls.forEach(r => { r.setAttribute("fill-opacity", on ? (r === p ? 0.85 : 0.12) : 1); });
        if (on) {
          const n = p.__node;
          const dir = p.__side === "in" ? (n.label + " → Système") : ("Système → " + n.label);
          tip.innerHTML = tipRow(n.color, dir, fmt(n.value) + unit);
          tip.hidden = false;
        } else tip.hidden = true;
      };
      ribbonEls.forEach(p => {
        p.style.cursor = "pointer";
        p.addEventListener("mouseenter", () => highlight(true)(p));
        p.addEventListener("mousemove", e => {
          const rect = container.getBoundingClientRect();
          placeTip(tip, rect, e.clientX - rect.left);
        });
        p.addEventListener("mouseleave", () => highlight(false)(p));
      });
    }

    if (!mini && cfg.table !== false) buildSankeyTable(container, cfg, leftNodes, rightNodes, T, unit, fmt);

    container.__zoomRender = target => sankeyChart(target, Object.assign({}, cfg, { table: false }));
    return svg;
  }

  // Tableau de données accessible du Sankey (sources / régimes, en Md€).
  function buildSankeyTable(container, cfg, leftNodes, rightNodes, T, unit, fmt) {
    const pct = v => Math.round((v / T) * 100);
    const rows = (nodes, head) => {
      let h = `<tr><th scope="col">${head}</th><th scope="col">${cfg.unit || "Md€"}</th><th scope="col">Part</th></tr>`;
      nodes.forEach(n => {
        h += `<tr><th scope="row">${n.label}</th><td>${fmt(n.value)}</td><td>${pct(n.value)} %</td></tr>`;
      });
      return h;
    };
    const html = `<details class="data-details"><summary class="data-toggle">Voir les données (tableau)</summary>` +
      `<div class="data-table-wrap"><table><caption class="visually-hidden">${cfg.ariaLabel || "Financement des retraites"}</caption>` +
      `<thead>${rows([], "Sources de financement — " + (cfg.yearLabel || ""))}</thead>` +
      `<tbody>${rows(leftNodes, "").replace(/^<tr>.*?<\/tr>/, "")}</tbody>` +
      `<thead>${rows([], "Emplois par régime")}</thead>` +
      `<tbody>${rows(rightNodes, "").replace(/^<tr>.*?<\/tr>/, "")}</tbody>` +
      `</table></div></details>`;
    container.insertAdjacentHTML("beforeend", html);
  }

  window.CORChart = { lineChart, barChart, sankeyChart, setAnimate, isAnimating: () => ANIMATE, swatch: swatchHTML };
})();
