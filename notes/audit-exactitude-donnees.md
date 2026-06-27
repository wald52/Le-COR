# Audit d'exactitude des données — site vs rapports du COR

> Vérification des chiffres **publiés sur le site** par rapport aux **sources
> officielles** (fichiers Excel des rapports annuels du COR rangés sous
> `data/Données du COR/`). Réalisé le 2026-06-27.

## Méthode

1. **Reproductibilité des fichiers générés.** Réexécution de
   `python3 tools/extract_cor.py` (qui lit les Excel officiels) puis comparaison
   au fichier commité.
2. **Vérification cellule par cellule.** Pour chaque série affichée, ouverture de
   la feuille Excel d'origine et comparaison des valeurs aux années clés.
3. **Audit des valeurs saisies à la main** (`data/data.js`) et des **chiffres
   narratifs** codés en dur dans `index.html`, `js/cards.js` et `notes/`.

Rappel d'architecture : le site affiche en priorité `window.COR_SERIES`
(fichiers `data/*.generated.js`, **extraits automatiquement** des Excel), et
n'utilise `window.COR_DATA` (`data/data.js`, **saisi à la main**) que pour
`productivite`, `fiscalisation`, `hypothesesTable`, `macro` — le reste de
`data.js` ne sert que de **secours** si le fichier généré ne charge pas.

## Résultat global

**Toutes les données effectivement affichées sont exactes** par rapport aux
sources officielles du COR. Vérifications concordantes :

| Élément vérifié | Source officielle | Statut |
|---|---|---|
| Dépenses en % du PIB — série observée 2002→2025 | synthèse 2026, feuille « Dépenses en % » | ✔ exact |
| Dépenses en % du PIB — projection 2070 par millésime | idem (ligne « Sc. Ref ») | ✔ exact |
| Solde 2070 par rapport (+0,9 % en 2022 → −2,4 % en 2026) | feuilles « Solde » 2016→2026 | ✔ exact |
| Ressources vs dépenses 2070 (12,9 % vs 15,3 %) | synthèse 2026 | ✔ exact |
| Niveau de vie relatif 2070 (83 / 87 / 90 %) | feuilles niveau de vie 2023→2026 | ✔ exact |
| Fécondité observée + hypothèse centrale 1,45 (2026) | partie 1 2026, Fig 1.1 | ✔ exact |
| Solde migratoire +150 000/an (2026) | partie 1 2026, Fig 1.2 | ✔ exact |
| Chômage de référence 7 % | partie 1 2026, Fig 1.11 | ✔ exact |
| Productivité — scénarios 0,4 / 0,7 / 1,0 % (réf. 0,7 %) 2025-2026 | « Hypothèses de salaires, prix et PIB » 2025 | ✔ exact |
| Fiscalisation ITAF+CSG : 52,2 / 54,5 / 62,2 / 64,7 Md€ | feuilles « Tab 2.2 » 2023→2026 | ✔ exact |
| Structure des ressources 2025 (422,2 Md€ ; 65,6 / 15,3 / 13,5 / 5,6 %) | partie 2 2026, Tab 2.2 | ✔ exact |
| Comparaison internationale (France 14,3 %, 2ᵉ derrière l'Italie, 2021) | synthèse 2026, dépenses OCDE | ✔ exact |
| Leviers d'équilibrage 2070 (≈ +3 ans, +5,6 pts, −16 % pension) | partie 2 2026, Fig 2.24 (col. 2070) | ✔ exact |
| Tableau de bord des hypothèses (2019→2026) | rapports annuels concernés | ✔ exact |

La **note ressources** (`notes/ressources-retraites-financements-publics.md`)
et tous les **chiffres des textes** (titres, encadrés « Ce qu'il faut retenir »)
ont également été confrontés aux Excel : aucun écart.

## Correction appliquée

Seule inexactitude trouvée : dans `data/data.js`, les **projections
`depensesPib`** (couche de secours, **non affichée** tant que le fichier généré
charge) portaient des extrémités 2070 et des `endNote` **périmées**, antérieures
à la mise en place de l'extraction automatique :

| Projection | 2070 affiché (secours, faux) | 2070 officiel (corrigé) |
|---|---|---|
| 2019 | ≈13,6 % | **13,0 %** |
| 2021 | ≈12,1 % | **12,3 %** |
| 2022 | ≈12,4 % | **12,8 %** |
| 2023 | ≈13,5 % | **13,0 %** |
| 2024 | ≈13,6 % | **13,2 %** |
| 2025 | ≈14,2 % | 14,2 % (déjà exact) |
| 2026 | ≈15,3 % | 15,3 % (déjà exact) |

Les courbes de secours ont été réalignées sur les valeurs officielles
(échantillonnées depuis `window.COR_SERIES`), de sorte qu'un éventuel repli
affiche désormais les mêmes chiffres que le graphique principal.

## Reproductibilité

`tools/extract_cor.py` régénère `data/cor-series.generated.js` **à l'identique**.
Pour `data/cor-explorer.generated.js`, **toutes les valeurs de données sont
identiques** ; une seule différence cosmétique subsiste sur un indicateur
(`df_beneficiaires` : ordre des clés et bornes d'axe recalculées), sans effet sur
les chiffres. Fichier laissé tel quel pour éviter une modification non
substantielle.

## Note d'outillage

La configuration ESLint a été étendue pour couvrir les scripts Node de `tools/`
(globaux `__dirname`, `console`…) afin que `npm run lint` passe ; ces scripts ne
sont pas livrés au navigateur.
