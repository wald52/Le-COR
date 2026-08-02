# Contribuer au site « Ceci est mon COR »

Merci de votre intérêt ! Ce projet est un **outil citoyen** statique
(HTML + CSS + JavaScript natif), **sans étape de build** : les fichiers servis
sont exactement ceux du dépôt. L'outillage ci-dessous sert uniquement au
développement (lint, tests) et n'est **jamais livré** au visiteur.

## Lancer le site en local

Le site utilise un service worker : il faut le servir en HTTP (pas en `file://`).

```bash
python3 -m http.server 8000
# puis ouvrir http://localhost:8000
```

## Outillage de développement

Prérequis : Node.js 22+. Installez les dépendances de développement :

```bash
npm install
```

Commandes disponibles :

| Commande            | Rôle                                                        |
| ------------------- | ----------------------------------------------------------- |
| `npm run lint`      | Analyse statique du JavaScript (ESLint). **Doit passer.**   |
| `npm run test:unit` | Tests unitaires Node (dossier `tests/unit/`). **Doit passer.** |
| `npm test`          | Tests de bout en bout (Playwright, dossier `tests/`).       |
| `npm run serve`     | Sert le site en local (`python3 -m http.server`).           |
| `npm run format`    | Vérifie le format (Prettier) — **optionnel**, voir ci-dessous. |
| `npm run format:fix`| Reformate les fichiers ciblés (Prettier).                   |

> **Note sur Prettier.** Le code existant suit un style compact volontaire qui
> n'est **pas** imposé par la CI. Prettier est fourni comme commodité ; ne
> reformatez pas massivement un fichier pour une petite contribution.

La première exécution des tests télécharge le navigateur :
`npx playwright install chromium`.

## Mettre à jour les données du COR

- Les séries d'amorçage et leurs sources sont dans **`data/data.js`**.
- Les séries officielles complètes sont **générées** dans
  `data/cor-series.generated.js` et `data/cor-explorer.generated.js` à partir des
  fichiers Excel du COR, via le script Python **`tools/extract_cor.py`**. Ces
  deux fichiers `*.generated.js` ne sont ni édités à la main ni analysés par le
  linter.
- Pour remplacer une courbe par des chiffres exacts ponctuels, éditer le tableau
  `points` correspondant dans `data/data.js` — aucune autre modification requise.
- **La date de mise à jour est écrite en dur à trois endroits**, à toucher
  ensemble lors de l'intégration d'un nouveau rapport, sans quoi elles se
  désynchronisent :
  1. le pied de page d'`index.html` (« Dernière mise à jour : … ») ;
  2. `legal.html` (`.legal-updated`, en bas de page) ;
  3. `sitemap.xml` (`<lastmod>`, au format `AAAA-MM-JJ`).

## Ajouter ou modifier un graphique

- Le moteur de graphiques maison est dans `js/chart.js` (fonction `lineChart`).
  Il expose déjà `role="img"` + `aria-label` sur le SVG et un **tableau de
  données repliable** (accessibilité). Renseignez `cfg.ariaLabel`.
- L'assemblage des sections et le branchement des données se font dans
  `js/app.js`.
- Après toute modification d'un asset servi, lancez **`npm run build:min`** et
  committez le résultat. La commande minifie les sources, puis estampille les
  URLs d'assets d'un hachage de contenu (`?v=…`) dans les documents, les scripts
  minifiés et la liste de précache de `sw.js`. Il n'y a plus de version de cache
  à incrémenter à la main : le hachage la remplace.

  Cet estampillage est ce qui garantit qu'une page ne mélange jamais des
  fichiers de générations différentes — une URL estampillée désigne un contenu
  immuable. L'oublier ne casse pas le site, mais fige le cache des visiteurs sur
  l'ancienne version ; la CI le refuse (« garde-fou anti-dérive »), et
  `npm run test:unit` le signale.

## Le relais de signalement (`worker/`)

Le formulaire « Signaler une erreur » envoie vers un petit Cloudflare Worker,
qui ouvre l'issue GitHub à la place du visiteur — c'est ce qui permet de
signaler une erreur **sans compte et sans quitter le site**.

Ce dossier n'est **pas** déployé sur GitHub Pages (il est retiré par
`.github/workflows/pages.yml`) : il se déploie séparément avec `wrangler`. La
marche à suivre complète — création du captcha, jeton GitHub restreint, secrets,
mise en service — est dans [`worker/README.md`](worker/README.md).

Deux points de vigilance :

- **Le jeton GitHub expire.** Le jour venu, le formulaire cesse d'enregistrer
  les signalements (le visiteur voit un message d'échec et le lien GitHub de
  repli). Il suffit de régénérer un jeton et de rejouer `wrangler secret put
  GITHUB_TOKEN`.
- **Les défenses anti-abus se testent sans compte Cloudflare** :
  `npm run test:unit` couvre l'origine, les pièges à robots, la validation, la
  limitation de débit et l'absence d'adresse IP dans les issues publiées.

## Avant d'ouvrir une contribution

1. `npm run lint` passe sans erreur.
2. `npm run test:unit` et `npm test` passent (ou expliquez les tests ajustés).
3. Si vous avez touché un `.css`/`.js` servi, `npm run build:min` puis
   **committez les fichiers régénérés** (la CI échoue sinon).
4. Mettez à jour le `CHANGELOG.md`.
