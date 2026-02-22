import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E test configuration for WSL Proxy Admin.
 *
 * Tests run against a deployed server — set E2E_BASE_URL to the target
 * environment. Defaults to https://prod-our.wslproxy.com.
 *
 * Projects:
 *   - "no-auth"   — API, Swagger, MCP tests (no login needed)
 *   - "login"     — Login flow tests (explicit login per test)
 *   - "logged-in" — Dashboard tests (reuses auth state from global setup)
 */
export default defineConfig({
  testDir: "./e2e",
  outputDir: "./test-results",
  globalSetup: "./e2e/global-setup.js",

  /* Fail the build on CI if test.only was left in source */
  forbidOnly: !!process.env.CI,

  /* Retry twice on CI to handle transient network issues */
  retries: process.env.CI ? 2 : 0,

  /* Single worker on CI to avoid overloading the runner */
  workers: process.env.CI ? 1 : undefined,

  /* Timeout per test — 30s default */
  timeout: 30000,

  expect: {
    timeout: 10000,
  },

  reporter: process.env.CI
    ? [
        ["line"],
        ["html", { open: "never", outputFolder: "./playwright-report" }],
      ]
    : [["html", { open: "on-failure", outputFolder: "./playwright-report" }]],

  use: {
    baseURL: process.env.E2E_BASE_URL || "https://prod-our.wslproxy.com",
    ignoreHTTPSErrors: true,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "on-first-retry",
    actionTimeout: 10000,
    navigationTimeout: 15000,
  },

  projects: [
    {
      name: "no-auth",
      testMatch: /\/(health|swagger|mcp)\.spec\.js$/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "login",
      testMatch: /\/login\.spec\.js$/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "logged-in",
      testMatch: /\/dashboard\.spec\.js$/,
      dependencies: ["no-auth"],
      use: {
        ...devices["Desktop Chrome"],
        storageState: "./e2e/.auth/state.json",
      },
    },
  ],
});
