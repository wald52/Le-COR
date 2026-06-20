// Configuration Playwright — tests de bout en bout du site statique.
// Le site n'a pas de serveur applicatif : on le sert localement avec le serveur
// HTTP de Python (même façon de le lancer qu'en développement).
import { defineConfig, devices } from "@playwright/test";

const PORT = 8000;
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  expect: { timeout: 7_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "list" : "line",
  use: {
    baseURL: BASE_URL,
    permissions: ["clipboard-read", "clipboard-write"]
  },
  webServer: {
    command: `python3 -m http.server ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      testIgnore: /swipe\.spec\.js/
    },
    {
      // Contexte tactile (hasTouch) pour le geste de fermeture par glissement.
      name: "mobile",
      use: { ...devices["Pixel 5"] },
      testMatch: /swipe\.spec\.js/
    }
  ]
});
