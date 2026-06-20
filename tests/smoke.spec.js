// Tests de fumée : parcours critiques de l'accueil en mode carousel.
// L'accueil est désormais un CardSwipeScreen (cartes swipeables) ; le contenu
// d'origine (sections) sert de contenu aux vues détail, ouvertes au tap.
import { test, expect } from "@playwright/test";

test("le carousel d'accueil se charge avec son titre", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Ceci est mon COR/i);
  await expect(page.locator(".cs-title")).toHaveText(/Ceci est mon COR/i);
  await expect(page.locator("body.mode-carousel")).toBeAttached();
});

test("le carousel affiche des cartes, des dots et un graphique sur la carte active", async ({ page }) => {
  await page.goto("/");
  const cards = page.locator(".cs-track .card");
  await expect(cards).toHaveCount(9);
  await expect(page.locator(".cs-dots .cs-dot")).toHaveCount(9);
  // Le mini-graphique (SVG réel) de la carte active est rendu.
  await expect(page.locator(".card.is-active .card-chart .chart-svg")).toBeVisible();
});

test("un repli <noscript> est présent dans le document", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("noscript")).toHaveCount(1);
});

test("taper la carte active ouvre la vue détail avec son contenu complet", async ({ page }) => {
  await page.goto("/");
  const active = page.locator(".card.is-active");
  await expect(active).toBeVisible();
  await active.click();

  const detail = page.locator(".card-detail .cd-sheet");
  await expect(detail).toBeVisible();
  // La première carte = section « depenses » : son graphique phare se redessine.
  await expect(page.locator(".cd-body #chart-pib .chart-svg")).toBeVisible();
  await expect(page.locator(".cd-body .takeaway")).toContainText(/retenir/i);
});

test("le bouton retour ferme la vue détail et restitue le carousel", async ({ page }) => {
  await page.goto("/");
  await page.locator(".card.is-active").click();
  await expect(page.locator(".card-detail")).toBeVisible();

  await page.getByRole("button", { name: /revenir au carousel/i }).click();
  await expect(page.locator(".card-detail")).toHaveCount(0);
  await expect(page.locator(".card.is-active")).toBeVisible();
  // La section est revenue dans le réservoir caché.
  await expect(page.locator("#story-sections #depenses")).toBeAttached();
});

test("la navigation au clavier change de carte active", async ({ page }) => {
  await page.goto("/");
  await page.locator("#card-screen").focus();
  const titleBefore = await page.locator(".card.is-active .card-title").textContent();
  await page.locator("#card-screen").press("ArrowRight");
  // Après le snap, la carte active a changé.
  await expect
    .poll(async () => page.locator(".card.is-active .card-title").textContent())
    .not.toBe(titleBefore);
});
