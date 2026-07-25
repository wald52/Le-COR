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
- Cache du service worker porté à `v76`.
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
- **Préchargement de l'élément LCP** : `<link rel="preload" as="image">` sur la
  photo de la 1re carte. Le scanner de préchargement ne la découvrait qu'après
  avoir traversé tout le `<head>` ; sa requête part désormais en parallèle des
  feuilles de style. Le `<img>` garde `fetchpriority="high"` — une seule requête.

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
