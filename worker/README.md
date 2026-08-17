# Worker de signalement anonyme

Ce dossier contient le **seul maillon serveur** du projet. Le site étant
entièrement statique (GitHub Pages), il ne peut rien recevoir : ce petit
programme, hébergé gratuitement chez Cloudflare, reçoit le formulaire
« Signaler une erreur » et ouvre l'issue GitHub à la place du visiteur.

Résultat : **aucun compte GitHub n'est nécessaire** pour signaler une erreur, et
le visiteur reste anonyme — c'est le jeton du Worker qui écrit, pas lui.

Ce dossier n'est **jamais publié** sur le site (`rm -rf worker` dans
`.github/workflows/pages.yml`).

---

## Ce qu'il faut avoir sous la main

- Un compte Cloudflare (gratuit, sans carte bancaire) ;
- un accès au dépôt GitHub `wald52/Le-COR` ;
- Node.js installé (pour la commande `wrangler`).

Comptez une vingtaine de minutes la première fois. Les valeurs à noter au fil de
l'eau sont signalées par 📝.

---

## 1. Créer le captcha Turnstile

Turnstile est l'anti-robot de Cloudflare : invisible dans la quasi-totalité des
cas (pas de cases à cocher, pas de photos de feux tricolores) et sans cookie de
traçage.

1. Ouvrir <https://dash.cloudflare.com/> → **Turnstile** → **Add widget**.
2. Nom : `Le COR — signalement`. Domaine : `wald52.github.io`.
3. Mode : **Managed**.
4. Valider. Deux clés s'affichent :
   - 📝 la **Site Key** (publique — elle ira dans le code du site) ;
   - 📝 la **Secret Key** (privée — elle ne quitte jamais Cloudflare).

## 2. Créer le jeton GitHub

Le jeton donne au Worker le droit d'ouvrir des issues, **et rien d'autre**.

1. GitHub → **Settings** → **Developer settings** → **Personal access tokens** →
   **Fine-grained tokens** → **Generate new token**.
2. **Repository access** : *Only select repositories* → **Le-COR** uniquement.
3. **Permissions** → *Repository permissions* → **Issues** : `Read and write`.
   Ne rien cocher d'autre.
4. **Expiration** : choisir la durée souhaitée. 📝 **Noter la date d'expiration**
   dans un agenda : le formulaire cessera de fonctionner ce jour-là, et il
   faudra simplement régénérer un jeton et rejouer l'étape 4.
5. Générer. 📝 Copier le jeton (il n'est affiché qu'une fois).

## 3. Installer wrangler et créer l'espace de stockage

`wrangler` est l'outil en ligne de commande de Cloudflare.

```bash
npm install -g wrangler
wrangler login          # ouvre le navigateur pour autoriser l'accès
cd worker
wrangler kv namespace create REPORT_RL
```

La dernière commande affiche un identifiant. 📝 Le recopier dans
`wrangler.toml`, à la place de `REMPLACER_PAR_ID_KV`.

Cet espace ne sert qu'à compter les envois par tranche horaire, sous forme
d'empreintes anonymes qui expirent d'elles-mêmes en moins de 25 heures.

## 4. Déposer les trois secrets

```bash
wrangler secret put GITHUB_TOKEN       # le jeton de l'étape 2
wrangler secret put TURNSTILE_SECRET   # la Secret Key de l'étape 1
wrangler secret put IP_SALT            # une longue chaîne aléatoire, inventée
```

`IP_SALT` est le « sel » qui rend les empreintes d'adresses IP irréversibles.
Pour en générer une : `openssl rand -hex 32`.

## 5. Déployer

```bash
wrangler deploy
```

📝 Noter l'URL affichée, de la forme
`https://le-cor-signalement.<votre-compte>.workers.dev`.

## 6. Créer l'étiquette GitHub

Sur GitHub → **Issues** → **Labels** → **New label** : `signalement-anonyme`.
(L'API la créerait automatiquement, mais autant choisir sa couleur et sa
description : « Signalement envoyé depuis le formulaire du site, contenu non
vérifié ».)

## 7. Brancher le site

Tout se passe dans **`index.html`**, et nulle part ailleurs : les trois valeurs
y sont voisines, donc aucune chance d'en oublier une. (`js/report.js` ne
contient aucune URL ni aucune clé : il les lit sur la modale.)

**a.** Sur la balise `<dialog id="report-modal">`, renseigner les deux
attributs, aujourd'hui vides :

```html
<dialog id="report-modal" class="report-modal" aria-labelledby="report-title"
        data-endpoint="https://le-cor-signalement.<compte>.workers.dev/report"
        data-sitekey="0x4AAA…">
```

- `data-endpoint` : l'URL du Worker notée à l'étape 5, **terminée par `/report`** ;
- `data-sitekey` : la **Site Key** de l'étape 1 (la publique).

**b.** Dans la balise `Content-Security-Policy`, en tête de page, remplacer
`le-cor-signalement.REMPLACER.workers.dev` par l'hôte réel du Worker, dans la
directive `connect-src` — la même URL que ci-dessus, **sans `/report`**. Sans
cela le navigateur bloquera l'envoi.

Tant que `data-endpoint` ou `data-sitekey` reste vide, le formulaire n'est pas
branché : les liens « Signaler une erreur » mènent à GitHub comme auparavant.
C'est volontaire — aucun visiteur ne se retrouve devant un formulaire qui
n'aboutirait pas.

**c.** Régénérer les fichiers minifiés et les estampilles de version :

```bash
npm run build:min
```

et committer le résultat.

---

## Vérifier que tout marche

Depuis un terminal, une requête venue d'ailleurs que du site doit être refusée :

```bash
curl -i -X POST https://le-cor-signalement.<compte>.workers.dev/report \
  -H 'Origin: https://exemple-malveillant.test' \
  -H 'Content-Type: application/json' \
  -d '{"type":"autre","description":"test","elapsedMs":9000}'
# → HTTP/1.1 403
```

Avec la bonne origine mais sans jeton de captcha valide :

```bash
curl -i -X POST https://le-cor-signalement.<compte>.workers.dev/report \
  -H 'Origin: https://wald52.github.io' \
  -H 'Content-Type: application/json' \
  -d '{"type":"autre","description":"un test de signalement","elapsedMs":9000}'
# → HTTP/1.1 403 (« Vérification anti-robot échouée »)
```

Enfin, un vrai signalement depuis <https://wald52.github.io/Le-COR/> doit créer
une issue portant l'étiquette `signalement-anonyme` — et **sans aucune adresse
IP** dans son contenu.

## Essais en local

Turnstile fournit des clés de test qui acceptent toujours :

- Site Key : `1x00000000000000000000AA`
- Secret Key : `1x0000000000000000000000000000000AA`

```bash
cd worker
wrangler dev --var ALLOWED_ORIGIN:http://127.0.0.1:8000
```

Puis, dans une autre console, `npm run serve` à la racine, et pointer
temporairement, dans `index.html`, `data-endpoint` sur
`http://127.0.0.1:8787/report` et `data-sitekey` sur la Site Key de test
ci-dessus — en ajoutant `http://127.0.0.1:8787` à `connect-src`, faute de quoi
le navigateur bloquera l'envoi. **Penser à remettre les valeurs de production
avant de committer** : rien ne le vérifie à votre place.

Sans espace KV en local, la limitation de débit est simplement inactive : le
reste de la chaîne (origine, pièges à robots, validation, captcha) fonctionne.

---

## Ce que le Worker vérifie, dans l'ordre

| # | Contrôle | Réponse si échec |
|---|---|---|
| 1 | Origine dans la liste blanche | 403 sans en-têtes CORS |
| 2 | Corps ≤ 10 Ko | 413 |
| 3 | Champ-piège (invisible) resté vide | **200 factice** |
| 4 | Au moins 4 s entre l'ouverture et l'envoi | **200 factice** |
| 5 | Champs valides (type connu, description 10–2 000 car., ≤ 3 liens, page du site) | 400 |
| 6 | ≤ 3 envois/heure par appareil, ≤ 40/jour au total | 429 |
| 7 | Captcha Turnstile validé | 403 |
| 8 | Création de l'issue | 502 |

Les contrôles 3 et 4 répondent un **faux succès** : un robot qui reçoit une
erreur explicite apprend ce qui l'a trahi et corrige sa prochaine tentative.

Le texte du visiteur est inséré dans l'issue en bloc de citation, avec tous les
caractères Markdown neutralisés : impossible de notifier des comptes
(`@quelqu'un`), de rattacher de fausses références ou d'injecter du HTML.
