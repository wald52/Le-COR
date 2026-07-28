// Configuration Playwright — tests de bout en bout du site statique.
// Le site n'a pas de serveur applicatif : on le sert localement avec le serveur
// HTTP de Python (même façon de le lancer qu'en développement).
import { defineConfig, devices } from "@playwright/test";

const PORT = 8000;
const BASE_URL = `http://127.0.0.1:${PORT}`;
// Chromium uniquement (cf. la note sur les projets, plus bas).
const CLIPBOARD = ["clipboard-read", "clipboard-write"];

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  expect: { timeout: 7_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "list" : "line",
  use: {
    baseURL: BASE_URL
  },
  webServer: {
    command: `python3 -m http.server ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000
  },
  // Les permissions presse-papier sont déclarées PAR PROJET, pas dans le `use`
  // global : elles n'existent que dans Chromium. WebKit rejette la création même
  // du contexte (« Unknown permission: clipboard-write »), ce qui ferait échouer
  // la totalité de ses tests avant le premier `goto`.
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], permissions: CLIPBOARD },
      testIgnore: /swipe\.spec\.js/
    },
    {
      // Contexte tactile (hasTouch) pour le geste de fermeture par glissement.
      name: "mobile",
      use: { ...devices["Pixel 5"], permissions: CLIPBOARD },
      testMatch: /swipe\.spec\.js/
    },
    {
      // WebKit tactile (iPhone) : l'interaction centrale du site est un
      // carrousel au doigt, et Safari iOS est une part majeure du trafic mobile
      // français. Les deux projets ci-dessus tournent sur Chromium — un défaut
      // propre à WebKit (glissement, dialog, scroll momentum, préfixes CSS)
      // passerait inaperçu. On y rejoue la suite complète.
      name: "mobile-webkit",
      use: { ...devices["iPhone 13"] }
    }
  ]
});
