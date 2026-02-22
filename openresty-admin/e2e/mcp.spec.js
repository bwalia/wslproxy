import { test, expect } from '@playwright/test';

/**
 * WSL Proxy — MCP (Model Context Protocol) endpoint integration tests.
 *
 * Validates that MCP endpoints are accessible and return correct
 * protocol structures. No authentication required — MCP endpoints
 * are public when enabled.
 */

test.describe('MCP Protocol', () => {
  test('manifest returns valid structure', async ({ page }) => {
    const response = await page.request.get('/mcp/manifest');
    expect(response.status()).toBe(200);

    const json = await response.json();
    // JSON-RPC wrapper
    expect(json.jsonrpc).toBe('2.0');
    expect(json.result).toBeTruthy();

    // Server info
    const result = json.result;
    expect(result.server).toBeTruthy();
    expect(result.server.name).toBe('wslproxy-mcp');
    expect(result.protocol_version).toBeTruthy();
  });

  test('capabilities lists resources', async ({ page }) => {
    const response = await page.request.get('/mcp/capabilities');
    expect(response.status()).toBe(200);

    const json = await response.json();
    expect(json.jsonrpc).toBe('2.0');

    const capabilities = json.result.capabilities;
    expect(capabilities).toBeTruthy();
    expect(capabilities.resources).toBeTruthy();
    expect(Array.isArray(capabilities.resources)).toBe(true);
    expect(capabilities.resources.length).toBeGreaterThan(0);
  });

  test('resources list is accessible', async ({ page }) => {
    const response = await page.request.get('/mcp/resources');
    expect(response.status()).toBe(200);

    const json = await response.json();
    expect(json.jsonrpc).toBe('2.0');
    expect(json.result).toBeTruthy();
  });

  test('schemas endpoint returns schema list', async ({ page }) => {
    const response = await page.request.get('/mcp/schemas');
    expect(response.status()).toBe(200);

    const json = await response.json();
    expect(json.jsonrpc).toBe('2.0');
    expect(json.result).toBeTruthy();
  });

  test('health resource returns data', async ({ page }) => {
    const response = await page.request.get('/mcp/resources/health');
    expect(response.status()).toBe(200);

    const json = await response.json();
    expect(json.jsonrpc).toBe('2.0');
    expect(json.result).toBeTruthy();
  });

  test('response includes MCP headers', async ({ page }) => {
    const response = await page.request.get('/mcp/manifest');

    const mcpServer = response.headers()['x-mcp-server'];
    expect(mcpServer).toBe('wslproxy');

    const mcpVersion = response.headers()['x-mcp-version'];
    expect(mcpVersion).toBeTruthy();
  });

  test('tools endpoint is accessible', async ({ page }) => {
    const response = await page.request.get('/mcp/tools');
    expect(response.status()).toBe(200);

    const json = await response.json();
    expect(json.jsonrpc).toBe('2.0');
    expect(json.result).toBeTruthy();
  });
});
