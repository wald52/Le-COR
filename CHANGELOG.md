# Journal des modifications

Toutes les évolutions notables du site. Format inspiré de
[Keep a Changelog](https://keepachangelog.com/fr/1.1.0/).

## [Non publié]

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
