/*
 * Défenses du relais de signalement anonyme (worker/worker.js).
 *
 * Ce que ces tests protègent : le formulaire de signalement est ouvert à tous,
 * sans compte ni identification. C'est exactement ce qui le rend attaquable —
 * spam de masse, injection Markdown dans une issue publique, fuite de l'adresse
 * IP du visiteur dans un contenu public. Chaque assertion ci-dessous fige une
 * de ces défenses ; aucune n'est visible à l'œil nu dans le site déployé.
 *
 * Le Worker n'a aucune dépendance : il tourne tel quel sous Node 22, où
 * `Request`, `Response` et `crypto.subtle` sont natifs. Seuls `fetch` (appels à
 * Turnstile et à GitHub) et l'espace KV sont simulés.
 */
import test from "node:test";
import assert from "node:assert/strict";

import worker, { validatePayload, buildIssue, escapeMarkdown } from "../../worker/worker.js";

const ORIGIN = "https://wald52.github.io";
const PAGE = "https://wald52.github.io/Le-COR/";

/** Espace KV en mémoire, suffisant pour les compteurs (pas de TTL simulé). */
function fakeKV() {
  const store = new Map();
  return {
    store,
    async get(key) {
      return store.has(key) ? store.get(key) : null;
    },
    async put(key, value) {
      store.set(key, value);
    },
  };
}

/**
 * Remplace `fetch` le temps d'un test.
 * @param {object} opts - `turnstileOk`, et la réponse de création d'issue.
 * @returns {{calls: Array, restore: Function}}
 */
function stubFetch({ turnstileOk = true, issueOk = true } = {}) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init, body: init.body });
    if (String(url).includes("siteverify")) {
      return new Response(JSON.stringify({ success: turnstileOk }), { status: 200 });
    }
    if (String(url).includes("api.github.com")) {
      return issueOk
        ? new Response(
            JSON.stringify({ html_url: `${ORIGIN}/Le-COR/issues/42`, number: 42 }),
            { status: 201 },
          )
        : new Response("{}", { status: 500 });
    }
    throw new Error(`Appel réseau inattendu : ${url}`);
  };
  return { calls, restore: () => (globalThis.fetch = original) };
}

function makeEnv(overrides = {}) {
  return {
    ALLOWED_ORIGIN: ORIGIN,
    GITHUB_REPO: "wald52/Le-COR",
    GITHUB_TOKEN: "jeton-de-test",
    TURNSTILE_SECRET: "secret-de-test",
    IP_SALT: "sel-de-test",
    REPORT_RL: fakeKV(),
    ...overrides,
  };
}

function makeRequest(body, { origin = ORIGIN, ip = "203.0.113.7", method = "POST" } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (origin) headers.Origin = origin;
  if (ip) headers["CF-Connecting-IP"] = ip;
  return new Request("https://worker.test/report", {
    method,
    headers,
    body: method === "POST" ? JSON.stringify(body) : undefined,
  });
}

/** Charge utile valide de référence : les tests n'en modifient qu'un aspect. */
const validBody = {
  type: "donnee",
  description: "Le montant affiché pour 2035 ne correspond pas au rapport du COR.",
  section: "depenses",
  page: PAGE,
  elapsedMs: 9000,
  website: "",
  turnstile: "jeton-captcha",
};

/* ------------------------------------------------------------------------ */
/* Contrôle d'accès                                                          */
/* ------------------------------------------------------------------------ */

test("une origine étrangère est refusée, sans en-têtes CORS", async () => {
  const f = stubFetch();
  try {
    const res = await worker.fetch(
      makeRequest(validBody, { origin: "https://site-malveillant.test" }),
      makeEnv(),
    );
    assert.equal(res.status, 403);
    // Sans en-tête d'autorisation, un navigateur ne laissera même pas le script
    // appelant lire la réponse.
    assert.equal(res.headers.get("Access-Control-Allow-Origin"), null);
    assert.equal(f.calls.length, 0, "aucun appel externe ne doit avoir lieu");
  } finally {
    f.restore();
  }
});

test("le préflight n'autorise que l'origine du site", async () => {
  const env = makeEnv();
  const ok = await worker.fetch(makeRequest(null, { method: "OPTIONS" }), env);
  assert.equal(ok.status, 204);
  assert.equal(ok.headers.get("Access-Control-Allow-Origin"), ORIGIN);

  const ko = await worker.fetch(
    makeRequest(null, { method: "OPTIONS", origin: "https://ailleurs.test" }),
    env,
  );
  assert.equal(ko.status, 403);
});

/* ------------------------------------------------------------------------ */
/* Pièges à robots — ils doivent répondre un SUCCÈS, sans rien créer          */
/* ------------------------------------------------------------------------ */

test("le champ-piège rempli simule un succès sans créer d'issue", async () => {
  const f = stubFetch();
  try {
    const res = await worker.fetch(
      makeRequest({ ...validBody, website: "https://spam.test" }),
      makeEnv(),
    );
    assert.equal(res.status, 200);
    assert.equal((await res.json()).ok, true, "le robot ne doit pas savoir qu'il est repéré");
    assert.equal(f.calls.length, 0, "ni Turnstile ni GitHub ne doivent être appelés");
  } finally {
    f.restore();
  }
});

test("un envoi trop rapide pour un humain simule un succès sans créer d'issue", async () => {
  const f = stubFetch();
  try {
    const res = await worker.fetch(makeRequest({ ...validBody, elapsedMs: 120 }), makeEnv());
    assert.equal(res.status, 200);
    assert.equal((await res.json()).ok, true);
    assert.equal(f.calls.length, 0);
  } finally {
    f.restore();
  }
});

/* ------------------------------------------------------------------------ */
/* Validation des champs                                                     */
/* ------------------------------------------------------------------------ */

test("les charges utiles invalides sont rejetées avec un message en français", () => {
  const cases = [
    [{ ...validBody, type: "n-importe-quoi" }, /type/i],
    [{ ...validBody, description: "court" }, /au moins/i],
    [{ ...validBody, description: "x".repeat(2001) }, /dépasser/i],
    [{ ...validBody, section: "s".repeat(101) }, /section/i],
    [{ ...validBody, page: "https://ailleurs.test/page" }, /hors du site/i],
    [
      {
        ...validBody,
        description: "Voir https://a.test https://b.test https://c.test https://d.test ici",
      },
      /liens/i,
    ],
  ];
  for (const [body, pattern] of cases) {
    const result = validatePayload(body);
    assert.equal(result.ok, false, `attendu invalide : ${JSON.stringify(body).slice(0, 60)}`);
    assert.match(result.error, pattern);
  }

  assert.equal(validatePayload(validBody).ok, true);
});

test("une description invalide reçoit un 400 et n'atteint jamais GitHub", async () => {
  const f = stubFetch();
  try {
    const res = await worker.fetch(makeRequest({ ...validBody, description: "court" }), makeEnv());
    assert.equal(res.status, 400);
    assert.equal(f.calls.length, 0);
  } finally {
    f.restore();
  }
});

/* ------------------------------------------------------------------------ */
/* Limitation de débit                                                       */
/* ------------------------------------------------------------------------ */

test("le quatrième envoi d'un même appareil dans l'heure est refusé", async () => {
  const f = stubFetch();
  const env = makeEnv();
  try {
    for (let i = 0; i < 3; i++) {
      const res = await worker.fetch(makeRequest(validBody), env);
      assert.equal(res.status, 201, `l'envoi ${i + 1} doit passer`);
    }
    const bloque = await worker.fetch(makeRequest(validBody), env);
    assert.equal(bloque.status, 429);
    assert.match((await bloque.json()).error, /Trop de signalements/i);
  } finally {
    f.restore();
  }
});

test("le compteur ne stocke jamais l'adresse IP en clair", async () => {
  const f = stubFetch();
  const env = makeEnv();
  try {
    await worker.fetch(makeRequest(validBody, { ip: "198.51.100.23" }), env);
    const cles = [...env.REPORT_RL.store.keys()].join(" ");
    assert.ok(cles.length > 0, "un compteur doit avoir été écrit");
    assert.ok(!cles.includes("198.51.100.23"), "l'IP ne doit apparaître dans aucune clé");
  } finally {
    f.restore();
  }
});

/* ------------------------------------------------------------------------ */
/* Captcha                                                                   */
/* ------------------------------------------------------------------------ */

test("un captcha refusé bloque la création de l'issue", async () => {
  const f = stubFetch({ turnstileOk: false });
  try {
    const res = await worker.fetch(makeRequest(validBody), makeEnv());
    assert.equal(res.status, 403);
    assert.ok(
      !f.calls.some(c => c.url.includes("api.github.com")),
      "GitHub ne doit pas être appelé",
    );
  } finally {
    f.restore();
  }
});

test("un jeton de captcha absent est refusé sans appel réseau", async () => {
  const f = stubFetch();
  try {
    const res = await worker.fetch(makeRequest({ ...validBody, turnstile: "" }), makeEnv());
    assert.equal(res.status, 403);
    assert.equal(f.calls.length, 0);
  } finally {
    f.restore();
  }
});

/* ------------------------------------------------------------------------ */
/* Chemin nominal et contenu de l'issue                                      */
/* ------------------------------------------------------------------------ */

test("un signalement valide crée une issue étiquetée, sans aucune trace de l'IP", async () => {
  const f = stubFetch();
  try {
    const res = await worker.fetch(makeRequest(validBody, { ip: "192.0.2.55" }), makeEnv());
    assert.equal(res.status, 201);

    const payload = await res.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.number, 42);

    const appel = f.calls.find(c => c.url.includes("api.github.com"));
    assert.ok(appel, "l'API GitHub doit être appelée");
    assert.match(appel.url, /repos\/wald52\/Le-COR\/issues$/);
    // L'API GitHub rejette toute requête sans User-Agent.
    assert.ok(appel.init.headers["User-Agent"], "un User-Agent est obligatoire");

    const issue = JSON.parse(appel.body);
    assert.deepEqual(issue.labels, ["signalement-anonyme"]);
    assert.match(issue.title, /^\[Signalement\]/);

    // Le cœur de l'engagement de vie privée : rien d'identifiant dans le contenu
    // rendu public.
    assert.ok(!appel.body.includes("192.0.2.55"), "l'IP ne doit pas figurer dans l'issue");
    assert.ok(!appel.body.includes("jeton-captcha"), "le jeton de captcha ne doit pas fuiter");
  } finally {
    f.restore();
  }
});

test("un échec côté GitHub est signalé au visiteur, pas maquillé en succès", async () => {
  const f = stubFetch({ issueOk: false });
  try {
    const res = await worker.fetch(makeRequest(validBody), makeEnv());
    assert.equal(res.status, 502);
    assert.equal((await res.json()).ok, false);
  } finally {
    f.restore();
  }
});

/* ------------------------------------------------------------------------ */
/* Neutralisation du Markdown                                                */
/* ------------------------------------------------------------------------ */

test("le texte du visiteur ne peut ni notifier des comptes ni injecter du Markdown", () => {
  const hostile = "Bonjour @mainteneur voir #1 et <img src=x> **gras** [lien](http://x.test)";
  const echappe = escapeMarkdown(hostile);

  // Chaque caractère dangereux doit être précédé d'une barre oblique inverse :
  // GitHub affiche alors le caractère littéral au lieu de l'interpréter.
  for (const motif of ["\\@mainteneur", "\\#1", "\\<img", "\\*\\*gras", "\\[lien\\]"]) {
    assert.ok(echappe.includes(motif), `« ${motif} » doit être échappé`);
  }
  // Aucun caractère actif ne subsiste sans son échappement.
  assert.doesNotMatch(echappe, /(^|[^\\])@/, "toute arobase doit être échappée");

  const issue = buildIssue({
    type: "texte",
    description: hostile,
    section: "",
    page: PAGE,
  });
  assert.doesNotMatch(issue.body, /(^|[^\\])@mainteneur/, "aucune mention active dans le corps");
  // Le texte reste présenté comme une citation, séparé des notes de l'éditeur.
  assert.match(issue.body, /^> /m);
});

test("le titre reste court même avec une section démesurée", () => {
  const issue = buildIssue({
    type: "autre",
    description: "Une description parfaitement valide pour le test.",
    section: "S".repeat(100),
    page: PAGE,
  });
  assert.ok(issue.title.length <= 90, `titre trop long : ${issue.title.length}`);
});
