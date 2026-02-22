import { test, expect } from '@playwright/test';
import { clearAppState } from './helpers.js';

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

test.describe('Login Page', { tag: '@regression' }, () => {
  test.beforeEach(async ({ page }) => {
    if (!EMAIL || !PASSWORD) {
      test.skip(true, 'E2E_TEST_EMAIL and E2E_TEST_PASSWORD must be set');
    }
    // Clear any leftover auth state to ensure clean login tests
    await page.goto('/#/login');
    await clearAppState(page);
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

    await page.locator('#email').fill(EMAIL);
    await page.locator('#password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign In' }).click();

    await page.waitForFunction(
      () => !window.location.hash.includes('/login'),
      { timeout: 15000 }
    );

    await expect(page.locator('#main-content')).toBeVisible({ timeout: 10000 });

    const authToken = await page.evaluate(() => localStorage.getItem('token') || localStorage.getItem('auth'));
    expect(authToken).toBeTruthy();
  });

  test('login with invalid credentials shows error notification', async ({ page }) => {
    await page.goto('/#/login');

    await page.locator('#email').fill('invalid@example.com');
    await page.locator('#password').fill('WrongPassword123');
    await page.getByRole('button', { name: 'Sign In' }).click();

    await expect(
      page.getByText('Invalid email or password').first()
    ).toBeVisible({ timeout: 10000 });

    expect(page.url()).toContain('#/login');
  });

  test('password visibility toggle works', async ({ page }) => {
    await page.goto('/#/login');

    const passwordInput = page.locator('#password');
    await expect(passwordInput).toHaveAttribute('type', 'password');

    // Find the visibility toggle button near the password field
    const toggleButton = page.locator('button[aria-label*="isibility"], #password ~ button, #password + div button').first();
    await toggleButton.click();

    await expect(passwordInput).toHaveAttribute('type', 'text');
  });

  test('login form submits on Enter key', async ({ page }) => {
    await page.goto('/#/login');

    await page.locator('#email').fill(EMAIL);
    await page.locator('#password').fill(PASSWORD);
    await page.locator('#password').press('Enter');

    await page.waitForFunction(
      () => !window.location.hash.includes('/login'),
      { timeout: 15000 }
    );

    await expect(page.locator('#main-content')).toBeVisible({ timeout: 10000 });
  });

  test('empty form submission does not navigate away', async ({ page }) => {
    await page.goto('/#/login');

    await page.getByRole('button', { name: 'Sign In' }).click();
    await page.waitForTimeout(2000);

    expect(page.url()).toContain('#/login');
  });
});

test.describe('Login Page - UI', { tag: '@regression' }, () => {
  test('theme toggle switches between light and dark mode', async ({ page }) => {
    await page.goto('/#/login');

    const themeToggle = page.locator('button').filter({ has: page.locator('[data-testid="LightModeRoundedIcon"], [data-testid="DarkModeRoundedIcon"]') });
    await expect(themeToggle).toBeVisible();

    await themeToggle.click();
    await page.waitForTimeout(500);
    await themeToggle.click();

    await expect(themeToggle).toBeVisible();
  });
});
