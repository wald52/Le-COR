/**
 * Relais de signalement anonyme — Cloudflare Worker.
 *
 * Le site est 100 % statique (GitHub Pages) : il ne peut RIEN recevoir, et un
 * jeton GitHub ne peut pas y vivre (dépôt public, JS servi en clair). Ce Worker
 * est le seul maillon serveur du projet : il reçoit le formulaire du site,
 * vérifie qu'il ne s'agit pas d'un robot, puis ouvre l'issue GitHub à la place
 * du visiteur. Celui-ci n'a donc besoin d'aucun compte et reste anonyme.
 *
 * Engagements de vie privée (repris dans legal.html) :
 *   - l'adresse IP n'est JAMAIS écrite dans l'issue, ni journalisée ; elle sert
 *     uniquement, hachée et salée, de clé de limitation de débit (TTL ≤ 25 h) ;
 *   - aucun user-agent, aucun cookie, aucun identifiant n'est conservé ;
 *   - le contenu saisi devient public : le formulaire le dit explicitement.
 *
 * Déploiement : voir worker/README.md. Ce dossier n'est jamais publié sur
 * GitHub Pages (cf. `rm -rf worker` dans .github/workflows/pages.yml).
 */

/* --------------------------------------------------------------------------
 * Constantes de politique. Les seuils sont volontairement bas : le site reçoit
 * peu de signalements légitimes, et un plafond serré coûte peu aux honnêtes
 * visiteurs tout en rendant le spam de masse inintéressant.
 * ----------------------------------------------------------------------- */

// Énumération FERMÉE : tout ce qui n'est pas listé est rejeté. Le libellé sert
// au titre de l'issue (le client n'envoie que la clé).
const TYPES = {
  donnee: "Donnée chiffrée",
  texte: "Texte",
  graphique: "Graphique",
  technique: "Problème technique",
  autre: "Autre",
};

const MAX_BODY_BYTES = 10 * 1024; // Lu AVANT JSON.parse : borne le coût d'analyse.
const MIN_ELAPSED_MS = 4000; // Temps humain minimal entre ouverture et envoi.
const DESC_MIN = 10;
const DESC_MAX = 2000;
const SECTION_MAX = 100;
const MAX_LINKS = 3; // Au-delà, c'est du référencement, pas un signalement.
const RL_IP_PER_HOUR = 3;
const RL_GLOBAL_PER_DAY = 40;
const PAGE_PREFIX = "https://wald52.github.io/Le-COR/";
const DEFAULT_REPO = "wald52/Le-COR";
const LABEL = "signalement-anonyme";
const USER_AGENT = "Le-COR-signalement-worker";

/* --------------------------------------------------------------------------
 * Utilitaires (exportés : testés unitairement dans tests/unit/worker.test.mjs).
 * ----------------------------------------------------------------------- */

/**
 * Neutralise le Markdown d'un texte saisi par un inconnu avant de l'insérer
 * dans une issue publique. Sans cela, un signalement pourrait mentionner des
 * comptes (`@utilisateur` les notifie), rattacher de faux liens vers d'autres
 * issues (`#12`), injecter du HTML ou casser la mise en forme.
 *
 * On échappe par barre oblique inverse : GitHub restitue alors le caractère
 * littéral, donc le texte reste lisible tel qu'il a été écrit.
 */
export function escapeMarkdown(text) {
  return String(text)
    .replace(/\\/g, "\\\\")
    .replace(/([`*_{}[\]()#+\-.!|<>@~])/g, "\\$1");
}

/** Retire les caractères de contrôle (hors tabulation et saut de ligne). */
export function stripControl(text) {
  // Filtrage par point de code plutôt que par expression régulière : on garde
  // la tabulation (9) et le saut de ligne (10), on retire le reste des
  // caractères de contrôle ainsi que DEL (127).
  return Array.from(String(text))
    .filter(ch => {
      const code = ch.codePointAt(0);
      return code === 9 || code === 10 || (code > 31 && code !== 127);
    })
    .join("");
}

/** Normalise les fins de ligne et rogne les blancs de bord. */
function normalize(text) {
  // Les fins de ligne sont unifiées AVANT le filtrage : sinon un retour chariot
  // isolé (anciens clients Mac) serait supprimé et souderait deux lignes.
  return stripControl(String(text).replace(/\r\n?/g, "\n")).trim();
}

/**
 * Valide et normalise la charge utile reçue.
 * @returns {{ok: true, value: object} | {ok: false, error: string}}
 */
export function validatePayload(data) {
  if (!data || typeof data !== "object") {
    return { ok: false, error: "Requête invalide." };
  }

  const type = typeof data.type === "string" ? data.type : "";
  if (!Object.prototype.hasOwnProperty.call(TYPES, type)) {
    return { ok: false, error: "Type de signalement inconnu." };
  }

  const description = normalize(data.description ?? "");
  if (description.length < DESC_MIN) {
    return { ok: false, error: `La description doit faire au moins ${DESC_MIN} caractères.` };
  }
  if (description.length > DESC_MAX) {
    return { ok: false, error: `La description ne peut pas dépasser ${DESC_MAX} caractères.` };
  }
  if ((description.match(/https?:\/\//gi) || []).length > MAX_LINKS) {
    return { ok: false, error: "Trop de liens dans la description." };
  }

  const section = normalize(data.section ?? "");
  if (section.length > SECTION_MAX) {
    return { ok: false, error: "Le champ « section » est trop long." };
  }

  // La page doit appartenir au site : on ne relaie pas des URLs arbitraires.
  const page = normalize(data.page ?? "");
  if (page && !page.startsWith(PAGE_PREFIX)) {
    return { ok: false, error: "Page hors du site." };
  }

  return { ok: true, value: { type, description, section, page } };
}

/** Construit le titre, le corps et les étiquettes de l'issue GitHub. */
export function buildIssue({ type, description, section, page }) {
  const label = TYPES[type];
  const context = section || (page ? page.slice(PAGE_PREFIX.length) || "accueil" : "");
  let title = context ? `[Signalement] ${label} — ${context}` : `[Signalement] ${label}`;
  if (title.length > 90) title = `${title.slice(0, 89)}…`;

  // Bloc de citation : le texte du visiteur est visuellement séparé du reste et
  // ne peut pas être confondu avec une note de l'éditeur.
  const quoted = escapeMarkdown(description)
    .split("\n")
    .map(line => `> ${line}`)
    .join("\n");

  const meta = [`**Type :** ${label}`];
  if (section) meta.push(`**Section :** ${escapeMarkdown(section)}`);
  if (page) meta.push(`**Page :** ${page}`);

  const body = [
    meta.join("\n"),
    "",
    "**Description**",
    "",
    quoted,
    "",
    "---",
    "",
    "_Signalement anonyme transmis via le formulaire du site. Son contenu est",
    "celui saisi par un visiteur : il n'a pas été vérifié. Aucune donnée",
    "personnelle (adresse IP comprise) n'est collectée ni transmise ici._",
  ].join("\n");

  return { title, body, labels: [LABEL] };
}

/* --------------------------------------------------------------------------
 * CORS. Origine comparée à une liste blanche : le point de collecte n'est
 * utilisable que depuis le site (la liste accepte plusieurs valeurs séparées
 * par une virgule pour permettre les essais en local via `wrangler dev`).
 * ----------------------------------------------------------------------- */

function allowedOrigins(env) {
  return String(env.ALLOWED_ORIGIN || "")
    .split(",")
    .map(o => o.trim())
    .filter(Boolean);
}

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...(origin ? corsHeaders(origin) : {}),
    },
  });
}

/* --------------------------------------------------------------------------
 * Limitation de débit (Workers KV).
 *
 * Le cache API serait par centre de données — donc contournable en changeant de
 * point de présence ; les Durable Objects seraient surdimensionnés pour ce
 * volume. KV suffit : sa cohérence différée (quelques secondes) est sans
 * importance pour un plafond horaire, et son TTL natif fait le ménage seul.
 * ----------------------------------------------------------------------- */

/** Empreinte non réversible de l'IP : la clé de comptage ne révèle pas l'IP. */
async function ipKey(ip, salt) {
  const bytes = new TextEncoder().encode(`${salt}:${ip}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest).slice(0, 16))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Compte une TENTATIVE (et non un succès) : un robot qui échoue au captcha
 * consomme quand même son quota, ce qui rend le forçage inintéressant.
 * @returns {Promise<boolean>} false si le plafond est atteint.
 */
async function rateLimit(env, ip) {
  const kv = env.REPORT_RL;
  if (!kv) return true; // Pas de binding (essais locaux) : on ne bloque pas.

  const now = new Date().toISOString();
  const hourKey = `ip:${await ipKey(ip, env.IP_SALT || "")}:${now.slice(0, 13)}`;
  const dayKey = `global:${now.slice(0, 10)}`;

  const [ipHits, globalHits] = await Promise.all([kv.get(hourKey), kv.get(dayKey)]);
  if (Number(ipHits || 0) >= RL_IP_PER_HOUR) return false;
  if (Number(globalHits || 0) >= RL_GLOBAL_PER_DAY) return false;

  await Promise.all([
    kv.put(hourKey, String(Number(ipHits || 0) + 1), { expirationTtl: 3700 }),
    kv.put(dayKey, String(Number(globalHits || 0) + 1), { expirationTtl: 90000 }),
  ]);
  return true;
}

/* --------------------------------------------------------------------------
 * Vérifications externes.
 * ----------------------------------------------------------------------- */

async function verifyTurnstile(env, token, ip) {
  const form = new URLSearchParams();
  form.set("secret", env.TURNSTILE_SECRET || "");
  form.set("response", token);
  if (ip) form.set("remoteip", ip);

  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  const data = await res.json().catch(() => ({}));
  return data.success === true;
}

async function createIssue(env, issue) {
  const repo = env.GITHUB_REPO || DEFAULT_REPO;
  const res = await fetch(`https://api.github.com/repos/${repo}/issues`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      // Obligatoire pour l'API GitHub : une requête sans User-Agent est rejetée.
      "User-Agent": USER_AGENT,
    },
    body: JSON.stringify(issue),
  });
  if (!res.ok) return null;
  return res.json().catch(() => null);
}

/* --------------------------------------------------------------------------
 * Point d'entrée.
 * ----------------------------------------------------------------------- */

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowed = allowedOrigins(env).includes(origin) ? origin : null;

    if (request.method === "OPTIONS") {
      // Préflight : refusé sans en-têtes CORS si l'origine n'est pas autorisée.
      return allowed
        ? new Response(null, { status: 204, headers: corsHeaders(allowed) })
        : new Response(null, { status: 403 });
    }

    const { pathname } = new URL(request.url);
    if (pathname !== "/report") return json({ ok: false, error: "Introuvable." }, 404, allowed);
    if (request.method !== "POST") return json({ ok: false, error: "Méthode non autorisée." }, 405, allowed);
    if (!allowed) return json({ ok: false, error: "Origine non autorisée." }, 403, null);

    // 1. Taille — bornée avant toute analyse.
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) {
      return json({ ok: false, error: "Signalement trop volumineux." }, 413, allowed);
    }

    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return json({ ok: false, error: "Requête invalide." }, 400, allowed);
    }

    // 2 & 3. Pièges à robots. On répond un FAUX SUCCÈS : un robot qui reçoit une
    // erreur apprend ce qui l'a trahi et adapte sa prochaine tentative.
    const trapped =
      (typeof data.website === "string" && data.website.trim() !== "") ||
      !(Number(data.elapsedMs) >= MIN_ELAPSED_MS);
    if (trapped) return json({ ok: true, url: null }, 200, allowed);

    // 4. Validation des champs.
    const checked = validatePayload(data);
    if (!checked.ok) return json({ ok: false, error: checked.error }, 400, allowed);

    // 5. Limitation de débit.
    const ip = request.headers.get("CF-Connecting-IP") || "";
    if (!(await rateLimit(env, ip))) {
      return json(
        { ok: false, error: "Trop de signalements envoyés depuis cet appareil. Réessayez dans une heure." },
        429,
        allowed,
      );
    }

    // 6. Captcha — le contrôle le plus coûteux vient en dernier.
    const token = typeof data.turnstile === "string" ? data.turnstile : "";
    if (!token || !(await verifyTurnstile(env, token, ip))) {
      return json({ ok: false, error: "Vérification anti-robot échouée. Rechargez la page et réessayez." }, 403, allowed);
    }

    // 7. Création de l'issue publique.
    const created = await createIssue(env, buildIssue(checked.value));
    if (!created) {
      return json({ ok: false, error: "Le signalement n'a pas pu être enregistré. Réessayez plus tard." }, 502, allowed);
    }

    return json({ ok: true, url: created.html_url, number: created.number }, 201, allowed);
  },
};
