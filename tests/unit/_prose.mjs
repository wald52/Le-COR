/*
 * Balayage des chiffres de la PROSE du site.
 * -----------------------------------------
 * Sert au filet anti-dérive de `figures.test.mjs` : recenser, dans les fichiers
 * livrés au navigateur, tout nombre suivi d'une unité (« 15,3 % », « 422 Md€ »,
 * « 45 Md€ »…) afin d'exiger que chacun soit soit rattaché à une donnée
 * officielle, soit explicitement déclaré non dérivé.
 *
 * Ce qui compte comme prose — et pourquoi :
 *
 *   1. le TEXTE visible, une fois les balises retirées ;
 *   2. les attributs `aria-label`, `alt` et `title`, qui sont du texte lu par
 *      les lecteurs d'écran. La barre de structure des ressources
 *      (`.struct-bar`) énonce ses quatre parts dans son seul `aria-label` : les
 *      ignorer laisserait quatre chiffres officiels sans surveillance, alors
 *      qu'ils sont la seule version de l'information pour qui n'a pas l'image.
 *
 * Ce qui n'en est pas : les commentaires HTML (bourrés de mesures de
 * performance — « 88 ms », « 92 → 111 ms »), les `<script>` (le JSON-LD, les
 * appels de fonctions) et les `<style>`.
 *
 * Technique : on NEUTRALISE (remplacement caractère par caractère par des
 * espaces) au lieu de supprimer, pour que les décalages du fichier restent
 * intacts — c'est ce qui permet de rendre un numéro de ligne exact dans le
 * message d'échec, seule façon d'agir vite sur un rapport de CI.
 */

/** Remplace un fragment par des espaces, en gardant les sauts de ligne. */
const neutralise = m => m.replace(/[^\n]/g, " ");

// Espaces « invisibles » du document : insécable, insécable fine, fine, plus
// l'espace ordinaire. Écrites en séquences d'échappement — un caractère
// invisible dans une classe de caractères est indébogable, et un copier-coller
// malheureux le remplace par une espace ordinaire sans que rien ne le signale.
const ESPACES = "\\u00a0\\u202f\\u2009 ";
const RE_ESPACES = new RegExp("[" + ESPACES + "]", "g");

/** Espaces insécables, fines, entités HTML → espace simple ; espaces réduits. */
export function normalise(s) {
  return s
    .replace(/&nbsp;|&#160;|&#xa0;/gi, " ")
    .replace(RE_ESPACES, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/*
 * Un nombre : signe optionnel, groupes de milliers séparés par une espace,
 * décimales à la virgule française. Puis l'unité, elle aussi séparable par une
 * espace. Les unités en lettres exigent une fin de mot (`\b`), sans quoi
 * « 5 ans » attraperait « 5 an » dans « 5 année ».
 *
 * Le séparateur de milliers accepte l'ENTITÉ autant que le caractère : la page
 * écrit « 1&nbsp;000&nbsp;milliards », et une classe de caractères seule s'y
 * arrêtait sur « 000 milliards » — un chiffre tronqué, donc introuvable dans la
 * table des faits, donc un faux échec impossible à comprendre.
 */
const ESPACE = "(?:&nbsp;|&#160;|[" + ESPACES + "])*";
const ESPACE1 = "(?:&nbsp;|&#160;|[" + ESPACES + "])";
const NOMBRE = "(?:[\\u2212+-]\\s?)?\\d+(?:" + ESPACE1 + "\\d{3})*(?:,\\d+)?";
const UNITE = "(?:%|Md\\u20ac|\\u20ac|pts?\\b|milliards?\\b|millions?\\b|ans\\b|mois\\b)";
const FIGURE = new RegExp(NOMBRE + ESPACE + UNITE, "g");

/** Index de début de chaque ligne, pour convertir un décalage en n° de ligne. */
function débutsDeLigne(texte) {
  const débuts = [0];
  for (let i = 0; i < texte.length; i++) if (texte[i] === "\n") débuts.push(i + 1);
  return débuts;
}

function ligneDe(débuts, décalage) {
  let bas = 0;
  let haut = débuts.length - 1;
  while (bas < haut) {
    const milieu = (bas + haut + 1) >> 1;
    if (débuts[milieu] <= décalage) bas = milieu;
    else haut = milieu - 1;
  }
  return bas + 1;
}

/**
 * Recense les figures d'un document HTML.
 * @returns {{ligne:number, figure:string, source:"texte"|"attribut"}[]}
 */
export function figuresHtml(brut) {
  // 1. Hors-prose neutralisé.
  const base = brut
    .replace(/<!--[\s\S]*?-->/g, neutralise)
    .replace(/<script[\s\S]*?<\/script>/gi, neutralise)
    .replace(/<style[\s\S]*?<\/style>/gi, neutralise);

  const débuts = débutsDeLigne(base);
  const trouvées = [];

  // 2. Attributs textuels : relevés AVANT le retrait des balises, qui les
  //    emporterait avec elles. Le drapeau `d` donne le décalage exact du groupe
  //    capturé, donc le bon numéro de ligne même pour un attribut multiligne.
  const ATTR = /\b(?:aria-label|alt|title)\s*=\s*"([^"]*)"/gid;
  for (const m of base.matchAll(ATTR)) {
    const [départ] = m.indices[1];
    for (const f of m[1].matchAll(FIGURE)) {
      trouvées.push({
        ligne: ligneDe(débuts, départ + f.index),
        figure: normalise(f[0]),
        source: "attribut",
      });
    }
  }

  // 3. Texte visible. `[^>]` accepte les sauts de ligne : une balise étalée sur
  //    plusieurs lignes — courant ici — est bien neutralisée d'un seul coup.
  const texte = base.replace(/<[^>]*>/g, neutralise);
  for (const f of texte.matchAll(FIGURE)) {
    trouvées.push({
      ligne: ligneDe(débuts, f.index),
      figure: normalise(f[0]),
      source: "texte",
    });
  }

  return trouvées.sort((a, b) => a.ligne - b.ligne);
}

/**
 * Isole le littéral `const cards = [ … ];` de js/cards.js.
 *
 * Les titres, sous-titres et descriptions des cartes portent eux aussi des
 * chiffres officiels — et ce sont les PREMIERS que lit un visiteur. On ne
 * balaie pas tout le fichier : `translateY(100%)` et autres valeurs CSS y
 * seraient comptées comme de la prose.
 *
 * Renvoie `null` si le tableau n'est plus reconnaissable : l'appelant doit en
 * faire un échec, jamais un balayage vide silencieux.
 */
export function régionDesCartes(source) {
  const début = source.indexOf("\n  const cards = [");
  if (début === -1) return null;
  const fin = source.indexOf("\n  ];", début);
  if (fin === -1) return null;
  return {
    texte: source.slice(début, fin),
    ligneDeDépart: source.slice(0, début).split("\n").length,
  };
}

/** Recense les figures du tableau des cartes (avec n° de ligne du fichier). */
export function figuresDesCartes(source) {
  const région = régionDesCartes(source);
  if (!région) return null;
  const débuts = débutsDeLigne(région.texte);
  const trouvées = [];
  for (const f of région.texte.matchAll(FIGURE)) {
    trouvées.push({
      ligne: région.ligneDeDépart + ligneDe(débuts, f.index) - 1,
      figure: normalise(f[0]),
      source: "texte",
    });
  }
  return trouvées.sort((a, b) => a.ligne - b.ligne);
}

/** Convertit une figure publiée (« −2,4 % », « 65.6% », « 1 000 Md€ ») en nombre. */
export function versNombre(publiée) {
  const nettoyée = normalise(publiée)
    .replace(/(?:%|Md€|€|pts?|milliards?|millions?|ans|mois)\s*$/i, "")
    .replace(RE_ESPACES, "")
    .replace(",", ".")
    .replace("−", "-")
    .trim();
  const n = Number(nettoyée);
  if (!Number.isFinite(n)) throw new Error("Figure illisible : " + JSON.stringify(publiée));
  return n;
}

/** Nombre de décimales publiées — fixe la finesse d'arrondi attendue. */
export function décimales(publiée) {
  const m = normalise(publiée).match(/[,.](\d+)/);
  return m ? m[1].length : 0;
}
