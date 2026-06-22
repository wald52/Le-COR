/*
 * CardSwipeScreen — transforme l'accueil « Ceci est mon COR » en carousel
 * mobile de cartes swipeables (inspiration « iPhone Card Swipe Animation »).
 *
 * Vanilla pur, sans dépendance. Réutilise :
 *  - window.CORChart  (moteur de graphiques SVG, js/chart.js) pour le mini-
 *    graphique de fond de chaque carte ;
 *  - window.CORApp    (js/app.js) pour (re)dessiner le graphique complet et
 *    interactif dans la vue détail ;
 *  - les <section> existantes de index.html comme CONTENU des vues détail
 *    (on les déplace dans l'overlay à l'ouverture, on les remet à la fermeture).
 *
 * Composants (fabriques vanilla) : CardSwipeScreen, CardItem, CardDetailView.
 *
 * Comment fonctionnent les interpolations
 * ---------------------------------------
 * Tout l'état du carousel tient dans UN scalaire continu : `offset` (position
 * en « unités de carte », 0 = première carte centrée). Pour chaque carte i :
 *   d = i - offset                      (distance signée au centre)
 *   scale   = lerp(ACTIVE, INACTIVE, |d|)   → la carte centrale est la plus grande
 *   opacity = lerp(1, 0.55, |d|)            → les voisines s'estompent
 *   x       = d * STEP                       → translation horizontale
 *   rotate  = -d * 2°                         → légère inclinaison
 * Le graphique interne est translaté de -d*STEP*PARALLAX_AMOUNT : il « traîne »
 * derrière la carte → effet de profondeur/parallax. Comme `offset` varie en
 * continu pendant le drag, tout s'interpole en douceur, sans à-coups.
 * L'ouverture d'une carte interpole une progression t∈[0,1] (easeOutCubic) qui
 * agrandit la carte au plein écran (FLIP), réduit les coins arrondis et fait
 * apparaître le contenu en fade + slide-up.
 */
(function () {
  "use strict";

  // Sécurité : si le moteur de graphiques ou l'API app ne sont pas chargés, on
  // ne fait rien (la page reste la version à défilement classique).
  if (!window.CORChart || !window.CORApp) return;

  const D = window.COR_DATA || {};
  const S = window.COR_SERIES || {};
  const { lineChart, barChart } = window.CORChart;

  /* ======================================================================
   * CONSTANTES RÉGLABLES — voir aussi css/cards.css (mêmes valeurs en --var).
   * ==================================================================== */
  const CARD_WIDTH = 340;      // largeur d'une carte (px)
  const CARD_HEIGHT = 520;     // hauteur d'une carte (px)
  const CARD_SPACING = 20;     // espace entre deux cartes (px)
  const ACTIVE_SCALE = 1.0;    // échelle de la carte centrale
  const INACTIVE_SCALE = 0.86; // échelle des cartes latérales
  const PARALLAX_AMOUNT = 0.18;// décalage du graphique interne (fraction de STEP)
  const SPRING_CONFIG = { stiffness: 170, damping: 26, mass: 1 }; // snap au centre
  const OPEN_DURATION = 440;   // durée de l'ouverture/fermeture du détail (ms)

  const STEP = CARD_WIDTH + CARD_SPACING;
  const reduceMotion = () =>
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  /* ======================================================================
   * MINI-GRAPHIQUES de fond — de vrais graphiques rendus par CORChart, en
   * version « vignette » (sans légende, sans tableau, non interactifs : les
   * interactions sont désactivées en CSS via .card-chart). Le graphique complet
   * et interactif est rendu plus tard dans la vue détail (CORApp.renderSection).
   * ==================================================================== */
  function miniLine(target, series, x, y) {
    lineChart(target, { series, x, y, legend: false, table: false, animate: false, ariaLabel: "" });
  }
  // Bloc « réalisé + projections/hypothèses superposées » (dépenses, solde…).
  function miniOverlay(target, block, key, suffix) {
    if (!block) return;
    const extra = block[key] || [];
    const series = [
      { ...block.realise, kind: "solid", markers: false },
      ...extra.map(p => ({ label: p.label, color: p.color, kind: "dash", points: p.points }))
    ];
    miniLine(target, series, { min: block.xMin, max: block.xMax },
      { min: block.yMin, max: block.yMax, suffix });
  }

  const MINI = {
    depenses: t => miniOverlay(t, S.depensesPib || D.depensesPib, "projections", " %"),
    deficit: t => miniOverlay(t, S.solde, "projections", " %"),
    productivite: t => {
      const d = D.productivite;
      if (!d) return;
      const pts = d.rapports.map(r => ({ x: r.year, y: r.central }));
      miniLine(t, [{ label: "Productivité", color: "#d62728", kind: "solid", markers: false, points: pts }],
        { min: d.rapports[0].year, max: d.rapports[d.rapports.length - 1].year },
        { min: 0, max: 2, suffix: " %" });
    },
    realite: t => miniOverlay(t, S.fecondite || D.fecondite, "hypotheses", ""),
    financement: t => {
      const d = S.fiscalisation || D.fiscalisation;
      if (!d) return;
      miniLine(t, [{ ...d.realise, kind: "solid", markers: false }],
        { min: d.xMin, max: d.xMax }, { min: d.yMin, max: d.yMax, suffix: " Md€" });
    },
    niveau: t => miniOverlay(t, S.niveauVie, "projections", " %"),
    monde: t => {
      const d = S.international;
      if (!d) return;
      const cats = d.countries.map(c => c.name);
      const series = [
        { label: "Public", color: "#1f4e79", points: d.countries.map((c, i) => ({ x: i, y: c.pub })) },
        { label: "Privé", color: "#7fb0e0", points: d.countries.map((c, i) => ({ x: i, y: c.priv })) }
      ];
      barChart(t, { categories: cats, series, barMode: "stacked",
        legend: false, table: false, animate: false, y: { suffix: " %" }, ariaLabel: "" });
    }
  };

  /* ======================================================================
   * DONNÉES DES CARTES (point 7 du cahier des charges).
   * `image` = référence de rendu (pas un fichier : « aucun asset externe ») :
   *   { section, theme, mini, icon }
   *     section : id de la <section> existante (contenu de la vue détail)
   *     theme   : couleur du dégradé de profondeur derrière le graphique
   *     mini    : clé du mini-graphique (MINI[...]) — absent ⇒ carte « outil »
   *     icon    : emoji affiché sur les cartes sans graphique
   * Réordonner / ajouter une carte = éditer ce tableau, rien d'autre.
   * ==================================================================== */
  const cards = [
    { id: "presentation", chapter: "Bienvenue", title: "À quoi sert ce site ?",
      subtitle: "Chaque année, le COR projette nos retraites jusqu'en 2070. Ce site superpose ses rapports de 2001 à 2026 : change-t-il d'avis, et ses prévisions se réalisent-elles ?",
      noDetail: true,
      image: { section: "presentation", theme: "#1f4e79", photo: "./images/intro-cor.jpg" } },
    { id: "depenses", chapter: "Le constat", title: "La même question, des réponses différentes",
      subtitle: "Dépenses de retraite en % du PIB",
      description: "Chaque rapport du COR reprévoit la même courbe… et change d'avis : de « ça baisse » à « ça monte fortement ».",
      image: { section: "depenses", theme: "#1f4e79", mini: "depenses" } },
    { id: "deficit", chapter: "Le constat", title: "Le déficit : pourquoi, depuis quand ?",
      subtitle: "Le solde du système plonge",
      description: "Sur onze rapports superposés, le solde projeté en 2070 va de +0,9 % à −2,4 % du PIB. Effet ciseaux.",
      image: { section: "deficit", theme: "#c0392b", mini: "deficit" } },
    { id: "productivite", chapter: "Le constat", title: "L'hypothèse qui fait tout basculer",
      subtitle: "La productivité, discrètement abaissée",
      description: "De 1,3 % à 0,7 % : changer ce seul chiffre transforme un système « à l'équilibre » en système « en déficit ».",
      image: { section: "productivite", theme: "#7b1fa2", mini: "productivite" } },
    { id: "realite", chapter: "Le constat", title: "Les prévisions se sont-elles réalisées ?",
      subtitle: "L'hypothèse rattrapée par les faits",
      description: "Fécondité et productivité réelles sont passées sous les hypothèses du COR — qui les révise enfin en 2026.",
      image: { section: "realite", theme: "#2f6fb0", mini: "realite" } },
    { id: "niveau", chapter: "Le constat", title: "Les retraités vont-ils décrocher ?",
      subtitle: "Niveau de vie relatif des retraités",
      description: "Proche de la parité aujourd'hui (~100 %), le COR projette un décrochage progressif — d'ampleur variable selon les rapports.",
      image: { section: "niveau", theme: "#0f766e", mini: "niveau" } },
    { id: "financement", chapter: "Comment ça marche", title: "D'où vient vraiment l'argent des retraites ?",
      subtitle: "Cotisations, impôts, transferts",
      description: "Le financement n'est pas que des cotisations : la part de l'impôt (CSG, ITAF) monte. D'où vient réellement l'argent ?",
      image: { section: "financement", theme: "#0e7490", mini: "financement" } },
    { id: "dette", chapter: "Comment ça marche", title: "« La moitié de la dette part dans les retraites » ?",
      subtitle: "Vrai ou faux ? — le débat Bayrou / Beaufret",
      description: "Le chiffre avancé par F. Bayrou, et sa lecture « avant concours publics » (Beaufret, Molinari, Fondapol) : ce que disent vraiment les sources.",
      image: { section: "dette", theme: "#b91c1c", photo: "./images/bayrou.jpg" } },
    { id: "monde", chapter: "Comment ça marche", title: "La France dans le monde",
      subtitle: "Dépenses de retraite par pays (2021)",
      description: "Parmi les pays qui dépensent le plus, mais des dépenses quasi entièrement publiques : un choix de répartition.",
      image: { section: "monde", theme: "#b45309", mini: "monde" } },
    { id: "hypotheses", chapter: "Comment ça marche", title: "Le tableau de bord des hypothèses",
      subtitle: "Toutes les hypothèses, d'un coup d'œil",
      description: "Productivité, fécondité, chômage, immigration… le récapitulatif des hypothèses retenues par chaque rapport du COR.",
      image: { section: "hypotheses", theme: "#475569", photo: "./images/hypotheses-cockpit.jpg" } },
    { id: "explorer", chapter: "Aller plus loin", title: "Explorer tous les indicateurs",
      subtitle: "Un thème, un indicateur, un graphique",
      description: "Choisissez un thème puis un indicateur : toutes les projections des rapports se superposent.",
      image: { section: "explorer", theme: "#334155", photo: "./images/explorer-cards.svg" } },
    { id: "simulateur", chapter: "Que faire ?", title: "Équilibrez le système",
      subtitle: "Le simulateur des 3 leviers",
      description: "Âge, cotisations, pensions : dosez les leviers et voyez si le système revient à l'équilibre en 2070.",
      image: { section: "simulateur", theme: "#1f4e79", photo: "./images/simulateur-faders.jpg" } },
    { id: "methode", chapter: "Aller plus loin", title: "Méthode & sources",
      subtitle: "D'où viennent les données",
      description: "Comment lire ces graphiques, et les fichiers officiels du COR derrière chaque courbe.",
      image: { section: "methode", theme: "#475569", photo: "./images/sources-logos.png" } }
  ];

  /* ======================================================================
   * État du carousel.
   * ==================================================================== */
  let offset = 0;        // position continue (unités de carte)
  let index = 0;         // carte active (entier)
  let vel = 0;           // vitesse de `offset` (unités/seconde)
  let raf = null;        // id rAF de l'animation spring
  let detailOpen = false;
  const cardEls = [];    // <li.card>
  const chartEls = [];   // calque .card-chart de chaque carte (parallax)
  const dotEls = [];
  const miniDrawn = new Set(); // cartes dont le mini-graphique est déjà tracé

  let screen, viewport, track, dotsWrap, prevBtn, nextBtn;

  /* ----------------------------------------------------------------------
   * CardItem — construit une carte.
   * -------------------------------------------------------------------- */
  function CardItem(card, i) {
    const li = document.createElement("li");
    li.className = "card";
    li.dataset.index = String(i);
    li.dataset.section = card.image.section;
    // Carte sans vue détail (noDetail) : ni rôle bouton, ni libellé « ouvrir ».
    // La classe `card--no-detail` permet au CSS de retirer l'affordance
    // « cliquable » (curseur) quand la carte est centrée : un tap n'ouvre rien.
    if (card.noDetail) {
      li.classList.add("card--no-detail");
      li.setAttribute("aria-label", card.title);
    } else {
      li.setAttribute("role", "button");
      li.setAttribute("tabindex", "0");
      li.setAttribute("aria-label", card.title + " — ouvrir");
    }

    const inner = document.createElement("div");
    inner.className = "card-inner";
    inner.style.setProperty("--theme", card.image.theme);

    const bg = document.createElement("div");
    bg.className = "card-bg";

    const chart = document.createElement("div");
    if (card.image.photo) {
      // Carte « photo » : une image pleine carte sert de fond (pas de mini-graphe).
      chart.className = "card-chart card-chart--photo";
      const img = document.createElement("img");
      img.className = "card-photo";
      img.src = card.image.photo;
      img.alt = "";
      img.loading = "lazy";
      img.decoding = "async";
      chart.appendChild(img);
    } else {
      chart.className = "card-chart" + (card.image.mini ? "" : " card-chart--icon");
      if (!card.image.mini) chart.innerHTML = `<span class="card-icon">${card.image.icon || "•"}</span>`;
    }

    const overlay = document.createElement("div");
    overlay.className = "card-overlay";

    const text = document.createElement("div");
    text.className = "card-text";
    text.innerHTML =
      (i === 0 ? "" : `<span class="card-chapter">${card.chapter} · ${String(i).padStart(2, "0")}</span>`) +
      `<h2 class="card-title">${card.title}</h2>` +
      `<p class="card-sub">${card.subtitle}</p>` +
      (card.description ? `<p class="card-desc">${card.description}</p>` : "") +
      (card.noDetail ? "" : `<span class="card-cta">Voir le détail ›</span>`);

    inner.appendChild(bg);
    inner.appendChild(chart);
    inner.appendChild(overlay);
    inner.appendChild(text);
    li.appendChild(inner);

    cardEls[i] = li;
    chartEls[i] = chart;
    return li;
  }

  /* ----------------------------------------------------------------------
   * Trace (paresseusement) le mini-graphique d'une carte et de ses voisines.
   * -------------------------------------------------------------------- */
  function drawMini(i) {
    if (i < 0 || i >= cards.length || miniDrawn.has(i)) return;
    const card = cards[i];
    if (!card.image.mini || !MINI[card.image.mini]) return;
    miniDrawn.add(i);
    try { MINI[card.image.mini](chartEls[i]); } catch (e) { miniDrawn.delete(i); }
  }
  function drawVisibleMinis() {
    for (let i = index - 1; i <= index + 1; i++) drawMini(i);
  }

  /* ----------------------------------------------------------------------
   * Applique les transforms à toutes les cartes pour un `offset` donné.
   * N'utilise que transform/opacity (composables GPU) → fluide à 60 fps.
   * -------------------------------------------------------------------- */
  function applyTransforms(off) {
    for (let i = 0; i < cardEls.length; i++) {
      const el = cardEls[i];
      const d = i - off;
      const ad = clamp(Math.abs(d), 0, 1);
      const scale = lerp(ACTIVE_SCALE, INACTIVE_SCALE, ad);
      const opacity = lerp(1, 0.55, ad);
      const rot = clamp(d, -1.5, 1.5) * -2; // légère inclinaison
      el.style.transform =
        `translate3d(${d * STEP}px,0,0) scale(${scale}) rotate(${rot}deg)`;
      el.style.opacity = String(opacity);
      el.style.zIndex = String(100 - Math.round(Math.abs(d) * 10));
      const chart = chartEls[i];
      if (chart) {
        // Parallax : le graphique se déplace plus lentement que la carte.
        // On borne la distance à ±1 : le décalage sature et reste couvert par le
        // débord de l'image (cf. .card-chart--photo) → aucune carte ne révèle de
        // bord vide, même très loin du centre.
        const dp = clamp(d, -1, 1);
        chart.style.transform = `translate3d(${(-dp * STEP * PARALLAX_AMOUNT).toFixed(2)}px,0,0)`;
      }
      el.classList.toggle("is-active", i === Math.round(off));
    }
    updateDots(Math.round(off));
    updateNav(Math.round(off));
  }

  function updateDots(active) {
    for (let i = 0; i < dotEls.length; i++) {
      const on = i === active;
      dotEls[i].classList.toggle("is-active", on);
      dotEls[i].setAttribute("aria-current", on ? "true" : "false");
    }
  }

  /* Grise la flèche aux extrémités (indice visuel que le bout est atteint).
   * Dès que l'utilisateur quitte la 1re carte, on coupe l'animation « indice »
   * qui invite à explorer : il a compris le geste, plus besoin de le guider. */
  function updateNav(active) {
    if (!prevBtn) return;
    prevBtn.disabled = active <= 0;
    nextBtn.disabled = active >= cards.length - 1;
    if (active >= 1) nextBtn.classList.remove("is-hint");
  }

  /* ----------------------------------------------------------------------
   * Snap « spring » vers une carte cible.
   * -------------------------------------------------------------------- */
  function springTo(target) {
    target = clamp(target, 0, cards.length - 1);
    index = target;
    drawVisibleMinis();
    if (reduceMotion()) {
      offset = target; vel = 0;
      applyTransforms(offset);
      return;
    }
    if (raf) cancelAnimationFrame(raf);
    let last = performance.now();
    const step = now => {
      const dt = Math.min((now - last) / 1000, 1 / 30);
      last = now;
      const x = offset - target;
      const a = (-SPRING_CONFIG.stiffness * x - SPRING_CONFIG.damping * vel) / SPRING_CONFIG.mass;
      vel += a * dt;
      offset += vel * dt;
      applyTransforms(offset);
      if (Math.abs(offset - target) < 0.001 && Math.abs(vel) < 0.01) {
        offset = target; vel = 0; raf = null;
        applyTransforms(offset);
        return;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }

  /* ----------------------------------------------------------------------
   * Gestes : drag horizontal (swipe), tap (ouvrir), clavier.
   * -------------------------------------------------------------------- */
  function setupGestures() {
    let dragging = false, axis = null, downCard = null;
    let startX = 0, startY = 0, startOffset = 0, lastOffset = 0, lastT = 0;

    viewport.addEventListener("pointerdown", e => {
      if (detailOpen) return;
      dragging = true; axis = null;
      // On mémorise la carte sous le doigt MAINTENANT : après setPointerCapture,
      // e.target des événements suivants devient le viewport, plus la carte.
      downCard = e.target.closest && e.target.closest(".card");
      startX = e.clientX; startY = e.clientY;
      startOffset = offset; lastOffset = offset; lastT = performance.now();
      vel = 0;
      if (raf) { cancelAnimationFrame(raf); raf = null; }
      try { viewport.setPointerCapture(e.pointerId); } catch (err) {}
    });

    viewport.addEventListener("pointermove", e => {
      if (!dragging) return;
      const dx = e.clientX - startX, dy = e.clientY - startY;
      if (axis === null) {
        if (Math.abs(dx) > 6 || Math.abs(dy) > 6) axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
        else return;
      }
      if (axis !== "x") return;     // geste vertical : on laisse passer
      e.preventDefault();
      // Élastique aux extrémités : on freine le débordement.
      let o = startOffset - dx / STEP;
      if (o < 0) o = o * 0.35;
      else if (o > cards.length - 1) o = (cards.length - 1) + (o - (cards.length - 1)) * 0.35;
      offset = o;
      const now = performance.now();
      const dt = Math.max((now - lastT) / 1000, 0.001);
      vel = (offset - lastOffset) / dt;
      lastOffset = offset; lastT = now;
      applyTransforms(offset);
    });

    function endDrag(e) {
      if (!dragging) return;
      dragging = false;
      try { viewport.releasePointerCapture(e.pointerId); } catch (err) {}
      const moved = Math.abs(e.clientX - startX) + Math.abs(e.clientY - startY);
      if (axis !== "x" || moved < 10) {
        // Tap : ouvrir la carte active, ou aller à la carte tapée.
        if (downCard) {
          const i = +downCard.dataset.index;
          if (i === Math.round(offset)) openDetail(i);
          else springTo(i);
        }
        axis = null; downCard = null;
        return;
      }
      axis = null;
      // Cible : carte la plus proche, biaisée par la vitesse (flick).
      let target = Math.round(offset + clamp(vel * 0.12, -0.6, 0.6));
      springTo(target);
      downCard = null;
    }
    viewport.addEventListener("pointerup", endDrag);
    viewport.addEventListener("pointercancel", endDrag);

    // Clavier : flèches pour naviguer, Entrée/Espace pour ouvrir la carte focalisée.
    // Écoute sur `document` : #card-screen n'est pas focusable, un keydown sur le
    // <body> ne « remonterait » jamais jusqu'à lui (les événements bubblent vers
    // les ancêtres, pas les descendants).
    document.addEventListener("keydown", e => {
      if (detailOpen || !document.body.classList.contains("mode-carousel")) return;
      const onCard = document.activeElement && document.activeElement.classList.contains("card");
      if (e.key === "ArrowRight") { springTo(index + 1); e.preventDefault(); }
      else if (e.key === "ArrowLeft") { springTo(index - 1); e.preventDefault(); }
      else if ((e.key === "Enter" || e.key === " ") && onCard) {
        openDetail(+document.activeElement.dataset.index); e.preventDefault();
      }
    });
  }

  /* ======================================================================
   * CardDetailView — « plongée » plein écran dans une carte.
   * ==================================================================== */
  let storeyard;             // #story-sections (réservoir de contenu)
  let detailEl = null;       // overlay courant
  let movedSection = null;   // <section> déplacée (à remettre)
  let sectionPlaceholder = null;
  let detailHistoryPushed = false; // a-t-on empilé une entrée d'historique pour ce détail ?

  function openDetail(i) {
    if (detailOpen) return;
    const card = cards[i];
    if (card.noDetail) return;            // carte sans descriptif détaillé
    const section = storeyard.querySelector("#" + CSS.escape(card.image.section));
    if (!section) return;
    detailOpen = true;
    index = i;

    // Empile une entrée d'historique (sans changer l'URL) pour que le bouton
    // Retour referme le descriptif et revienne aux cartes au lieu de quitter le site.
    try {
      history.pushState({ corDetail: card.image.section }, "");
      detailHistoryPushed = true;
    } catch (e) {}

    // Construit l'overlay.
    detailEl = document.createElement("div");
    detailEl.className = "card-detail";
    detailEl.innerHTML =
      '<div class="cd-scrim"></div>' +
      '<div class="cd-sheet" role="dialog" aria-modal="true" aria-label="' +
      card.title.replace(/"/g, "&quot;") + '">' +
      '<div class="cd-handle"></div>' +
      '<div class="cd-body"></div>' +
      "</div>";
    document.body.appendChild(detailEl);

    const sheet = detailEl.querySelector(".cd-sheet");
    const scrim = detailEl.querySelector(".cd-scrim");
    const body = detailEl.querySelector(".cd-body");

    // Déplace la <section> réelle dans la vue détail (placeholder pour la remettre).
    sectionPlaceholder = document.createComment("section:" + card.image.section);
    section.parentNode.insertBefore(sectionPlaceholder, section);
    body.appendChild(section);
    section.hidden = false;
    movedSection = section;

    // (Re)dessine le ou les graphiques de la section, à pleine taille et animés.
    requestAnimationFrame(() => {
      try { window.CORApp.renderSection(card.image.section, !reduceMotion()); } catch (e) {}
    });

    // Verrouille le scroll de fond, masque le carousel.
    document.body.classList.add("detail-open");
    screen.setAttribute("aria-hidden", "true");

    // Fermeture : glissement vers le bas (mobile), Échap (clavier), clic sur le voile.
    scrim.addEventListener("click", closeDetail);
    setupSheetDismiss(sheet);

    // Animation d'ouverture (FLIP depuis la carte).
    if (reduceMotion()) {
      detailEl.classList.add("is-open");
      body.style.opacity = "1";
      return;
    }
    const rect = cardEls[i].getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    const sx = rect.width / vw, sy = rect.height / vh;
    const tx = rect.left + rect.width / 2 - vw / 2;
    const ty = rect.top + rect.height / 2 - vh / 2;
    sheet.animate(
      [
        { transform: `translate(${tx}px, ${ty}px) scale(${sx}, ${sy})`, borderRadius: "22px", opacity: 0.5 },
        { transform: "none", borderRadius: "0px", opacity: 1 }
      ],
      { duration: OPEN_DURATION, easing: "cubic-bezier(.2,.7,.2,1)", fill: "both" }
    );
    scrim.animate([{ opacity: 0 }, { opacity: 1 }], { duration: OPEN_DURATION, fill: "both" });
    body.animate(
      [{ opacity: 0, transform: "translateY(28px)" }, { opacity: 1, transform: "none" }],
      { duration: OPEN_DURATION, delay: 90, easing: "cubic-bezier(.2,.7,.2,1)", fill: "both" }
    );
    detailEl.classList.add("is-open");
  }

  // `opts.slideDown` (avec `fromY`/`velocity`) ⇒ fermeture par glissement : la
  // feuille continue vers le bas et sort de l'écran. Sinon ⇒ « replongée » dans
  // la carte d'origine (FLIP), symétrique de l'ouverture (bouton/Échap/voile).
  function closeDetail(opts) {
    if (!detailOpen || !detailEl) return;
    opts = opts || {};

    // Fermeture « manuelle » (Échap/voile/glissement) : on consomme nous-mêmes
    // l'entrée d'historique empilée à l'ouverture pour garder l'historique propre.
    // Le popstate qui suit est neutralisé (drapeau déjà à false). Une fermeture
    // déclenchée par le Retour (fromPopstate) a déjà vu son entrée retirée.
    if (detailHistoryPushed && !opts.fromPopstate) {
      detailHistoryPushed = false;
      history.back();
    }

    const sheet = detailEl.querySelector(".cd-sheet");
    const scrim = detailEl.querySelector(".cd-scrim");

    const finish = () => {
      // Remet la <section> à sa place dans le réservoir.
      if (movedSection && sectionPlaceholder && sectionPlaceholder.parentNode) {
        movedSection.hidden = false; // reste affichable, mais le réservoir est hidden
        sectionPlaceholder.parentNode.insertBefore(movedSection, sectionPlaceholder);
        sectionPlaceholder.remove();
      }
      movedSection = null; sectionPlaceholder = null;
      detailEl.remove(); detailEl = null;
      document.body.classList.remove("detail-open");
      screen.removeAttribute("aria-hidden");
      detailOpen = false;
    };

    if (reduceMotion()) { finish(); return; }

    // ----- Fermeture par glissement : continuité avec le doigt -----
    // On repart EXACTEMENT de la position courante de la feuille (translateY du
    // drag) et on la laisse filer vers le bas, hors écran, pendant que le voile
    // s'efface. Pas de saut, pas de mouvement à contre-sens : ça « tombe » dans
    // le prolongement du geste. La durée tient compte de l'élan (flick rapide ⇒
    // sortie plus vive).
    if (opts.slideDown) {
      const vh = window.innerHeight;
      const fromY = opts.fromY || 0;
      const v = Math.max(opts.velocity || 0, 0);              // px/ms
      const dur = clamp(v > 0 ? (vh - fromY) / v : 300, 200, 420);
      const r0 = parseFloat(sheet.style.borderRadius) || 0;
      const s0 = scrim ? (parseFloat(scrim.style.opacity) || 1) : 1;
      const a = sheet.animate(
        [
          { transform: `translateY(${fromY}px)`, borderRadius: r0 + "px" },
          { transform: `translateY(${vh}px)`, borderRadius: "26px" }
        ],
        { duration: dur, easing: "cubic-bezier(.22,1,.36,1)", fill: "both" }
      );
      if (scrim) scrim.animate([{ opacity: s0 }, { opacity: 0 }], { duration: dur, fill: "both" });
      a.onfinish = finish;
      a.oncancel = finish;
      return;
    }

    // ----- Fermeture par bouton/Échap/voile : replongée dans la carte (FLIP) -----
    const i = index;
    const rect = cardEls[i].getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    const sx = rect.width / vw, sy = rect.height / vh;
    const tx = rect.left + rect.width / 2 - vw / 2;
    const ty = rect.top + rect.height / 2 - vh / 2;
    const body = detailEl.querySelector(".cd-body");
    const a = sheet.animate(
      [
        { transform: "translate(0px,0px) scale(1,1)", borderRadius: "0px", opacity: 1 },
        { transform: `translate(${tx}px, ${ty}px) scale(${sx}, ${sy})`, borderRadius: "26px", opacity: 0.35 }
      ],
      { duration: OPEN_DURATION, easing: "cubic-bezier(.32,.72,0,1)", fill: "both" }
    );
    scrim.animate([{ opacity: 1 }, { opacity: 0 }], { duration: OPEN_DURATION, fill: "both" });
    // Le contenu s'efface un peu plus tôt que la réduction → on évite l'effet
    // « texte écrasé » pendant que la feuille rapetisse.
    if (body) body.animate([{ opacity: 1 }, { opacity: 0 }],
      { duration: Math.round(OPEN_DURATION * 0.6), easing: "ease-out", fill: "both" });
    a.onfinish = finish;
    a.oncancel = finish;
  }

  // Fermeture par glissement vers le bas (swipe-down) quand le contenu est en
  // haut de course. Translate la feuille, ferme au-delà d'un seuil, sinon revient.
  function setupSheetDismiss(sheet) {
    let dragging = false, startY = 0, dy = 0, axis = null, startX = 0;
    let lastY = 0, lastT = 0, vy = 0;        // suivi de vélocité (px/ms) pour le « flick »
    sheet.addEventListener("pointerdown", e => {
      if (sheet.scrollTop > 0) return;       // on ne happe le geste qu'en haut
      dragging = true; axis = null; startY = e.clientY; startX = e.clientX; dy = 0;
      lastY = e.clientY; lastT = performance.now(); vy = 0;
    });
    sheet.addEventListener("pointermove", e => {
      if (!dragging) return;
      const ddy = e.clientY - startY, ddx = e.clientX - startX;
      if (axis === null) {
        if (Math.abs(ddy) > 8 || Math.abs(ddx) > 8) axis = Math.abs(ddy) > Math.abs(ddx) ? "y" : "x";
        else return;
      }
      if (axis !== "y" || ddy < 0) return;   // seulement vers le bas
      dy = ddy;
      const now = performance.now();
      if (now > lastT) vy = (e.clientY - lastY) / (now - lastT);
      lastY = e.clientY; lastT = now;
      if (e.cancelable) e.preventDefault();  // le blocage réel vient du touchmove (voir plus bas)
      sheet.style.transform = `translateY(${dy}px)`;
      sheet.style.borderRadius = Math.min(22, dy / 6) + "px";
      const scrim = detailEl.querySelector(".cd-scrim");
      if (scrim) scrim.style.opacity = String(clamp(1 - dy / 500, 0, 1));
    });
    function up() {
      if (!dragging) return;
      dragging = false;
      // Fermeture si on a dépassé le seuil OU sur un « flick » descendant vif.
      if (dy > 120 || (vy > 0.45 && dy > 24)) {
        closeDetail({ slideDown: true, fromY: dy, velocity: Math.max(vy, 0) });
      } else {
        // Retour en place — réglage un peu plus doux/élastique.
        sheet.style.transition = "transform .32s cubic-bezier(.22,1,.36,1), border-radius .32s cubic-bezier(.22,1,.36,1)";
        sheet.style.transform = "";
        sheet.style.borderRadius = "";
        const scrim = detailEl.querySelector(".cd-scrim");
        if (scrim) scrim.style.opacity = "1";
        setTimeout(() => { if (sheet) sheet.style.transition = ""; }, 340);
      }
      dy = 0; axis = null; vy = 0;
    }
    sheet.addEventListener("pointerup", up);
    sheet.addEventListener("pointercancel", up);

    // Garde tactile : seule façon fiable de supprimer le « pull-to-refresh » natif.
    // Le preventDefault() d'un pointer event n'est PAS honoré une fois que le
    // navigateur a classé le geste en défilement ; il faut un touchmove NON passif.
    // On ne bloque QUE quand le contenu est tout en haut ET que le doigt descend,
    // pour laisser intact le défilement vertical normal du descriptif.
    let tStartY = 0;
    sheet.addEventListener("touchstart", e => {
      if (e.touches.length === 1) tStartY = e.touches[0].clientY;
    }, { passive: true });
    sheet.addEventListener("touchmove", e => {
      if (e.touches.length !== 1) return;     // pinch/zoom : on laisse le natif
      const ddy = e.touches[0].clientY - tStartY;
      if (sheet.scrollTop <= 0 && ddy > 0 && e.cancelable) e.preventDefault();
    }, { passive: false });
  }

  // Échap ferme le détail.
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && detailOpen) closeDetail();
  });

  // Bouton/geste Retour du navigateur : l'entrée empilée à l'ouverture vient
  // d'être consommée → on referme le descriptif (animation conservée) et on
  // revient aux cartes, sans re-toucher l'historique.
  window.addEventListener("popstate", () => {
    if (detailOpen && detailHistoryPushed) {
      detailHistoryPushed = false;
      closeDetail({ fromPopstate: true });
    }
  });

  /* ======================================================================
   * CardSwipeScreen — assemble l'écran et remplace l'accueil.
   * ==================================================================== */
  function CardSwipeScreen() {
    const main = document.getElementById("top") || document.querySelector("main");
    if (!main) return;

    // Source unique : les constantes JS pilotent les variables CSS des cartes.
    const root = document.documentElement.style;
    root.setProperty("--card-w", CARD_WIDTH + "px");
    root.setProperty("--card-h", CARD_HEIGHT + "px");

    // Réservoir : on déplace tout le contenu existant de <main> dans un conteneur
    // caché. Les <section> y restent disponibles comme contenu des vues détail.
    storeyard = document.createElement("div");
    storeyard.id = "story-sections";
    storeyard.hidden = true;
    while (main.firstChild) storeyard.appendChild(main.firstChild);
    main.appendChild(storeyard);

    // Écran carousel.
    screen = document.createElement("section");
    screen.id = "card-screen";
    screen.className = "card-screen";
    screen.setAttribute("aria-label", "Carousel — Ceci est mon COR");
    screen.innerHTML =
      '<header class="cs-head">' +
      '<p class="cs-kicker">Outil citoyen · données publiques du COR</p>' +
      '<h1 class="cs-title">Ceci est mon COR</h1>' +
      '<p class="cs-hint">Glissez pour explorer · touchez une carte pour le détail</p>' +
      "</header>" +
      '<div class="cs-viewport">' +
      '<ul class="cs-track" role="list"></ul>' +
      '<button class="cs-nav cs-nav-prev" type="button" aria-label="Carte précédente">' +
      '<svg class="icon" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>' +
      "</button>" +
      '<button class="cs-nav cs-nav-next is-hint" type="button" aria-label="Carte suivante">' +
      '<svg class="icon" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>' +
      "</button>" +
      "</div>" +
      '<nav class="cs-dots" aria-label="Pagination des cartes"></nav>';

    main.insertBefore(screen, storeyard);

    viewport = screen.querySelector(".cs-viewport");
    track = screen.querySelector(".cs-track");
    dotsWrap = screen.querySelector(".cs-dots");

    cards.forEach((c, i) => track.appendChild(CardItem(c, i)));

    cards.forEach((c, i) => {
      const dot = document.createElement("button");
      dot.className = "cs-dot";
      dot.type = "button";
      dot.setAttribute("aria-label", "Aller à la carte " + (i + 1) + " : " + c.title);
      dot.addEventListener("click", () => springTo(i));
      dotEls[i] = dot;
      dotsWrap.appendChild(dot);
    });

    // Flèches de navigation : même logique que clavier/dots (springTo clampe).
    prevBtn = screen.querySelector(".cs-nav-prev");
    nextBtn = screen.querySelector(".cs-nav-next");
    prevBtn.addEventListener("click", () => springTo(index - 1));
    nextBtn.addEventListener("click", () => springTo(index + 1));
    // Empêcher le viewport de capturer le pointer (setPointerCapture) sur
    // pointerdown, sinon le `click` du bouton risque de ne pas se déclencher.
    [prevBtn, nextBtn].forEach(b =>
      b.addEventListener("pointerdown", e => e.stopPropagation()));

    document.body.classList.add("mode-carousel");
    setupGestures();

    // Premier rendu + minis visibles.
    offset = 0; index = 0;
    applyTransforms(0);
    drawVisibleMinis();

    // Redimensionnement (rotation) : les transforms sont en px → on réapplique.
    let rt;
    window.addEventListener("resize", () => {
      clearTimeout(rt);
      rt = setTimeout(() => { if (!detailOpen) applyTransforms(offset); }, 150);
    });
  }

  // L'API CORApp est posée à la fin de app.js (même cycle de scripts `defer`,
  // app.js avant cards.js) : à ce stade tout est prêt.
  function boot() { CardSwipeScreen(); }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
