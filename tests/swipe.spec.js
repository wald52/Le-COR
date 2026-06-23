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

  // La 1re carte (intro) n'a pas de vue détail : on ouvre celle de « depenses ».
  await page.keyboard.press("ArrowRight");
  const active = page.locator('.card.is-active[data-section="depenses"]');
  await expect(active).toBeVisible();
  await active.click();
  await expect(page.locator(".card-detail .cd-sheet")).toBeVisible();

  // Glissement franc vers le bas (> 120px, seuil de fermeture) depuis le haut.
  await pointerSwipe(page, ".cd-sheet", { fromY: 80, toY: 360 });

  await expect(page.locator(".card-detail")).toHaveCount(0);
  await expect(page.locator(".card.is-active")).toBeVisible();
  // La page n'a pas rechargé.
  expect(await page.evaluate(() => window.__noReload)).toBe(true);
});

// Dispatch un glissement vertical avec de VRAIS touch events (chemin mobile réel),
// objets Touch inclus — c'est le chemin piloté par touchstart/touchmove/touchend.
async function touchSwipe(page, selector, { fromY, toY, x = 180, steps = 6 }) {
  await page.locator(selector).evaluate((el, args) => {
    const { fromY, toY, x, steps } = args;
    const mk = y => {
      const t = new Touch({ identifier: 1, target: el, clientX: x, clientY: y });
      return { touch: t };
    };
    const fire = (type, y) => {
      const { touch } = mk(y);
      el.dispatchEvent(new TouchEvent(type, {
        bubbles: true, cancelable: true,
        touches: type === "touchend" ? [] : [touch],
        targetTouches: type === "touchend" ? [] : [touch],
        changedTouches: [touch]
      }));
    };
    fire("touchstart", fromY);
    for (let i = 1; i <= steps; i++) {
      fire("touchmove", fromY + ((toY - fromY) * i) / steps);
    }
    fire("touchend", toY);
  }, { fromY, toY, x, steps });
}

test("glisser (touch) vers le bas depuis le détail revient aux cartes", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => { window.__noReload = true; });

  await page.keyboard.press("ArrowRight");
  const active = page.locator('.card.is-active[data-section="depenses"]');
  await expect(active).toBeVisible();
  await active.click();
  await expect(page.locator(".card-detail .cd-sheet")).toBeVisible();

  // Glissement franc vers le bas (> 120px) via de vrais TouchEvent.
  await touchSwipe(page, ".cd-sheet", { fromY: 80, toY: 360 });

  await expect(page.locator(".card-detail")).toHaveCount(0);
  await expect(page.locator(".card.is-active")).toBeVisible();
  expect(await page.evaluate(() => window.__noReload)).toBe(true);
});

test("la feuille suit le doigt pendant le glissement (transform en direct)", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("ArrowRight");
  const active = page.locator('.card.is-active[data-section="depenses"]');
  await expect(active).toBeVisible();
  await active.click();
  await expect(page.locator(".card-detail .cd-sheet")).toBeVisible();

  // On attend la fin de l'animation d'ouverture (WAAPI, fill:both). Sans le
  // freezeOpenAnims, cette animation garderait la priorité sur le style inline et
  // le transform du drag n'aurait AUCUN effet visible → ce test échouerait.
  await page.waitForTimeout(600);

  // touchstart + quelques touchmove SANS touchend : on inspecte en plein geste.
  const ty = await page.locator(".cd-sheet").evaluate(el => {
    const mk = y => new Touch({ identifier: 1, target: el, clientX: 180, clientY: y });
    const fire = (type, y) => el.dispatchEvent(new TouchEvent(type, {
      bubbles: true, cancelable: true,
      touches: [mk(y)], targetTouches: [mk(y)], changedTouches: [mk(y)]
    }));
    fire("touchstart", 80);
    for (let i = 1; i <= 5; i++) fire("touchmove", 80 + i * 12);  // jusqu'à +60px
    // matrix(a, b, c, d, e, f) → f = translateY appliqué.
    const m = new DOMMatrixReadOnly(getComputedStyle(el).transform);
    return m.f;
  });
  // La feuille a bien suivi le doigt vers le bas (translation positive notable).
  expect(ty).toBeGreaterThan(20);

  // On relâche sous le seuil : retour élastique, le détail reste ouvert.
  await page.locator(".cd-sheet").evaluate(el => {
    const t = new Touch({ identifier: 1, target: el, clientX: 180, clientY: 60 });
    el.dispatchEvent(new TouchEvent("touchend", {
      bubbles: true, cancelable: true, touches: [], targetTouches: [], changedTouches: [t]
    }));
  });
  await expect(page.locator(".card-detail")).toBeVisible();
});

test("un petit glissement (touch) ne ferme pas le détail (retour élastique)", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("ArrowRight");
  const active = page.locator('.card.is-active[data-section="depenses"]');
  await expect(active).toBeVisible();
  await active.click();
  await expect(page.locator(".card-detail .cd-sheet")).toBeVisible();

  // Sous le seuil (< 120px) : la feuille revient en place, le détail reste ouvert.
  await touchSwipe(page, ".cd-sheet", { fromY: 80, toY: 150 });

  await expect(page.locator(".card-detail")).toBeVisible();
});

test("un petit glissement vers le bas ne ferme pas le détail (retour élastique)", async ({ page }) => {
  await page.goto("/");
  // La 1re carte (intro) n'a pas de vue détail : on ouvre celle de « depenses ».
  await page.keyboard.press("ArrowRight");
  const active = page.locator('.card.is-active[data-section="depenses"]');
  await expect(active).toBeVisible();
  await active.click();
  await expect(page.locator(".card-detail .cd-sheet")).toBeVisible();

  // Sous le seuil (< 120px) : la feuille revient en place, le détail reste ouvert.
  await pointerSwipe(page, ".cd-sheet", { fromY: 80, toY: 150 });

  await expect(page.locator(".card-detail")).toBeVisible();
});

test("après l'ouverture, la feuille est posée et la carte d'origine restaurée", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("ArrowRight");
  const active = page.locator('.card.is-active[data-section="depenses"]');
  await expect(active).toBeVisible();
  await active.click();
  await expect(page.locator(".card-detail .cd-sheet")).toBeVisible();

  // Fin de l'animation de montée (OPEN_DURATION = 440ms + marge).
  await page.waitForTimeout(600);

  // (a) La feuille est arrivée à destination : translateY ≈ 0 (matrice identité).
  const ty = await page.locator(".cd-sheet").evaluate(
    el => new DOMMatrixReadOnly(getComputedStyle(el).transform).f
  );
  expect(Math.abs(ty)).toBeLessThan(1);

  // (b) Le contenu de la carte active (.card-inner) est restauré (le fondu a été
  // annulé) : opacité pleine, donc la carte sera normale au retour.
  const innerOpacity = await page.locator('.card.is-active .card-inner').evaluate(
    el => getComputedStyle(el).opacity
  );
  expect(innerOpacity).toBe("1");
});

// Dispatch un glissement vertical (pointer events) sur un sélecteur, SANS relâcher
// par défaut → on peut inspecter la feuille en plein geste. `release: true` ajoute
// le pointerup final.
async function pointerDrag(page, selector, { fromY, toY, x = 180, steps = 8, release = true }) {
  await page.locator(selector).evaluate((el, args) => {
    const { fromY, toY, x, steps, release } = args;
    const fire = (type, y) => el.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, pointerId: 1, pointerType: "touch",
      clientX: x, clientY: y
    }));
    fire("pointerdown", fromY);
    for (let i = 1; i <= steps; i++) fire("pointermove", fromY + ((toY - fromY) * i) / steps);
    if (release) fire("pointerup", toY);
  }, { fromY, toY, x, steps, release });
}

test("glisser la carte active vers le haut ouvre le détail (suivi puis confirmation)", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => { window.__noReload = true; });
  await page.keyboard.press("ArrowRight");
  const active = page.locator('.card.is-active[data-section="depenses"]');
  await expect(active).toBeVisible();

  const vh = await page.evaluate(() => window.innerHeight);

  // Glissement vers le HAUT, sans relâcher : la feuille apparaît et SUIT le doigt.
  await pointerDrag(page, '.card.is-active[data-section="depenses"]',
    { fromY: vh - 120, toY: 120, release: false });
  await expect(page.locator(".card-detail .cd-sheet")).toBeVisible();
  const tyMid = await page.locator(".cd-sheet").evaluate(
    el => new DOMMatrixReadOnly(getComputedStyle(el).transform).f
  );
  // La feuille a nettement remonté depuis le bas (translateY < hauteur, > 0).
  expect(tyMid).toBeGreaterThan(0);
  expect(tyMid).toBeLessThan(vh - 200);

  // On relâche au-delà du seuil → confirmation : la feuille se cale en plein écran.
  // Le pointerup doit viser un élément DANS le viewport (la carte) : en usage réel,
  // setPointerCapture le route vers le viewport ; en synthétique, on s'appuie sur le
  // bubbling jusqu'à #card-screen (la feuille de détail, elle, est hors viewport).
  await page.locator('.card.is-active[data-section="depenses"]').evaluate(el =>
    el.dispatchEvent(new PointerEvent("pointerup", {
      bubbles: true, cancelable: true, pointerId: 1, pointerType: "touch", clientX: 180, clientY: 120
    })));
  await page.waitForTimeout(600);
  await expect(page.locator(".card-detail")).toBeVisible();
  const tyEnd = await page.locator(".cd-sheet").evaluate(
    el => new DOMMatrixReadOnly(getComputedStyle(el).transform).f
  );
  expect(Math.abs(tyEnd)).toBeLessThan(1);
  expect(await page.evaluate(() => window.__noReload)).toBe(true);
});

test("taper la carte active ouvre le détail et il RESTE ouvert (clic synthétique neutralisé)", async ({ page }) => {
  // Régression : un TAP émet, après le touchend, un `click` synthétique re-testé
  // sous le doigt. Pendant la montée de la feuille (translateY 100% → 0), seul le
  // voile est sous le doigt au centre → sans garde, ce clic déclenchait la
  // fermeture et le détail se refermait aussitôt (« sursaut »). (NB : un click
  // SOURIS ne reproduit pas le bug — sa cible est la carte, ancêtre commun
  // mousedown/mouseup — d'où l'usage d'un vrai tap tactile ici.)
  await page.goto("/");
  await page.evaluate(() => { window.__noReload = true; });
  await page.keyboard.press("ArrowRight");
  const active = page.locator('.card.is-active[data-section="depenses"]');
  await expect(active).toBeVisible();

  await active.tap();

  // Le détail s'ouvre et NE se referme PAS : feuille posée (translateY ≈ 0).
  await expect(page.locator(".card-detail .cd-sheet")).toBeVisible();
  await page.waitForTimeout(600);
  await expect(page.locator(".card-detail")).toBeVisible();
  const ty = await page.locator(".cd-sheet").evaluate(
    el => new DOMMatrixReadOnly(getComputedStyle(el).transform).f
  );
  expect(Math.abs(ty)).toBeLessThan(1);
  expect(await page.evaluate(() => window.__noReload)).toBe(true);
});

test("un petit glisser LENT vers le haut puis relâcher annule l'ouverture (retour aux cartes)", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("ArrowRight");
  const active = page.locator('.card.is-active[data-section="depenses"]');
  await expect(active).toBeVisible();

  const vh = await page.evaluate(() => window.innerHeight);
  const sel = '.card.is-active[data-section="depenses"]';
  const fire = (type, y) => page.locator(sel).evaluate((el, a) =>
    el.dispatchEvent(new PointerEvent(a.type, {
      bubbles: true, cancelable: true, pointerId: 1, pointerType: "touch", clientX: 180, clientY: a.y
    })), { type, y });

  // Glissement court (< 120px) ET LENT (vraie temporisation entre les moves) : la
  // vélocité reste sous le seuil de « flick », donc le relâcher ANNULE l'ouverture.
  const fromY = vh - 120;
  await fire("pointerdown", fromY);
  for (let i = 1; i <= 5; i++) { await page.waitForTimeout(45); await fire("pointermove", fromY - i * 10); }
  await fire("pointerup", fromY - 50);

  await page.waitForTimeout(500);
  await expect(page.locator(".card-detail")).toHaveCount(0);
  await expect(page.locator(".card.is-active")).toBeVisible();
  // La carte d'origine est restaurée (fondu inline effacé) : opacité pleine.
  const innerOpacity = await page.locator('.card.is-active .card-inner').evaluate(
    el => getComputedStyle(el).opacity
  );
  expect(innerOpacity).toBe("1");
});

test("un bouton 'Revenir à l'accueil' en bas du descriptif ramène aux cartes", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => { window.__noReload = true; });
  await page.keyboard.press("ArrowRight");
  const active = page.locator('.card.is-active[data-section="depenses"]');
  await expect(active).toBeVisible();
  await active.tap();
  await expect(page.locator(".card-detail .cd-sheet")).toBeVisible();
  await page.waitForTimeout(600);   // fin de la montée

  // Le bouton existe DANS la feuille, en bas du contenu (dernier enfant de .cd-body,
  // donc après la <section> du descriptif → atteint seulement après défilement).
  const ret = page.locator(".cd-sheet .cd-body > .cd-return");
  await expect(ret).toHaveCount(1);
  await expect(page.locator(".cd-body > *:last-child")).toHaveClass(/cd-return/);

  // Même fonction que la flèche du haut : on revient aux cartes, sans recharger.
  await ret.click();
  await expect(page.locator(".card-detail")).toHaveCount(0);
  await expect(page.locator(".card.is-active")).toBeVisible();
  expect(await page.evaluate(() => window.__noReload)).toBe(true);
});

test("le graphique de la section est rendu après l'ouverture (rendu différé)", async ({ page }) => {
  // Le rendu des graphiques est DIFFÉRÉ à la fin de l'ouverture (sinon il saccade
  // l'animation, effet « on/off »). On vérifie qu'il a bien eu lieu une fois la
  // feuille arrivée : le SVG de la section « depenses » est présent et tracé.
  await page.goto("/");
  await page.keyboard.press("ArrowRight");
  const active = page.locator('.card.is-active[data-section="depenses"]');
  await expect(active).toBeVisible();
  await active.click();
  await expect(page.locator(".card-detail .cd-sheet")).toBeVisible();

  // Fin de l'animation de montée (OPEN_DURATION = 440ms) + déclenchement du rendu.
  const chart = page.locator(".cd-body svg").first();
  await expect(chart).toBeVisible({ timeout: 2000 });
});
