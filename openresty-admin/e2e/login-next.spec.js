import { test, expect } from '@playwright/test';
import { clearAppState } from './helpers.js';

/**
 * WSL Proxy Admin (Next.js dashboard) — Login E2E tests.
 *
 * This is the Next.js admin counterpart to login.spec.js (which targets the
 * legacy React-Admin SPA). The two UIs differ enough that they need separate
 * specs:
 *   - React-Admin uses hash routing (/#/login); Next.js uses path routing
 *     (/login, with / redirecting to /login when unauthenticated).
 *   - React-Admin stores auth under localStorage['token']; Next.js stores the
 *     signed-in user under localStorage['wslproxy.user'].
 *   - Copy/labels differ ("...admin dashboard" vs "...admin account", and the
 *     invalid-login message is the raw API "Invalid credentials").
 *
 * Credentials are supplied via environment variables:
 *   E2E_TEST_EMAIL    — login email address
 *   E2E_TEST_PASSWORD — login password
 */

const EMAIL = process.env.E2E_TEST_EMAIL;
const PASSWORD = process.env.E2E_TEST_PASSWORD;

test.describe('Login Page (Next.js)', { tag: '@regression' }, () => {
  test.beforeEach(async ({ page }) => {
    if (!EMAIL || !PASSWORD) {
      test.skip(true, 'E2E_TEST_EMAIL and E2E_TEST_PASSWORD must be set');
    }
    // Clear any leftover auth state to ensure clean login tests.
    await page.goto('/login');
    await clearAppState(page);
  });

  test('login page loads correctly', async ({ page }) => {
    await page.goto('/login');

    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
    await expect(page.getByText('Welcome back')).toBeVisible();
    await expect(page.getByText('Sign in to your admin dashboard')).toBeVisible();
  });

  test('login with valid credentials redirects to dashboard', async ({ page }) => {
    await page.goto('/login');

    await page.locator('#email').fill(EMAIL);
    await page.locator('#password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();

    // Next.js uses path routing — wait until we leave /login.
    await page.waitForURL((url) => !url.pathname.startsWith('/login'), {
      timeout: 15000,
    });

    // The signed-in user is persisted under wslproxy.user.
    const user = await page.evaluate(() => localStorage.getItem('wslproxy.user'));
    expect(user).toBeTruthy();
  });

  test('login with invalid credentials shows error', async ({ page }) => {
    await page.goto('/login');

    await page.locator('#email').fill('invalid@example.com');
    await page.locator('#password').fill('WrongPassword123');
    await page.getByRole('button', { name: 'Sign in' }).click();

    // The Next.js login surfaces the raw API message on failure.
    await expect(page.getByText('Invalid credentials').first()).toBeVisible({
      timeout: 10000,
    });
    expect(new URL(page.url()).pathname).toContain('/login');
  });

  test('password visibility toggle works', async ({ page }) => {
    await page.goto('/login');

    const passwordInput = page.locator('#password');
    await expect(passwordInput).toHaveAttribute('type', 'password');

    await page.getByRole('button', { name: /show password/i }).click();
    await expect(passwordInput).toHaveAttribute('type', 'text');
  });

  test('login form submits on Enter key', async ({ page }) => {
    await page.goto('/login');

    await page.locator('#email').fill(EMAIL);
    await page.locator('#password').fill(PASSWORD);
    await page.locator('#password').press('Enter');

    await page.waitForURL((url) => !url.pathname.startsWith('/login'), {
      timeout: 15000,
    });
  });
});

test.describe('Login Page - UI (Next.js)', { tag: '@regression' }, () => {
  test('theme toggle switches between light and dark mode', async ({ page }) => {
    await page.goto('/login');

    // The toggle's accessible name flips between "Switch to dark mode" and
    // "Switch to light mode" depending on the current theme.
    const themeToggle = page.getByRole('button', { name: /switch to (dark|light) mode/i });
    await expect(themeToggle).toBeVisible();

    const before = await themeToggle.getAttribute('aria-label');
    await themeToggle.click();
    await expect(themeToggle).not.toHaveAttribute('aria-label', before ?? '');
  });
});
