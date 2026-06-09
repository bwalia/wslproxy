import { test, expect } from '@playwright/test';
import { clearAppState } from './helpers.js';

/**
 * WSL Proxy Admin (Next.js dashboard) — Create Server E2E test.
 *
 * Goal: prove that an operator can create a server through the live admin and
 * that the new server then shows up on the /servers list page
 * (https://prod-our.wslproxy.com/servers).
 *
 * Flow:
 *   1. Log in through the real Next.js login form. This sets the httpOnly
 *      `wslproxy_token` cookie in the browser context (same auth a human gets).
 *   2. Create a uniquely-named server via the same `POST /api/servers` endpoint
 *      the dashboard's data-provider uses. `page.request` shares the context's
 *      cookie jar, so the login cookie authenticates the call automatically —
 *      no token juggling, and we exercise the real backend create path.
 *   3. Reload /servers and assert the new server is visible in the list.
 *
 * Safety on production:
 *   - `config_status: false` means the generated nginx config is persisted as
 *     JSON only and is NOT copied into /opt/nginx/conf.d, so `openresty -t`
 *     never runs and no reload flag is touched. The test server is inert — it
 *     appears in the admin list but cannot affect live traffic.
 *   - The server name is unique per run (timestamp + worker pid) so concurrent
 *     or repeated runs never collide.
 *
 * The created server is intentionally LEFT in place so the run can be visually
 * confirmed at /servers. Set E2E_CLEANUP=true to delete it at the end instead.
 *
 * Credentials are supplied via environment variables:
 *   E2E_TEST_EMAIL    — login email address
 *   E2E_TEST_PASSWORD — login password
 *   E2E_PROFILE       — environment profile to create under (default "prod")
 *   E2E_CLEANUP       — "true" to delete the server after verifying (default: keep)
 */

const EMAIL = process.env.E2E_TEST_EMAIL;
const PASSWORD = process.env.E2E_TEST_PASSWORD;
const PROFILE = process.env.E2E_PROFILE || 'prod';
const CLEANUP = process.env.E2E_CLEANUP === 'true';

/**
 * Build the minimal nginx server block the Next.js data-provider would compose
 * for a plain HTTP-only server (no SSL, single location). The backend
 * base64-encodes the `config` field on save, so we send raw nginx text — the
 * same as the browser does.
 */
function buildConfig(serverName) {
  return `server {
      listen 80;
      server_name ${serverName};
      root /var/www/html;
      index index.html index.htm;
      access_log /var/log/nginx/access.log;
      error_log /var/log/nginx/error.log;
      location / {
          default_type text/plain;
          return 200 "wslproxy e2e create-server test\\n";
      }
  }
  `;
}

test.describe('Create Server (Next.js)', { tag: '@regression' }, () => {
  test.beforeEach(async ({ page }) => {
    if (!EMAIL || !PASSWORD) {
      test.skip(true, 'E2E_TEST_EMAIL and E2E_TEST_PASSWORD must be set');
    }
    await page.goto('/login');
    await clearAppState(page);
  });

  test('creates a server via the admin and it appears on the /servers list', async ({ page }) => {
    // ── 1. Log in through the real UI ──────────────────────────────────────
    await page.goto('/login');
    await page.locator('#email').fill(EMAIL);
    await page.locator('#password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL((url) => !url.pathname.startsWith('/login'), {
      timeout: 15000,
    });

    // ── 2. Create a uniquely-named server via the authenticated API ────────
    // Unique per run: epoch seconds + worker index keep concurrent/repeat runs
    // from colliding. `.wslproxy.test` is a reserved-style suffix that will
    // never resolve, making it obvious this is a synthetic test record.
    const stamp = `${Math.floor(Date.now() / 1000)}-${test.info().workerIndex}`;
    const serverName = `e2e-create-${stamp}.wslproxy.test`;
    const serverId = `host:${serverName}`;

    const payload = {
      server_name: serverName,
      proxy_server_name: serverName,
      listens: [{ listen: '80' }],
      config: buildConfig(serverName),
      // Inert on prod: JSON only, never written to /opt/nginx/conf.d.
      config_status: false,
      profile_id: PROFILE,
    };

    const createRes = await page.request.post('/api/servers', {
      headers: {
        'content-type': 'application/json',
        'x-platform': 'openresty-admin-next',
      },
      data: payload,
    });

    expect(
      createRes.ok(),
      `POST /api/servers failed (HTTP ${createRes.status()}): ${await createRes.text()}`,
    ).toBeTruthy();

    // ── 3. Confirm it persisted via the API (independent of the UI list) ───
    const getRes = await page.request.get(
      `/api/servers/${encodeURIComponent(serverId)}?_format=json&envprofile=${PROFILE}`,
      { headers: { 'x-platform': 'openresty-admin-next' } },
    );
    expect(
      getRes.ok(),
      `GET /api/servers/${serverId} failed (HTTP ${getRes.status()})`,
    ).toBeTruthy();
    const got = await getRes.json();
    const record = got?.data ?? got;
    expect(record?.server_name ?? record?.id).toContain(serverName.split('.')[0]);

    // ── 4. Verify it shows up on the /servers list page ────────────────────
    // The list is sorted by created_at DESC, so the freshly-created server is
    // on the first page. Search by name as a belt-and-braces filter in case
    // the default page size ever changes.
    await page.goto('/servers');
    const search = page.getByPlaceholder(/search/i).first();
    if (await search.isVisible().catch(() => false)) {
      await search.fill(serverName);
    }
    await expect(page.getByText(serverName, { exact: false }).first()).toBeVisible({
      timeout: 15000,
    });

    // ── 5. Optional cleanup ────────────────────────────────────────────────
    if (CLEANUP) {
      const delRes = await page.request.delete(
        `/api/servers/${encodeURIComponent(serverId)}?envprofile=${PROFILE}`,
        { headers: { 'x-platform': 'openresty-admin-next' } },
      );
      expect(
        delRes.ok(),
        `cleanup DELETE /api/servers/${serverId} failed (HTTP ${delRes.status()})`,
      ).toBeTruthy();
    }
  });
});
