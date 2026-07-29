/*
 * Service worker : l'instantané hors-ligne est COMPLET et COHÉRENT.
 *
 * Le scénario visé est celui de l'avion : on a visité le site une fois, on perd
 * le réseau, on recharge. Le piège n'est pas la page d'accueil — elle est
 * précachée depuis toujours — mais tout ce que la page charge TARDIVEMENT : les
 * données de l'explorateur (468 Ko, chargées à l'ouverture de la carte) et les
 * photos des cartes. Sous l'ancienne stratégie « réseau d'abord » pour tout, le
 * cache était un patchwork de fichiers datant de moments différents ; ces
 * chargements tardifs pouvaient donc ramener une génération dépareillée, ou
 * rien du tout. Ce test vérifie qu'après un rechargement hors ligne, la page
 * complète — chargements tardifs compris — vient bien du cache.
 */
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// La liste de précache que tools/stamp-assets.mjs a écrite dans sw.js : c'est la
// définition même de « la génération », donc ce que le cache doit contenir. On
// lit le seul bloc généré — ailleurs, sw.js cite « ./index.html » (repli de
// navigation), qui n'est pas une entrée de la liste.
const ASSETS = [...precacheBlock().matchAll(/"(\.\/[^"]*)"/g)].map(m => m[1]);

function precacheBlock() {
  const sw = readFileSync(join(root, "sw.js"), "utf8");
  const block = sw.match(/const ASSETS = \[([\s\S]*?)\];/);
  if (!block) throw new Error("sw.js : liste de précache introuvable.");
  return block[1];
}

// Chromium seulement : Playwright n'émule pas la coupure réseau de la même
// façon sur tous les moteurs, et le reste de la suite couvre déjà WebKit pour
// l'interaction. Ce qu'on teste ici — précache et arbitrage du service worker —
// ne dépend d'aucune particularité de moteur.
test.skip(({ browserName }) => browserName !== "chromium", "service worker : Chromium suffit");

test("hors ligne, un rechargement sert la génération complète, chargements tardifs compris", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready);

  // Le précache s'exécute pendant l'installation, hors du chemin critique : on
  // attend qu'il ait fini avant de couper le réseau, sinon on testerait une
  // course, pas la stratégie.
  await expect
    .poll(
      () => page.evaluate(urls => Promise.all(urls.map(u => caches.match(u).then(Boolean))).then(r => r.filter(Boolean).length), ASSETS),
      { timeout: 30_000, message: "le précache du service worker n'a pas abouti" },
    )
    .toBe(ASSETS.length);

  await context.setOffline(true);
  await page.reload();

  // 1. Le document lui-même : le carousel est monté, donc le HTML et les
  //    scripts de la génération ont tous été servis.
  await expect(page.locator(".card").first()).toBeVisible();

  // 2. Une photo de carte — chargée seulement à l'ouverture de la carte, donc
  //    jamais demandée lors du premier passage en ligne au-delà de la première.
  await expect(page.locator("img.card-photo").first()).toHaveJSProperty("complete", true);
  expect(await page.locator("img.card-photo").first().evaluate(img => img.naturalWidth)).toBeGreaterThan(0);

  // 3. Le chargement tardif le plus lourd : les données de l'explorateur. C'est
  //    le cas qui échouait auparavant — la carte restait vide et muette.
  //    `goto` puis `reload` : poser le hash depuis la même page ne serait qu'une
  //    navigation même-document, qui ne rejouerait pas le chargement.
  await page.goto("/#explorer");
  await page.reload();
  await expect(page.locator("#explorer-themes .exp-tab").first()).toBeVisible();
  await expect(page.locator("#exp-label")).not.toHaveText(/indisponibles/i);
});

test("hors ligne, une URL inconnue retombe sur l'accueil plutôt que sur l'erreur du navigateur", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect
    .poll(() => page.evaluate(() => caches.match("./index.html").then(Boolean)), { timeout: 30_000 })
    .toBe(true);

  await context.setOffline(true);
  await page.goto("/une-page-qui-nexiste-pas");
  await expect(page.locator(".card").first()).toBeVisible();
});
