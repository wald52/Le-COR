// Geste de fermeture par glissement vers le bas (mobile).
// Depuis le descriptif détaillé, tirer vers le bas en haut du contenu doit
// revenir aux cartes — SANS jamais recharger la page (pull-to-refresh natif).
// Le visuel du drag est piloté par des pointer events ; on les reproduit ici.
import { test, expect, devices } from "@playwright/test";

test.use({ ...devices["Pixel 5"] });

// Dispatch un glissement vertical (pointer events) sur un sélecteur.
async function pointerSwipe(page, selector, { fromY, toY, x = 180, steps = 6 }) {
  await page.locator(selector).evaluate((el, args) => {
    const { fromY, toY, x, steps } = args;
    const fire = (type, y) => el.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, pointerId: 1, pointerType: "touch",
      clientX: x, clientY: y
    }));
    fire("pointerdown", fromY);
    for (let i = 1; i <= steps; i++) {
      fire("pointermove", fromY + ((toY - fromY) * i) / steps);
    }
    fire("pointerup", toY);
  }, { fromY, toY, x, steps });
}

test("glisser vers le bas depuis le détail revient aux cartes sans recharger", async ({ page }) => {
  await page.goto("/");
  // Sentinelle : un vrai rechargement effacerait cette variable de window.
  await page.evaluate(() => { window.__noReload = true; });

  await page.locator(".card.is-active").click();
  await expect(page.locator(".card-detail .cd-sheet")).toBeVisible();

  // Glissement franc vers le bas (> 120px, seuil de fermeture) depuis le haut.
  await pointerSwipe(page, ".cd-sheet", { fromY: 80, toY: 360 });

  await expect(page.locator(".card-detail")).toHaveCount(0);
  await expect(page.locator(".card.is-active")).toBeVisible();
  // La page n'a pas rechargé.
  expect(await page.evaluate(() => window.__noReload)).toBe(true);
});

test("un petit glissement vers le bas ne ferme pas le détail (retour élastique)", async ({ page }) => {
  await page.goto("/");
  await page.locator(".card.is-active").click();
  await expect(page.locator(".card-detail .cd-sheet")).toBeVisible();

  // Sous le seuil (< 120px) : la feuille revient en place, le détail reste ouvert.
  await pointerSwipe(page, ".cd-sheet", { fromY: 80, toY: 150 });

  await expect(page.locator(".card-detail")).toBeVisible();
});
