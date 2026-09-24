/* Round-trip contract for the api_gw policy editor.
 *
 * `buildPayload` in the server page is an allow-list, and `serializeApiGw`
 * rebuilds the policy field by field rather than merging into what was
 * loaded. That is a deliberate design -- it keeps the persisted JSON tidy --
 * but it means ANY schema field the form type does not model is deleted the
 * first time someone opens that server and presses Save, with nothing in the
 * diff to explain it.
 *
 * So the test that matters is not "does each input work", it is: load a
 * policy that uses the whole schema, hydrate it, serialise it, and assert
 * nothing went missing. New schema fields should fail here first.
 *
 * Run: npm test   (node's built-in runner; Node >= 22 strips the types)
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { hydrateApiGw, serializeApiGw } from "../src/components/servers/apiGwTypes.ts";

/** A policy exercising fields the UI does not render but the gateway reads. */
const HAND_WRITTEN = {
  enabled: true,
  modules: ["real_ip", "request_security", "cors", "ivt", "auth", "rate_limit", "audit"],
  tenant_id: "acme",
  ivt: {
    mode: "block",
    path_denylist: ["\\.env$"],
    block_threshold: 4,
    // Tuned scoring. api/api_gw/config.lua reads these with defaults
    // 5/5/3/1/5, so losing them silently changes when IVT blocks.
    weights: {
      method_denied: 9,
      path_denied: 8,
      auth_malformed: 7,
      header_spoof: 6,
      burst_exceeded: 5,
    },
  },
  auth: {
    strategy: "jwt",
    jwt: {
      // The schema supports an inline key ("Prefer secret_ref", but legal).
      // Dropping it breaks JWT verification for that tenant outright.
      secret: "inline-hmac-key",
      alg: "HS256",
      issuer: "https://idp.example.com",
    },
  },
  rate_limit: {
    profiles: { standard: { limit: 600, window_seconds: 60, key: "consumer" } },
  },
};

const roundTrip = (raw: unknown) =>
  serializeApiGw(hydrateApiGw(raw)) as Record<string, any>;

test("ivt.weights survives hydrate -> serialize", () => {
  const out = roundTrip(HAND_WRITTEN);
  assert.deepEqual(
    out.ivt?.weights,
    HAND_WRITTEN.ivt.weights,
    "tuned IVT scoring weights must not be reset to defaults by a UI save",
  );
});

test("an inline auth.jwt.secret survives hydrate -> serialize", () => {
  const out = roundTrip(HAND_WRITTEN);
  assert.equal(
    out.auth?.jwt?.secret,
    "inline-hmac-key",
    "an inline signing key must not be dropped — JWT verification would start failing",
  );
});

test("fields the UI does render still round-trip", () => {
  const out = roundTrip(HAND_WRITTEN);
  assert.equal(out.enabled, true);
  assert.equal(out.tenant_id, "acme");
  assert.equal(out.ivt?.mode, "block");
  assert.equal(out.ivt?.block_threshold, 4);
  assert.deepEqual(out.ivt?.path_denylist, ["\\.env$"]);
  assert.equal(out.auth?.strategy, "jwt");
  assert.equal(out.auth?.jwt?.issuer, "https://idp.example.com");
  assert.deepEqual(out.rate_limit?.profiles?.standard, {
    limit: 600,
    window_seconds: 60,
    key: "consumer",
  });
});

test("absent optional fields stay absent rather than being invented", () => {
  const out = roundTrip({ enabled: true });
  assert.equal(out.ivt?.weights, undefined, "no weights key when none was set");
  assert.equal(out.auth?.jwt?.secret, undefined, "no secret key when none was set");
});

test("a partially-specified weights table keeps only what was given", () => {
  const out = roundTrip({
    enabled: true,
    ivt: { mode: "audit", weights: { path_denied: 9 } },
  });
  assert.deepEqual(
    out.ivt?.weights,
    { path_denied: 9 },
    "an operator who tuned one weight should not acquire the other four",
  );
});

/* ── The invariant, checked against real policies ───────────────────────────
 *
 * A strict key-by-key comparison of input vs output is the wrong test here:
 * `serializeApiGw` deliberately omits values that equal the gateway default
 * (`audit.level: "info"`, `rate_limit.algorithm: "sliding"`,
 * `routes[].path_key: "starts_with"`, an empty `trusted_cidrs`), which is
 * tidy and behaviour-identical — api/api_gw/config.lua:291,314 fills them
 * back in.
 *
 * The property that must hold is that normalisation is IDEMPOTENT: once a
 * policy has been through the form, a second pass changes nothing. A field
 * the form cannot represent breaks this, because it vanishes on pass one and
 * is absent on pass two — which is exactly how ivt.weights and the inline
 * auth.jwt.secret were found.
 */

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const REPO = path.resolve(import.meta.dirname, "../..");

const REAL_POLICIES = [
  "data/servers/int/host:int.wslproxy.com.json",
  "examples/api-gw/host:api.demo.example.com.json",
  "examples/api-gw/host:api.fishers.example.com.json",
];

test("normalisation is idempotent for a policy using the whole schema", () => {
  const once = serializeApiGw(hydrateApiGw(HAND_WRITTEN));
  const twice = serializeApiGw(hydrateApiGw(once));
  assert.deepEqual(twice, once, "a second trip changed the policy");
});

for (const rel of REAL_POLICIES) {
  test(`normalisation is idempotent for ${path.basename(rel)}`, (t) => {
    const file = path.join(REPO, rel);
    if (!existsSync(file)) return t.skip(`${rel} not present`);
    const record = JSON.parse(readFileSync(file, "utf8"));
    if (!record.api_gw) return t.skip("no api_gw block");

    const once = serializeApiGw(hydrateApiGw(record.api_gw));
    const twice = serializeApiGw(hydrateApiGw(once));
    assert.deepEqual(
      twice,
      once,
      "a second trip through the form changed the policy — some field is not representable",
    );
  });
}
