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
  // La carte d'accueil active affiche son image de fond et son pitch, mais
  // pas de bouton « Voir le détail » (carte de couverture, noDetail)…
  await expect(page.locator(".card.is-active .card-chart--photo img.card-photo")).toBeVisible();
  await expect(page.locator(".card.is-active .card-sub")).toBeVisible();
  await expect(page.locator(".card.is-active .card-cta")).toHaveCount(0);
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
  await expect(page.locator('.cd-body #sankey-year [role="option"]')).toHaveCount(22);
  await expect(page.locator("#sankey-year-label")).toHaveText("2025");
  // Par défaut « Parts (%) » : source officielle (aucun calcul).
  await expect(page.locator("#sankey-source")).toContainText(/officielle/i);
  // Passer en « Milliards € » sur une année ≠ 2025 : la source signale un CALCUL.
  await page.locator('.cd-body .unit-btn[data-unit="mds"]').click();
  await page.locator(".cd-body #sankey-year .cor-select__btn").click();
  await page.locator('.cd-body #sankey-year [role="option"][data-value="2010"]').click();
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

test("explorateur : échec de chargement → message + réessai qui aboutit", async ({ page }) => {
  // Les données de l'explorateur (468 Ko) sont chargées paresseusement : sur
  // réseau coupé, la section doit le DIRE et offrir un réessai, au lieu de
  // rester une carte vide.
  let blocked = true;
  await page.route("**/cor-explorer.generated.js", r => (blocked ? r.abort() : r.continue()));
  await page.goto("/#explorer");

  await expect(page.locator("#exp-label")).toHaveText(/indisponibles/i);
  const action = page.locator("#toast:not([hidden]) #toast-action");
  await expect(action).toHaveText(/Réessayer/i);

  // Le toast doit rester CLIQUABLE au-dessus de la feuille détail (z-index).
  blocked = false;
  await action.click();
  await expect(page.locator("#explorer-themes .exp-tab").first()).toBeVisible();
  await expect(page.locator("#exp-label")).not.toHaveText(/indisponibles/i);
});

test("le pied de page survit au montage du carousel (repli sans JS / LCEN)", async ({ page }) => {
  await page.goto("/");
  // Placé hors de <main>, il n'est PAS déplacé dans le réservoir caché
  // (#story-sections) : il reste dans le document, simplement recouvert par
  // l'écran carousel. C'est le seul chemin vers legal.html sans JavaScript.
  const footer = page.locator("body > footer.site-footer");
  await expect(footer).toBeAttached();
  await expect(footer.locator('a[href*="legal.html"]')).toHaveCount(1);
  await expect(page.locator("#story-sections footer.site-footer")).toHaveCount(0);
});

test("la page 404 renvoie vers l'accueil et les mentions légales", async ({ page }) => {
  await page.goto("/404.html");
  await expect(page.locator("h1")).toHaveText(/n'existe pas/i);
  await expect(page.locator('.nf-actions a[href="./"]')).toBeVisible();
  await expect(page.locator('footer.site-footer a[href*="legal.html"]')).toBeVisible();
});

test("la page légale mène au dépôt et au COR (pas de cul-de-sac)", async ({ page }) => {
  await page.goto("/legal.html");
  const footer = page.locator("body > footer.site-footer");
  await expect(footer.locator('a[href*="github.com"]')).toBeVisible();
  await expect(footer.locator('a[href*="cor-retraites.fr"]')).toBeVisible();
  // Pas de lien vers la page courante.
  await expect(footer.locator('a[href*="legal.html"]')).toHaveCount(0);
});

test("simulateur : les curseurs annoncent leur valeur en clair (aria-valuetext)", async ({ page }) => {
  // Les curseurs portent des ENTIERS d'un pas arbitraire : 24 crans = +2,4 pt.
  // Sans aria-valuetext, le lecteur d'écran annonce « 24 ». Le contrat testé
  // ici est que l'attribut dise TOUJOURS la même chose que la valeur à l'écran.
  await page.goto("/#simulateur");

  // Contrat : pour chaque levier, aria-valuetext == le texte affiché à côté.
  const sameAsDisplayed = async () => {
    for (const k of ["age", "cot", "pen"]) {
      const spoken = await page.locator(`.cd-body #lv-${k}`).getAttribute("aria-valuetext");
      const shown = (await page.locator(`.cd-body #lv-${k}-out`).textContent()).trim();
      expect(spoken, `levier ${k}`).toBe(shown);
    }
  };

  await sameAsDisplayed();
  const cot = page.locator(".cd-body #lv-cot");
  await cot.fill("24");
  await cot.dispatchEvent("input");
  // 24 crans = +2,4 pt : sans l'attribut, le lecteur d'écran annoncerait « 24 ».
  await expect(page.locator(".cd-body #lv-cot-out")).toHaveText("+2,4 pt");
  await expect(cot).toHaveAttribute("aria-valuetext", "+2,4 pt");
  await sameAsDisplayed();
});

test("simulateur : le verdict de la jauge est une région vivante", async ({ page }) => {
  // Le résultat du simulateur se réécrit sans déplacer le focus : sans
  // aria-live, bouger un curseur ne produit AUCUNE annonce.
  await page.goto("/#simulateur");
  const gauge = page.locator(".cd-body #gauge-msg");
  await expect(gauge).toHaveAttribute("aria-live", "polite");
  await expect(gauge).toHaveAttribute("aria-atomic", "true");
  await page.locator(".cd-body #lv-age").fill("12");
  await page.locator(".cd-body #lv-age").dispatchEvent("input");
  await expect(gauge).toContainText(/comblé à/i);
});

test("explorateur : le titre du graphique est une région vivante", async ({ page }) => {
  // Cliquer une puce remplace titre + description et redessine le graphique,
  // sans bouger le focus : le changement doit être annoncé.
  await page.goto("/#explorer");
  const cap = page.locator(".cd-body #explorer figcaption.chart-title");
  await expect(cap).toHaveAttribute("aria-live", "polite");
  await expect(cap).toHaveAttribute("aria-atomic", "true");
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

test("bulle du haut : cliquer sur le libellé « Cliquez pour revenir » ferme le descriptif", async ({ page }) => {
  // Régression (ordinateur) : à la 1re ouverture, la pilule est déployée avec
  // son libellé. Replier la pilule au pointerdown la faisait glisser hors du
  // curseur avant le pointerup → aucun `click` synthétisé → l'action ne partait
  // pas. On clique donc précisément sur le LIBELLÉ (partie droite de la
  // pilule), le point qui reproduisait le bug.
  await page.goto("/");
  await page.keyboard.press("ArrowRight");
  const active = page.locator('.card.is-active[data-section="depenses"]');
  await expect(active).toBeVisible();
  await active.click();
  await expect(page.locator(".card-detail .cd-sheet")).toBeVisible();

  // Attend le déploiement de la pilule (startBackHint, ~480 ms) puis la fin de
  // la transition de largeur (.4 s) pour cliquer sur une pilule stable.
  await expect(page.locator(".cd-back")).toHaveClass(/is-shown/);
  await page.waitForTimeout(450);

  // Clic « humain » : pression maintenue ~300 ms vers le bout droit du libellé.
  // Un clic synthétique instantané ne reproduit PAS le bug (la pilule n'a pas
  // le temps de se replier entre down et up) ; avec une durée de pression
  // réaliste, la pilule repliée au pointerdown glissait hors du curseur avant
  // le pointerup et le `click` était perdu.
  const box = await page.locator(".cd-back-label").boundingBox();
  await page.mouse.move(box.x + box.width - 8, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(300);
  await page.mouse.up();
  await expect(page.locator(".card-detail")).toHaveCount(0);
  await expect(page.locator(".card.is-active")).toBeVisible();
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

test("un lien profond ouvre la feuille en haut, titre de section lisible", async ({ page }) => {
  // Régression : la <section> ciblée est déplacée dans .cd-sheet (conteneur
  // défilant) ; le navigateur y appliquait ensuite son « défilement jusqu'au
  // fragment », alignant le haut de la section sur celui de la feuille — le titre
  // passait derrière la bulle de retour collante et devenait illisible.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#realite");
  const sheet = page.locator(".card-detail .cd-sheet");
  await expect(sheet).toBeVisible();

  // La feuille est bien en haut de course…
  await expect.poll(async () => sheet.evaluate(el => el.scrollTop)).toBe(0);
  // …et le titre de la section, une fois la feuille montée, commence SOUS la bulle
  // de retour et sous le bord haut de l'écran (on interroge en boucle : l'ouverture
  // est animée, les positions ne sont stables qu'à la fin de la montée).
  const back = page.locator(".cd-back");
  const h2 = page.locator(".cd-body #realite h2");
  await expect(h2).toBeVisible();
  await expect
    .poll(async () => {
      const backBox = await back.boundingBox();
      const h2Box = await h2.boundingBox();
      return h2Box.y > 0 && h2Box.y >= backBox.y + backBox.height;
    })
    .toBe(true);

  // Arrivée par lien : la bulle nomme le site pour qui n'a jamais vu l'accueil.
  await expect(back).toHaveClass(/is-deep/);
  await expect(back).toContainText("Ceci est mon COR");
});

test("ouverte depuis le carousel, la bulle garde l'indice de retour habituel", async ({ page }) => {
  await page.goto("/");
  // 1re carte = couverture sans détail : on passe à « depenses » puis on l'ouvre.
  await page.keyboard.press("ArrowRight");
  await expect(page.locator('.card.is-active[data-section="depenses"]')).toBeVisible();
  await page.locator(".card.is-active").click();
  const back = page.locator(".cd-back");
  await expect(back).toBeVisible();
  await expect(back).not.toHaveClass(/is-deep/);
  await expect(back).toContainText(/revenir à l'accueil/i);
});

test("sans hash, l'accueil normal se charge (carousel, pas de vue détail)", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".card.is-active")).toBeVisible();
  await expect(page.locator(".card-detail")).toHaveCount(0);
});

test("le graphique est re-tracé quand la largeur de la fenêtre change", async ({ page }) => {
  // Régression : le registre des graphiques tracés n'était jamais alimenté, si
  // bien que le gestionnaire « resize » ne re-traçait RIEN. Après une rotation,
  // chaque SVG gardait la mise en page calculée pour l'ancienne largeur (marges
  // d'axes, seuil « étroit ») et le viewBox se contentait de l'étirer.
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/#depenses");
  const svg = page.locator(".cd-body #chart-pib .chart-svg");
  await expect(svg).toBeVisible();
  const before = await svg.getAttribute("viewBox");

  await page.setViewportSize({ width: 420, height: 900 });
  // Le re-rendu est débattu (200 ms) après le dernier événement resize.
  await expect.poll(async () => svg.getAttribute("viewBox")).not.toBe(before);
});

test("changer d'unité régénère l'image téléchargeable du graphique", async ({ page }) => {
  // Régression : le PNG mis en cache par carte n'était invalidé qu'au
  // redimensionnement. Après un passage en « Milliards € », le bouton
  // Télécharger/Partager livrait encore l'image en % du PIB.
  await page.goto("/#depenses");
  const card = page.locator(".cd-body .chart-card").first();
  await expect(card.locator(".chart-svg")).toBeVisible();
  // Cache initial prêt (généré en temps mort à l'ouverture du détail).
  await expect.poll(async () => card.evaluate(el => !!(el.__png && el.__png.blob))).toBe(true);
  const sizeBefore = await card.evaluate(el => el.__png.blob.size);

  await page.locator('.cd-body .unit-btn[data-unit="eur"]').click();
  await expect(page.locator(".cd-body #pib-unit-note")).toBeVisible();
  // Le cache est régénéré : un nouveau blob, rendu depuis le SVG en Md€.
  await expect.poll(async () => card.evaluate(el => !!(el.__png && el.__png.blob))).toBe(true);
  const sizeAfter = await card.evaluate(el => el.__png.blob.size);
  expect(sizeAfter).not.toBe(sizeBefore);
});

test("le focus entre dans la vue détail puis revient à la carte à la fermeture", async ({ page }) => {
  // La feuille est une boîte de dialogue modale et l'accueil passe en
  // aria-hidden : laisser le focus sur la carte le rendrait invisible aux
  // lecteurs d'écran, et la tabulation parcourrait l'arrière-plan.
  await page.goto("/");
  await page.keyboard.press("ArrowRight");
  const active = page.locator('.card.is-active[data-section="depenses"]');
  await expect(active).toBeVisible();
  await active.focus();
  await page.keyboard.press("Enter");

  const sheet = page.locator(".card-detail .cd-sheet");
  await expect(sheet).toBeVisible();
  await expect.poll(async () =>
    page.evaluate(() => !!document.activeElement.closest(".cd-sheet"))).toBe(true);
  // La tabulation reste enfermée dans la feuille.
  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => !!document.activeElement.closest(".cd-sheet"))).toBe(true);

  await page.keyboard.press("Escape");
  await expect(page.locator(".card-detail")).toHaveCount(0);
  // Le focus est rendu à la carte qui a ouvert le détail.
  await expect.poll(async () =>
    page.evaluate(() => document.activeElement.dataset && document.activeElement.dataset.section))
    .toBe("depenses");
});

test("double-clic sur une carte : la description détaillée reste visible", async ({ page }) => {
  // Régression (ordinateur) : au 1er clic le détail s'ouvre et la feuille monte ;
  // ~130 ms plus tard, le 2e clic d'un double-clic tombe sur la feuille et amorce
  // un drag (freezeOpenAnims). Un commitStyles() précoce figeait alors le fondu
  // d'entrée du corps à opacité ~0 → description « totalement blanche ». Le corps
  // doit rester pleinement visible.
  await page.goto("/");
  await page.keyboard.press("ArrowRight");
  const active = page.locator('.card.is-active[data-section="depenses"]');
  await expect(active).toBeVisible();

  const box = await active.boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.click(cx, cy);
  await page.waitForTimeout(130);
  await page.mouse.click(cx, cy);

  const body = page.locator(".card-detail .cd-body");
  await expect(body).toBeVisible();
  await expect
    .poll(async () => Number(await body.evaluate((el) => getComputedStyle(el).opacity)))
    .toBeGreaterThan(0.9);
});
