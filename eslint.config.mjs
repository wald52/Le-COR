// Configuration ESLint (flat config) — outillage de DÉVELOPPEMENT uniquement.
// Le site reste 100 % vanilla, sans étape de build : ESLint ne sert qu'à
// détecter les erreurs avant déploiement, pas à transformer le code livré.
import js from "@eslint/js";
import globals from "globals";

export default [
  // Fichiers générés automatiquement (data volumineuses, artefacts minifiés) :
  // non analysés — seules les sources lisibles (js/*.js, css/*.css) le sont.
  { ignores: ["data/*.generated.js", "**/*.min.js", "node_modules/**"] },

  js.configs.recommended,

  {
    files: ["js/**/*.js", "sw.js", "data/data.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: {
        ...globals.browser,
        ...globals.serviceworker,
        // Globaux propres au site (exposés via window par les scripts).
        COR_DATA: "readonly",
        COR_SERIES: "writable",
        COR_EXPLORER: "readonly",
        CORChart: "readonly",
        // Widget anti-robot Cloudflare, chargé à la demande par js/report.js
        // (absent tant que la modale de signalement n'a pas été ouverte).
        turnstile: "readonly",
        // Export de test gardé (`typeof module !== "undefined"`) en pied de
        // fichier : indéfini dans le navigateur, lu par les tests unitaires Node.
        module: "readonly"
      }
    },
    rules: {
      // Tolérant : on veut révéler les bugs, pas réécrire le style existant.
      "no-unused-vars": ["warn", { args: "none", caughtErrors: "none", varsIgnorePattern: "^_" }],
      "no-empty": ["warn", { allowEmptyCatch: true }]
    }
  },

  // Relais de signalement (Cloudflare Worker) : module ES exécuté sur le
  // runtime Workers, proche d'un service worker (fetch, Response, crypto…).
  // Jamais servi par le site — le dossier est exclu du déploiement Pages.
  {
    files: ["worker/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.serviceworker }
    }
  },

  // Fichiers de configuration exécutés par Node (lint, Playwright).
  {
    files: ["*.config.js", "*.config.mjs"],
    languageOptions: { sourceType: "module", globals: { ...globals.node } }
  },

  // Outils de développement (génération des données, build des assets) :
  // scripts Node, jamais livrés au navigateur. Le type de module est déduit de
  // l'extension (.cjs → CommonJS, .mjs → module).
  {
    files: ["tools/**/*.{js,cjs,mjs}"],
    languageOptions: { globals: { ...globals.node } }
  },

  // Tests Playwright (*.spec.js) : s'exécutent sous Node, mais les rappels
  // page.evaluate() tournent dans le navigateur (globaux browser). Les tests
  // unitaires (*.test.mjs, tests/unit/) sont du pur Node.
  {
    files: ["tests/**/*.{js,mjs}"],
    languageOptions: {
      sourceType: "module",
      globals: { ...globals.node, ...globals.browser }
    }
  }
];
