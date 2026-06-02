import { chromium } from '@playwright/test';
import path from 'path';

const AUTH_STATE_PATH = path.join(import.meta.dirname, '.auth', 'state.json');

/**
 * Global setup — runs once before all test projects.
 *
 * Logs in with E2E_TEST_EMAIL / E2E_TEST_PASSWORD and saves the
 * browser storage state so that "logged-in" project tests can
 * skip the login flow entirely.
 */
export default async function globalSetup(config) {
  const baseURL =
    process.env.E2E_BASE_URL ||
    config.projects[0]?.use?.baseURL ||
    'https://prod-our-v1.wslproxy.com';

  const email = process.env.E2E_TEST_EMAIL;
  const password = process.env.E2E_TEST_PASSWORD;

  if (!email || !password) {
    // No credentials — dashboard tests will skip via their own guard
    return;
  }

  const browser = await chromium.launch();
  const context = await browser.newContext({ baseURL, ignoreHTTPSErrors: true });
  const page = await context.newPage();

  try {
    await page.goto('/#/login');
    await page.locator('#email').fill(email);
    await page.locator('#password').fill(password);
    await page.getByRole('button', { name: 'Sign In' }).click();
    await page.waitForFunction(
      () => !window.location.hash.includes('/login'),
      { timeout: 15000 }
    );
    await page.locator('#main-content').waitFor({ state: 'visible', timeout: 10000 });
    await context.storageState({ path: AUTH_STATE_PATH });
  } catch (err) {
    // Pre-seeding the logged-in auth state is best-effort. The "login" /
    // "login-next" projects perform their own explicit login per test and do
    // NOT depend on this state, so a failure here must not abort the whole run
    // — that previously surfaced as a misleading "0 tests / passed" result.
    // Only the "logged-in" dashboard project relies on the saved state.
    console.warn(`[global-setup] could not pre-seed auth state: ${err.message}`);
  } finally {
    await browser.close();
  }
}
