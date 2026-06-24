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
    // Dès qu'on quitte la 1re carte : on coupe le va-et-vient ET on replie le
    // libellé d'aide (la bulle redevient une simple pastille-flèche).
    if (active >= 1) { nextBtn.classList.remove("is-hint"); nextBtn.classList.remove("is-shown"); }
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
    // Ouverture au glissement (vertical, vers le haut) : miroir de la fermeture.
    let openDragActive = false, odRefs = null;
    let odStartY = 0, odLastY = 0, odLastT = 0, odV = 0;   // suivi de vélocité (px/ms montants)

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
      if (axis === "y") { handleOpenDrag(e, dy); return; }   // vertical : glisser-pour-ouvrir
      if (axis !== "x") return;
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

    // ----- Glisser-pour-ouvrir : inverse de setupSheetDismiss (la feuille MONTE) -----
    // Amorce dès qu'on reconnaît un geste vertical vers le HAUT sur la carte active :
    // on construit l'overlay et on positionne la feuille en bas, prête à suivre.
    function handleOpenDrag(e, dy) {
      if (!openDragActive) {
        if (detailOpen) return;
        if (dy >= 0 || !downCard) return;                 // vers le bas / hors carte : rien
        const i = +downCard.dataset.index;
        if (i !== Math.round(offset) || cards[i].noDetail) return;  // pas la carte active / sans détail
        const refs = buildDetail(i);
        if (!refs) return;
        odRefs = refs; openDragActive = true;
        openDragInner = refs.cardInner;
        detailEl.classList.add("is-open");
        refs.sheet.style.transform = "translateY(100%)";
        refs.sheet.style.borderRadius = "28px";
        if (refs.scrim) refs.scrim.style.opacity = "0";
        odStartY = startY;                                // suivi 1:1 depuis le pointerdown
        odLastY = e.clientY; odLastT = performance.now(); odV = 0;
      }
      e.preventDefault();
      const vh = window.innerHeight;
      const du = Math.max(0, odStartY - e.clientY);       // déplacement vers le haut (px)
      const ty = clamp(vh - du, 0, vh);                   // la feuille suit le doigt 1:1
      const progress = clamp(du / vh, 0, 1);
      const sheet = odRefs.sheet, scrim = odRefs.scrim, inner = odRefs.cardInner;
      sheet.style.transform = `translateY(${ty}px)`;
      sheet.style.borderRadius = (28 * (1 - progress)).toFixed(1) + "px";
      if (scrim) scrim.style.opacity = String(progress);
      if (inner) {                                        // fondu de la carte d'origine
        inner.style.opacity = String(1 - Math.min(1, progress / 0.6));
        inner.style.transform =
          `scale(${(1 + 0.06 * progress).toFixed(3)}) translateY(${(-8 * progress).toFixed(1)}px)`;
      }
      // Vélocité (px/ms montants) sur un intervalle SIGNIFICATIF : on n'échantillonne
      // qu'au-delà de ~4 ms pour éviter une fausse pointe juste après buildDetail (qui
      // consomme du temps réel) et obtenir une vitesse fiable pour le « flick ».
      const now = performance.now();
      if (now - odLastT > 4) {
        odV = (odLastY - e.clientY) / (now - odLastT);
        odLastY = e.clientY; odLastT = now;
      }
    }

    // Confirme l'ouverture : la feuille se cale en plein écran, dans le prolongement
    // du geste, puis on déclenche le rendu différé des graphiques et la bulle d'aide.
    function commitOpen(fromTy, v) {
      const refs = odRefs;
      odRefs = null;
      if (!refs) return;
      const sheet = refs.sheet, scrim = refs.scrim;
      const settle = () => {
        detailReady = true;        // ouverture confirmée : le voile peut fermer
        sheet.style.transform = "";
        sheet.style.borderRadius = "";
        if (scrim) scrim.style.opacity = "1";
        if (pendingDetailRender && !detailChartsRendered) {
          detailChartsRendered = true;
          const render = pendingDetailRender; pendingDetailRender = null;
          requestAnimationFrame(() => { if (detailOpen) render(); });
        }
        startBackHint(refs.backBtn, refs.labelEl);
      };
      if (reduceMotion()) { settle(); return; }
      const r0 = parseFloat(sheet.style.borderRadius) || 0;
      const s0 = scrim ? (parseFloat(scrim.style.opacity) || 0) : 0;
      const dur = clamp(v > 0 ? fromTy / v : OPEN_DURATION, 160, OPEN_DURATION);
      const a = sheet.animate(
        [
          { transform: `translateY(${fromTy}px)`, borderRadius: r0 + "px" },
          { transform: "translateY(0px)", borderRadius: "0px" }
        ],
        { duration: dur, easing: "cubic-bezier(.22,1,.36,1)", fill: "both" }
      );
      if (scrim) scrim.animate([{ opacity: s0 }, { opacity: 1 }], { duration: dur, fill: "both" });
      a.onfinish = () => { try { a.cancel(); } catch (err) {} settle(); };
      a.oncancel = settle;
    }

    // Annule l'ouverture : la feuille redescend hors écran et on démonte tout, en
    // réutilisant la fermeture par glissement (cohérence historique + tear-down).
    function cancelOpen(fromTy) {
      odRefs = null;
      closeDetail({ slideDown: true, fromY: fromTy, velocity: 0 });
    }

    function endDrag(e) {
      if (openDragActive) {
        openDragActive = false;
        try { viewport.releasePointerCapture(e.pointerId); } catch (err) {}
        const vh = window.innerHeight;
        const du = Math.max(0, odStartY - e.clientY);
        const fromTy = clamp(vh - du, 0, vh);
        if (du > 120 || (odV > 0.45 && du > 24)) commitOpen(fromTy, odV);
        else cancelOpen(fromTy);
        dragging = false; axis = null; downCard = null;
        return;
      }
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
  let backHintShown = false; // l'indice texte « cliquez/glissez pour revenir » ne s'affiche qu'à la 1re ouverture
  let openAnims = [];        // animations d'ouverture (WAAPI) à figer avant un drag
  let openCardAnim = null;   // fondu de la carte d'origine pendant l'ouverture (à annuler pour la restaurer)
  let openDragInner = null;  // .card-inner estompé au doigt pendant l'ouverture-glissement (styles inline à restaurer)
  let detailChartsRendered = false; // a-t-on déjà (re)dessiné les graphiques de la section ?
  let pendingDetailRender = null;   // rendu des graphiques différé jusqu'à la fin de l'ouverture
  // Sections dont le tracé a déjà été animé : la révélation gauche → droite ne joue
  // qu'à la PREMIÈRE apparition d'un graphique. Rouvrir la même carte le re-rend
  // (taille réelle, interactivité) mais SANS rejouer le tracé (sinon « rechargement »).
  const animatedDetailSections = new Set();
  let detailReady = false;          // ouverture TERMINÉE → le voile accepte la fermeture (cf. clic parasite ci-dessous)

  // Fige les animations d'ouverture : on écrit leur valeur de fin dans le style
  // inline (commitStyles) puis on les annule (cancel). Sans ça, une animation WAAPI
  // en `fill: "both"` garde la priorité sur le style inline dans la cascade et
  // écrase le `transform`/`opacity` posés par le drag → la feuille ne suit pas le
  // doigt (effet « on/off »). Les valeurs commit = valeurs de fin ⇒ aucun saut.
  function freezeOpenAnims() {
    detailReady = true;            // ouverture posée : le voile peut désormais fermer
    openAnims.forEach(a => {
      if (!a) return;
      try { a.commitStyles(); } catch (e) {}
      try { a.cancel(); } catch (e) {}
    });
    openAnims = [];
    // Le rendu des graphiques a été DIFFÉRÉ pour ne pas saccader l'ouverture (effet
    // « on/off » : reconstruire le SVG bloque le thread pendant la montée de la
    // feuille). On le déclenche maintenant, une seule fois, l'animation étant figée
    // — en rAF pour laisser le commit/cancel se poser d'abord, et seulement si le
    // détail est toujours ouvert (sinon la section est déjà repartie au réservoir).
    if (pendingDetailRender && !detailChartsRendered) {
      detailChartsRendered = true;
      const render = pendingDetailRender;
      pendingDetailRender = null;
      requestAnimationFrame(() => { if (detailOpen) render(); });
    }
  }

  // Construit l'overlay du détail (DOM, déplacement de la section, écouteurs, rendu
  // différé des graphiques) SANS jouer d'animation ni poser `is-open`. Partagé par
  // l'ouverture au tap (montée automatique) et par l'ouverture au glissement
  // (feuille pilotée au doigt). Renvoie les éléments clés, ou null si la carte n'a
  // pas de détail.
  function buildDetail(i) {
    const card = cards[i];
    if (card.noDetail) return null;       // carte sans descriptif détaillé
    const section = storeyard.querySelector("#" + CSS.escape(card.image.section));
    if (!section) return null;
    detailOpen = true;
    detailReady = false;           // réarmé à chaque ouverture (voir garde du voile plus bas)
    index = i;

    // Empile une entrée d'historique (sans changer l'URL) pour que le bouton
    // Retour referme le descriptif et revienne aux cartes au lieu de quitter le site.
    try {
      history.pushState({ corDetail: card.image.section }, "");
      detailHistoryPushed = true;
    } catch (e) {}

    // Libellé d'aide affiché UNE SEULE FOIS (première ouverture d'un détail),
    // INTÉGRÉ dans la bulle de la flèche (pas un élément séparé). Le verbe
    // s'adapte à la plateforme : « Glissez » sur écran tactile (on tire la
    // feuille), « Cliquez » au pointeur fin (souris). Court, pour ne pas envahir
    // l'écran et laisser interagir.
    const coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
    const showHint = !backHintShown;
    backHintShown = true;
    const labelHtml = showHint
      ? '<span class="cd-back-label">' +
        (coarse ? "Glissez pour revenir à l'accueil" : "Cliquez pour revenir à l'accueil") +
        "</span>"
      : "";

    // Construit l'overlay.
    detailEl = document.createElement("div");
    detailEl.className = "card-detail";
    detailEl.innerHTML =
      '<div class="cd-scrim"></div>' +
      '<div class="cd-sheet" role="dialog" aria-modal="true" aria-label="' +
      card.title.replace(/"/g, "&quot;") + '">' +
      // Bulle de retour : UN seul élément blanc contenant la flèche ET, à la 1re
      // ouverture, le libellé d'aide (tous deux en bleu). On « tire » la bulle
      // vers le bas (réutilise le swipe-down) ou on clique ; un léger va-et-vient
      // (nudge, en CSS) invite au geste. Pastille ronde, qui se déploie en pilule
      // pour révéler le libellé. Indispensable sur ordinateur, où rien n'existait.
      '<div class="cd-backbar">' +
      '<button class="cd-back" type="button" aria-label="Revenir aux cartes">' +
      '<svg class="icon" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="5 12 12 19 19 12"/></svg>' +
      labelHtml +
      "</button>" +
      "</div>" +
      '<div class="cd-body"></div>' +
      "</div>";
    document.body.appendChild(detailEl);

    const sheet = detailEl.querySelector(".cd-sheet");
    const scrim = detailEl.querySelector(".cd-scrim");
    const body = detailEl.querySelector(".cd-body");
    const backBtn = detailEl.querySelector(".cd-back");
    const labelEl = backBtn.querySelector(".cd-back-label");

    // Déplace la <section> réelle dans la vue détail (placeholder pour la remettre).
    sectionPlaceholder = document.createComment("section:" + card.image.section);
    section.parentNode.insertBefore(sectionPlaceholder, section);
    body.appendChild(section);
    section.hidden = false;
    movedSection = section;

    // Bouton de retour EN BAS du descriptif : même action que la flèche du haut
    // (revenir aux cartes), au style du site (pilule .cta). On l'ajoute APRÈS la
    // section, comme frère dans .cd-body (jamais DANS la section, que finish()
    // remet au réservoir à la fermeture). Placé tout en bas, il n'est atteignable
    // qu'une fois la feuille entièrement défilée.
    const returnBtn = document.createElement("button");
    returnBtn.type = "button";
    returnBtn.className = "cta cd-return";
    returnBtn.innerHTML =
      '<svg class="icon" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" ' +
      'fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>' +
      "Revenir à l'accueil";
    returnBtn.addEventListener("click", () => closeDetail({ slideDown: true }));
    body.appendChild(returnBtn);

    // Les graphiques sont pré-rendus au repos (déjà à leur taille finale → pas de
    // redimensionnement à l'ouverture). renderSection ne fait ici que (re)câbler les outils
    // — rendu une seule fois, il NE re-trace pas (garde de course : il trace tout de même si
    // le pré-rendu n'a pas encore eu lieu). Pour la PREMIÈRE apparition d'une section, on
    // CACHE les courbes AVANT la montée de la feuille (pas de flash) puis on rejoue leur
    // tracé une fois la feuille arrivée (déclenché par freezeOpenAnims), sur le SVG déjà
    // rendu → aucune reconstruction, aucun saut. Mouvement réduit / réouverture : pas de
    // révélation, les courbes s'affichent d'emblée.
    const sec = card.image.section;
    try { window.CORApp.renderSection(sec); } catch (e) {}
    const revealHosts = (!reduceMotion() && !animatedDetailSections.has(sec))
      ? Array.from(section.querySelectorAll(".chart-host")).filter(h => h.__revealReset)
      : [];
    revealHosts.forEach(h => h.__revealReset());
    detailChartsRendered = false;
    pendingDetailRender = () => {
      animatedDetailSections.add(sec);
      revealHosts.forEach(h => h.__revealPlay());
    };

    // Verrouille le scroll de fond, masque le carousel.
    document.body.classList.add("detail-open");
    screen.setAttribute("aria-hidden", "true");

    // Fermeture : flèche de retour, glissement vers le bas (mobile), Échap
    // (clavier), clic sur le voile. Un clic sur la flèche fait glisser la feuille
    // vers le bas (slideDown) — dans le sens de la flèche, comme un « tiré » bref.
    // Clic sur le voile = fermeture, MAIS seulement une fois l'ouverture terminée
    // (detailReady). La feuille opaque plein écran recouvre le voile en état ouvert :
    // un clic sur le voile n'est donc jamais légitime « ouvert ». Sans cette garde, le
    // `click` synthétique émis juste après le tap d'ouverture (alors que la feuille
    // monte encore depuis le bas, hors écran → seul le voile est sous le doigt) ferme
    // aussitôt le détail à peine ouvert (« sursaut »/dézoom instantané).
    scrim.addEventListener("click", () => { if (detailReady) closeDetail(); });
    backBtn.addEventListener("click", () => closeDetail({ slideDown: true }));
    // Le va-et-vient s'arrête et la bulle se replie (le libellé rentre) dès la
    // première prise en main (défilement, ou pression — clic/tap/début de
    // glissement) : on a montré comment revenir, inutile d'insister ensuite.
    // (Le survol/focus de la flèche stoppe en plus le nudge en CSS.)
    const stopHint = () => { backBtn.classList.add("is-still"); backBtn.classList.remove("is-shown"); };
    sheet.addEventListener("scroll", stopHint, { once: true, passive: true });
    sheet.addEventListener("pointerdown", stopHint, { once: true });
    setupSheetDismiss(sheet);

    const cardInner = cardEls[i] && cardEls[i].querySelector(".card-inner");
    return { sheet, scrim, body, backBtn, labelEl, cardInner };
  }

  // Déploiement différé de la bulle de retour (« Cliquez/Glissez pour revenir ») :
  // la flèche apparaît en pastille, puis s'élargit pour révéler le libellé. Appelé
  // une fois l'ouverture TERMINÉE (au tap : après le lancement des animations ; au
  // glissement : à la fin du « settle »).
  function startBackHint(backBtn, labelEl) {
    if (!labelEl) return;
    setTimeout(() => { if (backBtn.isConnected) backBtn.classList.add("is-shown"); },
      reduceMotion() ? 60 : 480);
  }

  // Ouverture au TAP : monte la feuille automatiquement (animation), avec fondu de
  // la carte d'origine. L'ouverture au GLISSEMENT (feuille pilotée au doigt) est
  // gérée dans setupGestures (commitOpen/cancelOpen), à partir du même buildDetail.
  function openDetail(i) {
    if (detailOpen) return;
    const refs = buildDetail(i);
    if (!refs) return;
    const { sheet, scrim, body, backBtn, labelEl, cardInner } = refs;

    // Animation d'ouverture : INVERSE de la fermeture par glissement (la feuille
    // MONTE depuis le bas), plus un fondu de la carte d'origine. Même courbe
    // (cubic-bezier(.22,1,.36,1)) que le slideDown de fermeture → mouvement
    // symétrique.
    if (reduceMotion()) {
      detailEl.classList.add("is-open");
      detailReady = true;          // ouverture immédiate : le voile peut fermer
      body.style.opacity = "1";
      // Pas d'animation à concurrencer : on dessine les graphiques tout de suite.
      const render = pendingDetailRender;
      detailChartsRendered = true;
      pendingDetailRender = null;
      if (render) requestAnimationFrame(render);
      startBackHint(backBtn, labelEl);
      return;
    }
    const sheetAnim = sheet.animate(
      [
        { transform: "translateY(100%)", borderRadius: "28px" },
        { transform: "translateY(0)", borderRadius: "0px" }
      ],
      { duration: OPEN_DURATION, easing: "cubic-bezier(.22,1,.36,1)", fill: "both" }
    );
    const scrimAnim = scrim.animate([{ opacity: 0 }, { opacity: 1 }], { duration: OPEN_DURATION, fill: "both" });
    const bodyAnim = body.animate(
      [{ opacity: 0, transform: "translateY(28px)" }, { opacity: 1, transform: "none" }],
      { duration: OPEN_DURATION, delay: 90, easing: "cubic-bezier(.2,.7,.2,1)", fill: "both" }
    );
    // Fondu de la carte d'accueil : son contenu (.card-inner) se soulève en se
    // dissolvant pendant que le détail apparaît → effet de « passage de relais »
    // depuis la carte. On anime l'inner (et non le <li>) pour ne pas écraser le
    // transform/opacity posés par applyTransforms sur le <li>. L'opacité tombe à 0
    // tôt (offset .6) puis y reste : à la fin, la feuille recouvre la carte → pas de
    // flash au cancel (lequel restaure la carte, voir closeDetail/onfinish).
    if (cardInner) {
      openCardAnim = cardInner.animate(
        [
          { opacity: 1, transform: "scale(1) translateY(0)", offset: 0 },
          { opacity: 0, transform: "scale(1.06) translateY(-8px)", offset: 0.6 },
          { opacity: 0, transform: "scale(1.06) translateY(-8px)", offset: 1 }
        ],
        { duration: OPEN_DURATION, easing: "cubic-bezier(.22,1,.36,1)", fill: "both" }
      );
      // Restaure la carte (opacité 1, transform neutre) une fois cachée par la feuille.
      openCardAnim.onfinish = () => { try { openCardAnim.cancel(); } catch (e) {} };
    }
    // À la fin de l'ouverture, on fige ces animations (commit + cancel) pour rendre
    // la main au style inline → le drag de fermeture pourra réellement déplacer la
    // feuille. (Un drag amorcé plus tôt déclenche aussi freezeOpenAnims via beginDrag.)
    openAnims = [sheetAnim, scrimAnim, bodyAnim];
    sheetAnim.onfinish = freezeOpenAnims;
    detailEl.classList.add("is-open");
    startBackHint(backBtn, labelEl);
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

    // Si l'ouverture est encore en cours (fermeture déclenchée tôt), on annule le
    // fondu de la carte pour la restaurer (sinon elle resterait estompée au retour).
    try { if (openCardAnim) { openCardAnim.cancel(); openCardAnim = null; } } catch (e) {}
    // Ouverture-glissement : la carte d'origine a été estompée via des styles inline
    // (pas une animation WAAPI) → on les efface pour la restaurer.
    if (openDragInner) {
      openDragInner.style.opacity = "";
      openDragInner.style.transform = "";
      openDragInner = null;
    }

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
      detailReady = false;
      // Annule un éventuel rendu différé non encore déclenché (fermeture rapide
      // avant la fin de l'ouverture) et réarme l'état pour la prochaine ouverture.
      detailChartsRendered = false;
      pendingDetailRender = null;
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
  // haut de course. La feuille SUIT le doigt en continu (1:1) : on peut descendre,
  // remonter, changer d'avis, tenir à mi-course (geste classique iOS/Android). Au
  // relâcher : fermeture si on a dépassé le seuil OU sur un « flick » vif, sinon
  // retour élastique en place.
  //
  // Sur écran tactile, le geste est piloté ENTIÈREMENT par les touch events : dans
  // un `touchmove` NON passif on peut `preventDefault()` dès le premier mouvement
  // qualifiant, ce qui empêche le navigateur de réclamer le geste comme un
  // défilement (sinon il émet `pointercancel` et coupe le suivi → effet « on/off »,
  // plus le « pull-to-refresh » natif). Le même handler bloque le scroll natif ET
  // fait suivre la feuille.
  //
  // Le chemin pointer events ne sert que de repli non tactile (souris, dispatch
  // programmatique). Il est neutralisé dès qu'un geste tactile est en cours
  // (`touchDriving`) pour éviter un double pilotage.
  function setupSheetDismiss(sheet) {
    let dragging = false, startY = 0, startX = 0, dy = 0, axis = null;
    let lastY = 0, lastT = 0, vy = 0;        // suivi de vélocité (px/ms) pour le « flick »
    let touchDriving = false;                // un geste tactile pilote le drag

    // Amorce un drag : uniquement si le contenu est tout en haut de course.
    // Renvoie false si on n'amorce pas (le geste reste un défilement normal).
    function beginDrag(y, x) {
      if (sheet.scrollTop > 0) return false;
      // Fige l'animation d'ouverture si elle « remplit » encore : sinon elle écrase
      // le transform inline du drag et la feuille ne suivrait pas le doigt.
      freezeOpenAnims();
      dragging = true; axis = null; dy = 0;
      startY = y; startX = x;
      lastY = y; lastT = performance.now(); vy = 0;
      return true;
    }

    // Met à jour la position selon le doigt/pointeur. Renvoie true si on est bien
    // sur l'axe vertical descendant (geste de fermeture en cours) → le tactile sait
    // alors qu'il doit `preventDefault()`.
    function moveDrag(y, x) {
      if (!dragging) return false;
      const ddy = y - startY, ddx = x - startX;
      if (axis === null) {
        if (Math.abs(ddy) > 8 || Math.abs(ddx) > 8) axis = Math.abs(ddy) > Math.abs(ddx) ? "y" : "x";
        else return false;
      }
      if (axis !== "y") return false;
      // Suivi 1:1 même vers le haut : remonter le doigt fait remonter la feuille
      // jusqu'à sa place (dy = 0), ce qui permet l'aller-retour. On ne dépasse pas
      // la position d'origine (pas de translation négative).
      dy = Math.max(0, ddy);
      const now = performance.now();
      if (now > lastT) vy = (y - lastY) / (now - lastT);
      lastY = y; lastT = now;
      sheet.style.transform = `translateY(${dy}px)`;
      sheet.style.borderRadius = Math.min(22, dy / 6) + "px";
      const scrim = detailEl.querySelector(".cd-scrim");
      if (scrim) scrim.style.opacity = String(clamp(1 - dy / 500, 0, 1));
      return ddy > 0;                        // descendant ⇒ le tactile bloque le natif
    }

    // Fin du drag : ferme ou revient en place.
    function endDrag() {
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

    // ----- Chemin tactile : pilote le visuel ET bloque le natif -----
    sheet.addEventListener("touchstart", e => {
      if (e.touches.length !== 1) return;    // pinch/zoom : on laisse le natif
      touchDriving = true;
      beginDrag(e.touches[0].clientY, e.touches[0].clientX);
    }, { passive: true });
    sheet.addEventListener("touchmove", e => {
      if (!dragging || e.touches.length !== 1) return;
      const t = e.touches[0];
      // `preventDefault()` dès qu'on glisse vers le bas en haut de course : c'est ce
      // qui empêche le navigateur de transformer le geste en défilement / pull-to-
      // refresh, donc le suivi reste fluide. Doit précéder le calcul (le scroll natif
      // est réclamé tôt).
      const goingDown = t.clientY - startY > 0;
      if (goingDown && e.cancelable) e.preventDefault();
      moveDrag(t.clientY, t.clientX);
    }, { passive: false });
    const touchEnd = () => { endDrag(); touchDriving = false; };
    sheet.addEventListener("touchend", touchEnd, { passive: true });
    sheet.addEventListener("touchcancel", touchEnd, { passive: true });

    // ----- Repli pointer (souris / dispatch programmatique) : ignoré sur tactile -----
    sheet.addEventListener("pointerdown", e => {
      if (touchDriving) return;
      beginDrag(e.clientY, e.clientX);
    });
    sheet.addEventListener("pointermove", e => {
      if (touchDriving || !dragging) return;
      if (moveDrag(e.clientY, e.clientX) && e.cancelable) e.preventDefault();
    });
    sheet.addEventListener("pointerup", () => { if (!touchDriving) endDrag(); });
    sheet.addEventListener("pointercancel", () => { if (!touchDriving) endDrag(); });
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

    // Le carrousel devient le seul à rendre les graphiques (via renderSection, à
    // l'ouverture d'une carte). On coupe le rendu paresseux au défilement d'app.js :
    // ses observateurs, restés actifs sur les #chart-* désormais masqués, se
    // redéclencheraient quand une section reparaît dans la vue détail et retraceraient
    // la courbe par-dessus le rendu du carrousel — d'où un double-tracé (clignotement).
    if (window.CORApp.disableLazyCharts) window.CORApp.disableLazyCharts();

    // Pré-rend AU REPOS (échelonné, hors écran) TOUS les graphiques : ils sont ainsi déjà
    // à leur taille finale dès la première ouverture de leur carte, au lieu d'être rendus
    // après la montée de la feuille (le conteneur sauterait de min-height:300px à la hauteur
    // du SVG → « redimensionnement » juste avant le tracé). Le tracé des courbes est rejoué
    // à l'ouverture (cf. buildDetail), sur le SVG déjà rendu, sans reconstruction.
    if (window.CORApp.prerenderAllCharts) window.CORApp.prerenderAllCharts();

    // Libellé d'aide intégré à la flèche « suivante » (comme la bulle de retour
    // du détail). Verbe adapté à la plateforme : « Glissez » au tactile (on fait
    // défiler les cartes), « Cliquez » au pointeur fin (souris).
    const coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
    const navLabel = coarse ? "Glissez pour explorer" : "Cliquez pour explorer";

    // Écran carousel.
    screen = document.createElement("section");
    screen.id = "card-screen";
    screen.className = "card-screen";
    screen.setAttribute("aria-label", "Carousel — Ceci est mon COR");
    screen.innerHTML =
      '<header class="cs-head">' +
      '<p class="cs-kicker">Outil citoyen · données publiques du COR</p>' +
      '<h1 class="cs-title">Ceci est mon COR</h1>' +
      "</header>" +
      '<div class="cs-viewport">' +
      '<ul class="cs-track" role="list"></ul>' +
      '<button class="cs-nav cs-nav-prev" type="button" aria-label="Carte précédente">' +
      '<svg class="icon" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>' +
      "</button>" +
      // Flèche « suivante » : une seule bulle (libellé à gauche + flèche à droite,
      // tous deux bleus) qui se déploie vers la gauche à la 1re carte, puis se
      // replie en pastille dès qu'on explore.
      '<button class="cs-nav cs-nav-next is-hint" type="button" aria-label="Carte suivante">' +
      '<span class="cs-nav-label">' + navLabel + "</span>" +
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

    // Déploie le libellé d'aide de la flèche « suivante » après un court délai,
    // puis le replie à la première prise en main (premier appui sur le carrousel,
    // ou navigation vers une autre carte — voir updateNav). On ne le déploie pas
    // si l'utilisateur a déjà touché l'écran entre-temps.
    let navHintArmed = true;
    viewport.addEventListener("pointerdown", () => {
      navHintArmed = false;
      nextBtn.classList.remove("is-shown");
    }, { once: true });
    const deployNavHint = () => { if (navHintArmed && index === 0) nextBtn.classList.add("is-shown"); };
    if (reduceMotion()) deployNavHint();
    else setTimeout(deployNavHint, 800);

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
