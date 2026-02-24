import { test, expect } from '@playwright/test';

/**
 * WSL Proxy — MCP (Model Context Protocol) endpoint integration tests.
 *
 * Validates that MCP endpoints are accessible and return correct
 * protocol structures. No authentication required — MCP endpoints
 * are public when enabled.
 *
 * Tests gracefully skip if MCP is not deployed (503 response).
 */

test.describe('MCP Protocol', { tag: '@regression' }, () => {
  let mcpAvailable = false;

  test.beforeAll(async ({ request }) => {
    try {
      const response = await request.get('/mcp/manifest');
      mcpAvailable = response.status() === 200;
    } catch {
      mcpAvailable = false;
    }
  });

  test.beforeEach(async () => {
    test.skip(!mcpAvailable, 'MCP endpoints not available on this environment (503)');
  });

  test('manifest returns valid structure', async ({ request }) => {
    const response = await request.get('/mcp/manifest');
    expect(response.status()).toBe(200);

    const json = await response.json();
    expect(json.jsonrpc).toBe('2.0');
    expect(json.result).toBeTruthy();

    const result = json.result;
    expect(result.server).toBeTruthy();
    expect(result.server.name).toBe('wslproxy-mcp');
    expect(result.protocol_version).toBeTruthy();
  });

  test('capabilities lists resources', async ({ request }) => {
    const response = await request.get('/mcp/capabilities');
    expect(response.status()).toBe(200);

    const json = await response.json();
    expect(json.jsonrpc).toBe('2.0');

    const capabilities = json.result.capabilities;
    expect(capabilities).toBeTruthy();
    expect(capabilities.resources).toBeTruthy();
    expect(Array.isArray(capabilities.resources)).toBe(true);
    expect(capabilities.resources.length).toBeGreaterThan(0);
  });

  test('resources list is accessible', async ({ request }) => {
    const response = await request.get('/mcp/resources');
    expect(response.status()).toBe(200);

    const json = await response.json();
    expect(json.jsonrpc).toBe('2.0');
    expect(json.result).toBeTruthy();
  });

  test('schemas endpoint returns schema list', async ({ request }) => {
    const response = await request.get('/mcp/schemas');
    expect(response.status()).toBe(200);

    const json = await response.json();
    expect(json.jsonrpc).toBe('2.0');
    expect(json.result).toBeTruthy();
  });

  test('health resource returns data', async ({ request }) => {
    const response = await request.get('/mcp/resources/health');
    expect(response.status()).toBe(200);

    const json = await response.json();
    expect(json.jsonrpc).toBe('2.0');
    expect(json.result).toBeTruthy();
  });

  test('response includes MCP headers', async ({ request }) => {
    const response = await request.get('/mcp/manifest');

    const mcpServer = response.headers()['x-mcp-server'];
    expect(mcpServer).toBe('wslproxy');

    const mcpVersion = response.headers()['x-mcp-version'];
    expect(mcpVersion).toBeTruthy();
  });

  test('tools endpoint is accessible', async ({ request }) => {
    const response = await request.get('/mcp/tools');
    expect(response.status()).toBe(200);

    const json = await response.json();
    expect(json.jsonrpc).toBe('2.0');
    expect(json.result).toBeTruthy();
  });
});
