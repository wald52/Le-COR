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
  // ne fait rien (la page reste la version à défilement classique) — mais on
  // retire d'abord l'écran d'accueil (#card-screen, servi en HTML), sinon il
  // masquerait la page à défilement qui prend le relais. Sans son montage il
  // n'est qu'une image figée : ni flèches, ni pagination, ni ouverture.
  if (!window.CORChart || !window.CORApp) {
    const s = document.getElementById("card-screen");
    if (s) s.remove();
    return;
  }

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
  const MIN_FIT = 0.7;         // plancher du facteur d'ajustement (cf. computeFit)
  const SPRING_CONFIG = { stiffness: 170, damping: 26, mass: 1 }; // snap au centre
  const OPEN_DURATION = 440;   // durée de l'ouverture/fermeture du détail (ms)

  const STEP = CARD_WIDTH + CARD_SPACING;
  const reduceMotion = () =>
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  // Travail préparatoire : jamais dans la frame courante, toujours en temps
  // mort. Repli en `setTimeout` pour Safari, où `requestIdleCallback` n'existe
  // pas avant la 17.4 — le délai y remplace la fenêtre d'oisiveté.
  const idle = window.requestIdleCallback
    ? cb => window.requestIdleCallback(cb, { timeout: 2000 })
    : cb => setTimeout(cb, 200);

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
    depenses: t => miniOverlay(t, S.depensesPib, "projections", " %"),
    deficit: t => miniOverlay(t, S.solde, "projections", " %"),
    productivite: t => {
      const d = D.productivite;
      if (!d) return;
      const pts = d.rapports.map(r => ({ x: r.year, y: r.central }));
      miniLine(t, [{ label: "Productivité", color: "#d62728", kind: "solid", markers: false, points: pts }],
        { min: d.rapports[0].year, max: d.rapports[d.rapports.length - 1].year },
        { min: 0, max: 2, suffix: " %" });
    },
    realite: t => miniOverlay(t, S.fecondite, "hypotheses", ""),
    financement: t => {
      const d = D.fiscalisation;
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
    { id: "presentation", chapter: "Bienvenue", title: "À quoi sert ce site ?", noDetail: true,
      subtitle: "Chaque année, le COR projette nos retraites jusqu'en 2070. Ce site superpose ses rapports de 2001 à 2026 : change-t-il d'avis, et ses prévisions se réalisent-elles ?",
      image: { section: "presentation", theme: "#0e7490", photo: "./images/accueil-lecteur-cor.webp" } },
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
      image: { section: "dette", theme: "#b91c1c", photo: "./images/bayrou.webp" } },
    { id: "monde", chapter: "Comment ça marche", title: "La France dans le monde",
      subtitle: "Dépenses de retraite par pays (2021)",
      description: "Parmi les pays qui dépensent le plus, mais des dépenses quasi entièrement publiques : un choix de répartition.",
      image: { section: "monde", theme: "#b45309", mini: "monde" } },
    { id: "hypotheses", chapter: "Comment ça marche", title: "Le tableau de bord des hypothèses",
      subtitle: "Toutes les hypothèses, d'un coup d'œil",
      description: "Productivité, fécondité, chômage, immigration… le récapitulatif des hypothèses retenues par chaque rapport du COR.",
      image: { section: "hypotheses", theme: "#475569", photo: "./images/hypotheses-cockpit.webp" } },
    { id: "simulateur", chapter: "Que faire ?", title: "Équilibrez le système",
      subtitle: "Le simulateur des 3 leviers",
      description: "Âge, cotisations, pensions : dosez les leviers et voyez si le système revient à l'équilibre en 2070.",
      image: { section: "simulateur", theme: "#1f4e79", photo: "./images/simulateur-faders.webp" } },
    { id: "explorer", chapter: "Aller plus loin", title: "Explorer tous les indicateurs",
      subtitle: "Un thème, un indicateur, un graphique",
      description: "Choisissez un thème puis un indicateur : toutes les projections des rapports se superposent.",
      // WebP et non le SVG d'origine (conservé dans `images/`, il reste la
      // source du dessin) : ses 24 vignettes portent chacune une ombre portée
      // FLOUTÉE, et le navigateur rejoue ces 24 passes de flou à chaque
      // rasterisation de la carte. Cette vignette entre à l'écran pile au
      // balayage 09 → 10, qui coûtait 88 ms de rasterisation contre ~20 ms pour
      // tous les autres balayages (Pixel 5, CPU ×4). Mesuré : masquer cette
      // seule carte ramenait le balayage à 15 ms ; réduire le rayon du flou ne
      // change rien (c'est le NOMBRE de passes qui coûte) ; la même image en
      // WebP tombe à 28 ms, comme toutes les autres cartes-photos.
      image: { section: "explorer", theme: "#334155", photo: "./images/explorer-cards.webp" } },
    { id: "methode", chapter: "Aller plus loin", title: "Méthode & sources",
      subtitle: "D'où viennent les données",
      description: "Comment lire ces graphiques, et les fichiers officiels du COR derrière chaque courbe.",
      image: { section: "methode", theme: "#475569", photo: "./images/sources-logos.webp" } }
  ];

  /* ======================================================================
   * État du carousel.
   * ==================================================================== */
  let offset = 0;        // position continue (unités de carte)
  let index = 0;         // carte active (entier)
  let vel = 0;           // vitesse de `offset` (unités/seconde)
  let raf = null;        // id rAF de l'animation spring
  let detailOpen = false;
  const cardEls = [];    // <div.card>
  const chartEls = [];   // calque .card-chart de chaque carte (parallax)
  const dotEls = [];
  const miniDrawn = new Set(); // cartes dont le mini-graphique est déjà tracé
  const hydrated = new Set();  // cartes dont le contenu interne est monté (cf. hydrateCard)
  const lastZ = [];            // dernier zIndex écrit par carte (évite les ré-écritures par frame)
  const lastHidden = [];       // dernier état visibility écrit par carte (même principe)
  let lastActive = -1;         // dernier indice actif poussé aux points/flèches/classe is-active
  // Distance (en cartes) au-delà de laquelle une carte est entièrement hors écran.
  // Les cartes au-delà sont passées en visibility:hidden : ~3-5 cartes peintes et
  // composées au lieu de 14 (chaque carte est un calque GPU permanent via son
  // translate3d). Marge large (CARD_WIDTH entier au lieu d'une demi-carte) pour
  // couvrir échelle/rotation. Recalculée au resize (rotation d'écran).
  let hideDist = Infinity;
  // Distance (en cartes) au-delà de laquelle une carte n'est plus RÉELLEMENT à
  // l'écran. Contrairement à `hideDist`, ce seuil est géométrique et SANS marge :
  // une carte latérale est peinte à l'échelle INACTIVE_SCALE, elle mord donc sur
  // le viewport tant que `dist × STEP − CARD_WIDTH × INACTIVE_SCALE / 2` reste
  // sous la demi-largeur de la fenêtre. Sert à décider ce qui doit porter son
  // visuel dès la PREMIÈRE peinture (cf. drawPaintedMinis) : une carte que le
  // visiteur voit ne doit jamais être blanche, une carte qu'il ne voit pas ne
  // doit rien coûter au chargement.
  //   412 px (profil Lighthouse mobile) → 0,98 : la carte d'accueil seule.
  //   1280-1440 px (bureau)             → 2,2-2,4 : les cartes 1 et 2 aussi.
  // L'inclinaison de 2° est ignorée sciemment : elle n'ajouterait qu'un coin de
  // ~8 px en bord d'écran, et suffirait à faire basculer le profil mobile
  // au-dessus de 1 — donc à retracer au chargement ce que l'on vient d'économiser.
  let paintDist = Infinity;
  function computeHideDist() {
    // Les seuils comparent des DISTANCES EN CARTES à une largeur d'écran en
    // pixels : ils doivent donc raisonner sur le pas RÉELLEMENT peint, soit
    // STEP × fitScale (cf. computeFit), et sur des cartes elles aussi réduites.
    const step = STEP * fitScale, w = CARD_WIDTH * fitScale;
    hideDist = (window.innerWidth / 2 + w) / step;
    paintDist = (window.innerWidth / 2 + (w * INACTIVE_SCALE) / 2) / step;
  }

  // Facteur d'ajustement de la piste aux écrans COURTS. La carte mesure
  // CARD_HEIGHT (hauteur fixe) et `.cs-viewport` rogne son débord : dès
  // que la place verticale manque, la carte était amputée en haut et en bas.
  // On met la piste entière à l'échelle (cf. `--cs-fit` dans css/cards.css) :
  // la carte rapetissit au lieu d'être coupée, et toute la géométrie JS reste
  // exprimée dans les constantes d'origine — seules les conversions
  // pixels ↔ unités de carte (drag, seuils de masquage) passent par fitScale.
  //
  // Plancher `MIN_FIT` : sous ~0,7 le texte de la carte (0,86 rem pour le
  // descriptif) devient illisible. Un téléphone tenu en paysage ne laisse que
  // ~260 px de piste — aucune valeur d'échelle ne rend cette mise en page
  // confortable ; on préfère alors une carte lisible, légèrement rognée, à une
  // carte entière mais minuscule.
  //
  // Mesuré sur `.cs-viewport` et non déduit de innerHeight : la hauteur du
  // châssis n'est pas une constante (le sur-titre revient à la ligne sur
  // téléphone, l'en-tête passe de 60 à 77 px). Les quatre éléments qui
  // occupent de la hauteur sont servis en HTML (cf. index.html) : dès le
  // montage, la mesure est donc la bonne — une seule lecture au démarrage,
  // puis une par redimensionnement (déjà amorti à 150 ms).
  let fitScale = 1;
  function computeFit() {
    const avail = viewport ? viewport.clientHeight : 0;
    if (!avail) return;                       // écran masqué : on garde la valeur courante
    fitScale = clamp(avail / CARD_HEIGHT, MIN_FIT, 1);
    track.style.setProperty("--cs-fit", fitScale.toFixed(4));
    // Sous le plancher, la carte déborde de la piste (rognage assumé, cf.
    // ci-dessus) : on rétablit la coupe VERTICALE de `.cs-viewport`, retirée
    // par défaut pour laisser l'ombre portée des cartes s'éteindre sans trait
    // au-dessus des pastilles (cf. css/cards.css). Sans elle, la carte
    // recouvrirait l'en-tête, les pastilles et les liens légaux.
    viewport.classList.toggle("cs-viewport--cropped", avail < CARD_HEIGHT * MIN_FIT);
  }

  let screen, viewport, track, dotsWrap, prevBtn, nextBtn;

  /* ----------------------------------------------------------------------
   * CardItem — construit une carte.
   * -------------------------------------------------------------------- */
  function CardItem(card, i) {
    // Carte = <div> (et non <li>) : la piste n'est pas une vraie liste ARIA.
    // Une <ul role="list"> exigerait des enfants `listitem`, incompatibles avec
    // les cartes interactives qui portent `role="button"` (cf. audits Lighthouse
    // aria-required-children / aria-allowed-role). Le carousel est un groupe de
    // boutons, pas une liste.
    const el = document.createElement("div");
    el.className = "card";
    el.dataset.index = String(i);
    el.dataset.section = card.image.section;
    // Carte sans vue détail (noDetail) : pas de rôle bouton ni de libellé
    // « ouvrir ». On lui donne role="img" (un visuel illustré avec un libellé),
    // rôle qui autorise `aria-label`. La classe `card--no-detail` permet au CSS
    // de retirer l'affordance « cliquable » (curseur) : un tap n'ouvre rien.
    if (card.noDetail) {
      el.classList.add("card--no-detail");
      el.setAttribute("role", "img");
      el.setAttribute("aria-label", card.title);
    } else {
      el.setAttribute("role", "button");
      el.setAttribute("tabindex", "0");
      el.setAttribute("aria-label", card.title + " — ouvrir");
    }

    cardEls[i] = el;
    return el;
  }

  /* ----------------------------------------------------------------------
   * Adopte les cartes déjà présentes dans la piste (servies en HTML par
   * index.html — en pratique la seule carte d'accueil, cards[0]). Elles sont
   * déjà mises en page et peintes quand les scripts s'exécutent : les
   * enregistrer telles quelles évite de les reconstruire, donc de refaire la
   * mise en page et la peinture de ce que le visiteur voit déjà.
   *
   * L'appariement se fait sur `data-index`, que le HTML porte exactement comme
   * le poserait `CardItem`. Une carte statique dont l'indice ne correspond à
   * rien est retirée : mieux vaut la reconstruire que d'afficher un contenu
   * désaccordé du modèle de données.
   * -------------------------------------------------------------------- */
  function adoptStaticCard() {
    [...track.children].forEach(el => {
      const i = Number(el.dataset.index);
      if (!Number.isInteger(i) || i < 0 || i >= cards.length || cardEls[i]) { el.remove(); return; }
      const chart = el.querySelector(".card-chart");
      if (!chart) { el.remove(); return; }    // coquille sans contenu : à reconstruire
      cardEls[i] = el;
      chartEls[i] = chart;
      hydrated.add(i);
    });
  }

  /* ----------------------------------------------------------------------
   * Monte le CONTENU d'une carte (fond, visuel, dégradé, textes) dans sa
   * coquille. Séparé de `CardItem` pour que le montage du carrousel n'ait à
   * construire que les cartes réellement visibles.
   *
   * Pourquoi : les 13 cartes construites d'un bloc représentaient 285 boîtes à
   * mettre en page dans la première frame du carrousel — une tâche longue de
   * ~107 ms (profilé à CPU ×8) dont 80 ms de `Layout` pur, plus le recalcul de
   * style qui l'accompagne dans la tâche d'exécution des scripts. Or une seule
   * carte est regardée à l'arrivée : les autres sont hors écran (au-delà de
   * `hideDist`) et déjà `visibility:hidden`, donc jamais peintes. On ne monte
   * donc que celles-là, et les autres suivent — une par temps mort dans la file
   * de pré-tracé, ou à la demande dès qu'elles franchissent le seuil de
   * visibilité (`applyTransforms`), c'est-à-dire toujours avant d'être vues.
   *
   * La coquille, elle, existe dès le montage pour les treize : elle porte le
   * rôle ARIA, le libellé, le `tabindex` et la transform de position. Le
   * clavier, les points de pagination et les liens profonds fonctionnent donc
   * exactement comme avant, sur une boîte de taille fixe (var(--card-w/h)) dont
   * la mise en page ne coûte presque rien.
   *
   * Idempotent (garde `hydrated`) : appelable depuis n'importe quel chemin.
   * -------------------------------------------------------------------- */
  function hydrateCard(i) {
    if (i < 0 || i >= cards.length || hydrated.has(i)) return cardEls[i];
    const el = cardEls[i];
    if (!el) return null;
    hydrated.add(i);
    const card = cards[i];

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
      // Dimensions intrinsèques, comme le fait le HTML statique de la carte 0 :
      // sans elles le navigateur met en page une image de taille inconnue, puis
      // la remet en page une fois l'entête décodé.
      img.width = CARD_WIDTH;
      img.height = CARD_HEIGHT;
      // Une carte réellement à l'écran (cf. paintDist) ne doit pas se peindre
      // blanche en attendant son image : `.card-chart--photo` a un fond #fff.
      // On la charge donc en `eager`, sans attendre le calcul d'intersection du
      // chargement paresseux. `fetchpriority` reste réservé à la carte 0, seul
      // élément LCP. Les cartes hors écran, elles, gardent `lazy`.
      if (Math.abs(i - offset) <= paintDist) {
        img.loading = "eager";
        if (i === 0) img.fetchPriority = "high";
      } else {
        img.loading = "lazy";
      }
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
      (card.subtitle ? `<p class="card-sub">${card.subtitle}</p>` : "") +
      (card.description ? `<p class="card-desc">${card.description}</p>` : "") +
      (card.noDetail ? "" : `<span class="card-cta">Voir le détail ›</span>`);

    inner.appendChild(bg);
    inner.appendChild(chart);
    inner.appendChild(overlay);
    inner.appendChild(text);
    el.appendChild(inner);

    chartEls[i] = chart;
    // Décalage parallax de la carte à sa position ACTUELLE : une carte montée en
    // cours de route (temps mort ou franchissement du seuil de visibilité) doit
    // arriver avec le même décalage que si elle avait été montée d'origine —
    // sinon son graphique sauterait au premier `applyTransforms` suivant.
    const dp = clamp(i - offset, -1, 1);
    chart.style.transform =
      `translate3d(${(-dp * STEP * PARALLAX_AMOUNT).toFixed(2)}px,0,0)`;
    return el;
  }

  /* ----------------------------------------------------------------------
   * Trace (paresseusement) le mini-graphique d'une carte et de ses voisines.
   * -------------------------------------------------------------------- */
  function drawMini(i) {
    if (i < 0 || i >= cards.length || miniDrawn.has(i)) return;
    const card = cards[i];
    if (!card.image.mini || !MINI[card.image.mini]) return;
    // Le calque .card-chart n'existe qu'une fois la carte montée. On monte donc
    // avant de tracer : le moteur de graphiques mesure la largeur utile du
    // conteneur (chartWidth), qui vaut 0 tant qu'il n'est pas dans le document.
    hydrateCard(i);
    miniDrawn.add(i);
    try { MINI[card.image.mini](chartEls[i]); } catch (e) { miniDrawn.delete(i); }
  }
  /* ----------------------------------------------------------------------
   * Prépare (au repos, un graphique par temps mort) les sections des cartes
   * voisines de la carte courante — jamais les huit d'un coup. Le visiteur ne
   * peut ouvrir que la carte active : préparer ±1 suffit toujours à ce que la
   * section soit prête avant l'ouverture, et la navigation étend la file au fur
   * et à mesure. `prerenderSections` déduplique de son côté.
   * -------------------------------------------------------------------- */
  /* ----------------------------------------------------------------------
   * Exécute `fn` au PREMIER signe d'interaction (doigt, souris, clavier,
   * molette), une seule fois. Sert à ne rien préparer tant que le visiteur
   * n'a pas bougé : au repos il ne regarde que la carte d'accueil, qui est une
   * photo sans mini et sans vue détail. Tout ce qui est préparé « au cas où »
   * pendant le chargement ne fait qu'allonger les tâches du fil principal.
   * -------------------------------------------------------------------- */
  const FIRST_INTERACTION = ["pointerdown", "keydown", "wheel", "touchstart"];
  function startOnFirstInteraction(fn) {
    let done = false;
    const go = () => {
      if (done) return;
      done = true;
      FIRST_INTERACTION.forEach(ev => window.removeEventListener(ev, go, true));
      fn();
    };
    // Capture : le carrousel arrête certains gestes (setPointerCapture,
    // stopPropagation sur les flèches) avant qu'ils n'atteignent `window`.
    FIRST_INTERACTION.forEach(ev => window.addEventListener(ev, go, { capture: true, passive: true }));
  }

  function prerenderAround() {
    if (!window.CORApp || !window.CORApp.prerenderSections) return;
    const ids = [];
    for (let i = index - 1; i <= index + 1; i++) {
      if (i >= 0 && i < cards.length) ids.push(cards[i].image.section);
    }
    window.CORApp.prerenderSections(ids);
  }

  /* ----------------------------------------------------------------------
   * Prépare l'entourage de la carte active — minis des voisines, décodage de
   * leurs photos, pré-rendu de leurs sections — TOUJOURS en temps mort, jamais
   * dans la frame qui suit le geste. Appelé à la fin du ressort (cf. springTo) :
   * à cet instant l'écran est immobile, le navigateur est libre, et la file de
   * `prerenderSections` (app.js) est de toute façon gardée par `setUiBusy`.
   *
   * Portée ±2, et pas seulement les voisines immédiates : un balayage rapide
   * peut « dépasser » le pré-tracé et atteindre une carte dont le SVG n'est pas
   * encore construit. Tracer un cran plus loin donne une marge.
   *
   * Toutes les opérations sont idempotentes (gardes `miniDrawn`, `decoded`,
   * `sectionRendered`) : un appel de trop ne coûte rien.
   * -------------------------------------------------------------------- */
  function prepareAround() {
    // Un mini par temps mort, jamais les quatre d'affilée : `requestIdleCallback`
    // DÉMARRE un rappel quand il reste du temps mais ne l'interrompt pas, et
    // quatre graphiques dans le même rappel reforment une tâche longue (97 ms
    // mesurées) — au repos cette fois, mais le visiteur qui enchaîne un second
    // balayage la retrouverait sous le doigt.
    for (let i = index - 2; i <= index + 2; i++) {
      if (i !== index) queueIdle(() => drawMini(i));
    }
    queueIdle(decodeAround);
    queueIdle(prerenderAround);
  }

  /* ----------------------------------------------------------------------
   * File de travaux préparatoires : un job par temps mort, mise en pause tant
   * que quelque chose bouge (doigt posé, ressort en cours — cf. setAnimating).
   * Même motif que la file de pré-rendu des sections dans app.js, dont elle
   * partage l'indicateur d'occupation. Les jobs sont tous idempotents : un
   * doublon empilé par deux balayages voisins ne coûte qu'un test.
   * -------------------------------------------------------------------- */
  const idleJobs = [];
  let idleRunning = false;
  function queueIdle(fn) {
    idleJobs.push(fn);
    if (idleRunning) return;
    idleRunning = true;
    const step = () => {
      if (window.CORApp && window.CORApp.pointerBusy && window.CORApp.pointerBusy()) {
        setTimeout(step, 150);
        return;
      }
      const job = idleJobs.shift();
      if (!job) { idleRunning = false; return; }
      job();
      idle(step);
    };
    idle(step);
  }

  /* ----------------------------------------------------------------------
   * Décode À L'AVANCE les photos des cartes voisines. Une carte montée hors de
   * `paintDist` reçoit `loading="lazy"` (cf. hydrateCard) : son image n'est ni
   * téléchargée ni décodée tant qu'elle n'approche pas de l'écran — c'est-à-dire
   * pendant le balayage même qui la révèle. Le décodage tombait donc au pire
   * moment, sur les quatre cartes-photos de la fin (dette, hypothèses,
   * simulateur, explorer, méthode). On le déclenche un cran à l'avance, au
   * repos : `decode()` fait le travail hors du fil principal quand le navigateur
   * sait le faire, et la carte arrive à l'écran déjà prête à peindre.
   * -------------------------------------------------------------------- */
  const decoded = new Set();
  function decodeAround() {
    for (let i = index - 2; i <= index + 2; i++) {
      if (i < 0 || i >= cards.length || decoded.has(i) || !cards[i].image.photo) continue;
      const el = cardEls[i];
      const img = el && el.querySelector(".card-photo");
      if (!img) continue;              // carte pas encore montée : au prochain passage
      decoded.add(i);
      img.loading = "eager";
      if (img.decode) img.decode().catch(() => {});
    }
  }

  /* ----------------------------------------------------------------------
   * Trace les minis des seules cartes RÉELLEMENT visibles (cf. paintDist).
   * Complément de `prepareAround` : celui-là vise la fluidité du balayage
   * (±2 cartes, une avance, en temps mort), celui-ci la justesse de l'image
   * (0 carte blanche) — et lui seul a le droit d'être synchrone.
   *
   * Appelé au montage, avant que le navigateur ne peigne, et après un
   * redimensionnement : élargir la fenêtre fait entrer une carte qui, sinon,
   * resterait blanche jusqu'au premier contact. `drawMini` est idempotent.
   * -------------------------------------------------------------------- */
  function drawPaintedMinis() {
    for (let i = 0; i < cards.length; i++) {
      if (Math.abs(i - offset) <= paintDist) drawMini(i);
    }
  }

  /* ----------------------------------------------------------------------
   * Applique les transforms à toutes les cartes pour un `offset` donné.
   * N'utilise que transform/opacity (composables GPU) → fluide à 60 fps.
   * -------------------------------------------------------------------- */
  function applyTransforms(off) {
    for (let i = 0; i < cardEls.length; i++) {
      const el = cardEls[i];
      const d = i - off;
      const dist = Math.abs(d);
      // Cartes entièrement hors écran : masquées (ni peintes ni composées).
      // Écrit seulement au franchissement du seuil, pas à chaque frame.
      const hidden = dist > hideDist;
      if (lastHidden[i] !== hidden) {
        // Une carte qui entre dans l'écran doit avoir son contenu : on la monte
        // ici si la file de temps mort ne l'a pas encore fait. Le montage a lieu
        // au FRANCHISSEMENT du seuil seulement (une carte à la fois, jamais en
        // pleine rafale), et la carte est de toute façon sur le point d'être
        // peinte : le travail n'est pas ajouté, il est déplacé au plus tard.
        if (!hidden) hydrateCard(i);
        el.style.visibility = hidden ? "hidden" : "";
        lastHidden[i] = hidden;
      } else if (hidden) {
        // Carte masquée qui le reste : rien à écrire. Sa transform ne sert qu'à
        // la peinture, et elle n'est pas peinte. On la réécrira de toute façon
        // dans la MÊME frame que son retour à l'écran (la branche ci-dessus est
        // traversée avant), donc aucune carte ne peut réapparaître décalée.
        // Économise 8 à 10 écritures de style par frame sur les 13 cartes.
        continue;
      }
      const ad = clamp(dist, 0, 1);
      const scale = lerp(ACTIVE_SCALE, INACTIVE_SCALE, ad);
      const opacity = lerp(1, 0.55, ad);
      const rot = clamp(d, -1.5, 1.5) * -2; // légère inclinaison
      el.style.transform =
        `translate3d(${d * STEP}px,0,0) scale(${scale}) rotate(${rot}deg)`;
      el.style.opacity = String(opacity);
      // zIndex ne change qu'à des seuils entiers de distance : on ne le ré-écrit
      // que lorsqu'il varie réellement, pas à chaque frame (une écriture de zIndex
      // invalide le style/l'ordre d'empilement → coût inutile pendant le ressort).
      const z = 100 - Math.round(Math.abs(d) * 10);
      if (lastZ[i] !== z) { el.style.zIndex = String(z); lastZ[i] = z; }
      const chart = chartEls[i];
      if (chart) {
        // Parallax : le graphique se déplace plus lentement que la carte.
        // On borne la distance à ±1 : le décalage sature et reste couvert par le
        // débord de l'image (cf. .card-chart--photo) → aucune carte ne révèle de
        // bord vide, même très loin du centre.
        const dp = clamp(d, -1, 1);
        chart.style.transform = `translate3d(${(-dp * STEP * PARALLAX_AMOUNT).toFixed(2)}px,0,0)`;
      }
    }
    // Points/flèches ET classe `is-active` : n'écrire dans le DOM que quand
    // l'indice actif arrondi change réellement (une seule fois par ressort), pas à
    // chaque frame — sinon on force un recalcul de style/classe inutile sur les 14
    // cartes qui saccade légèrement l'animation.
    const active = Math.round(off);
    if (active !== lastActive) {
      if (cardEls[lastActive]) cardEls[lastActive].classList.remove("is-active");
      if (cardEls[active]) cardEls[active].classList.add("is-active");
      lastActive = active;
      updateDots(active);
      updateNav(active);
    }
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
   * Indicateur « les cartes bougent » (ressort ou drag en cours). Pendant le
   * mouvement, le CSS neutralise les `backdrop-filter` des cartes (pastilles
   * chapitre / « Voir le détail ») : ces flous, ré-échantillonnés à chaque frame
   * pour 14 cartes, sont l'effet le plus coûteux en mouvement. Au repos, l'effet
   * « verre dépoli » revient à l'identique. Idempotent (toggle sur classe).
   * -------------------------------------------------------------------- */
  // Temporisation du retrait de `cards-warm` (calques GPU maintenus entre deux
  // gestes rapprochés — cf. css/cards.css).
  let warmTimer = 0;
  const WARM_LINGER = 1200;

  function setAnimating(on) {
    document.body.classList.toggle("cards-animating", on);
    if (warmTimer) { clearTimeout(warmTimer); warmTimer = 0; }
    if (on) document.body.classList.add("cards-warm");
    else warmTimer = setTimeout(() => {
      warmTimer = 0;
      document.body.classList.remove("cards-warm");
    }, WARM_LINGER);
    // Les files en temps mort (pré-tracé des minis ici, pré-rendu des sections
    // dans app.js) ne s'interrompent pas en cours de job : un graphique entier
    // démarré entre deux frames du ressort fait sauter la frame suivante, et le
    // saut se voit sous le doigt. Elles savaient déjà attendre le relâchement du
    // pointeur ; le ressort qui SUIT ce relâchement dure encore ~400 ms, pendant
    // lesquelles elles se croyaient au repos. On leur signale donc le mouvement.
    if (window.CORApp && window.CORApp.setUiBusy) window.CORApp.setUiBusy(on);
  }

  /* ----------------------------------------------------------------------
   * Snap « spring » vers une carte cible.
   * -------------------------------------------------------------------- */
  function springTo(target) {
    target = clamp(target, 0, cards.length - 1);
    // Signale une « interaction » quand l'utilisateur passe réellement à une
    // autre carte (navigation clavier, dots, fin de swipe). Sert à décider,
    // côté app.js, quand proposer l'installation de la PWA. On déduplique sur
    // le changement d'index pour ignorer les recalages sur la même carte.
    if (target !== index) document.dispatchEvent(new CustomEvent("cor:interaction"));
    index = target;
    // Ne restent synchrones que les minis dont l'absence SE VERRAIT : la carte
    // visée (elle arrive au centre) et celles réellement à l'écran à cet instant
    // (`drawPaintedMinis`, sans effet sur téléphone où seule la carte centrale
    // est peinte). Les voisines hors écran (±2) et le pré-rendu des sections
    // sont repoussés APRÈS le ressort : tracés ici, ils formaient une tâche de
    // plusieurs centaines de millisecondes AVANT la première frame de
    // l'animation — 435 ms mesurées sur le balayage accueil → 01 (Pixel 5,
    // CPU ×4), le ralentissement signalé. Les deux appels sont idempotents.
    drawMini(target);
    drawPaintedMinis();
    if (reduceMotion()) {
      offset = target; vel = 0;
      applyTransforms(offset);
      setAnimating(false);
      prepareAround();
      return;
    }
    setAnimating(true);
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
        setAnimating(false);
        prepareAround();
        return;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }

  /* ----------------------------------------------------------------------
   * Recentre INSTANTANÉMENT la carte active (offset entier = `index`).
   * Ouvrir un détail annule le ressort au pointerdown : `offset` peut alors être
   * figé sur une position INTERMÉDIAIRE (carte décentrée). On appelle ceci quand
   * la feuille recouvre le carrousel (fin d'ouverture) → le recentrage est
   * invisible, et la carte est en position normale au retour, jamais « bloquée ».
   * -------------------------------------------------------------------- */
  function centerActiveCard() {
    if (raf) { cancelAnimationFrame(raf); raf = null; }
    offset = index; vel = 0;
    applyTransforms(offset);
    setAnimating(false);
  }

  /* ----------------------------------------------------------------------
   * Gestes : drag horizontal (swipe), tap (ouvrir), clavier.
   * -------------------------------------------------------------------- */
  function setupGestures() {
    let dragging = false, axis = null, downCard = null;
    let startX = 0, startY = 0, startOffset = 0, lastOffset = 0, lastT = 0;
    // Le drag écrit dans le DOM au rythme de l'écran, pas au rythme des événements
    // pointeur : sur un swipe rapide (ou un écran 90/120 Hz), plusieurs `pointermove`
    // tombent dans une même frame. On calcule bien `offset`/`vel` à chaque événement
    // (nécessaire pour la vélocité du flick), mais on ne pousse `applyTransforms` qu'une
    // seule fois par frame via rAF → fin des recalculs de style redondants.
    let moveRaf = 0;
    const scheduleDraw = () => {
      if (moveRaf) return;
      moveRaf = requestAnimationFrame(() => { moveRaf = 0; applyTransforms(offset); });
    };
    const cancelDraw = () => { if (moveRaf) { cancelAnimationFrame(moveRaf); moveRaf = 0; } };
    // Ouverture au glissement (vertical, vers le haut) : miroir de la fermeture.
    let openDragActive = false, odRefs = null;
    let odStartY = 0, odLastY = 0, odLastT = 0, odV = 0;   // suivi de vélocité (px/ms montants)

    viewport.addEventListener("pointerdown", e => {
      if (detailOpen) return;
      dragging = true; axis = null;
      setAnimating(true);   // le doigt va (peut-être) déplacer les cartes : coupe les flous coûteux
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
      // `dx` est en pixels d'ÉCRAN : sur une piste réduite (cf. computeFit), un
      // pas de carte n'y mesure plus STEP mais STEP × fitScale — sans quoi les
      // cartes avanceraient plus vite que le doigt.
      let o = startOffset - dx / (STEP * fitScale);
      if (o < 0) o = o * 0.35;
      else if (o > cards.length - 1) o = (cards.length - 1) + (o - (cards.length - 1)) * 0.35;
      offset = o;
      const now = performance.now();
      const dt = Math.max((now - lastT) / 1000, 0.001);
      vel = (offset - lastOffset) / dt;
      lastOffset = offset; lastT = now;
      scheduleDraw();
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
        centerActiveCard();        // recentre la carte sous la feuille (recentrage invisible)
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
      const s0 = scrim ? (parseFloat(scrim.style.opacity) || 0) : 0;
      const dur = clamp(v > 0 ? fromTy / v : OPEN_DURATION, 160, OPEN_DURATION);
      // Le rayon reste FIGÉ à sa valeur du drag pendant le settle (animer
      // border-radius repeint la feuille plein écran à chaque frame) ; settle()
      // le remet à zéro en une seule écriture, coins en bord d'écran → invisible.
      const a = sheet.animate(
        [
          { transform: `translateY(${fromTy}px)` },
          { transform: "translateY(0px)" }
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
      // Une écriture de drag planifiée mais pas encore exécutée écraserait la 1re
      // frame du ressort (springTo) avec l'`offset` du drag → petit saut. On l'annule.
      cancelDraw();
      try { viewport.releasePointerCapture(e.pointerId); } catch (err) {}
      const moved = Math.abs(e.clientX - startX) + Math.abs(e.clientY - startY);
      if (axis !== "x" || moved < 10) {
        // Tap : ouvrir la carte active, ou aller à la carte tapée.
        if (downCard) {
          const i = +downCard.dataset.index;
          // Carte la plus centrée : ouvrir son détail. À l'ouverture, la feuille
          // fige les cartes (centerActiveCard) : les flous, statiques, ne coûtent
          // plus rien, donc on lève tout de suite l'état « animation ».
          // `springTo` gère lui-même la classe pour un changement de carte.
          if (i === Math.round(offset)) {
            // Une carte sans détail (l'intro) ne s'ouvre pas — mais il faut quand
            // même se recaler dessus : un pointerdown incident (doigt qui effleure
            // la carte pendant un appui rapide sur une flèche) a pu annuler le
            // ressort en cours et figer `offset` sur une position intermédiaire.
            // Sans ce recalage, la carte reste bloquée de travers (openDetail
            // recentre via centerActiveCard, mais seulement quand un détail s'ouvre).
            if (cards[i].noDetail) springTo(i);
            else { openDetail(i); setAnimating(false); }
          }
          else springTo(i);
        } else {
          // Un pointerdown incident (doigt qui effleure le viewport pendant un
          // appui rapide sur une flèche) a pu annuler le ressort en cours, laissant
          // `offset` sur une position intermédiaire. On le recale sur la carte visée
          // au lieu de figer la carte entre deux positions. Au repos (aucun ressort
          // annulé), `offset === index` déjà → `springTo` est un quasi no-op.
          springTo(index);
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
  let deepLinkArrival = false; // ce détail s'ouvre-t-il DIRECTEMENT depuis une URL …/#section ?
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
  let detailOpener = null;          // élément focalisé avant l'ouverture (à refocaliser après)
  let releaseFocusTrap = null;      // retire le piège de focus de la feuille

  /* ----------------------------------------------------------------------
   * Focus de la vue détail. La feuille est une boîte de dialogue modale
   * (role="dialog" aria-modal="true") et l'accueil passe en aria-hidden à
   * l'ouverture : le focus DOIT quitter le carrousel, sans quoi il resterait sur
   * une carte devenue invisible pour les lecteurs d'écran, et la tabulation
   * continuerait de parcourir l'arrière-plan. Même contrat que la vue
   * « Agrandir », qui l'obtient gratuitement via <dialog> (cf. js/app.js).
   * -------------------------------------------------------------------- */
  const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]),' +
    ' textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

  // On focalise la FEUILLE elle-même (tabindex="-1"), pas son bouton de retour :
  // le lecteur d'écran annonce le dialogue et son libellé, la tabulation part
  // ensuite naturellement sur le premier élément qu'elle contient, et aucun
  // anneau de focus n'apparaît pour qui ouvre une carte à la souris ou au doigt.
  function focusInDetail(sheet) {
    if (!sheet || !sheet.isConnected) return;
    if (detailEl && detailEl.contains(document.activeElement)) return;   // déjà dedans
    sheet.setAttribute("tabindex", "-1");
    sheet.focus({ preventScroll: true });
  }

  // Boucle la tabulation à l'intérieur de la feuille tant que le détail est
  // ouvert. Renvoie la fonction de retrait (appelée à la fermeture).
  function trapFocus(sheet) {
    const onKey = e => {
      if (e.key !== "Tab" || !detailOpen) return;
      const items = Array.from(sheet.querySelectorAll(FOCUSABLE))
        .filter(node => node.offsetWidth || node.offsetHeight || node === document.activeElement);
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      const outside = !sheet.contains(document.activeElement);
      if (e.shiftKey && (outside || document.activeElement === first)) {
        e.preventDefault(); last.focus({ preventScroll: true });
      } else if (!e.shiftKey && (outside || document.activeElement === last)) {
        e.preventDefault(); first.focus({ preventScroll: true });
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }

  // Fige les animations d'ouverture : on écrit leur valeur de fin dans le style
  // inline (commitStyles) puis on les annule (cancel). Sans ça, une animation WAAPI
  // en `fill: "both"` garde la priorité sur le style inline dans la cascade et
  // écrase le `transform`/`opacity` posés par le drag → la feuille ne suit pas le
  // doigt (effet « on/off »). Les valeurs commit = valeurs de fin ⇒ aucun saut.
  // Promotion en calque du voile (.cd-scrim, opacité) et du corps (.cd-body,
  // transform + opacité, gros sous-arbre) JUSTE avant leurs animations WAAPI, puis
  // retrait ensuite. `.cd-sheet` garde son `will-change: transform` permanent (CSS).
  // Sans ça, le calque est créé sur la 1re frame de l'animation → léger à-coup à
  // l'ouverture/fermeture du détail.
  function setDetailWillChange(on) {
    if (!detailEl) return;
    const scrim = detailEl.querySelector(".cd-scrim");
    const body = detailEl.querySelector(".cd-body");
    if (scrim) scrim.style.willChange = on ? "opacity" : "";
    if (body) body.style.willChange = on ? "transform, opacity" : "";
  }

  function freezeOpenAnims() {
    detailReady = true;            // ouverture posée : le voile peut désormais fermer
    setDetailWillChange(false);    // animations d'ouverture terminées → libère les calques
    centerActiveCard();            // recentre la carte sous la feuille (recentrage invisible)
    openAnims.forEach(a => {
      if (!a) return;
      try { a.commitStyles(); } catch (e) {}
      try { a.cancel(); } catch (e) {}
    });
    openAnims = [];
    // Efface le rayon figé posé avant la montée (cf. openDetail) : la feuille
    // est plein écran, le passage 28px → 0 se joue hors champ.
    const sheet = detailEl && detailEl.querySelector(".cd-sheet");
    if (sheet) sheet.style.borderRadius = "";
    // Le fondu d'entrée du corps (.cd-body) peut être figé à mi-course par le
    // commitStyles() ci-dessus s'il est déclenché tôt (2e clic d'un double-clic
    // amorçant un drag avant la fin de l'ouverture, alors que le corps est encore
    // à opacité ~0 pendant son délai/début de fondu) : l'opacité resterait bloquée
    // en style inline → description « blanche ». À l'état ouvert le corps est
    // TOUJOURS pleinement visible : on efface ces styles figés.
    const cdBody = detailEl && detailEl.querySelector(".cd-body");
    if (cdBody) { cdBody.style.opacity = ""; cdBody.style.transform = ""; }
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
    // Filet : l'ouverture d'un détail lit `.card-inner` (fondu de la carte
    // d'origine pendant le FLIP). En pratique on n'ouvre que la carte active,
    // donc déjà montée — mais un lien profond ouvre la carte cible dès le
    // montage du carrousel, avant que la file de temps mort n'ait tourné.
    hydrateCard(i);
    setAnimating(false);   // un détail s'ouvre : les cartes vont être figées/recouvertes
    detailOpen = true;
    detailReady = false;           // réarmé à chaque ouverture (voir garde du voile plus bas)
    // Un détail a été ouvert au moins une fois : on fige définitivement la
    // pulsation d'amorçage de la pastille « Voir le détail › » (cf. cards.css).
    document.body.classList.add("cards-detail-seen");
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
    //
    // Cas particulier du LIEN PROFOND (…/#realite) : le visiteur n'a jamais vu
    // l'accueil et peut ignorer sur quel site il vient d'atterrir. La bulle nomme
    // alors le site ET l'action (deux lignes, cf. .cd-back.is-deep), au lieu du
    // simple « revenir à l'accueil » qui ne dit rien à qui arrive par un lien
    // partagé. Le drapeau est consommé ici : seule la feuille d'arrivée le reçoit.
    const coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
    const showHint = !backHintShown;
    const deep = deepLinkArrival;
    backHintShown = true;
    deepLinkArrival = false;
    const labelHtml = showHint
      ? '<span class="cd-back-label">' +
        (deep
          ? '<span class="cd-back-site">Ceci est mon COR</span>' +
            '<span class="cd-back-act">voir toutes les cartes</span>'
          : coarse ? "Glissez pour revenir à l'accueil" : "Cliquez pour revenir à l'accueil") +
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
      '<button class="cd-back' + (showHint && deep ? " is-deep" : "") +
      '" type="button" aria-label="Revenir aux cartes">' +
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

    // Une feuille s'ouvre TOUJOURS en haut de course : le titre de la section est
    // la première chose que l'on doit lire. Ceinture et bretelles avec le
    // `scroll-margin-top` de .cd-body .band (cf. cards.css), qui borne à 0 le
    // « défilement jusqu'au fragment » que le navigateur applique après coup sur
    // un lien profond.
    sheet.scrollTop = 0;

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
    // Repli à la première pression sur la feuille, SAUF si elle commence sur la
    // bulle elle-même : replier la pilule PENDANT la pression la fait glisser
    // hors du curseur avant le pointerup (cible down ≠ cible up) → le
    // navigateur ne synthétise jamais le `click` et l'action ne part pas (bug
    // constaté sur ordinateur à la première ouverture). `once` manuel : la
    // garde ne doit pas consommer l'écouteur.
    const stopHintOnPress = e => {
      if (backBtn.contains(e.target)) return;
      sheet.removeEventListener("pointerdown", stopHintOnPress);
      stopHint();
    };
    sheet.addEventListener("pointerdown", stopHintOnPress);
    setupSheetDismiss(sheet);

    // Le focus entre dans la feuille dès sa construction — c'est-à-dire avant
    // que l'accueil ne devienne aria-hidden pour de bon — et la tabulation y est
    // enfermée jusqu'à la fermeture, qui rend le focus à son point de départ.
    detailOpener = document.activeElement;
    releaseFocusTrap = trapFocus(sheet);
    focusInDetail(sheet);

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
    // Ouvrir une carte en détail compte comme une « interaction » (cf. springTo)
    // pour décider quand proposer l'installation de la PWA (voir js/app.js).
    document.dispatchEvent(new CustomEvent("cor:interaction"));
    const { sheet, scrim, body, backBtn, labelEl, cardInner } = refs;

    // Animation d'ouverture : INVERSE de la fermeture par glissement (la feuille
    // MONTE depuis le bas), plus un fondu de la carte d'origine. Même courbe
    // (cubic-bezier(.22,1,.36,1)) que le slideDown de fermeture → mouvement
    // symétrique.
    if (reduceMotion()) {
      detailEl.classList.add("is-open");
      detailReady = true;          // ouverture immédiate : le voile peut fermer
      centerActiveCard();          // recentre la carte (pas d'animation à concurrencer)
      body.style.opacity = "1";
      // Pas d'animation à concurrencer : on dessine les graphiques tout de suite.
      const render = pendingDetailRender;
      detailChartsRendered = true;
      pendingDetailRender = null;
      if (render) requestAnimationFrame(render);
      startBackHint(backBtn, labelEl);
      return;
    }
    setDetailWillChange(true);     // promeut voile + corps avant leurs animations
    // Rayon FIGÉ à 28px pendant la montée (animer border-radius avec transform
    // repeint la feuille plein écran à chaque frame → saccades à l'ouverture) ;
    // freezeOpenAnims le remet à zéro en une seule écriture, coins en bord
    // d'écran à ce moment-là → imperceptible.
    sheet.style.borderRadius = "28px";
    const sheetAnim = sheet.animate(
      [
        { transform: "translateY(100%)" },
        { transform: "translateY(0)" }
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
    // depuis la carte. On anime l'inner (et non la carte) pour ne pas écraser le
    // transform/opacity posés par applyTransforms sur la carte. L'opacité tombe à 0
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
      // Focus : on libère le piège, puis on le rend à l'élément qui a ouvert le
      // détail (une carte, une flèche…) — seulement une fois l'accueil de
      // nouveau exposé aux technologies d'assistance.
      if (releaseFocusTrap) { releaseFocusTrap(); releaseFocusTrap = null; }
      const opener = detailOpener;
      detailOpener = null;
      if (opener && opener.isConnected && opener.focus) opener.focus({ preventScroll: true });
      // Annule un éventuel rendu différé non encore déclenché (fermeture rapide
      // avant la fin de l'ouverture) et réarme l'état pour la prochaine ouverture.
      detailChartsRendered = false;
      pendingDetailRender = null;
      // Filet de sécurité : si l'ouverture a été interrompue avant le recentrage
      // (fermeture pendant l'ouverture, ou glissement d'ouverture annulé), `offset`
      // peut être resté intermédiaire. On resettle en douceur vers la carte active
      // pour ne jamais laisser une carte figée hors-centre au retour.
      if (Math.abs(offset - index) > 0.001) springTo(index);
    };

    if (reduceMotion()) { finish(); return; }

    setDetailWillChange(true);     // promeut voile + corps avant l'animation de fermeture

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
      const s0 = scrim ? (parseFloat(scrim.style.opacity) || 1) : 1;
      // Le rayon garde sa valeur inline du moment (drag : déjà arrondi ; bouton :
      // carré) : l'animer pendant la sortie repeindrait la feuille à chaque frame
      // pour un détail invisible sur un mouvement descendant rapide.
      const a = sheet.animate(
        [
          { transform: `translateY(${fromY}px)` },
          { transform: `translateY(${vh}px)` }
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
    // Rayon FIGÉ à 26px dès le départ (au lieu d'animer 0 → 26 : repaint plein
    // écran à chaque frame) : la mise à l'échelle le réduit visuellement pendant
    // la « replongée », et la feuille est démontée à l'arrivée.
    sheet.style.borderRadius = "26px";
    const a = sheet.animate(
      [
        { transform: "translate(0px,0px) scale(1,1)", opacity: 1 },
        { transform: `translate(${tx}px, ${ty}px) scale(${sx}, ${sy})`, opacity: 0.35 }
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

    // Une commande manipulable au doigt (curseur du simulateur, bouton, lien,
    // liste dépliante…) possède le geste qui commence sur elle. Sans ce filtre,
    // pousser un curseur armait AUSSI le glisser-pour-fermer : au moindre
    // tremblement vertical du doigt, l'axe basculait sur « y » et la feuille se
    // mettait à suivre le doigt pendant qu'on réglait le curseur.
    const CONTROLS = "input, button, select, textarea, a, summary";
    const isControl = t => !!(t && t.closest && t.closest(CONTROLS));

    // Amorce un drag : uniquement si le contenu est tout en haut de course.
    // Renvoie false si on n'amorce pas (le geste reste un défilement normal).
    function beginDrag(y, x, target) {
      if (isControl(target)) return false;
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
    function onTouchMove(e) {
      if (!dragging || e.touches.length !== 1) return;
      const t = e.touches[0];
      // `preventDefault()` dès qu'on glisse vers le bas en haut de course : c'est ce
      // qui empêche le navigateur de transformer le geste en défilement / pull-to-
      // refresh, donc le suivi reste fluide. Doit précéder le calcul (le scroll natif
      // est réclamé tôt).
      const goingDown = t.clientY - startY > 0;
      if (goingDown && e.cancelable) e.preventDefault();
      moveDrag(t.clientY, t.clientX);
    }
    // L'écouteur est NON PASSIF : tant qu'il est posé, le navigateur doit
    // attendre le fil principal à chaque déplacement du doigt avant de bouger
    // quoi que ce soit. On ne le pose donc que lorsqu'un glisser-pour-fermer est
    // réellement amorcé, et on le retire à la fin du geste. Un geste qui part
    // d'une commande (curseur du simulateur) n'en pose aucun : le navigateur le
    // traite alors sur son chemin rapide, sans détour par JavaScript.
    sheet.addEventListener("touchstart", e => {
      if (e.touches.length !== 1) return;    // pinch/zoom : on laisse le natif
      touchDriving = true;
      if (beginDrag(e.touches[0].clientY, e.touches[0].clientX, e.target)) {
        sheet.addEventListener("touchmove", onTouchMove, { passive: false });
      }
    }, { passive: true });
    const touchEnd = () => {
      sheet.removeEventListener("touchmove", onTouchMove, { passive: false });
      endDrag();
      touchDriving = false;
    };
    sheet.addEventListener("touchend", touchEnd, { passive: true });
    sheet.addEventListener("touchcancel", touchEnd, { passive: true });

    // ----- Repli pointer (souris / dispatch programmatique) : ignoré sur tactile -----
    sheet.addEventListener("pointerdown", e => {
      if (touchDriving) return;
      beginDrag(e.clientY, e.clientX, e.target);
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
   * CardSwipeScreen — anime l'écran d'accueil déjà servi en HTML.
   * ==================================================================== */
  function CardSwipeScreen() {
    const main = document.getElementById("top") || document.querySelector("main");
    if (!main) return;

    // L'écran d'accueil (#card-screen) et sa 1re carte sont DÉJÀ dans le document
    // (cf. index.html) : on les adopte au lieu de les reconstruire. Tout
    // CardSwipeScreen s'exécute en UNE tâche synchrone : le navigateur ne
    // repeint qu'à la fin, une fois les autres cartes ajoutées et le contenu
    // déplacé dans #story-sections[hidden] → aucune peinture intermédiaire.
    screen = document.getElementById("card-screen");
    if (!screen) return;                 // HTML inattendu : on laisse la page à défilement
    viewport = screen.querySelector(".cs-viewport");
    track = screen.querySelector(".cs-track");
    if (!viewport || !track) return;

    // Source unique : les constantes JS pilotent les variables CSS des cartes.
    const root = document.documentElement.style;
    root.setProperty("--card-w", CARD_WIDTH + "px");
    root.setProperty("--card-h", CARD_HEIGHT + "px");
    computeFit();          // avant computeHideDist : les seuils dépendent de l'échelle
    computeHideDist();

    // Réservoir : on déplace tout le contenu existant de <main> dans un conteneur
    // caché. Les <section> y restent disponibles comme contenu des vues détail.
    // L'écran d'accueil en est exclu : il RESTE en place, sans être ni détaché ni
    // rattaché (le détacher forcerait le navigateur à remettre en page et à
    // repeindre de zéro tout ce qu'il vient d'afficher).
    storeyard = document.createElement("div");
    storeyard.id = "story-sections";
    storeyard.hidden = true;
    let node = screen.nextSibling;
    while (node) { const next = node.nextSibling; storeyard.appendChild(node); node = next; }
    node = screen.previousSibling;
    while (node) { const prev = node.previousSibling; storeyard.insertBefore(node, storeyard.firstChild); node = prev; }
    main.appendChild(storeyard);

    // Pré-rend AU REPOS (échelonné, hors écran) TOUS les graphiques : ils sont ainsi déjà
    // à leur taille finale dès la première ouverture de leur carte, au lieu d'être rendus
    // après la montée de la feuille (le conteneur sauterait de min-height:300px à la hauteur
    // du SVG → « redimensionnement » juste avant le tracé). Le tracé des courbes est rejoué
    // à l'ouverture (cf. buildDetail), sur le SVG déjà rendu, sans reconstruction.
    //
    // Déclenché par la PREMIÈRE INTERACTION, et non par le chargement de la page.
    // La carte d'accueil (index 0) est `noDetail` : elle n'ouvre rien. Tant que
    // le visiteur n'a pas bougé, aucun graphique ne peut donc être demandé, et
    // en préparer un pendant le chargement ne servait qu'à alourdir le fil
    // principal — c'était la dernière tâche longue de la fenêtre de chargement
    // (~145 ms attribués à js/app.js sur le site déployé).
    //
    // Dès le premier contact (doigt, souris ou clavier), la file démarre : elle
    // a donc de l'avance pendant tout le geste de swipe, bien avant que la carte
    // voisine puisse être ouverte. `springTo` l'étend ensuite à chaque
    // changement de carte. Et si le visiteur va plus vite que la file, ouvrir
    // une carte reste correct : `renderSection` appelle `renderSectionOnce`, qui
    // rattrape la section à l'ouverture — le pré-rendu est une avance prise,
    // jamais une dépendance.
    startOnFirstInteraction(prerenderAround);

    // Rangée de pastilles et lien légal : servis en HTML (ils occupent de la
    // hauteur, cf. index.html), on les ADOPTE. Le reste du châssis est créé ici.
    dotsWrap = screen.querySelector(".cs-dots");
    if (!dotsWrap) return;                 // HTML inattendu

    // Libellé d'aide intégré à la flèche « suivante » (comme la bulle de retour
    // du détail). Verbe adapté à la plateforme : « Glissez » au tactile (on fait
    // défiler les cartes), « Cliquez » au pointeur fin (souris).
    const coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
    const navLabel = coarse ? "Glissez pour explorer" : "Cliquez pour explorer";

    // Affordances en `position:absolute` : elles se superposent à l'écran sans
    // peser sur la hauteur du viewport, donc leur ajout après le premier rendu
    // ne décale rien. Les créer ici plutôt que de les servir en HTML garde le
    // premier rendu au plus léger (leurs deux SVG et la requête d'image du logo
    // y coûtaient 19 ms sur la tâche la plus longue, à CPU ×8).
    //
    // Le logo/lien partenaire « Le Modèle Social Français » — pastille ronde dorée
    // en haut à droite de l'accueil (badge 🔗 + infobulle), pointant vers le
    // Linktree — est enfant direct de l'écran (hors .cs-viewport) : le clic n'est
    // pas capté par les gestes du carrousel. Ouvre dans un nouvel onglet
    // (target=_blank + rel de sécurité). Masqué avec l'accueil (aria-hidden)
    // quand un détail est ouvert.
    const logo = document.createElement("div");
    logo.innerHTML =
      '<a class="ms-logo" href="https://linktr.ee/lemodelesocialfrancais" ' +
      'target="_blank" rel="noopener noreferrer" ' +
      'title="Le Modèle Social Français — voir mon Linktree">' +
      '<img class="ms-logo-img" src="./icons/le-modele-social-francais.webp" ' +
      'alt="Le Modèle Social Français" width="40" height="40" decoding="async" />' +
      '<span class="ms-logo-tip">🔗 Mon Linktree</span>' +
      "</a>";
    screen.insertBefore(logo.firstElementChild, screen.firstChild);

    // Flèches de navigation, dans le viewport (au-dessus de la piste).
    const navs = document.createElement("div");
    navs.innerHTML =
      '<button class="cs-nav cs-nav-prev" type="button" aria-label="Carte précédente">' +
      '<svg class="icon" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>' +
      "</button>" +
      // Flèche « suivante » : une seule bulle (libellé à gauche + flèche à droite,
      // tous deux bleus) qui se déploie vers la gauche à la 1re carte, puis se
      // replie en pastille dès qu'on explore.
      '<button class="cs-nav cs-nav-next is-hint" type="button" aria-label="Carte suivante">' +
      '<span class="cs-nav-label">' + navLabel + "</span>" +
      '<svg class="icon" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>' +
      "</button>";
    while (navs.firstChild) viewport.appendChild(navs.firstChild);

    // La 1re carte est déjà dans la piste (HTML statique) : on l'ADOPTE. Les
    // douze autres reçoivent leur coquille ici (position, rôle ARIA, libellé,
    // tabindex) ; leur CONTENU est monté par `hydrateCard`, appelé juste en
    // dessous par `applyTransforms(0)` pour les seules cartes visibles, puis en
    // temps mort pour les autres.
    adoptStaticCard();
    cards.forEach((c, i) => { if (!cardEls[i]) track.appendChild(CardItem(c, i)); });

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

    // Premier rendu. Les minis des cartes HORS ÉCRAN ne sont pas tracés ici :
    // tracer les cartes ±2 coûtait 112 ms des ~127 ms
    // du montage (profilé à CPU ×4) — l'essentiel de la tâche longue attribuée à
    // ce fichier au chargement, et donc du Total Blocking Time restant. Le
    // pré-traçage en temps mort juste en dessous couvre les mêmes cartes, à
    // raison d'un mini par rappel, sans bloquer le fil principal.
    //
    // Les cartes RÉELLEMENT à l'écran, elles, sont tracées ici et de façon
    // synchrone (`drawPaintedMinis`), avant que le navigateur ne peigne : sur un
    // écran large, `applyTransforms` monte les voisines sous le seuil de
    // masquage, et sans leur graphique elles se peignaient blanches puis se
    // remplissaient au premier contact. Une carte visible ne doit jamais être
    // blanche. Le coût suit exactement ce que le visiteur voit : nul sur mobile
    // (paintDist < 1 → la seule carte visible est l'accueil, une photo sans
    // mini), deux minis sur un écran de bureau.
    offset = 0; index = 0;
    applyTransforms(0);
    drawPaintedMinis();

    // Pré-trace les minis hors écran quand le navigateur est libre : plus aucun
    // mini n'est construit sur la 1re frame d'un changement de carte (fin des
    // micro-saccades au premier passage sur une carte). `drawMini` est idempotent
    // (garde `miniDrawn`) → sans effet s'il est déjà tracé.
    const idlePrefetch = idle;
    // Une carte par rappel idle : tout faire dans un seul rappel formait une
    // longue tâche au chargement (Total Blocking Time). Chaque pas monte la carte
    // (hydrateCard) PUIS trace son mini s'il y en a un — les cartes sans mini
    // (photo d'accueil, icônes) ont besoin du premier sans le second, sinon
    // elles ne seraient montées qu'au franchissement du seuil de visibilité.
    // Les deux opérations sont idempotentes (gardes `hydrated` / `miniDrawn`) :
    // ce que la navigation a déjà fait est sauté.
    let miniPrefetchIdx = 0;
    const cardReady = i => hydrated.has(i) && (miniDrawn.has(i) || !cards[i].image.mini);
    const prefetchStep = () => {
      while (miniPrefetchIdx < cards.length && cardReady(miniPrefetchIdx)) miniPrefetchIdx++;
      if (miniPrefetchIdx >= cards.length) return;
      // Cette file est armée par la PREMIÈRE interaction : elle démarre donc
      // pendant le geste qui la déclenche. Monter une carte et tracer son mini
      // peut déborder de la fenêtre d'oisiveté et faire sauter la frame
      // suivante — visible sous le doigt. On attend le relâchement du pointeur ;
      // ce n'est qu'une avance prise, jamais une dépendance (drawMini est
      // idempotent et prepareAround reste le filet à chaque changement).
      if (window.CORApp && window.CORApp.pointerBusy && window.CORApp.pointerBusy()) {
        setTimeout(prefetchStep, 150);
        return;
      }
      const i = miniPrefetchIdx++;
      hydrateCard(i);
      drawMini(i);
      idlePrefetch(prefetchStep);
    };
    // …mais SEULEMENT à partir de la première interaction, comme le pré-rendu des
    // graphiques (cf. startPrerender plus bas). Au repos, une seule carte est
    // réellement regardée — la carte d'accueil, qui est une photo et n'a pas de
    // mini. Tracer les treize pendant le chargement coûtait ~85 ms de JavaScript
    // (CPU ×4, médiane sur 5 chargements) PLUS la mise en page et la peinture
    // qu'ils déclenchent, sur des cartes que personne ne regarde encore : c'était
    // le dernier gros poste de « Style & Layout » de la fenêtre de chargement.
    // Dès le premier contact, la file démarre et prend son avance dès la fin du
    // geste ; `prepareAround()` (appelé à la fin de chaque ressort) reste le
    // filet qui garantit ±2 cartes tracées à chaque changement, et `drawMini`
    // est idempotent : rien n'est tracé deux fois.
    startOnFirstInteraction(() => idlePrefetch(prefetchStep));

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

    // Redimensionnement (rotation) : les transforms sont en px → on réapplique
    // (et le seuil de masquage hors écran dépend de la largeur du viewport).
    // La hauteur disponible change elle aussi — fenêtre de bureau redimensionnée,
    // passage en paysage, barre d'URL mobile qui se replie : on refait donc la
    // mesure d'ajustement avant les seuils, qui en dépendent.
    let rt;
    window.addEventListener("resize", () => {
      clearTimeout(rt);
      rt = setTimeout(() => {
        computeFit();
        computeHideDist();
        if (!detailOpen) { applyTransforms(offset); drawPaintedMinis(); }
      }, 150);
    });

    // Lien profond : une URL du type …/#depenses (celle que copie le bouton
    // « copier le lien » de chaque section) doit amener DIRECTEMENT sur la vue
    // détail de la section demandée, et non sur la 1re carte. On mappe le hash
    // sur l'`id` de section d'une carte (cards[].image.section) et, si elle a un
    // détail, on positionne le carousel sur cette carte (pour que la fermeture y
    // revienne) puis on ouvre son détail via le pipeline existant (openDetail).
    openDeepLink();
  }

  function openDeepLink() {
    const raw = (location.hash || "").replace(/^#/, "");
    if (!raw || raw === "top") return;
    let id;
    try { id = decodeURIComponent(raw); } catch (e) { id = raw; }
    const i = cards.findIndex(c => c.image.section === id);
    if (i < 0 || cards[i].noDetail) return;
    // Positionne le carousel sur la carte cible sans animation (la fermeture du
    // détail doit retrouver cette carte), puis ouvre le détail au prochain frame
    // pour ne pas entrer en concurrence avec le premier applyTransforms.
    offset = i; index = i;
    applyTransforms(offset);
    // Seulement ce qui est peint : la feuille de détail va recouvrir le
    // carrousel dans la foulée. Les voisines suivent en temps mort, bien avant
    // que la fermeture ne les redécouvre (cf. prepareAround).
    drawPaintedMinis();
    prepareAround();
    // Signale à buildDetail que cette feuille est une ARRIVÉE par lien : la bulle
    // de retour nommera le site (le visiteur n'a jamais vu l'accueil).
    deepLinkArrival = true;
    requestAnimationFrame(() => { if (!detailOpen) openDetail(i); });
  }

  // L'API CORApp est posée à la fin de app.js (même cycle de scripts `defer`,
  // app.js avant cards.js) : à ce stade tout est prêt.
  //
  // Le montage reste SYNCHRONE dans l'évaluation du script. Le repousser dans sa
  // propre tâche (`setTimeout` 0) a été mesuré : c'est nettement moins bon
  // (tâche la plus longue 83 → 119 ms, CPU ×8, médiane sur 7 chargements). Le
  // navigateur sépare déjà de lui-même l'exécution du script et la mise en page
  // qui suit ; différer le montage le fait retomber dans la tâche du minuteur,
  // où construction, recalcul de style ET mise en page se retrouvent réunis.
  function boot() { CardSwipeScreen(); }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
