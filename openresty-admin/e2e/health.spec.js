import { test, expect } from '@playwright/test';

/**
 * WSL Proxy — API Health & Infrastructure integration tests.
 *
 * Validates that the API layer is running and responding correctly.
 * No authentication required — these test public endpoints.
 */

test.describe('API Health', { tag: '@smoke' }, () => {
  test('/health returns 200 with healthy status', async ({ request }) => {
    const response = await request.get('/health');
    expect(response.status()).toBe(200);

    const json = await response.json();
    expect(json.response).toBe('pong');
    expect(json.status).toBe('healthy');
  });

  test('/health?detailed=true returns full diagnostics', async ({ request }) => {
    const response = await request.get('/health?detailed=true');
    const json = await response.json();

    expect(json.status).toBeTruthy();
    expect(json.services).toBeTruthy();
    expect(json.data_directories).toBeTruthy();
    expect(json.settings).toBeTruthy();
    expect(json.frontend_env).toBeTruthy();
    expect(json.system).toBeTruthy();
    expect(json.system.openresty_version).toBeTruthy();
  });

  test('/ping still works (backward compat)', async ({ request }) => {
    const response = await request.get('/ping');
    expect(response.status()).toBe(200);

    const json = await response.json();
    expect(json.response).toBe('pong');
  });

  test('API rejects unauthenticated requests', async ({ request }) => {
    // GET /api/servers without a token should return 401
    // This proves the API is mounted and enforcing authentication
    const response = await request.get('/api/servers');
    expect(response.status()).toBe(401);
  });
});
