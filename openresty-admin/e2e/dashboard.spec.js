import { test, expect } from '@playwright/test';
import { login } from './helpers.js';

/**
 * WSL Proxy — Dashboard UI integration tests.
 *
 * Validates that the admin dashboard loads, renders key pages,
 * and navigation works. Requires authentication via env vars:
 *   E2E_TEST_EMAIL    — login email address
 *   E2E_TEST_PASSWORD — login password
 */

const EMAIL = process.env.E2E_TEST_EMAIL;
const PASSWORD = process.env.E2E_TEST_PASSWORD;

test.describe('Dashboard Integration', () => {
  test.beforeEach(async () => {
    if (!EMAIL || !PASSWORD) {
      test.skip(true, 'E2E_TEST_EMAIL and E2E_TEST_PASSWORD must be set');
    }
  });

  test('dashboard loads after login', async ({ page }) => {
    await login(page, EMAIL, PASSWORD);

    // Verify dashboard content renders
    await expect(page.locator('#main-content')).toBeVisible();

    // Dashboard should show card-like elements (MUI Cards or Paper)
    // React Admin dashboard typically renders within the main content area
    const dashboardContent = page.locator('#main-content');
    await expect(dashboardContent).not.toBeEmpty();
  });

  test('servers page loads with data grid', async ({ page }) => {
    await login(page, EMAIL, PASSWORD);
    await page.goto('/#/servers');

    // Wait for the page to load — React Admin renders a Datagrid or List
    await page.waitForFunction(
      () => window.location.hash.includes('/servers'),
      { timeout: 10000 }
    );

    // Verify the list/datagrid renders (React Admin uses MUI Datagrid)
    const listContent = page.locator('.RaList-main, .RaDatagrid-root, table, [class*="datagrid"]');
    await expect(listContent.first()).toBeVisible({ timeout: 10000 });
  });

  test('rules page loads with data grid', async ({ page }) => {
    await login(page, EMAIL, PASSWORD);
    await page.goto('/#/rules');

    await page.waitForFunction(
      () => window.location.hash.includes('/rules'),
      { timeout: 10000 }
    );

    const listContent = page.locator('.RaList-main, .RaDatagrid-root, table, [class*="datagrid"]');
    await expect(listContent.first()).toBeVisible({ timeout: 10000 });
  });

  test('navigation sidebar contains key menu items', async ({ page }) => {
    await login(page, EMAIL, PASSWORD);

    // React Admin renders a sidebar with menu items
    // Check for key navigation links
    const sidebar = page.locator('[class*="Menu"], [class*="Sidebar"], nav, [role="navigation"]');
    await expect(sidebar.first()).toBeVisible({ timeout: 10000 });

    // Verify key menu items exist as links or menu items
    await expect(page.getByRole('menuitem', { name: /servers/i }).or(page.getByRole('link', { name: /servers/i }))).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('menuitem', { name: /rules/i }).or(page.getByRole('link', { name: /rules/i }))).toBeVisible({ timeout: 5000 });
  });

  test('profiles page loads', async ({ page }) => {
    await login(page, EMAIL, PASSWORD);
    await page.goto('/#/profiles');

    await page.waitForFunction(
      () => window.location.hash.includes('/profiles'),
      { timeout: 10000 }
    );

    const listContent = page.locator('.RaList-main, .RaDatagrid-root, table, [class*="datagrid"]');
    await expect(listContent.first()).toBeVisible({ timeout: 10000 });
  });
});
