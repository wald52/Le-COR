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
        CORChart: "readonly"
      }
    },
    rules: {
      // Tolérant : on veut révéler les bugs, pas réécrire le style existant.
      "no-unused-vars": ["warn", { args: "none", caughtErrors: "none", varsIgnorePattern: "^_" }],
      "no-empty": ["warn", { allowEmptyCatch: true }]
    }
  },

  // Fichiers de configuration exécutés par Node (lint, Playwright).
  {
    files: ["*.config.js", "*.config.mjs"],
    languageOptions: { sourceType: "module", globals: { ...globals.node } }
  },

  // Tests Playwright : s'exécutent sous Node, mais les rappels page.evaluate()
  // tournent dans le navigateur (globaux browser).
  {
    files: ["tests/**/*.js"],
    languageOptions: {
      sourceType: "module",
      globals: { ...globals.node, ...globals.browser }
    }
  }
];
