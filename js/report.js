/*
 * Formulaire de signalement anonyme.
 *
 * Avant, « Signaler une erreur » menait au formulaire d'issue de GitHub : il
 * fallait un compte pour dire qu'un chiffre était faux, et l'on quittait le
 * site. Ici, le signalement se remplit sur place et part vers un petit relais
 * (Cloudflare Worker, cf. worker/) qui ouvre l'issue publique à la place du
 * visiteur — sans compte, sans adresse, sans identification.
 *
 * Repli assumé : les déclencheurs restent de VRAIS liens vers GitHub. Sans
 * JavaScript, ou si ce fichier échoue à se charger, le canal de contact exigé
 * par les mentions légales (LCEN art. 6-III-2) reste ouvert — on n'a rien
 * enlevé, on a seulement intercepté.
 */
(function () {
  "use strict";

  const TURNSTILE_SRC =
    "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=__corTurnstileReady";

  /* ----------------------------------------------------------------------
   * Éléments et état.
   * -------------------------------------------------------------------- */

  const modal = document.getElementById("report-modal");
  const form = document.getElementById("report-form");
  if (!modal || !form) return;

  /* ----------------------------------------------------------------------
   * Configuration — lue sur la modale elle-même (`data-endpoint`,
   * `data-sitekey`), renseignée dans index.html au moment du déploiement du
   * relais. Marche à suivre : worker/README.md.
   *
   * Pourquoi dans le HTML plutôt qu'en dur ici : ces deux valeurs y voisinent
   * la directive `connect-src` de la CSP, qu'il faut mettre à jour en même
   * temps — un seul fichier à toucher, donc aucune chance d'en oublier une.
   * -------------------------------------------------------------------- */

  const REPORT_ENDPOINT = modal.dataset.endpoint || "";
  const TURNSTILE_SITEKEY = modal.dataset.sitekey || "";

  // Tant que ces deux valeurs sont vides, le formulaire n'est pas branché : les
  // liens continuent de mener à GitHub, exactement comme avant. C'est ce qui
  // permet de livrer le code AVANT d'avoir créé le compte Cloudflare, sans
  // jamais laisser le visiteur devant un formulaire qui n'aboutirait pas.
  const CONFIGURED = Boolean(REPORT_ENDPOINT && TURNSTILE_SITEKEY);

  const els = {
    type: document.getElementById("report-type"),
    section: document.getElementById("report-section"),
    desc: document.getElementById("report-desc"),
    count: document.getElementById("report-count"),
    hp: document.getElementById("report-website"),
    captcha: document.getElementById("report-turnstile"),
    status: document.getElementById("report-status"),
    submit: document.getElementById("report-submit"),
    fields: document.getElementById("report-fields"),
    done: document.getElementById("report-done"),
    doneLink: document.getElementById("report-done-link"),
  };

  let openedAt = 0;        // Horodatage d'ouverture → délai de saisie.
  let turnstileToken = ""; // Jeton fourni par le captcha.
  let widgetId = null;     // Identifiant du widget rendu (pour le réinitialiser).
  let turnstileLoading = false;
  let sending = false;

  /* ----------------------------------------------------------------------
   * Captcha : chargé À LA DEMANDE, et seulement à la première ouverture.
   *
   * Le charger au démarrage de la page ajouterait un script tiers au chemin
   * critique de CHAQUE visite, pour une fonctionnalité qu'une infime minorité
   * utilise. Ici, un visiteur qui ne signale rien ne télécharge rien.
   * -------------------------------------------------------------------- */

  function renderTurnstile() {
    if (widgetId !== null || !window.turnstile || !els.captcha) return;
    widgetId = window.turnstile.render(els.captcha, {
      sitekey: TURNSTILE_SITEKEY,
      language: "fr",
      callback: token => { turnstileToken = token; },
      "expired-callback": () => { turnstileToken = ""; },
      "error-callback": () => {
        turnstileToken = "";
        setStatus("La vérification anti-robot n'a pas pu se charger.", "error");
      },
    });
  }

  function loadTurnstile() {
    if (!CONFIGURED || widgetId !== null || turnstileLoading) return;
    if (window.turnstile) { renderTurnstile(); return; }
    turnstileLoading = true;
    // Le script Turnstile appelle ce rappel global une fois prêt (render=explicit).
    window.__corTurnstileReady = renderTurnstile;
    const s = document.createElement("script");
    s.src = TURNSTILE_SRC;
    s.async = true;
    s.defer = true;
    s.onerror = () => {
      turnstileLoading = false;
      setStatus("La vérification anti-robot n'a pas pu se charger.", "error");
    };
    document.head.appendChild(s);
  }

  /* ----------------------------------------------------------------------
   * Ouverture / fermeture — même contrat que la vue agrandie des graphiques
   * (openZoom dans js/app.js) : mémorisation du déclencheur, <dialog> natif
   * (focus piégé et Échap gérés par le navigateur), défilement bloqué.
   * -------------------------------------------------------------------- */

  /** Devine la section consultée pour pré-remplir le formulaire. */
  function currentSection() {
    const active = document.querySelector(".cs-card.is-active, .card.is-active");
    const id = (active && (active.dataset.section || active.dataset.id)) || "";
    if (id) return id;
    const hash = location.hash.replace(/^#/, "");
    return hash && hash !== "signaler" ? hash : "";
  }

  function openReport(trigger) {
    if (modal.open) return;
    resetForm();
    els.section.value = currentSection();
    modal.__opener = trigger || document.activeElement;
    modal.showModal();
    document.body.style.overflow = "hidden";
    openedAt = Date.now();
    loadTurnstile();
  }

  function resetForm() {
    form.reset();
    turnstileToken = "";
    sending = false;
    els.fields.hidden = false;
    els.done.hidden = true;
    els.submit.disabled = false;
    els.submit.textContent = "Envoyer le signalement";
    setStatus("", "");
    updateCount();
    if (widgetId !== null && window.turnstile) window.turnstile.reset(widgetId);
  }

  function setStatus(message, kind) {
    els.status.textContent = message;
    els.status.className = kind ? `report-status is-${kind}` : "report-status";
    els.status.hidden = !message;
  }

  function updateCount() {
    const n = els.desc.value.length;
    els.count.textContent = `${n} / 2000`;
    els.count.classList.toggle("is-over", n > 2000);
  }

  /* ----------------------------------------------------------------------
   * Envoi.
   * -------------------------------------------------------------------- */

  async function submit(event) {
    // TOUJOURS en premier : la politique de sécurité du site interdit toute
    // soumission native de formulaire (`form-action 'none'`). L'envoi passe
    // exclusivement par fetch().
    event.preventDefault();
    if (sending) return;

    const description = els.desc.value.trim();
    if (description.length < 10) {
      setStatus("Merci de décrire l'erreur en quelques mots (10 caractères minimum).", "error");
      els.desc.focus();
      return;
    }
    if (description.length > 2000) {
      setStatus("La description dépasse 2 000 caractères.", "error");
      els.desc.focus();
      return;
    }
    if (!navigator.onLine) {
      setStatus("Vous semblez hors connexion. Réessayez une fois de retour en ligne.", "error");
      return;
    }
    if (!turnstileToken) {
      setStatus("Vérification anti-robot en cours… réessayez dans un instant.", "error");
      loadTurnstile();
      return;
    }

    sending = true;
    els.submit.disabled = true;
    els.submit.textContent = "Envoi…";
    setStatus("Envoi du signalement…", "");

    try {
      const res = await fetch(REPORT_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: els.type.value,
          description,
          section: els.section.value.trim(),
          page: location.href.split("#")[0],
          elapsedMs: Date.now() - openedAt,
          website: els.hp.value,       // champ-piège : doit rester vide
          turnstile: turnstileToken,
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok && data.ok) {
        showSuccess(data.url);
        return;
      }
      setStatus(data.error || "Le signalement n'a pas pu être envoyé.", "error");
    } catch {
      setStatus(
        "Envoi impossible — vérifiez votre connexion, ou passez par le lien GitHub ci-dessous.",
        "error",
      );
    } finally {
      sending = false;
      els.submit.disabled = false;
      els.submit.textContent = "Envoyer le signalement";
      // Un jeton Turnstile n'est valable qu'une fois.
      turnstileToken = "";
      if (widgetId !== null && window.turnstile) window.turnstile.reset(widgetId);
    }
  }

  function showSuccess(url) {
    els.fields.hidden = true;
    els.done.hidden = false;
    setStatus("", "");
    if (url) {
      els.doneLink.href = url;
      els.doneLink.hidden = false;
    } else {
      els.doneLink.hidden = true;
    }
    els.done.focus();
    if (window.CORApp && window.CORApp.toast) {
      window.CORApp.toast("Signalement transmis. Merci !");
    }
  }

  /* ----------------------------------------------------------------------
   * Câblage.
   * -------------------------------------------------------------------- */

  // Les déclencheurs restent des liens vers GitHub : on n'intercepte que si le
  // formulaire est réellement branché, et jamais les clics « ouvrir dans un
  // nouvel onglet » (clic du milieu, Ctrl/⌘ enfoncé), qui doivent garder le
  // comportement attendu d'un lien.
  document.querySelectorAll(".report-trigger").forEach(link => {
    link.addEventListener("click", e => {
      if (!CONFIGURED) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
      e.preventDefault();
      openReport(link);
    });
  });

  form.addEventListener("submit", submit);
  els.desc.addEventListener("input", updateCount);

  document.querySelectorAll("[data-report-close]").forEach(btn => {
    btn.addEventListener("click", () => modal.close());
  });

  // Clic sur le fond → fermeture (même geste que la vue agrandie).
  modal.addEventListener("click", e => { if (e.target === modal) modal.close(); });

  modal.addEventListener("close", () => {
    document.body.style.overflow = "";
    if (modal.__opener && modal.__opener.focus) modal.__opener.focus();
    modal.__opener = null;
  });

  // Lien profond « #signaler » : c'est ce qui permet aux pages légale et 404 de
  // renvoyer ici sans dupliquer le formulaire.
  if (location.hash === "#signaler") {
    if (CONFIGURED) {
      // Le hash est retiré aussitôt : un rechargement ne rouvre pas la modale.
      history.replaceState(null, "", location.pathname + location.search);
      openReport(null);
    } else {
      // Relais pas encore déployé : on ne laisse pas le visiteur sur un accueil
      // où il ne s'est rien passé. Il est conduit là où il allait avant, c'est-
      // à-dire au formulaire d'issue de GitHub — le canal de contact exigé par
      // la LCEN reste donc joignable en un clic depuis toutes les pages.
      const repli = document.querySelector('.report-fallback a[href*="issues/new"]');
      if (repli) location.replace(repli.href);
    }
  }
})();
