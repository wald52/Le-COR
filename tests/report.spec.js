/*
 * Formulaire de signalement anonyme (index.html, js/report.js).
 *
 * Ce que ces tests protègent : le formulaire est le canal de contact du site,
 * et il est ouvert à tous. Trois choses doivent tenir, qu'aucune ne se voit à
 * l'œil nu sur la page déployée :
 *   1. le repli — sans configuration du relais, ou sans JavaScript, le lien
 *      vers GitHub doit rester intact (LCEN art. 6-III-2) ;
 *   2. le champ-piège doit rester invisible ET hors du parcours clavier, sinon
 *      il piège les visiteurs au lieu des robots ;
 *   3. un échec d'envoi doit être DIT, avec la porte de sortie vers GitHub —
 *      un signalement perdu en silence est pire que pas de formulaire.
 *
 * Le relais et le captcha sont simulés : ces tests ne dépendent d'aucun compte
 * Cloudflare et tournent hors ligne.
 */
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const ENDPOINT = "https://relais-de-test.workers.dev/report";
const SITEKEY = "cle-de-test";

/**
 * Sert l'accueil avec le relais configuré.
 *
 * En production ces deux valeurs sont écrites dans index.html au moment du
 * déploiement (cf. worker/README.md) ; ici on les injecte à la volée pour
 * tester le formulaire sans dépendre d'un compte Cloudflare.
 */
async function serveConfigured(page) {
  // Le service worker doit rester HORS du chemin. Sous WebKit il ré-émet les
  // requêtes lui-même, et Playwright ne sait pas router ce qui part d'un service
  // worker : les leurres ci-dessous étaient purement et simplement contournés,
  // le navigateur allait chercher le vrai script Turnstile chez Cloudflare, et
  // les deux tests qui ont besoin d'un jeton échouaient — en dépendant du réseau,
  // alors que l'en-tête de ce fichier promet l'inverse. On sert donc un worker
  // vide. Le service worker lui-même est éprouvé par tests/offline.spec.js.
  await page.route(/\/sw\.js/, route =>
    route.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
  const html = readFileSync(join(root, "index.html"), "utf8")
    .replace('data-endpoint="" data-sitekey=""', `data-endpoint="${ENDPOINT}" data-sitekey="${SITEKEY}"`)
    // La CSP doit autoriser le relais, exactement comme en production : sans
    // cette substitution, le navigateur bloquerait l'envoi et les tests
    // vérifieraient un faux échec. C'est aussi ce qui garantit que le
    // placeholder `connect-src` d'index.html reste bien celui qu'on remplace.
    .replace("https://le-cor-signalement.REMPLACER.workers.dev", "https://relais-de-test.workers.dev");
  await page.route("http://127.0.0.1:8000/", route =>
    route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: html }),
  );
}

/**
 * Remplace le script Turnstile par un faux qui valide immédiatement.
 * Le vrai widget est une iframe tierce : injoignable en test, et ce n'est pas
 * Cloudflare que l'on veut éprouver ici mais notre propre enchaînement.
 *
 * On coupe TOUT le domaine de Cloudflare, et par expression régulière plutôt que
 * par glob. L'ancien motif `…/turnstile/v0/api.js*` laissait passer deux
 * requêtes : le glob ne couvrait pas la chaîne de requête sous WebKit, et le
 * script se recharge de toute façon depuis une URL versionnée
 * (`/turnstile/v0/b/<hachage>/api.js`) que ce chemin ne décrit pas. Le vrai
 * widget était donc chargé pour de bon, et refusait la clé de test (erreur
 * 400020) : les deux tests qui ont besoin d'un jeton échouaient sur le seul
 * projet `mobile-webkit`, en dépendant du réseau par-dessus le marché. Couper le
 * domaine entier rend le scénario hermétique, comme annoncé en tête de fichier.
 */
async function stubTurnstile(page) {
  await page.route(/challenges\.cloudflare\.com/, route =>
    route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: `
        window.turnstile = {
          render: (el, opts) => { opts.callback("jeton-de-test"); return "widget-1"; },
          reset: () => {},
          remove: () => {},
        };
        if (window.__corTurnstileReady) window.__corTurnstileReady();
      `,
    }),
  );
}

/** Intercepte l'appel au relais. `handler` reçoit la route et la charge utile. */
async function stubEndpoint(page, handler) {
  await page.route(ENDPOINT, route => handler(route, JSON.parse(route.request().postData() || "{}")));
}

async function openModal(page) {
  await page.locator(".cs-legal a.report-trigger").click();
  await expect(page.locator("#report-modal")).toBeVisible();
}

/* ------------------------------------------------------------------------ */

test("sans relais configuré, le lien mène toujours à GitHub", async ({ page }) => {
  // État du dépôt tant que le Worker n'est pas déployé : le formulaire est
  // livré mais inerte, et le visiteur garde un canal de contact qui marche.
  await page.goto("/");
  const trigger = page.locator(".cs-legal a.report-trigger");
  await expect(trigger).toHaveAttribute("href", /github\.com.*issues\/new/);
  await expect(page.locator("#report-modal")).toBeHidden();
});

test("sans relais configuré, « #signaler » ne laisse pas le visiteur en plan", async ({ page }) => {
  // Les pages légale et 404 renvoient vers ce lien : il doit conduire quelque
  // part, même avant le déploiement du relais — sinon le canal de contact
  // exigé par la LCEN devient un cul-de-sac pour ces deux pages.
  await page.route("https://github.com/**", route =>
    route.fulfill({ status: 200, contentType: "text/html", body: "<p>GitHub</p>" }),
  );
  await page.goto("/#signaler");
  await expect(page).toHaveURL(/github\.com.*issues\/new/);
});

test("le formulaire s'ouvre sur place, sans quitter le site", async ({ page }) => {
  await serveConfigured(page);
  await stubTurnstile(page);
  await page.goto("/");
  await openModal(page);

  // Le cœur de la demande : on reste sur l'accueil.
  expect(page.url()).not.toContain("github.com");
  await expect(page.locator("#report-desc")).toBeVisible();
  // L'avertissement de publicité du message doit être là AVANT la saisie.
  await expect(page.locator(".report-intro")).toContainText(/publié/i);
});

test("Échap ferme le formulaire et rend le focus au lien d'origine", async ({ page }) => {
  await serveConfigured(page);
  await stubTurnstile(page);
  await page.goto("/");
  await openModal(page);

  await page.keyboard.press("Escape");
  await expect(page.locator("#report-modal")).toBeHidden();
  await expect(page.locator(".cs-legal a.report-trigger")).toBeFocused();
});

test("le champ-piège est invisible et hors du parcours clavier", async ({ page }) => {
  await serveConfigured(page);
  await stubTurnstile(page);
  await page.goto("/");
  await openModal(page);

  const piege = page.locator("#report-website");
  // Rejeté hors de l'écran plutôt que `display:none`, que certains robots
  // savent repérer — donc « hors du champ de vision », pas « absent du rendu ».
  await expect(piege).not.toBeInViewport();
  await expect(piege).toHaveAttribute("tabindex", "-1");
  // Un visiteur au clavier ne doit jamais l'atteindre : il resterait vide chez
  // les humains, ce qui est exactement le signal recherché.
  await page.locator("#report-desc").focus();
  await page.keyboard.press("Tab");
  await expect(piege).not.toBeFocused();
});

test("un signalement valide part au relais et confirme la réception", async ({ page }) => {
  await serveConfigured(page);
  await stubTurnstile(page);

  let recu = null;
  await stubEndpoint(page, (route, payload) => {
    recu = payload;
    route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, url: "https://github.com/wald52/Le-COR/issues/7", number: 7 }),
    });
  });

  await page.goto("/");
  await openModal(page);
  await page.locator("#report-desc").fill("Le chiffre de 2035 ne correspond pas au rapport cité.");
  // Le relais rejette les envois trop rapides pour un humain (piège à robots) :
  // on laisse passer le délai minimal.
  await page.waitForTimeout(4200);
  await page.locator("#report-submit").click();

  await expect(page.locator("#report-done")).toBeVisible();
  await expect(page.locator("#report-done-link")).toHaveAttribute("href", /issues\/7/);

  expect(recu).toBeTruthy();
  expect(recu.description).toContain("2035");
  expect(recu.website).toBe("");           // champ-piège resté vide
  expect(recu.elapsedMs).toBeGreaterThan(4000);
  expect(recu.turnstile).toBe("jeton-de-test");
});

test("une description trop courte est refusée avant tout envoi", async ({ page }) => {
  await serveConfigured(page);
  await stubTurnstile(page);

  let appele = false;
  await stubEndpoint(page, route => {
    appele = true;
    route.fulfill({ status: 201, contentType: "application/json", body: '{"ok":true}' });
  });

  await page.goto("/");
  await openModal(page);
  await page.locator("#report-desc").fill("court");
  await page.locator("#report-submit").click();

  await expect(page.locator("#report-status")).toContainText(/10 caractères/i);
  expect(appele, "aucune requête ne doit partir").toBe(false);
});

test("un échec d'envoi est annoncé, avec le repli GitHub sous la main", async ({ page }) => {
  await serveConfigured(page);
  await stubTurnstile(page);
  await stubEndpoint(page, route => route.abort());

  await page.goto("/");
  await openModal(page);
  await page.locator("#report-desc").fill("Une description valide pour éprouver l'échec réseau.");
  await page.waitForTimeout(4200);
  await page.locator("#report-submit").click();

  await expect(page.locator("#report-status")).toContainText(/impossible/i);
  // La porte de sortie doit rester visible : le signalement n'est pas perdu.
  await expect(page.locator('.report-fallback a[href*="issues/new"]')).toBeVisible();
});

test("le lien « #signaler » ouvre le formulaire sans casser le carousel", async ({ page }) => {
  // C'est par ce lien que la page légale et la 404 renvoient ici.
  await serveConfigured(page);
  await stubTurnstile(page);
  await page.goto("/#signaler");

  await expect(page.locator("#report-modal")).toBeVisible();
  // Le carousel doit être monté normalement derrière la modale.
  await expect(page.locator("body.mode-carousel")).toBeAttached();
  await expect(page.locator(".cs-track .card")).toHaveCount(13);
  // Le hash est retiré : un rechargement ne rouvre pas le formulaire.
  expect(page.url()).not.toContain("#signaler");
});
