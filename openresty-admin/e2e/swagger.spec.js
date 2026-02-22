import { test, expect } from '@playwright/test';

/**
 * WSL Proxy — Swagger UI & OpenAPI specification tests.
 *
 * Validates that Swagger documentation is accessible and the
 * OpenAPI spec is complete. No authentication required.
 */

test.describe('Swagger & OpenAPI', { tag: '@regression' }, () => {
  test('Swagger UI page loads', { tag: '@smoke' }, async ({ page }) => {
    await page.goto('/swagger/');
    const swaggerElement = page.locator('#swagger-ui, .swagger-ui');
    await expect(swaggerElement.first()).toBeVisible({ timeout: 10000 });
  });

  test('OpenAPI spec is accessible', async ({ request }) => {
    const response = await request.get('/swagger/openapi.yaml');
    expect(response.status()).toBe(200);

    const body = await response.text();
    expect(body).toContain('openapi:');
    expect(body).toContain('WSLProxy');
  });

  test('OpenAPI spec documents MCP endpoints', async ({ request }) => {
    const response = await request.get('/swagger/openapi.yaml');
    const body = await response.text();

    expect(body).toContain('/mcp/manifest');
    expect(body).toContain('/mcp/resources');
    expect(body).toContain('/mcp/capabilities');
  });

  test('OpenAPI spec documents core API endpoints', async ({ request }) => {
    const response = await request.get('/swagger/openapi.yaml');
    const body = await response.text();

    expect(body).toContain('/api/servers');
    expect(body).toContain('/api/rules');
    expect(body).toContain('/api/user/login');
  });
});
