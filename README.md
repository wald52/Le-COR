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

Le site s'ouvre sur un **carrousel de cartes** (une carte par section, que l'on
fait défiler au doigt, à la souris ou au clavier) ; ouvrir une carte déploie la
section complète — texte, graphique interactif, encadré « ce qu'il faut
retenir ». Sans JavaScript, la même matière se lit comme une page classique à
défilement. L'ensemble forme un parcours en **trois chapitres**
(accueil + 12 sections) :

**Chapitre 1 — Le constat** (combien on dépense, et des prévisions qui bougent)
1. **Le graphique clé** — part des dépenses de retraite dans le PIB :
   réalisé (courbe pleine) + une projection par rapport annuel (pointillés).
2. **Le déficit** — solde du système et effet « ciseaux ».
3. **Le revirement** — comment l'hypothèse de productivité a été abaissée.
4. **La réalité** — hypothèses vs valeurs réellement observées (fécondité, productivité).
5. **Le niveau de vie** des retraités face au reste de la population.

**Chapitre 2 — Comment ça marche vraiment** (décoder le système)
6. **Le financement** — d'où vient vraiment l'argent des retraites.
7. **La dette** — « la moitié part dans les retraites », vrai ou faux ?
8. **La France dans le monde** — comparaison internationale des dépenses.
9. **Le tableau de bord** des hypothèses du scénario de référence.

**Chapitre 3 — Que faire ?**
10. **Le simulateur** des trois leviers d'équilibrage.

**Aller plus loin** (les annexes)
11. **L'explorateur** de tous les indicateurs.
12. **Méthode & sources.**

## Caractéristiques techniques

- **Sans dépendance** : HTML + CSS + JavaScript natif. Les graphiques sont
  dessinés par un petit moteur **SVG maison** (`js/chart.js`).
- **PWA** (Progressive Web App) : installable et **utilisable hors-ligne**
  grâce au service worker (`sw.js`) et au manifeste (`manifest.webmanifest`).
- **Responsive** et accessible (navigation clavier, libellés ARIA).
- **Aucun traceur** : pas d'analytique, pas de cookie, aucune requête vers un
  tiers pendant la consultation. Le seul stockage local sert à ne pas reproposer
  l'installation de la PWA (voir [`legal.html`](legal.html)).
- **Signalement anonyme** : « Signaler une erreur » ouvre un formulaire sur la
  page, sans compte GitHub et sans quitter le site. Le site étant statique, un
  relais minimal ([`worker/`](worker/README.md), un Cloudflare Worker) ouvre
  l'issue publique à la place du visiteur. Il n'est sollicité qu'au moment d'un
  envoi&nbsp;: aucune requête tierce n'a lieu autrement.

## Lancer en local

Comme le site utilise un service worker, il faut le servir en HTTP (pas en
`file://`) :

```bash
python3 -m http.server 8000
# puis ouvrir http://localhost:8000
```

Pour le lint, les tests de bout en bout et le guide de contribution, voir
[`CONTRIBUTING.md`](CONTRIBUTING.md).

## Mettre à jour les données

Les séries affichées viennent des **fichiers Excel officiels du COR**, extraits
automatiquement par `tools/extract_cor.py` vers deux artefacts committés :

- `data/cor-series.generated.js` (`window.COR_SERIES`) — les séries des sections ;
- `data/cor-explorer.generated.js` (`window.COR_EXPLORER`) — l'explorateur.

`data/data.js` (`window.COR_DATA`) reste saisi à la main : il porte quelques
séries non extractibles (`productivite`, `fiscalisation`, `hypothesesTable`,
`macro`) et sert de **secours** si un fichier généré ne charge pas.

Pour intégrer un nouveau rapport : déposer ses fichiers sous
`data/Données du COR/`, relancer `python3 tools/extract_cor.py`, puis committer
les artefacts régénérés.

> **Honnêteté sur les données** : les chiffres publiés ont été confrontés un par
> un aux fichiers officiels — voir
> [`notes/audit-exactitude-donnees.md`](notes/audit-exactitude-donnees.md).
> Les rares valeurs calculées par le site (conversions en milliards d'euros,
> parts) sont signalées sous le graphique concerné.
>
> Cette vérification n'est plus seulement manuelle : les graphiques lisent les
> fichiers générés, mais les **phrases** portent leurs chiffres en dur.
> `tests/unit/figures.test.mjs` les recalcule tous depuis les données et échoue
> dès qu'un texte et sa source divergent — de sorte qu'un nouveau rapport ne
> peut pas mettre à jour les courbes en laissant les phrases périmées.

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
