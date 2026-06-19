// Tests de fumée : parcours critiques du site. Vérifient que la page se charge,
// que les graphiques se construisent au défilement, et que les fonctions
// ajoutées (lien d'évitement, partage de section, export CSV) fonctionnent.
import { test, expect } from "@playwright/test";

test("la page d'accueil se charge avec son titre principal", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Ceci est mon COR/i);
  await expect(page.locator("h1")).toContainText(/chiffres du COR/i);
  // L'accroche d'origine reste présente, désormais dans le chapô.
  await expect(page.locator(".lede")).toContainText(/COR change-t-il/i);
});

test("le lien d'évitement apparaît au focus clavier", async ({ page }) => {
  await page.goto("/");
  const skip = page.getByRole("link", { name: "Aller au contenu" });
  await expect(skip).toBeAttached();
  await page.keyboard.press("Tab");
  await expect(skip).toBeFocused();
});

test("un repli <noscript> est présent dans le document", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("noscript")).toHaveCount(1);
});

test("le graphique phare se construit au défilement", async ({ page }) => {
  await page.goto("/");
  await page.locator("#depenses").scrollIntoViewIfNeeded();
  await expect(page.locator("#chart-pib .chart-svg")).toBeVisible();
  // Description accessible exposée par le SVG.
  await expect(page.locator("#chart-pib .chart-svg")).toHaveAttribute("role", "img");
});

test("le tableau de données propose le téléchargement CSV", async ({ page }) => {
  await page.goto("/");
  const card = page.locator("#depenses .chart-card");
  await card.scrollIntoViewIfNeeded();
  await expect(card.locator(".chart-svg")).toBeVisible();

  // Le bouton CSV vit dans le tableau replié : on ouvre d'abord « Voir les données ».
  await card.locator("summary.data-toggle").click();
  const csvBtn = card.getByRole("button", { name: /télécharger les données/i });
  await expect(csvBtn).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    csvBtn.click()
  ]);
  expect(download.suggestedFilename()).toMatch(/\.csv$/);
});

test("le bouton de partage d'une section copie son lien d'ancre", async ({ page }) => {
  await page.goto("/");
  const section = page.locator("#methode");
  await section.scrollIntoViewIfNeeded();
  await section.locator("h2").hover();
  await section.locator(".anchor-link").click();
  await expect(page.locator("#toast")).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain("#methode");
});

test("la navigation principale pointe vers les sections", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Le déficit" }).click();
  await expect(page).toHaveURL(/#deficit$/);
});
