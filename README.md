# Le COR sous l'œil des citoyens

Un **outil citoyen** pour visualiser, simplement, comment évoluent les
**hypothèses du Conseil d'orientation des retraites (COR)** au fil de ses
rapports annuels — et vérifier si ses prévisions se sont réalisées.

L'idée centrale : **superposer les projections** faites à différentes dates
(comme un graphique de révisions de prévisions) pour répondre à des questions
simples :

- Le COR **change-t-il d'avis** d'une année sur l'autre ?
- Les hypothèses (démographie, productivité…) sont-elles **stables dans le temps** ?
- Les prévisions passées **se sont-elles réalisées** ?

Le but n'est pas de juger le COR, mais de rendre visible la **chaîne
d'hypothèses** sur laquelle reposent les projections (le COR reprend largement
des données de l'INSEE, de la Dares, etc.).

## Ce que montre le site

1. **Le graphique clé** — part des dépenses de retraite dans le PIB :
   réalisé (courbe pleine) + une projection par rapport annuel (pointillés).
2. **Le revirement** — comment l'hypothèse de productivité a été abaissée.
3. **La réalité** — hypothèses vs valeurs réellement observées
   (fécondité, productivité).
4. **Le tableau de bord** des hypothèses du scénario de référence.
5. **Méthode & sources**.

## Caractéristiques techniques

- **Sans dépendance** : HTML + CSS + JavaScript natif. Les graphiques sont
  dessinés par un petit moteur **SVG maison** (`js/chart.js`).
- **PWA** (Progressive Web App) : installable et **utilisable hors-ligne**
  grâce au service worker (`sw.js`) et au manifeste (`manifest.webmanifest`).
- **Responsive** et accessible (navigation clavier, libellés ARIA).

## Lancer en local

Comme le site utilise un service worker, il faut le servir en HTTP (pas en
`file://`) :

```bash
python3 -m http.server 8000
# puis ouvrir http://localhost:8000
```

## Mettre à jour les données

Toutes les séries sont dans **`data/data.js`**, avec leur source. Pour
remplacer une courbe par les chiffres **exacts** d'un fichier Excel du COR, il
suffit d'éditer le tableau `points` correspondant — aucune autre modification
n'est nécessaire.

> ⚠️ **Honnêteté sur les données** : cette première version est *pédagogique*.
> Les valeurs clés (points de départ, points 2070, hypothèses de référence)
> sont reprises des **synthèses officielles du COR** ; les points intermédiaires
> des courbes longues sont **interpolés** pour la lisibilité. Pour une analyse
> fine, brancher les fichiers Excel année par année (voir l'onglet
> « Méthode & sources » du site).

## Régénérer le logo et les icônes

Le logo « Ceci est mon COR » est construit en SVG par le script, qui rastérise
ensuite toutes les déclinaisons (favicon, icônes PWA, image de partage) :

```bash
pip install cairosvg        # nécessite libcairo
python3 icons/make_icons.py # écrit icon.svg, icon-192/512, maskable, og-image
```

## Sources principales

- Rapports annuels du COR (2019–2026) — <https://www.cor-retraites.fr/>
- INSEE (projections de population, comptes nationaux)

Site indépendant, **non affilié** au COR.
