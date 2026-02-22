import { test, expect } from '@playwright/test';

/**
 * WSL Proxy — Dashboard UI integration tests.
 *
 * Validates that the admin dashboard loads, renders key pages,
 * and navigation works. Auth state is injected via storageState
 * from global-setup.js — no per-test login needed.
 *
 * Requires E2E_TEST_EMAIL / E2E_TEST_PASSWORD to be set so that
 * global setup can create the auth state file.
 */

const HAS_CREDS = !!(process.env.E2E_TEST_EMAIL && process.env.E2E_TEST_PASSWORD);

test.describe('Dashboard Integration', { tag: '@regression' }, () => {
  test.beforeEach(async () => {
    if (!HAS_CREDS) {
      test.skip(true, 'E2E_TEST_EMAIL and E2E_TEST_PASSWORD must be set');
    }
  });

  test('dashboard loads after login', { tag: '@smoke' }, async ({ page }) => {
    await page.goto('/#/');
    await expect(page.locator('#main-content')).toBeVisible({ timeout: 15000 });
  });

  test('servers page loads with data grid', async ({ page }) => {
    await page.goto('/#/servers');
    await page.waitForFunction(
      () => window.location.hash.includes('/servers'),
      { timeout: 10000 }
    );
    await expect(
      page.locator('#main-content table, #main-content [role="grid"]').first()
    ).toBeVisible({ timeout: 15000 });
  });

  test('rules page loads with data grid', async ({ page }) => {
    await page.goto('/#/rules');
    await page.waitForFunction(
      () => window.location.hash.includes('/rules'),
      { timeout: 10000 }
    );
    await expect(
      page.locator('#main-content table, #main-content [role="grid"]').first()
    ).toBeVisible({ timeout: 15000 });
  });

  test('navigation sidebar contains key menu items', async ({ page }) => {
    await page.goto('/#/');
    await expect(page.locator('#main-content')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('a[href*="#/servers"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('a[href*="#/rules"]')).toBeVisible({ timeout: 10000 });
  });

  test('profiles page loads', async ({ page }) => {
    await page.goto('/#/profiles');
    await page.waitForFunction(
      () => window.location.hash.includes('/profiles'),
      { timeout: 10000 }
    );
    await expect(
      page.locator('#main-content table, #main-content [role="grid"]').first()
    ).toBeVisible({ timeout: 15000 });
  });
});
