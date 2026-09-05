import { defineConfig, devices } from '@playwright/test';

/**
 * Cross-engine determinism — docs/03-determinism.md §5.3.
 *
 * V8, SpiderMonkey and JavaScriptCore are the three engines the game will actually
 * ship on, and ECMAScript permits them to disagree on the transcendental functions.
 * Running the same seed on all three plus Node is the only way to prove the ban in
 * eslint.config.js is actually holding.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? 'github' : 'list',
  // The harness runs 10,000 ticks in the browser; that is not instant.
  timeout: 180_000,
  expect: { timeout: 120_000 },

  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],

  webServer: {
    command: 'pnpm dev --port 5173 --strictPort',
    url: 'http://127.0.0.1:5173/determinism.html',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
