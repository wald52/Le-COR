# Journal des modifications

Toutes les évolutions notables du site. Format inspiré de
[Keep a Changelog](https://keepachangelog.com/fr/1.1.0/).

## [1.1.0] – 2026-07-25

### Ajouté

- **Pied de page du document** (hors `<main>`, donc conservé hors du mode
  carrousel) : mentions légales, code source, site du COR. Sans JavaScript,
  c'était le chaînon manquant — la page des mentions légales n'avait aucun lien
  entrant (LCEN).
- **Titre de niveau 1 dans le repli `<noscript>`** : l'unique `<h1>` du document
  appartenant à l'accueil (masqué sans JS), la page n'en avait aucun.
- **Page `404.html`** : la navigation vers une URL inexistante affichait la page
  d'erreur générique (en anglais) de GitHub Pages. Précachée par le service
  worker.
- **États de chargement et d'erreur de l'explorateur** : le chargement paresseux
  de `data/cor-explorer.generated.js` (468 Ko) échouait en silence, laissant la
  section 11 vide et muette sur réseau lent ou coupé. Un message s'affiche
  désormais, avec une action « Réessayer ».
- **Annonce des résultats interactifs aux lecteurs d'écran.** Le document ne
  comptait qu'une seule région vivante (`#toast`) : les deux fonctions les plus
  interactives du site changeaient en silence.
  - Simulateur (§10) : le verdict de la jauge (`#gauge-msg`) devient une région
    `aria-live="polite" aria-atomic="true"` — bouger un curseur produit enfin une
    annonce.
  - Curseurs du simulateur : `aria-valuetext` porte désormais la valeur *lisible*
    (« +2,4 pt »), là où le curseur expose l'entier brut de son pas (« 24 »).
    L'attribut réutilise la chaîne déjà calculée pour l'affichage, donc ne peut
    pas se désynchroniser ; les `aria-label` perdent leur explication d'unité
    (« en dixièmes de point »), devenue inutile et trompeuse.
  - Explorateur (§11) : le titre du graphique (`figcaption`) devient une région
    vivante — changer d'indicateur ne déplace pas le focus et n'annonçait donc
    rien.
- **Pied de page sur `legal.html`** : la page était un cul-de-sac (aucun lien
  vers le dépôt ni vers le COR, seulement « Retour au site »). Même pied de page
  que l'accueil et la 404, moins le lien vers elle-même.
- **Quatre tests de bout en bout** couvrant ces contrats (`tests/smoke.spec.js`),
  la suite e2e étant bloquante en CI.

### Modifié

- **Déploiement Pages** : l'étape de préparation ne retirait que
  `data/Données du COR`, si bien que le reste du dépôt partait sur l'URL publique.
  Elle exclut désormais aussi l'outillage de développement (`tests/`, `tools/`,
  `package*.json`, configs ESLint/Prettier/Playwright, `CLAUDE.md`) et les images
  non référencées — les six `images/*.jpg` d'avant la conversion WebP (~1,3 Mo,
  cités par aucun HTML/CSS/JS/manifeste/service worker), `intro-cor.webp`,
  `le-modele-social-francais.png`, `icon-no-bg.svg`, `make_icons.py`. Le site
  déployé passe de 3,2 Mo à 1,6 Mo. Suppressions limitées au checkout éphémère du
  job : tous ces fichiers restent versionnés (les `.jpg` alimentent
  `tools/optimize-images.py`). Les `css/*.css` et `js/*.js` non minifiés restent
  publiés — lire la source en regard du `.min` fait partie de la transparence du
  projet.

- **`manifest.webmanifest`** : `background_color` passe du bleu nuit `#16294d`
  au clair `#f2f6fa` (l'écran de démarrage de l'app installée n'affiche plus un
  flash sombre avant une interface claire) ; `orientation` passe de
  `portrait-primary` à `any` (le paysage était refusé, y compris sur tablette) ;
  `start_url` passe de `./index.html` à `./`, l'URL canonique du site.
- **`legal.html` — confidentialité** : ajout de la mention du stockage local
  (`cor-interactions`, `cor-install-dismissed`, `cor-install-done`, avec leur
  finalité) et correction de la formulation du cache hors-ligne, actif dès la
  première visite et non à la seule installation.
- **`README.md`** : l'avertissement « valeurs interpolées » datait d'avant
  l'extraction automatique et contredisait le site ; il est remplacé par la
  description réelle de la chaîne de données et un renvoi vers la note d'audit.
  La présentation de l'interface (carrousel de cartes) est mise à jour.
- Cache du service worker porté à `v79`.
- **Section « D'où vient vraiment l'argent des retraites ? »** : les trois lectures
  (A/B/C) sont resserrées sur la seule lecture critique « avant subventions
  d'équilibre » et son tableau (≈ 87 Md€), désormais affichée directement (plus
  d'accordéon, puisqu'il n'y a qu'une lecture). La lecture officielle du COR —
  convention de tout le site — est rappelée dans le paragraphe d'introduction, et
  la lecture « médiane » était redondante avec l'encadré « Ce qu'il faut retenir ».

### Corrigé

- **Score de performance Lighthouse : 87 → 100** (audit mobile de la page
  d'accueil déployée). Tout le déficit venait d'un seul décalage de mise en page
  (CLS de **0,253**, sous-score 0,49 sur une métrique qui pèse 25 % — les quatre
  autres, LCP/TBT/FCP/Speed Index, étaient déjà au maximum).
  - **Cause** : le pied de page vit hors de `<main>` (c'est le seul chemin vers
    les mentions légales sans JavaScript). Quand le carrousel vide `<main>` dans
    `#story-sections[hidden]`, le document passe de ~15 000 px à 0 et le pied de
    page remonte d'un coup dans la fenêtre. Il y est invisible — `.card-screen`
    (`position:fixed;inset:0`) le recouvre — mais l'API *Layout Instability* de
    Chrome ne fait pas d'analyse d'occlusion : elle compte le déplacement. À lui
    seul, il pesait **0,245 des 0,253** mesurés.
  - **Correctif** : `body.mode-carousel .site-footer { display: none }`. La
    classe est posée dans la même tâche synchrone que le déplacement du contenu,
    donc le pied de page n'a jamais de position d'arrivée à décaler. Sans
    JavaScript, `body.mode-carousel` n'existe pas : le pied de page et son lien
    vers `legal.html` restent intacts (repli LCEN vérifié). Effet de bord
    bienvenu : il n'est plus atteignable au clavier derrière un écran opaque.
  - Mesure locale avant/après (Lighthouse 13, profil mobile) : CLS **0,253 →
    0,008**, sous-score **0,49 → 1,00**, sans régression des autres métriques.
  - Le préchargement de l'élément LCP (`<link rel="preload" as="image">` sur la
    photo de la 1re carte), d'abord ajouté par précaution, a été **retiré après
    mesure** : il ne rapporte rien (LCP 1,4 s → 1,5 s sur le site déployé ; A/B
    local de 5 runs par variante : 3 ms d'écart sur le FCP, 5 ms sur le LCP,
    très en dessous du bruit). La photo est le 1er élément du `<body>`, donc
    déjà découverte tôt, et porte `fetchpriority="high"` : la précharger ne
    ferait que lui disputer la bande passante avec la feuille de style — le
    raisonnement même qui vaut déjà pour les scripts.
- **Total Blocking Time : les deux tâches longues du chargement.** Une fois le
  CLS réglé et la mise en page allégée, le TBT restait le seul frein (124-372 ms
  sur trois audits mobiles du site déployé, soit un score oscillant entre 91 et
  99). Les traces désignaient deux coupables, reproductibles d'un run à l'autre.
  - **Le traçage des mini-graphiques au montage du carrousel** (~112 ms des
    ~127 ms du montage, profilé à CPU ×4 — l'essentiel de la tâche longue
    attribuée à `js/cards.js`). `drawVisibleMinis()` traçait les cartes ±2 d'un
    seul tenant, alors que le pré-traçage en temps mort juste en dessous couvre
    déjà les mêmes cartes, dans le même ordre, à raison d'un mini par rappel.
    L'appel synchrone est retiré : la carte active à l'ouverture est une carte
    photo (aucun mini à tracer), et tous les minis sont en place ~600 ms après
    `load` sans bloquer le fil principal. La navigation rappelle
    `drawVisibleMinis()` et `drawMini` est idempotent : aucune carte ne peut
    rester sans son mini.
  - **Le pré-rendu des graphiques : proportionnel à ce que le visiteur peut
    atteindre.** `prerenderAllCharts` traçait les huit sections après `load`,
    d'abord une section par temps mort (tâches de ~145 ms), puis un graphique
    par temps mort — sans suffire : sur un audit du site déployé, il restait des
    tâches de 126 à 167 ms attribuées à `js/app.js`, l'essentiel du TBT.
    Remplacé par `CORApp.prerenderSections(ids)`, alimenté par les sections des
    cartes **voisines** de la carte courante (±1), et étendu par la navigation.
    Au chargement, le visiteur est sur la carte d'accueil, qui n'a aucun
    graphique : **un seul** est préparé au lieu de dix. Une carte est toujours
    prête avant qu'on puisse l'ouvrir (il faut naviguer jusqu'à elle), et les
    chemins directs — lien profond `#monde`, saut par les pastilles — restent
    corrects : `renderSection` rattrape la section à l'ouverture. `explorer`
    reste hors périmètre (ses 468 Ko doivent rester paresseux) et les outils
    sont posés sur la seule section tracée, au lieu de re-balayer le document.
  - Mesure locale, 5 runs (Lighthouse 13, profil mobile) : **TBT médian 92 ms →
    0 ms**. Sur les runs non parasités par la machine de mesure, la fenêtre de
    chargement ne contient plus **aucune tâche longue de JavaScript** — il ne
    reste qu'une tâche document de ~55 ms. CLS inchangé à 0,006 ; lint,
    17 tests unitaires et 38 tests e2e au vert ; liens profonds et saut par
    pastilles vérifiés sur des sections jamais pré-rendues.
- **Mise en page des sections invisibles au premier rendu** (`content-visibility:
  auto` sur `.band`). Au chargement, le navigateur mettait en page les 13 sections
  (~3 000 éléments) alors qu'elles sont **recouvertes** par l'accueil statique
  (`#boot-splash`, `position:fixed;inset:0`, opaque) et que le carrousel les
  déplace, quelques millisecondes plus tard, dans `#story-sections[hidden]` où
  elles ne comptent plus. Ce travail entièrement perdu formait une tâche longue de
  ~470 ms attribuée au document : elle retardait le FCP et, selon qu'elle tombait
  avant ou après lui, gonflait le Total Blocking Time (mesuré jusqu'à +457 ms sur
  un seul run). Mesure sur 11 runs (Lighthouse 13, profil mobile) : « Style &
  Layout » **523 ms → 382 ms** en médiane, minimums 485 ms → 350 ms (sans
  recouvrement). La section ouverte en vue détail neutralise la règle
  (`.cd-body .band { content-visibility: visible }`) : c'est la seule qu'on
  regarde et qu'on fait défiler. Vérifié : sans JavaScript, les 13 sections
  gardent une hauteur normale (repli par défilement intact) ; le CLS reste à
  0,006 et les 38 tests de bout en bout passent.

## [1.0.0] – 2026-06-27

### Ajouté

- **Section « D'où vient vraiment l'argent des retraites ? »** : structure des
  ressources 2025 (barre 100 %), financements croisés (famille, chômage,
  fiscalisation), mini-graphe de la fiscalisation 2022→2025, et trois lectures du
  même constat présentées à parité (accordéon). Source : COR, feuille « Tab 2.2 ».
- **Lien d'évitement** « Aller au contenu » (visible à la première tabulation)
  sur l'accueil et la page légale, pour la navigation au clavier.
- **Repli `<noscript>`** : message expliquant que les graphiques nécessitent
  JavaScript, avec lien vers les sources officielles du COR.
- **Export CSV** des données par graphique : bouton « Télécharger les données
  (CSV) » placé dans le tableau de données repliable (« Voir les données »), en
  plus de l'export image PNG de la barre d'outils.
- **Partage par section** : bouton « copier le lien » à côté de chaque titre de
  section, copiant l'URL avec l'ancre correspondante.
- **Outillage de développement** (dev-only, non livré) : ESLint (flat config),
  Prettier (optionnel), tests de bout en bout Playwright (`tests/`), et un
  workflow CI `Qualité` (lint bloquant, e2e informatif).
- Documentation : `CONTRIBUTING.md` (guide de contribution) et ce `CHANGELOG.md`.
- **Fichier `LICENSE`** : double licence pour une ouverture maximale dans le
  respect des sources — code sous **MIT**, textes éditoriaux et mise en forme
  sous **Licence Ouverte 2.0 (Etalab)** (la licence des informations publiques
  du COR) ; les données sources restent sous la licence de leur producteur et
  sont réutilisées avec attribution.

### Modifié

- **Re-cadrage éditorial en trois chapitres** : le site, devenu un explicateur
  complet de 12 sections, est désormais structuré en trois actes annoncés par
  des intercalaires — « Le constat », « Comment ça marche vraiment » et « Que
  faire ? ». Nouveau titre et chapô d'accueil annonçant ce parcours (l'ancienne
  accroche « Le COR change-t-il d'avis ? » devient le hook d'ouverture). La
  navigation est regroupée par chapitre. Les sections « productivité », « réalité »
  et « niveau de vie » remontent dans le chapitre « constat » pour rétablir le fil
  narratif ; « financement » et « dette » rejoignent « comment ça marche ». Les
  ancres (`#id`) des sections sont **inchangées** : les liens de partage existants
  restent valides ; seule la numérotation visible (« N · ») a été mise à jour.
- `js/chart.js` expose désormais la configuration du graphique
  (`container.__cfg`) pour permettre l'export CSV.
- **Second axe Y (à droite)** dans les graphiques en courbes : une série peut
  être rattachée à une échelle secondaire (`axis:"right"` + `cfg.y2`). Le
  graphique « Bénéficiaires de pensions, par type de droit » l'utilise pour la
  part des bénéficiaires d'une réversion (en %), désormais lisible à côté des
  effectifs (en milliers) au lieu d'être écrasée sur l'échelle de gauche.
- **Métadonnées sociales raccourcies** (anti-troncature) : `<title>` 63→54,
  `og:title` / `twitter:title` 64→45, `og:description` 157→124 caractères ; le
  mot-clé « retraites » est conservé dans le titre de page et le titre social.
- **`legal.html` — « Propriété intellectuelle »** : passe de « reproduction
  soumise à autorisation » à une réutilisation libre sous Licence Ouverte 2.0.
- Cache du service worker porté à `v63` (rafraîchissement des assets modifiés).

### Corrigé

- **Infobulles des graphiques rognées sur mobile** : sur petit écran, les
  libellés longs rendaient l'infobulle plus large que le graphique, ce qui la
  poussait hors cadre (texte coupé à gauche). L'infobulle est désormais
  plafonnée à la largeur du graphique, ses libellés reviennent à la ligne, et
  son positionnement reste toujours dans la zone visible.
- **Mentions « (éch. de gauche / de droite) » sans second axe** : le graphique
  « Bénéficiaires de pensions, par type de droit » affichait ces mentions alors
  qu'un seul axe existait, et la part (~28 %) tracée sur l'échelle des milliers
  apparaissait comme une ligne plate à zéro (infobulle « 0,2 k » erronée). Le
  second axe est maintenant réellement dessiné.
