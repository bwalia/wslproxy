import { test, expect } from '@playwright/test';

/**
 * WSL Proxy — API Health & Infrastructure integration tests.
 *
 * Validates that the API layer is running and responding correctly.
 * No authentication required — these test public endpoints.
 */

test.describe('API Health', () => {
  test('/ping returns 200 with pong', async ({ page }) => {
    const response = await page.request.get('/ping');
    expect(response.status()).toBe(200);

    const json = await response.json();
    expect(json.response).toBe('pong');
  });

  test('/ping contains version info', async ({ page }) => {
    const response = await page.request.get('/ping');
    const json = await response.json();

    expect(json.app).toBeTruthy();
    expect(json.version).toBeTruthy();
    expect(json.openresty_version).toBeTruthy();
  });

  test('API rejects unauthenticated requests', async ({ page }) => {
    // GET /api/servers without a token should return 401
    // This proves the API is mounted and enforcing authentication
    const response = await page.request.get('/api/servers');
    expect(response.status()).toBe(401);
  });
});
