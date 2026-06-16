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

## Ajouter ou modifier un graphique

- Le moteur de graphiques maison est dans `js/chart.js` (fonction `lineChart`).
  Il expose déjà `role="img"` + `aria-label` sur le SVG et un **tableau de
  données repliable** (accessibilité). Renseignez `cfg.ariaLabel`.
- L'assemblage des sections et le branchement des données se font dans
  `js/app.js`.
- Après toute modification d'un asset servi, **incrémentez la version du cache**
  dans `sw.js` (`const CACHE = "le-cor-citoyen-vNN"`).

## Avant d'ouvrir une contribution

1. `npm run lint` passe sans erreur.
2. `npm test` passe (ou expliquez les tests ajustés).
3. Mettez à jour le `CHANGELOG.md`.
