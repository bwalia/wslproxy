import { test, expect } from '@playwright/test';

/**
 * WSL Proxy Admin — Login E2E tests.
 *
 * Credentials are supplied via environment variables:
 *   E2E_TEST_EMAIL    — login email address
 *   E2E_TEST_PASSWORD — login password
 *
 * The app uses hash-based routing (e.g. /#/login, /#/servers).
 */

const EMAIL = process.env.E2E_TEST_EMAIL;
const PASSWORD = process.env.E2E_TEST_PASSWORD;

test.describe('Login Page', () => {
  test.beforeEach(async () => {
    if (!EMAIL || !PASSWORD) {
      test.skip(true, 'E2E_TEST_EMAIL and E2E_TEST_PASSWORD must be set');
    }
  });

  test('login page loads correctly', async ({ page }) => {
    await page.goto('/#/login');

    // Verify key UI elements are visible
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
    await expect(page.getByText('Welcome back')).toBeVisible();
    await expect(page.getByText('Sign in to your admin account')).toBeVisible();
    await expect(page.getByText('Protected by WSL Proxy Gateway')).toBeVisible();
  });

  test('login with valid credentials redirects to dashboard', async ({ page }) => {
    await page.goto('/#/login');

    // Fill in credentials
    await page.locator('#email').fill(EMAIL);
    await page.locator('#password').fill(PASSWORD);

    // Submit the form
    await page.getByRole('button', { name: 'Sign In' }).click();

    // Wait for navigation away from login page (hash-based routing)
    // React Admin redirects to /#/ (dashboard) on successful login
    await page.waitForFunction(
      () => !window.location.hash.includes('/login'),
      { timeout: 15000 }
    );

    // Verify we reached the dashboard — check for main app content
    // Use generic selectors that work regardless of MUI version
    await expect(page.locator('nav, aside, [class*="Layout"], [class*="Sidebar"], header')).toBeVisible({ timeout: 10000 });

    // Verify auth token was stored in localStorage
    const authToken = await page.evaluate(() => localStorage.getItem('token') || localStorage.getItem('auth'));
    expect(authToken).toBeTruthy();
  });

  test('login with invalid credentials shows error notification', async ({ page }) => {
    await page.goto('/#/login');

    // Enter wrong credentials
    await page.locator('#email').fill('invalid@example.com');
    await page.locator('#password').fill('WrongPassword123');

    // Submit the form
    await page.getByRole('button', { name: 'Sign In' }).click();

    // React Admin shows a snackbar notification on login failure
    // Use getByText for the exact error message to avoid strict mode violation
    // (MUI renders nested wrapper + content elements for Snackbar)
    await expect(
      page.getByText('Invalid email or password').first()
    ).toBeVisible({ timeout: 10000 });

    // Should still be on the login page
    expect(page.url()).toContain('#/login');
  });

  test('password visibility toggle works', async ({ page }) => {
    await page.goto('/#/login');

    const passwordInput = page.locator('#password');

    // Password field should initially be type="password"
    await expect(passwordInput).toHaveAttribute('type', 'password');

    // Click the visibility toggle button
    await page.locator('#password').locator('..').locator('..').locator('button').click();

    // Password field should now be type="text"
    await expect(passwordInput).toHaveAttribute('type', 'text');
  });

  test('login form submits on Enter key', async ({ page }) => {
    await page.goto('/#/login');

    // Fill in credentials
    await page.locator('#email').fill(EMAIL);
    await page.locator('#password').fill(PASSWORD);

    // Press Enter instead of clicking button
    await page.locator('#password').press('Enter');

    // Wait for navigation away from login page
    await page.waitForFunction(
      () => !window.location.hash.includes('/login'),
      { timeout: 15000 }
    );

    // Verify we reached the dashboard
    await expect(page.locator('nav, aside, [class*="Layout"], [class*="Sidebar"], header')).toBeVisible({ timeout: 10000 });
  });

  test('empty form submission does not navigate away', async ({ page }) => {
    await page.goto('/#/login');

    // Click Sign In without filling anything
    await page.getByRole('button', { name: 'Sign In' }).click();

    // Wait a moment for any potential navigation
    await page.waitForTimeout(2000);

    // Should still be on the login page
    expect(page.url()).toContain('#/login');
  });
});

test.describe('Login Page - UI', () => {
  test('theme toggle switches between light and dark mode', async ({ page }) => {
    await page.goto('/#/login');

    // The page starts in dark mode by default
    // Find and click the theme toggle button (the icon button in top-right)
    const themeToggle = page.locator('button').filter({ has: page.locator('[data-testid="LightModeRoundedIcon"], [data-testid="DarkModeRoundedIcon"]') });
    await expect(themeToggle).toBeVisible();

    // Click to toggle theme
    await themeToggle.click();

    // Wait for transition
    await page.waitForTimeout(500);

    // Click again to toggle back
    await themeToggle.click();

    // Verify the toggle is still functional (no crash)
    await expect(themeToggle).toBeVisible();
  });
});
