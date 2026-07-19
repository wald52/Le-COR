// Tests de fumée : parcours critiques de l'accueil en mode carousel.
// L'accueil est désormais un CardSwipeScreen (cartes swipeables) ; le contenu
// d'origine (sections) sert de contenu aux vues détail, ouvertes au tap.
import { test, expect } from "@playwright/test";

test("le carousel d'accueil se charge avec son titre", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Le COR/i);
  await expect(page.locator(".cs-title")).toHaveText(/Ceci est mon COR/i);
  await expect(page.locator("body.mode-carousel")).toBeAttached();
});

test("le carousel affiche des cartes, des dots et un graphique sur une carte", async ({ page }) => {
  await page.goto("/");
  const cards = page.locator(".cs-track .card");
  await expect(cards).toHaveCount(13);
  await expect(page.locator(".cs-dots .cs-dot")).toHaveCount(13);
  // La carte d'accueil active affiche son image de fond, sans bouton
  // « Voir le détail » ni descriptif (carte de couverture, noDetail)…
  await expect(page.locator(".card.is-active .card-chart--photo img.card-photo")).toBeVisible();
  await expect(page.locator(".card.is-active .card-cta")).toHaveCount(0);
  await expect(page.locator(".card.is-active .card-sub")).toHaveCount(0);
  // …et la carte suivante (« depenses ») un vrai mini-graphique en courbes.
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".card.is-active .card-chart .chart-svg")).toBeVisible();
});

test("la carte « financement » ouvre le Sankey de la structure des ressources (unité + année)", async ({ page }) => {
  // Lien profond : ouvre directement la vue détail de la section financement.
  await page.goto("/#financement");

  await expect(page.locator(".card-detail .cd-sheet")).toBeVisible();
  // Le diagramme de Sankey se trace…
  await expect(page.locator(".cd-body #chart-sankey svg.sankey")).toBeVisible();
  // …avec un sélecteur d'unité (Milliards € / Parts %) et une liste d'années 2004→2025.
  await expect(page.locator(".cd-body #sankey-unit-toggle .unit-btn")).toHaveCount(2);
  await expect(page.locator(".cd-body #sankey-year option")).toHaveCount(22);
  await expect(page.locator("#sankey-year-label")).toHaveText("2025");
  // Par défaut « Parts (%) » : source officielle (aucun calcul).
  await expect(page.locator("#sankey-source")).toContainText(/officielle/i);
  // Passer en « Milliards € » sur une année ≠ 2025 : la source signale un CALCUL.
  await page.locator('.cd-body .unit-btn[data-unit="mds"]').click();
  await page.locator(".cd-body #sankey-year").selectOption("2010");
  await expect(page.locator("#sankey-year-label")).toHaveText("2010");
  await expect(page.locator("#sankey-source")).toContainText(/calcul/i);
});

test("un repli <noscript> est présent dans le document", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("noscript")).toHaveCount(1);
});

test("un lien « Mentions légales » est accessible depuis l'accueil (LCEN/RGPD)", async ({ page }) => {
  await page.goto("/");
  const legal = page.locator('.cs-legal[href*="legal.html"]');
  await expect(legal).toBeVisible();
});

test("le logo/lien « Le Modèle Social Français » est visible sur l'accueil", async ({ page }) => {
  await page.goto("/");
  const ms = page.locator('.ms-logo[href*="linktr.ee"]');
  await expect(ms).toBeVisible();
  await expect(ms).toHaveAttribute("target", "_blank");
  await expect(ms.locator("img.ms-logo-img")).toBeVisible();
});

test("taper la carte active ouvre la vue détail avec son contenu complet", async ({ page }) => {
  await page.goto("/");
  // On va sur la carte « depenses » (la 1re carte est la présentation du site).
  await page.keyboard.press("ArrowRight");
  const active = page.locator('.card.is-active[data-section="depenses"]');
  await expect(active).toBeVisible();
  await active.click();

  const detail = page.locator(".card-detail .cd-sheet");
  await expect(detail).toBeVisible();
  // La première carte = section « depenses » : son graphique phare se redessine.
  await expect(page.locator(".cd-body #chart-pib .chart-svg")).toBeVisible();
  await expect(page.locator(".cd-body .takeaway")).toContainText(/retenir/i);
});

test("la touche Échap ferme la vue détail et restitue le carousel", async ({ page }) => {
  await page.goto("/");
  // On ouvre la vue détail de « depenses ».
  await page.keyboard.press("ArrowRight");
  const active = page.locator('.card.is-active[data-section="depenses"]');
  await expect(active).toBeVisible();
  await active.click();
  await expect(page.locator(".card-detail")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.locator(".card-detail")).toHaveCount(0);
  await expect(page.locator(".card.is-active")).toBeVisible();
  // La section est revenue dans le réservoir caché.
  await expect(page.locator("#story-sections #depenses")).toBeAttached();
});

test("les flèches gauche/droite naviguent entre les cartes", async ({ page }) => {
  await page.goto("/");
  // À la 1re carte : la flèche « précédente » est grisée, la « suivante » active.
  await expect(page.locator(".cs-nav-prev")).toBeDisabled();
  await expect(page.locator(".cs-nav-next")).toBeEnabled();

  const titleBefore = await page.locator(".card.is-active .card-title").textContent();
  await page.locator(".cs-nav-next").click();
  // Après le snap (spring), la carte active a changé et « précédente » s'active.
  await expect
    .poll(async () => page.locator(".card.is-active .card-title").textContent())
    .not.toBe(titleBefore);
  await expect(page.locator(".cs-nav-prev")).toBeEnabled();
});

test("la flèche suivante clignote sur la 1re carte puis s'arrête après navigation", async ({ page }) => {
  await page.goto("/");
  // Au chargement (aucune interaction) : l'indice d'amorçage est actif.
  await expect(page.locator(".cs-nav-next")).toHaveClass(/is-hint/);
  // Une fois la 2e carte atteinte, l'indice disparaît définitivement.
  await page.locator(".cs-nav-next").click();
  await expect(page.locator(".cs-nav-next")).not.toHaveClass(/is-hint/);
});

test("la navigation au clavier change de carte active", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".card.is-active")).toBeVisible();
  const titleBefore = await page.locator(".card.is-active .card-title").textContent();
  await page.keyboard.press("ArrowRight");
  // Après le snap (spring), la carte active a changé.
  await expect
    .poll(async () => page.locator(".card.is-active .card-title").textContent())
    .not.toBe(titleBefore);
});

test("un lien profond (#depenses) ouvre directement la vue détail", async ({ page }) => {
  await page.goto("/#depenses");
  // On arrive DIRECTEMENT sur la description détaillée de la section « dépenses ».
  await expect(page.locator(".card-detail .cd-sheet")).toBeVisible();
  await expect(page.locator(".cd-body #chart-pib .chart-svg")).toBeVisible();
  await expect(page.locator(".cd-body .takeaway")).toContainText(/retenir/i);
  // Fermer (Échap) revient au carousel, sur la carte « dépenses ».
  await page.keyboard.press("Escape");
  await expect(page.locator(".card-detail")).toHaveCount(0);
  await expect(page.locator('.card.is-active[data-section="depenses"]')).toBeVisible();
});

test("sans hash, l'accueil normal se charge (carousel, pas de vue détail)", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".card.is-active")).toBeVisible();
  await expect(page.locator(".card-detail")).toHaveCount(0);
});
