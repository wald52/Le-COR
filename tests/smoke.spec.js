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

test("au chargement, aucune carte visible n'est peinte sans son visuel", async ({ page }) => {
  // Régression (ordinateur) : les optimisations Lighthouse avaient repoussé le
  // tracé des minis au premier contact, sur l'hypothèse « aucune voisine n'est
  // visible au repos » — vraie sur mobile, fausse sur un écran large, où le
  // seuil de masquage laisse paraître les cartes 1 et 2. Elles se peignaient
  // blanches (fond .card-bg / .card-chart--photo) puis se remplissaient.
  //
  // On vérifie l'INVARIANT, pas une largeur : toute carte dont la boîte peinte
  // croise le viewport porte son visuel. Le test est donc juste sur les trois
  // projets (bureau 1280 px : cartes 0-2 ; mobile ~390 px : carte 0 seule).
  await page.goto("/");
  await expect(page.locator("body.mode-carousel")).toBeAttached();
  // Aucune interaction : ni clic, ni touche, ni molette — c'est précisément ce
  // qui déclenchait le rattrapage et masquait le défaut.
  const inspect = () => page.evaluate(() =>
    [...document.querySelectorAll(".cs-track .card")]
      .filter(el => getComputedStyle(el).visibility !== "hidden")
      .filter(el => {
        const r = el.getBoundingClientRect();
        return r.right > 0 && r.left < window.innerWidth;
      })
      .map(el => {
        const img = el.querySelector("img.card-photo");
        const hasVisual = !!(
          el.querySelector(".card-chart svg") ||
          el.querySelector(".card-icon") ||
          (img && img.complete && img.naturalWidth > 0)
        );
        return hasVisual ? null : el.dataset.section;
      })
      .filter(Boolean));

  // Le défaut ne se répare pas tout seul (il attend une interaction) : laisser
  // du temps ne masque donc rien, cela absorbe seulement le décodage de l'image.
  await expect.poll(inspect).toEqual([]);
  // …et il y avait bien des cartes à vérifier.
  const count = await page.evaluate(() =>
    [...document.querySelectorAll(".cs-track .card")]
      .filter(el => getComputedStyle(el).visibility !== "hidden")
      .filter(el => {
        const r = el.getBoundingClientRect();
        return r.right > 0 && r.left < window.innerWidth;
      }).length);
  expect(count).toBeGreaterThan(0);
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
  const legal = page.locator('.cs-legal a[href*="legal.html"]');
  await expect(legal).toBeVisible();
});

test("un signalement d'erreur est accessible depuis l'accueil, carousel compris", async ({ page }) => {
  // Le site n'a pas d'autre canal de retour : l'éditeur est anonyme (LCEN
  // art. 6-III-2). Le lien doit rester atteignable dans l'écran carousel, qui
  // recouvre le pied de page du document.
  //
  // Les déclencheurs restent de VRAIS liens vers GitHub : js/report.js les
  // intercepte pour ouvrir le formulaire anonyme, mais sans JavaScript (ou si
  // le script échoue à se charger) le canal de contact demeure. C'est ce repli
  // que le `href` assert ici — il ne doit pas devenir un <button>.
  await page.goto("/");
  const trigger = page.locator(".cs-legal a.report-trigger");
  await expect(trigger).toBeVisible();
  await expect(trigger).toHaveAttribute("href", /issues\/new/);
  await expect(page.locator("body > footer.site-footer a.report-trigger")).toHaveCount(1);
});

// Le service worker précache les données de l'explorateur et les sert depuis
// son cache — hors de portée de `page.route`, qui n'intercepte que le réseau de
// la PAGE. La coupure réseau simulée ci-dessous passait donc à côté environ une
// fois sur six, selon que le SW avait eu le temps de s'activer (WebKit a son
// propre calendrier, d'où un échec cantonné à mobile-webkit). On le neutralise :
// ce test porte sur le rattrapage d'erreur de l'application, pas sur le cache
// hors ligne — celui-ci a son propre fichier, tests/offline.spec.js.
test.describe(() => {
  test.use({ serviceWorkers: "block" });

  test("explorateur : échec de chargement → message + réessai qui aboutit", async ({ page }) => {
    // Les données de l'explorateur (468 Ko) sont chargées paresseusement : sur
    // réseau coupé, la section doit le DIRE et offrir un réessai, au lieu de
    // rester une carte vide.
    let blocked = true;
    // `*` final : l'URL porte un estampillage de version (`?v=…`, cf.
    // tools/stamp-assets.mjs), que le motif doit accepter.
    await page.route("**/cor-explorer.generated.js*", r => (blocked ? r.abort() : r.continue()));
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
  // Le formulaire anonyme vit sur l'accueil : les pages secondaires y renvoient.
  await expect(page.locator('footer.site-footer a[href*="index.html#signaler"]')).toBeVisible();
});

test("la page légale mène au dépôt et au COR (pas de cul-de-sac)", async ({ page }) => {
  await page.goto("/legal.html");
  const footer = page.locator("body > footer.site-footer");
  await expect(footer.locator('a[href$="/Le-COR"]')).toBeVisible();
  // Le signalement ne mène plus à GitHub mais au formulaire anonyme de l'accueil.
  await expect(footer.locator('a[href*="index.html#signaler"]')).toBeVisible();
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

test("simulateur : le levier pensions descend jusqu'à l'extinction (−100 %)", async ({ page }) => {
  // La course du curseur n'est pas bornée par le calibrage COR (−16,3 %) : on
  // doit pouvoir aller jusqu'au bout, pension nulle comprise. Ce test verrouille
  // à la fois la borne et le redimensionnement (200 crans ÷ 2 = 100,0 %).
  await page.goto("/#simulateur");
  const pen = page.locator(".cd-body #lv-pen");
  await expect(pen).toHaveAttribute("max", "200");
  await pen.fill("200");
  await pen.dispatchEvent("input");
  await expect(page.locator(".cd-body #lv-pen-out")).toHaveText("−100,0 %");
  await expect(pen).toHaveAttribute("aria-valuetext", "−100,0 %");
  await expect(page.locator(".cd-body #lv-pen-note")).toHaveText(/45,3 % → 0 %$/);
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

test("sur téléphone, le logo partenaire ne mord jamais sur le texte de l'en-tête", async ({ page }) => {
  // Régression (signalée sur Galaxy S8+, 360 px) : la pastille du coq est en
  // `position:absolute` en haut à droite, donc invisible au flux — le sur-titre
  // et le titre, centrés sur toute la largeur, passaient DESSOUS. Mesuré à
  // l'époque : 39 px de recouvrement sur le titre à 320 px, et le sur-titre
  // touché jusqu'à ~500 px de large. `.cs-head` réserve désormais la gouttière
  // `--ms-logo-gutter` des deux côtés.
  //
  // On vérifie l'INVARIANT (aucune intersection) sur les largeurs de téléphone
  // courantes, pas une valeur de police : les tailles suivent `clamp()`.
  for (const width of [320, 360, 390, 412, 430, 540]) {
    await page.setViewportSize({ width, height: 740 });
    await page.goto("/");
    await expect(page.locator(".ms-logo")).toBeVisible();

    const hit = await page.evaluate(() => {
      const logo = document.querySelector(".ms-logo").getBoundingClientRect();
      // La pastille « 🔗 » déborde de 6 px en haut et à droite du lien.
      const zone = { left: logo.left - 6, right: logo.right + 6, top: logo.top - 6, bottom: logo.bottom + 6 };
      return [".cs-kicker", ".cs-title"]
        .map((sel) => {
          const range = document.createRange();
          range.selectNodeContents(document.querySelector(sel));
          const t = range.getBoundingClientRect();      // boîte du TEXTE peint
          const overlap =
            Math.max(0, Math.min(t.right, zone.right) - Math.max(t.left, zone.left)) *
            Math.max(0, Math.min(t.bottom, zone.bottom) - Math.max(t.top, zone.top));
          return overlap > 0 ? sel : null;
        })
        .filter(Boolean);
    });
    expect(hit, `chevauchement à ${width} px`).toEqual([]);
  }
});

test("sur écran court, la carte tient entière dans la piste (jamais rognée)", async ({ page }) => {
  // Régression (repérée sur le profil « Nest Hub », 1024×600, de la console
  // Chrome) : la carte a une hauteur fixe de 520 px et `.cs-viewport` est en
  // overflow:hidden — sous ~651 px de hauteur de fenêtre, elle était donc
  // amputée en haut et en bas (26 px de chaque côté à 600 px de haut). Le
  // symptôme n'a rien de propre au Nest Hub : toute fenêtre de bureau basse
  // le produit. La piste porte désormais un facteur d'échelle (`--cs-fit`).
  //
  // On vérifie l'INVARIANT (la carte active est contenue dans la piste), pas
  // une valeur d'échelle : elle se déduit de la hauteur réellement disponible.
  for (const [width, height] of [
    [1024, 600],   // Nest Hub
    [1280, 560],   // fenêtre de bureau volontairement basse
    [1440, 650],   // portable 1440×900 avec chrome du navigateur et barre de favoris
    [1280, 800],   // Nest Hub Max : aucune réduction attendue
    [393, 851],    // téléphone en portrait : aucune réduction attendue
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await expect(page.locator(".card.is-active")).toBeVisible();

    const m = await page.evaluate(() => {
      const vp = document.querySelector(".cs-viewport").getBoundingClientRect();
      const c = document.querySelector(".card.is-active").getBoundingClientRect();
      return { over: Math.max(vp.top - c.top, c.bottom - vp.bottom), h: c.height };
    });
    // Tolérance d'un pixel : la piste est mise à l'échelle, les bords tombent
    // sur des fractions de pixel.
    expect(m.over, `carte rognée en ${width}×${height}`).toBeLessThanOrEqual(1);
    expect(m.h, `carte trop petite en ${width}×${height}`).toBeGreaterThan(300);
  }
});

test("sur écran court, un swipe suit le doigt malgré la piste réduite", async ({ page }) => {
  // La conversion pixels → unités de carte du drag doit tenir compte de
  // l'échelle de la piste : sinon les cartes avancent plus vite que le doigt
  // (1/0,9 ≈ 11 % de trop à 1024×600). On mesure le déplacement RÉEL de la
  // carte d'accueil pendant un glissement de 100 px, doigt toujours posé.
  await page.setViewportSize({ width: 1024, height: 600 });
  await page.goto("/");
  await expect(page.locator(".card.is-active")).toBeVisible();

  const left = () =>
    page.locator('.card[data-index="0"]').evaluate((el) => el.getBoundingClientRect().left);
  const before = await left();
  await page.mouse.move(512, 300);
  await page.mouse.down();
  await page.mouse.move(412, 300, { steps: 10 });
  // Le carrousel n'écrit dans le DOM qu'au rythme de l'écran : il calcule sa
  // position à chaque `pointermove`, mais ne pose la transform qu'une fois par
  // frame (cf. `scheduleDraw` dans js/cards.js). On laisse donc passer une frame
  // avant de mesurer, sinon on lit la position d'AVANT le geste — ce que faisait
  // WebKit, qui exécute son `requestAnimationFrame` plus tard que Chromium.
  await page.evaluate(
    () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  const moved = before - (await left());
  await page.mouse.up();

  // ±10 px : la carte change aussi d'échelle et d'inclinaison en s'éloignant du
  // centre, ce que sa boîte englobante intègre.
  expect(Math.abs(moved - 100)).toBeLessThan(10);
});

/* ---------------------------------------------------------------------------
 * Sources cliquables.
 * Les phrases « Source : … » nommaient leur document sans y conduire ; elles
 * sont désormais reliées au registre COR_DATA.documents au moment du rendu.
 * ------------------------------------------------------------------------ */

test("chaque source de graphique conduit au document officiel", async ({ page }) => {
  await page.goto("/#depenses");
  const lien = page.locator('.cd-body .chart-source a[href^="https://www.cor-retraites.fr/"]').first();
  await expect(lien).toBeVisible();
  await expect(lien).toHaveAttribute("target", "_blank");
  await expect(lien).toHaveAttribute("rel", /noopener/);
  // Le libellé du lien est le texte cité, pas une URL brute.
  await expect(lien).toHaveText(/rapports? /i);
});

test("la source dit le classeur et l'onglet, sans repère technique visible", async ({ page }) => {
  // renderChartPngBlob recopie `.chart-source` via textContent : la queue de
  // précision part donc dans l'image partagée — c'est voulu, l'image se suffit
  // alors à elle-même. Ce qui ne doit JAMAIS s'y glisser, c'est un repère
  // technique du genre « nouvel onglet » : celui-là passe par aria-label.
  await page.goto("/#deficit");
  const src = page.locator(".cd-body figure.chart-card:has(#chart-ciseaux) .chart-source");
  await expect(src).toHaveText(
    "Source : COR, rapport annuel 2026 — données officielles (scénario de référence). " +
      "Classeur « Données juin 2026 – synthèse », onglet « Solde dépenses ressources »."
  );
  await expect(src).not.toContainText("nouvel onglet");
});

test("la queue de précision mène au classeur exact et à la page de la figure", async ({ page }) => {
  await page.goto("/#financement");
  const detail = page.locator(".cd-body #sankey-source .src-detail");
  await expect(detail).toContainText("Données juin 2026 - partie 2");
  await expect(detail).toContainText("Fig 2.11");
  // Un vrai classeur officiel, pas la page d'accueil du rapport.
  await expect(detail.locator('a[href$=".xlsx"]')).toHaveCount(1);
  // …et le renvoi de page ouvre le PDF officiel à la figure.
  const lienPage = detail.locator('a[href*="#page="]');
  await expect(lienPage).toHaveCount(1);
  await expect(lienPage).toHaveText(/^rapport p\. \d+$/);
});

test("aucune page n'est inventée quand l'onglet ne porte pas de numéro de figure", async ({ page }) => {
  // « Dépenses_OCDE » n'est pas une figure numérotée : le PDF n'en donne pas la
  // page. Mieux vaut pas de page qu'une page devinée — un renvoi faux enverrait
  // le lecteur sur la mauvaise figure, ce qui est pire que rien.
  await page.goto("/#monde");
  const detail = page.locator(".cd-body .chart-source .src-detail");
  await expect(detail).toContainText("Dépenses_OCDE");
  await expect(detail).not.toContainText("p. ");
  await expect(detail.locator('a[href*="#page="]')).toHaveCount(0);
});

test("la bibliographie « Méthode & sources » liste des documents joignables", async ({ page }) => {
  await page.goto("/#methode");
  const liens = page.locator(".cd-body #sources-list li a");
  // La bibliographie est rendue en temps mort (staticSteps) : attendre le
  // premier lien avant de compter, sinon on compte une liste encore vide.
  await expect(liens.first()).toBeVisible();
  expect(await liens.count()).toBeGreaterThanOrEqual(20);
  for (const href of await liens.evaluateAll(as => as.map(a => a.href))) {
    expect(href).toMatch(/^https:\/\//);
  }
  await expect(liens.first()).toHaveAttribute("target", "_blank");
});

test("explorateur : la source est cliquable et ne s'accumule pas d'un indicateur à l'autre", async ({ page }) => {
  await page.goto("/#explorer");
  const src = page.locator(".cd-body #exp-source");
  await expect(src.locator("a").first()).toBeVisible();
  const avant = await src.locator("a").count();
  const puces = page.locator(".cd-body #explorer-indicators .exp-chip");
  await puces.nth(1).click();
  await expect(src).toContainText("Source");
  // Changer d'indicateur reconstruit la phrase : pas d'empilement de liens.
  expect(await src.locator("a").count()).toBeLessThanOrEqual(avant + 3);
});

test("Sankey : les liens ne s'empilent pas d'une année à l'autre", async ({ page }) => {
  await page.goto("/#financement");
  const src = page.locator(".cd-body #sankey-source");
  // Trois liens, un par rôle : le rapport cité dans la phrase, le classeur, la
  // page de la figure. C'est le compte attendu — pas un lien fourre-tout.
  const compte = async () => ({
    rapport: await src.locator('a[href*="/rapports-du-cor/"]').count(),
    classeur: await src.locator('a[href$=".xlsx"]').count(),
    page: await src.locator('a[href*="#page="]').count(),
  });
  expect(await compte()).toEqual({ rapport: 1, classeur: 1, page: 1 });
  // Changer d'année reconstruit la phrase : le compte doit être identique, pas
  // doublé (régression classique d'un rendu qui ajoute au lieu de remplacer).
  await page.locator(".cd-body #sankey-year .cor-select__btn").click();
  await page.locator('.cd-body #sankey-year [role="option"][data-value="2010"]').click();
  await expect(page.locator("#sankey-year-label")).toHaveText("2010");
  expect(await compte()).toEqual({ rapport: 1, classeur: 1, page: 1 });
});
