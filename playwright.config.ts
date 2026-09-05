import { defineConfig, devices } from '@playwright/test';

/**
 * Cross-engine determinism — docs/03-determinism.md §5.3.
 *
 * V8, SpiderMonkey and JavaScriptCore are the three engines the game will ship on,
 * and ECMAScript permits them to disagree on the transcendental functions. Running
 * the same seed on all three plus Node is the only way to prove the ESLint ban in
 * eslint.config.js is actually holding rather than merely configured.
 *
 * Two suites, two locations, one runner: the browser-facing specs live in
 * `tests/*.playwright.spec.ts` (they must not match vitest's glob) and the
 * determinism harness lives in `e2e/`.
 */
export default defineConfig({
  testDir: '.',
  testMatch: ['e2e/**/*.spec.ts', 'tests/**/*.playwright.spec.ts'],
  testIgnore: ['node_modules/**', 'dist/**', 'assets/**'],
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  // The determinism harness runs 10,000 ticks in the browser; not instant.
  timeout: 180_000,
  expect: { timeout: 120_000 },

  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],

  webServer: {
    command: 'pnpm exec vite --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
