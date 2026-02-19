import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E test configuration for WSL Proxy Admin.
 *
 * Tests run against a deployed server — set E2E_BASE_URL to the target
 * environment. Defaults to https://prod-our.wslproxy.com.
 */
export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',

  /* Fail the build on CI if test.only was left in source */
  forbidOnly: !!process.env.CI,

  /* Retry once on CI to handle transient network issues */
  retries: process.env.CI ? 1 : 0,

  /* Single worker on CI to avoid overloading the runner */
  workers: process.env.CI ? 1 : undefined,

  /* Timeout per test — 30s default, longer for login flows */
  timeout: 30000,

  reporter: process.env.CI
    ? [['line'], ['html', { open: 'never', outputFolder: './playwright-report' }]]
    : [['html', { open: 'on-failure', outputFolder: './playwright-report' }]],

  use: {
    baseURL: process.env.E2E_BASE_URL || 'https://prod-our.wslproxy.com',
    ignoreHTTPSErrors: true,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
