# Cross-domain SSO with OpsAPI: opsapi.org → fictionally.org

How OpsAPI on `opsapi.org` becomes the single sign-on authority for apps on
another apex domain (`hello-java.fictionally.org`, `hello-php.fictionally.org`),
and what the wslproxy edge does in that picture.

**Read this first: today vs. target.** The edge side is live. The OIDC side is
not built yet.

| Piece | State |
|-------|-------|
| `opsapi.org`, `sso.opsapi.org`, `www.opsapi.org` on lon1 + pop0 (Let's Encrypt, HSTS, CORS, rate limits, PKCE pre-check) | **Live** (`data/servers/prod/host:*opsapi.org.json`) |
| OpsAPI login: `/auth/login`, `/auth/refresh`, `/auth/me`, `/auth/logout`, refresh cookie `refresh_token` | **Exists** in OpsAPI |
| `@opsapi/client` TypeScript SDK (`createClient({ baseUrl, token, namespace })`) | **Exists** (v1.3.0, `opsapi/sdk/typescript`) |
| `/oauth/authorize`, `/oauth/token`, `/oauth/userinfo`, `/.well-known/openid-configuration`, `/.well-known/jwks.json`, PKCE verification | **Not built.** OpsAPI work, see [What OpsAPI must build](#what-opsapi-must-build) |
| RS256/ES256 signing | **Not built.** OpsAPI signs every token HS256 with `JWT_SECRET_KEY`, so there is no public key to publish |

Until the OIDC endpoints exist, `/oauth/*` and `/.well-known/jwks.json` on
`opsapi.org` reach OpsAPI and get its normal 401/404. The Spring and OIDC parts
of Step 4 are the target configuration, not something to deploy today.

---

## Step 1: Architecture

### Why cookies alone cannot do this

A browser never sends an `opsapi.org` cookie to `fictionally.org`. That is
the same-site boundary, and no CORS header or proxy rule changes it. OpsAPI's
refresh cookie is also `SameSite=Strict`, so it isn't sent even on a
credentialed `fetch` from `hello-php.fictionally.org` to `opsapi.org`.

So SSO across apexes has to be **redirect-based**: each app sends the browser
to `opsapi.org`, which already holds a first-party session, and gets back a
one-time code. That is OIDC authorization code + PKCE.

```
 hello-java.fictionally.org        opsapi.org (OpsAPI via wslproxy)
 ─────────────────────────         ──────────────────────────────────
 1. user hits /dashboard
    no app session → 302 ───────►  2. GET /oauth/authorize
                                       ?client_id=hello-java
                                       &code_challenge=…&code_challenge_method=S256
                                       &redirect_uri=https://hello-java…/login/oauth2/code/opsapi
                                    edge: PKCE pre-check, rate limit "auth"
                                    3. first-party session cookie on .opsapi.org?
                                       no  → login form (/auth/login, 2FA)
                                       yes → no prompt (this is the SSO)
 5. GET /login/oauth2/code/opsapi ◄── 4. 302 redirect_uri?code=…&state=…
 6. POST /oauth/token  (back channel, server to server)
    code + code_verifier ─────────►  7. verify code_verifier against the stored
                                        challenge, issue id_token + access_token
                                        (RS256, kid in JWKS)
 8. verify id_token with
    /.well-known/jwks.json ───────►  (public, cacheable, CORS *)
 9. own app session cookie on hello-java.fictionally.org
```

The second app (`hello-php`) repeats steps 1–9. At step 3 the browser already
has the `opsapi.org` session, so the user isn't asked for credentials again.

### First-party session on `.opsapi.org`

- OpsAPI already decides the cookie `Domain` from the request **Origin**, not
  from Host (`lapis/helper/auth-cookies.lua`). With
  `AUTH_COOKIE_TRUSTED_DOMAINS=opsapi.org`, a login from `https://opsapi.org`
  or `https://sso.opsapi.org` sets `Domain=.opsapi.org`. That works behind
  wslproxy even though the edge rewrites the upstream Host to
  `opsapi.workstation.co.uk`.
- The edge adds `Strict-Transport-Security: max-age=31536000; includeSubDomains`
  and forces HTTPS, so the cookie never travels in clear.
- **Use one issuer: `https://opsapi.org`.** `sso.opsapi.org` serves the same
  backend and may host the login UI, but the discovery document and every
  token's `iss` must say `https://opsapi.org`. Two issuers means two
  sets of client config and broken validation.

### Identity matrix: proposed tables

New tables in OpsAPI (PostgreSQL). They don't exist yet. Names follow OpsAPI's
existing `snake_case` style.

**`oauth_clients`**: one row per consumer app.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `client_id` | text unique | `hello-java`, `hello-php` |
| `client_secret_hash` | text null | null for public (browser/SPA) clients |
| `client_type` | text | `confidential` \| `public` |
| `redirect_uris` | text[] | exact match, no wildcards |
| `post_logout_redirect_uris` | text[] | |
| `allowed_scopes` | text[] | `openid profile email` |
| `require_pkce` | boolean | **true for every client**, confidential ones too |
| `namespace_id` | uuid null | ties a client to an OpsAPI workspace |
| `created_at`, `updated_at` | timestamptz | |

**`sso_sessions`**: the browser's session at the authority. This is what makes
the second app silent.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | the value inside the `.opsapi.org` session cookie is an opaque random id that maps to this row, never a JWT |
| `user_id` | uuid FK users | |
| `auth_time` | timestamptz | for `max_age` / `prompt=login` |
| `amr` | text[] | `pwd`, `otp`, `apple`, `google`, … |
| `expires_at` | timestamptz | idle + absolute caps (reuse `JWT_MAX_SESSION_SECONDS`) |
| `revoked_at` | timestamptz null | logout anywhere ends every app's next refresh |
| `ip`, `user_agent` | text | audit |

**`oauth_authorization_codes`**: single use, about 60 s TTL.

| Column | Type | Notes |
|--------|------|-------|
| `code_hash` | text PK | store a hash, never the code |
| `client_id` | text FK | |
| `sso_session_id` | uuid FK | |
| `redirect_uri` | text | must equal the one presented at `/oauth/token` |
| `code_challenge` | text | |
| `code_challenge_method` | text | `S256` only |
| `scope`, `nonce`, `state_hash` | text | |
| `expires_at`, `used_at` | timestamptz | a second use revokes the tokens already issued |

**`oauth_grants`**: which apps a session has signed into, used for
front/back-channel logout and refresh-token rotation.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `sso_session_id` | uuid FK | |
| `client_id` | text FK | |
| `refresh_token_hash` | text | rotated on every use |
| `scope` | text | |
| `created_at`, `last_used_at`, `revoked_at` | timestamptz | |

**`oauth_signing_keys`**: key rotation.

| Column | Type | Notes |
|--------|------|-------|
| `kid` | text PK | |
| `alg` | text | `RS256` (or `ES256`) |
| `public_jwk` | jsonb | published in `/.well-known/jwks.json` |
| `private_key_ref` | text | a Vault path, never the key itself |
| `status` | text | `next` → `active` → `retired` (keep retired keys in JWKS until their tokens expire) |

### What OpsAPI must build

1. Asymmetric signing (RS256/ES256) for id/access tokens issued to OAuth
   clients, with `kid`. HS256 stays for OpsAPI's own first-party tokens.
2. `GET /.well-known/openid-configuration` and `GET /.well-known/jwks.json`.
3. `GET /oauth/authorize`: validate client + exact `redirect_uri`, require
   S256 PKCE, reuse `sso_sessions` or run the existing login, 2FA and social flows.
4. `POST /oauth/token`: `authorization_code` (verify `code_verifier`) and
   `refresh_token` (rotate), `client_secret_basic` or `none` + PKCE.
5. `GET /oauth/userinfo`, `/oauth/logout` (RP-initiated), and revocation.
6. Admin screens or API for `oauth_clients` in the OpsAPI dashboard.

---

## Step 2: OpsAPI runtime environment

Variables marked **existing** are read by OpsAPI today. Variables marked
**new** are names proposed for the OIDC work and do nothing until it ships.

```dotenv
# ── existing ────────────────────────────────────────────────────────────────
# HS256 key for OpsAPI's own tokens. Comes from Vault (devops/vault/), not this file.
JWT_SECRET_KEY=<from vault>
# Absolute cap on a login session, seconds.
JWT_MAX_SESSION_SECONDS=2592000

# Cookie Domain is chosen per request from the Origin. Listing opsapi.org
# makes logins from https://opsapi.org and https://sso.opsapi.org set
# Domain=.opsapi.org. Do NOT add fictionally.org: a cookie can't be shared
# across apexes, and listing it would only scope cookies for requests whose
# Origin is fictionally.org.
AUTH_COOKIE_TRUSTED_DOMAINS=opsapi.org,workstation.co.uk
# Leave AUTH_COOKIE_DOMAIN unset; it overrides the per-Origin choice for every tenant.
# AUTH_COOKIE_DOMAIN=

# CORS at the origin. wslproxy already answers CORS for these hosts and its
# headers overwrite the origin's, so these matter for traffic that bypasses
# the edge (int/test, local). Apex domains, matched with their subdomains.
CORS_ALLOWED_DOMAINS=opsapi.org,fictionally.org,workstation.co.uk
# Exact origins, for anything not covered by a domain above.
CORS_ALLOWED_ORIGINS=https://hello-java.fictionally.org,https://hello-php.fictionally.org
CORS_ALLOW_LOCALHOST=false

# ── new (OIDC work, not read by OpsAPI yet) ─────────────────────────────────
OIDC_ISSUER=https://opsapi.org
OIDC_SIGNING_ALG=RS256
OIDC_SIGNING_KEY_VAULT_PATH=secret/opsapi/prod/oidc-signing
OIDC_ACCESS_TOKEN_TTL=300
OIDC_ID_TOKEN_TTL=300
OIDC_REFRESH_TOKEN_TTL=2592000
OIDC_AUTH_CODE_TTL=60
OIDC_REQUIRE_PKCE=true
OIDC_PKCE_METHODS=S256
```

Lock state-changing endpoints to the authority's own origins: `/oauth/token`
and `/auth/refresh` should accept credentialed CORS only from
`https://opsapi.org` / `https://sso.opsapi.org`. Consumer apps call
`/oauth/token` from their **server**, so they never need cookies on it.

---

## Step 3: wslproxy edge configuration (live)

Files:

| File | Purpose |
|------|---------|
| `data/servers/prod/host:opsapi.org.json` | authority + admin console |
| `data/servers/prod/host:sso.opsapi.org.json` | same backend and policy; login UI host |
| `data/servers/prod/host:www.opsapi.org.json` | 301 → `https://opsapi.org`, path kept |
| `data/rules/prod/opsapi-org-default.json` | `/` → `origin-uk-003.pop0.uk` (cloud003 traefik-edge, where prod OpsAPI runs) |
| `data/rules/prod/opsapi-org-www-redirect.json` | the www redirect |
| `data/ssl/<host>.json` (on the edges, gitignored) | Let's Encrypt via auto-ssl; `ssl_init` recreates these from `ssl_enabled` server records on reload |
| `test/api_gw/test_opsapi_org.lua` | contract test for all of the above |

**Upstream Host.** Traefik on cloud003 routes OpsAPI by Host, so both servers
set `proxy_server_name: "opsapi.workstation.co.uk"`. Cookie scoping is
unaffected (see Step 1).

**`api_gw` policy** on `opsapi.org` and `sso.opsapi.org`:

| Route | Match | Policy |
|-------|-------|--------|
| `health` | `/health` equals | unlimited |
| `login` | `/auth/` prefix | `auth` rate class (20/min/IP), 16 KB body cap |
| `oidc-authorize` | `/oauth/authorize` GET | `auth` rate class + **PKCE pre-check** |
| `oidc-token` | `/oauth/token` POST | `auth` rate class, 16 KB body cap |
| `oidc-discovery` | `/.well-known/` GET | `public` rate class, CORS `*` without credentials |
| `api` | everything else | `standard` (600/min/IP) |

- **CORS** (credentialed): `https://opsapi.org`, `https://sso.opsapi.org`,
  `https://hello-java.fictionally.org`, `https://hello-php.fictionally.org`.
  Any other origin gets no CORS headers, and its preflight gets a bare 204.
- **PKCE pre-check**: an inline `api_gw` hook (`pkce_guard`) refuses
  `/oauth/authorize` without a 43–128 character `code_challenge` and
  `code_challenge_method=S256`, answering 400 `invalid_request`. It is a
  pre-filter. Hooks fail open, and only OpsAPI can verify the `code_verifier`
  at `/oauth/token`, so OpsAPI must enforce PKCE too.
  It lives inline in the server record so edge-sync carries it to pop0.
- **IVT** in audit mode, correlation IDs (`X-Correlation-ID`), HSTS, and an
  audit trail without query strings, because verify and reset links carry tokens there.

Verify:

```bash
curl -sI https://opsapi.org/health | grep -iE '^HTTP|strict-transport|x-correlation'
curl -s 'https://opsapi.org/oauth/authorize?client_id=x'      # 400 PKCE required
curl -s -o /dev/null -D - -X OPTIONS https://opsapi.org/auth/login \
  -H 'Origin: https://hello-java.fictionally.org' \
  -H 'Access-Control-Request-Method: POST' | grep -i access-control-allow-origin
curl -sI https://www.opsapi.org/x | grep -i location          # https://opsapi.org/x
```

**DNS:** `opsapi.org` and `www.opsapi.org` already resolve to lon1 + pop0.
`sso.opsapi.org` has **no record yet** (Cloudflare zone, `jule`/`quinton`).
Add A records for `195.20.255.201` and `85.190.106.189`, DNS-only (grey
cloud). Let's Encrypt issues the certificate on the first HTTPS request after that.

---

## Step 4: Consumer apps

### 4.1 Spring Boot (`hello-java.fictionally.org`): target state

Works once the OpsAPI endpoints in Step 1 exist. Until then the provider
calls get 404 or 401.

```yaml
# application.yml
spring:
  security:
    oauth2:
      client:
        registration:
          opsapi:
            provider: opsapi
            client-id: hello-java
            client-secret: ${OPSAPI_CLIENT_SECRET}
            client-authentication-method: client_secret_basic
            authorization-grant-type: authorization_code
            redirect-uri: "{baseUrl}/login/oauth2/code/{registrationId}"
            scope: openid,profile,email
        provider:
          opsapi:
            issuer-uri: https://opsapi.org
            authorization-uri: https://opsapi.org/oauth/authorize
            token-uri: https://opsapi.org/oauth/token
            jwk-set-uri: https://opsapi.org/.well-known/jwks.json
            user-info-uri: https://opsapi.org/oauth/userinfo
            user-name-attribute: sub
      resourceserver:
        jwt:
          issuer-uri: https://opsapi.org
          jwk-set-uri: https://opsapi.org/.well-known/jwks.json
          jws-algorithms: RS256

server:
  forward-headers-strategy: framework   # wslproxy terminates TLS; trust X-Forwarded-Proto
```

Spring sends PKCE automatically only for public clients. Turn it on for this
confidential client as well:

```java
@Bean
SecurityFilterChain security(HttpSecurity http, ClientRegistrationRepository clients) throws Exception {
    var resolver = new DefaultOAuth2AuthorizationRequestResolver(clients, "/oauth2/authorization");
    resolver.setAuthorizationRequestCustomizer(OAuth2AuthorizationRequestCustomizers.withPkce());
    http.authorizeHttpRequests(a -> a.anyRequest().authenticated())
        .oauth2Login(o -> o.authorizationEndpoint(e -> e.authorizationRequestResolver(resolver)))
        .oauth2ResourceServer(r -> r.jwt(Customizer.withDefaults()));
    return http.build();
}
```

Register the client in OpsAPI with
`redirect_uris = ["https://hello-java.fictionally.org/login/oauth2/code/opsapi"]`.

### 4.2 TypeScript with `@opsapi/client`

**Works today**: first-party login against the real SDK, for apps that sign
users in with OpsAPI credentials directly:

```ts
import { createClient } from '@opsapi/client';

let token: string | undefined;
let refreshToken: string | undefined;

export const opsapi = createClient({
  baseUrl: 'https://opsapi.org',
  token: () => token,
  namespace: 'fictionally',           // workspace slug or UUID
  onUnauthorized: async () => {
    if (!refreshToken) return null;
    const next = await opsapi.auth.refresh(refreshToken);
    token = next.token;
    refreshToken = next.refreshToken ?? refreshToken;
    return token;
  },
});

export async function signIn(username: string, password: string) {
  const res = await opsapi.auth.login({ username, password });
  if (res.status === 'needs_2fa') return res;     // then opsapi.auth.verify2fa({ sessionToken: res.sessionToken, code })
  token = res.token;
  refreshToken = res.refreshToken;
  return res;
}
```

**Target state (SSO)**: the app redirects to the authority with PKCE, then
passes the resulting access token into the same client. Prefer doing the code
exchange on the app's server, which keeps tokens out of browser storage:

```ts
// browser: start sign-in
const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
const challenge = base64url(new Uint8Array(
  await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
sessionStorage.setItem('pkce_verifier', verifier);
location.assign('https://opsapi.org/oauth/authorize?' + new URLSearchParams({
  client_id: 'hello-php',
  response_type: 'code',
  scope: 'openid profile email',
  redirect_uri: 'https://hello-php.fictionally.org/auth/callback',
  code_challenge: challenge,
  code_challenge_method: 'S256',
  state: crypto.randomUUID(),
}));

// server, at /auth/callback: exchange the code (and the verifier, sent up by the page)
const res = await fetch('https://opsapi.org/oauth/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'authorization_code', code, code_verifier: verifier,
    client_id: 'hello-php', redirect_uri: 'https://hello-php.fictionally.org/auth/callback',
  }),
});
const { access_token } = await res.json();
const api = createClient({ baseUrl: 'https://opsapi.org', token: access_token });

function base64url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
```

`hello-php` itself is PHP, so in production the callback exchange belongs
in its PHP backend. The TypeScript above shows the protocol, and fits any
Node/SPA front end added later.
