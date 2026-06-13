/**
 * Shared E2E test helpers for WSL Proxy Admin.
 *
 * Provides reusable functions to avoid duplicating login flows
 * and common assertions across test files.
 */

/**
 * Log in to the WSL Proxy Admin dashboard.
 *
 * Navigates to the login page, fills credentials, submits the form,
 * and waits for the dashboard to load.
 *
 * @param {import('@playwright/test').Page} page - Playwright page instance
 * @param {string} email - Login email address
 * @param {string} password - Login password
 */
export async function login(page, email, password) {
  await page.goto('/#/login');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await page.waitForFunction(
    () => !window.location.hash.includes('/login'),
    { timeout: 15000 }
  );
  await page.locator('#main-content').waitFor({ state: 'visible', timeout: 10000 });
}

/**
 * Clear browser storage to ensure test isolation.
 *
 * Removes localStorage and sessionStorage so tests start from
 * a clean state without leftover auth tokens or cached data.
 *
 * @param {import('@playwright/test').Page} page - Playwright page instance
 */
export async function clearAppState(page) {
  await page.evaluate(() => {
    // Guard against an opaque-origin document (e.g. about:blank after a
    // transient navigation failure), where accessing storage throws
    // SecurityError. Cleanup is best-effort and must never fail the test.
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch (_) {
      /* storage not accessible on this document — nothing to clear */
    }
  });
}
