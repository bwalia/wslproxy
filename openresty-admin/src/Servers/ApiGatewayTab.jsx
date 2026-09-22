import React from "react";
import { Alert, Grid, Link, Typography } from "@mui/material";
import {
  BooleanInput,
  FormDataConsumer,
  NumberInput,
  SelectArrayInput,
  SelectInput,
  TextInput,
  ArrayInput,
  SimpleFormIterator,
} from "react-admin";

import { SectionCard, SubSectionLabel } from "../component/SectionCard";
import RateProfilesInput from "./input/RateProfilesInput";

/**
 * The `api_gw` policy editor.
 *
 * Everything here writes into the server record's `api_gw` object, which
 * api/api_gw/config.lua normalises per request — so a save takes effect on
 * the next request with no nginx reload, and `enabled: false` is the rollback
 * (docs/api-gateway.md §11).
 *
 * Field names and defaults are taken from docs/api-gw.schema.json. Where a
 * field is left blank the gateway applies its own default, so helper text
 * states the default rather than the form pre-filling it — a pre-filled value
 * would be written into the record and freeze today's default forever.
 *
 * Sections follow the pipeline order in docs/api-gateway.md §2, so reading
 * the tab top to bottom is reading the order the stages actually run in.
 */

const CSV = {
  // The schema wants arrays of strings; SelectArrayInput with createLabel
  // gives free-text entry that still yields an array.
  format: (v) => (Array.isArray(v) ? v : []),
};

const METHODS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"].map(
  (m) => ({ id: m, name: m })
);

// MODULE names, not stage names. api_gw/pipeline.lua runs seven stages but
// gates them on six module names: `correlation` and `request_security` are
// two stages sharing the module `request_security` (pipeline.lua:39-44).
// Offering "correlation" here would silently disable the correlation id —
// naming a stage that is not a module filters every stage out.
const MODULES = [
  { id: "real_ip", name: "real_ip — trusted proxies" },
  { id: "request_security", name: "request_security — correlation + content-type + body size" },
  { id: "cors", name: "cors" },
  { id: "ivt", name: "ivt — traffic guard" },
  { id: "auth", name: "auth" },
  { id: "rate_limit", name: "rate_limit" },
  { id: "audit", name: "audit" },
];

const ApiGatewayTab = () => (
  <div className="form-container">
    <SectionCard
      title="API Gateway"
      subtitle="Kong-class edge policy for this server — CORS, correlation, traffic guards, auth, rate limiting and audit. Applied per request from this record: saving takes effect immediately, with no nginx reload."
    >
      <Grid container spacing={2}>
        <Grid item xs={12} sm={6} md={4}>
          <BooleanInput
            source="api_gw.enabled"
            label="Enable API Gateway"
            defaultValue={false}
            helperText="Off = the request path behaves exactly as before. This is also the rollback switch."
          />
        </Grid>
        <Grid item xs={12} sm={6} md={8}>
          <TextInput
            source="api_gw.tenant_id"
            label="Tenant ID (optional)"
            fullWidth
            helperText="Isolation key for shared-dict counters. Defaults to {profile}/{server_name}. Set it only to make several hostnames share one quota."
          />
        </Grid>
      </Grid>

      <FormDataConsumer>
        {({ formData }) =>
          formData?.api_gw?.enabled && (
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <SelectArrayInput
                  source="api_gw.modules"
                  label="Enabled modules"
                  fullWidth
                  choices={MODULES}
                  helperText="Leave empty to run every module the sections below configure — that is the safe default. Naming modules restricts the pipeline to just those, and anything omitted is silently skipped. request_security covers both the correlation id and content-type/body enforcement."
                />
              </Grid>
            </Grid>
          )
        }
      </FormDataConsumer>
    </SectionCard>

    <FormDataConsumer>
      {({ formData }) =>
        !formData?.api_gw?.enabled ? null : (
          <>
            {/* ── 1. real IP ───────────────────────────────────────────── */}
            <SectionCard
              title="1. Trusted proxies"
              subtitle="Resolves the real client address before anything keys a quota on it."
            >
              <Alert severity="warning" sx={{ mb: 2 }}>
                Configure this before turning on any per-IP quota. With no
                trusted CIDRs behind a load balancer, every request appears to
                come from the balancer and you rate limit your own
                infrastructure.
              </Alert>
              <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                  <SelectArrayInput
                    source="api_gw.real_ip.trusted_cidrs"
                    label="Trusted CIDRs"
                    fullWidth
                    choices={[]}
                    create
                    createLabel="Add CIDR"
                    helperText="e.g. 10.0.0.0/8. Empty = trust nothing and use the peer address."
                    {...CSV}
                  />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <TextInput
                    source="api_gw.real_ip.header"
                    label="Forwarded header"
                    fullWidth
                    helperText="Default X-Forwarded-For"
                  />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <BooleanInput
                    source="api_gw.real_ip.recursive"
                    label="Recursive"
                    helperText="Walk the header right-to-left while inside the trust boundary. Default on."
                  />
                </Grid>
              </Grid>
            </SectionCard>

            {/* ── 2. correlation + request security ────────────────────── */}
            <SectionCard
              title="2. Request security"
              subtitle="Correlation id, content-type enforcement and body size caps."
            >
              <SubSectionLabel>Correlation ID</SubSectionLabel>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6} md={3}>
                  <BooleanInput
                    source="api_gw.request_security.correlation.enabled"
                    label="Enabled"
                    helperText="Default on"
                  />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <TextInput
                    source="api_gw.request_security.correlation.header"
                    label="Header name"
                    fullWidth
                    helperText="Default X-Correlation-ID"
                  />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <BooleanInput
                    source="api_gw.request_security.correlation.echo_downstream"
                    label="Echo to client"
                    helperText="Default on"
                  />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <BooleanInput
                    source="api_gw.request_security.correlation.accept_inbound"
                    label="Accept inbound id"
                    helperText="Default on. An inbound id is validated before it is adopted; off always mints a fresh one."
                  />
                </Grid>
              </Grid>

              <SubSectionLabel>Content-Type enforcement</SubSectionLabel>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6} md={3}>
                  <BooleanInput
                    source="api_gw.request_security.content_type.enforce"
                    label="Enforce"
                    helperText="Default off"
                  />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <SelectArrayInput
                    source="api_gw.request_security.content_type.methods"
                    label="Methods"
                    fullWidth
                    choices={METHODS}
                    helperText="Default POST, PUT, PATCH"
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <SelectArrayInput
                    source="api_gw.request_security.content_type.allow"
                    label="Allowed types"
                    fullWidth
                    choices={[
                      { id: "application/json", name: "application/json" },
                      { id: "multipart/form-data", name: "multipart/form-data" },
                      {
                        id: "application/x-www-form-urlencoded",
                        name: "application/x-www-form-urlencoded",
                      },
                    ]}
                    create
                    createLabel="Add type"
                    helperText="Default application/json"
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <SelectArrayInput
                    source="api_gw.request_security.content_type.exempt_paths"
                    label="Exempt paths"
                    fullWidth
                    choices={[]}
                    create
                    createLabel="Add path"
                    helperText="Upload endpoints and anything that legitimately posts another type."
                  />
                </Grid>
              </Grid>

              <SubSectionLabel>Body size</SubSectionLabel>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6} md={4}>
                  <NumberInput
                    source="api_gw.request_security.max_body_bytes"
                    label="Max body bytes"
                    fullWidth
                    helperText="0 = no gateway limit. nginx client_max_body_size remains the hard backstop."
                  />
                </Grid>
                <Grid item xs={12} sm={6} md={4}>
                  <BooleanInput
                    source="api_gw.request_security.require_content_length"
                    label="Require Content-Length"
                    helperText="Closes the chunked-request hole, at the cost of breaking streaming clients. Default off."
                  />
                </Grid>
              </Grid>
            </SectionCard>

            {/* ── 3. CORS ─────────────────────────────────────────────── */}
            <SectionCard
              title="3. CORS"
              subtitle="Per-server origin policy and preflight handling."
            >
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6} md={3}>
                  <BooleanInput
                    source="api_gw.cors.enabled"
                    label="Enabled"
                    helperText="Default on"
                  />
                </Grid>
                <Grid item xs={12} md={9}>
                  <SelectArrayInput
                    source="api_gw.cors.origins"
                    label="Allowed origins"
                    fullWidth
                    choices={[]}
                    create
                    createLabel="Add origin"
                    helperText="Exact origin, or a single-label wildcard like https://*.example.com. Regex origins are not supported."
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <SelectArrayInput
                    source="api_gw.cors.methods"
                    label="Allowed methods"
                    fullWidth
                    choices={METHODS}
                    helperText="Default: all of the above"
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <SelectArrayInput
                    source="api_gw.cors.headers"
                    label="Allowed headers"
                    fullWidth
                    choices={[
                      { id: "Authorization", name: "Authorization" },
                      { id: "Content-Type", name: "Content-Type" },
                    ]}
                    create
                    createLabel="Add header"
                    helperText="Default Authorization, Content-Type"
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <SelectArrayInput
                    source="api_gw.cors.expose_headers"
                    label="Exposed headers"
                    fullWidth
                    choices={[]}
                    create
                    createLabel="Add header"
                    helperText="Response headers the browser may read, e.g. X-Correlation-ID"
                  />
                </Grid>
                <Grid item xs={12} sm={4} md={2}>
                  <BooleanInput
                    source="api_gw.cors.credentials"
                    label="Credentials"
                    helperText="The concrete origin is echoed, never *"
                  />
                </Grid>
                <Grid item xs={12} sm={4} md={2}>
                  <NumberInput
                    source="api_gw.cors.max_age"
                    label="Max age (s)"
                    fullWidth
                    helperText="Default 3600"
                  />
                </Grid>
                <Grid item xs={12} sm={4} md={2}>
                  <BooleanInput
                    source="api_gw.cors.preflight_continue"
                    label="Preflight continue"
                    helperText="Pass OPTIONS to the origin instead of answering at the edge"
                  />
                </Grid>
              </Grid>
            </SectionCard>

            {/* ── 4. IVT ──────────────────────────────────────────────── */}
            <SectionCard
              title="4. Traffic guard (IVT)"
              subtitle="Weighted signals — denied methods, denied paths, malformed credentials, spoofed headers, bursts — scored against a threshold."
            >
              <Alert severity="info" sx={{ mb: 2 }}>
                Deploy in <strong>audit</strong>, read the audit lines for a
                week, then tighten. <strong>monitor</strong> scores and
                annotates without rejecting; <strong>block</strong> rejects at
                or above the threshold.
              </Alert>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6} md={3}>
                  <SelectInput
                    source="api_gw.ivt.mode"
                    label="Mode"
                    fullWidth
                    choices={[
                      { id: "disabled", name: "disabled" },
                      { id: "audit", name: "audit — score and log only" },
                      { id: "monitor", name: "monitor — score and annotate" },
                      { id: "block", name: "block — reject at threshold" },
                    ]}
                    helperText="Start at audit"
                  />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <NumberInput
                    source="api_gw.ivt.block_threshold"
                    label="Block threshold"
                    fullWidth
                    helperText="Default 3"
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <SelectArrayInput
                    source="api_gw.ivt.methods.deny"
                    label="Denied methods"
                    fullWidth
                    choices={METHODS.concat([{ id: "TRACE", name: "TRACE" }])}
                    helperText="Leave empty to allow all"
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <SelectArrayInput
                    source="api_gw.ivt.path_denylist"
                    label="Path denylist (regex)"
                    fullWidth
                    choices={[]}
                    create
                    createLabel="Add pattern"
                    helperText="e.g. \\.env$ or /wp-admin"
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <SelectArrayInput
                    source="api_gw.ivt.strip_header_prefixes"
                    label="Strip header prefixes"
                    fullWidth
                    choices={[]}
                    create
                    createLabel="Add prefix"
                    helperText="Client headers the origin must never receive from outside, e.g. X-Internal-"
                  />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <BooleanInput
                    source="api_gw.ivt.require_auth_shape"
                    label="Require credential shape"
                    helperText="Score a malformed Authorization header. Shape only — no signature check."
                  />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <BooleanInput
                    source="api_gw.ivt.burst.enabled"
                    label="Burst counter"
                    helperText="Short-window flood signal, separate from rate limiting"
                  />
                </Grid>
                <FormDataConsumer>
                  {({ formData }) =>
                    formData?.api_gw?.ivt?.burst?.enabled && (
                      <>
                        <Grid item xs={12} sm={6} md={3}>
                          <NumberInput
                            source="api_gw.ivt.burst.window_seconds"
                            label="Burst window (s)"
                            fullWidth
                            helperText="Default 10"
                          />
                        </Grid>
                        <Grid item xs={12} sm={6} md={3}>
                          <NumberInput
                            source="api_gw.ivt.burst.max_requests"
                            label="Burst max requests"
                            fullWidth
                            helperText="0 = no burst limit"
                          />
                        </Grid>
                      </>
                    )
                  }
                </FormDataConsumer>
              </Grid>
            </SectionCard>

            {/* ── 5. auth ─────────────────────────────────────────────── */}
            <SectionCard
              title="5. Edge auth"
              subtitle="Optional. The origin can stay authoritative — passthrough records what the edge would have decided without enforcing it."
            >
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6} md={3}>
                  <SelectInput
                    source="api_gw.auth.strategy"
                    label="Strategy"
                    fullWidth
                    choices={[
                      { id: "passthrough", name: "passthrough — observe only" },
                      { id: "none", name: "none — no auth stage" },
                      { id: "api_key", name: "api_key" },
                      { id: "jwt", name: "jwt" },
                    ]}
                    helperText="Start at passthrough and read audit's auth.result before enforcing"
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <SelectArrayInput
                    source="api_gw.auth.public_paths"
                    label="Public paths"
                    fullWidth
                    choices={[]}
                    create
                    createLabel="Add path"
                    helperText="Never require a credential"
                  />
                </Grid>
                <Grid item xs={12} md={5}>
                  <SelectArrayInput
                    source="api_gw.auth.protected_paths"
                    label="Protected paths"
                    fullWidth
                    choices={[]}
                    create
                    createLabel="Add path"
                    helperText="Empty = every path outside the public list"
                  />
                </Grid>
              </Grid>

              <FormDataConsumer>
                {({ formData }) => {
                  const s = formData?.api_gw?.auth?.strategy;
                  if (s === "api_key") {
                    return (
                      <>
                        <SubSectionLabel>API key</SubSectionLabel>
                        <Grid container spacing={2}>
                          <Grid item xs={12} sm={6} md={3}>
                            <TextInput
                              source="api_gw.auth.api_key.header"
                              label="Header"
                              fullWidth
                              helperText="Default X-API-Key"
                            />
                          </Grid>
                          <Grid item xs={12} sm={6} md={3}>
                            <TextInput
                              source="api_gw.auth.api_key.query_param"
                              label="Query parameter"
                              fullWidth
                              helperText="Optional"
                            />
                          </Grid>
                          <Grid item xs={12} md={6}>
                            <TextInput
                              source="api_gw.auth.api_key.keys_ref"
                              label="Keys reference"
                              fullWidth
                              helperText='env://VAR_NAME or secret://record-id#field. Resolved at request time — the keys themselves are never stored in this record.'
                            />
                          </Grid>
                        </Grid>
                      </>
                    );
                  }
                  if (s === "jwt") {
                    return (
                      <>
                        <SubSectionLabel>JWT</SubSectionLabel>
                        <Alert severity="info" sx={{ mb: 2 }}>
                          The signing key is referenced, never stored here.
                          This record is synced to S3 and to git, so an inline
                          secret would be committed. Use{" "}
                          <code>secret://</code> or <code>env://</code>.
                        </Alert>
                        <Grid container spacing={2}>
                          <Grid item xs={12} md={6}>
                            <TextInput
                              source="api_gw.auth.jwt.secret_ref"
                              label="Secret reference"
                              fullWidth
                              helperText="secret://record-id#field or env://VAR_NAME. An unresolvable reference rejects the request — it never falls back to the literal string."
                            />
                          </Grid>
                          <Grid item xs={12} sm={6} md={3}>
                            <SelectInput
                              source="api_gw.auth.jwt.alg"
                              label="Algorithm"
                              fullWidth
                              choices={[
                                { id: "HS256", name: "HS256" },
                                { id: "HS384", name: "HS384" },
                                { id: "HS512", name: "HS512" },
                              ]}
                              helperText="Default HS256"
                            />
                          </Grid>
                          <Grid item xs={12} sm={6} md={3}>
                            <TextInput
                              source="api_gw.auth.jwt.claim_key"
                              label="Identity claim"
                              fullWidth
                              helperText="Default sub — also what rate_limit keys jwt.sub on"
                            />
                          </Grid>
                          <Grid item xs={12} sm={6} md={4}>
                            <TextInput
                              source="api_gw.auth.jwt.issuer"
                              label="Issuer (iss)"
                              fullWidth
                              helperText="Optional pin. One issuer only — multi-issuer belongs at the origin."
                            />
                          </Grid>
                          <Grid item xs={12} sm={6} md={4}>
                            <TextInput
                              source="api_gw.auth.jwt.audience"
                              label="Audience (aud)"
                              fullWidth
                              helperText="Optional pin"
                            />
                          </Grid>
                          <Grid item xs={12} sm={6} md={4}>
                            <NumberInput
                              source="api_gw.auth.jwt.leeway"
                              label="Leeway (s)"
                              fullWidth
                              helperText="Default 60"
                            />
                          </Grid>
                        </Grid>
                      </>
                    );
                  }
                  return null;
                }}
              </FormDataConsumer>
            </SectionCard>

            {/* ── 6. rate limit ───────────────────────────────────────── */}
            <SectionCard
              title="6. Rate limiting"
              subtitle="Named profiles, keyed per tenant. Counters are node-local — with several edges the effective global limit is limit × edge count."
            >
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6} md={3}>
                  <BooleanInput
                    source="api_gw.rate_limit.enabled"
                    label="Enabled"
                    helperText="Default on"
                  />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <SelectInput
                    source="api_gw.rate_limit.algorithm"
                    label="Algorithm"
                    fullWidth
                    choices={[
                      { id: "sliding", name: "sliding (default)" },
                      { id: "fixed", name: "fixed window" },
                    ]}
                  />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <TextInput
                    source="api_gw.rate_limit.default_profile"
                    label="Default profile"
                    fullWidth
                    helperText="Default 'standard'"
                  />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <NumberInput
                    source="api_gw.rate_limit.status"
                    label="Reject status"
                    fullWidth
                    helperText="Default 429"
                  />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <BooleanInput
                    source="api_gw.rate_limit.headers.standard"
                    label="RateLimit-* headers"
                    helperText="Default on"
                  />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <BooleanInput
                    source="api_gw.rate_limit.headers.legacy"
                    label="X-RateLimit-* headers"
                    helperText="Default on"
                  />
                </Grid>
              </Grid>

              <SubSectionLabel>Profiles</SubSectionLabel>
              <RateProfilesInput source="api_gw.rate_limit.profiles" />
            </SectionCard>

            {/* ── 7. audit ────────────────────────────────────────────── */}
            <SectionCard
              title="7. Audit logging"
              subtitle="One JSON line per request to the nginx error log, for a shipper to pick up."
            >
              <Alert severity="info" sx={{ mb: 2 }}>
                Audit lines are emitted at <code>info</code>. If your{" "}
                <code>error_log</code> level is higher, they are written
                nowhere and the tab will look like it is doing nothing.
              </Alert>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6} md={3}>
                  <BooleanInput
                    source="api_gw.audit.enabled"
                    label="Enabled"
                    helperText="Default on"
                  />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <SelectInput
                    source="api_gw.audit.level"
                    label="Level"
                    fullWidth
                    choices={["debug", "info", "notice", "warn", "error"].map(
                      (l) => ({ id: l, name: l })
                    )}
                    helperText="Default info"
                  />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <TextInput
                    source="api_gw.audit.tag"
                    label="Tag"
                    fullWidth
                    helperText="Default wsl_api_gw"
                  />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <NumberInput
                    source="api_gw.audit.sample_rate"
                    label="Sample rate"
                    fullWidth
                    helperText="1 = every request"
                  />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <BooleanInput
                    source="api_gw.audit.include_client_ip"
                    label="Include client IP"
                    helperText="Off by default — the hashed client key is logged instead"
                  />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <BooleanInput
                    source="api_gw.audit.include_query"
                    label="Include query string"
                    helperText="Default off"
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <SelectArrayInput
                    source="api_gw.audit.include_headers"
                    label="Include headers"
                    fullWidth
                    choices={[
                      { id: "user-agent", name: "user-agent" },
                      { id: "referer", name: "referer" },
                    ]}
                    create
                    createLabel="Add header"
                    helperText="Credential headers are dropped even if named here."
                  />
                </Grid>
              </Grid>
            </SectionCard>

            {/* ── 8. routes ───────────────────────────────────────────── */}
            <SectionCard
              title="8. Route policy matrix"
              subtitle="Per-path overrides. The most specific match wins; anything left blank inherits the server policy above."
            >
              <ArrayInput source="api_gw.routes" label="" fullWidth>
                <SimpleFormIterator fullWidth inline>
                  <TextInput source="name" label="Name" helperText={false} />
                  <TextInput
                    source="path"
                    label="Path"
                    helperText={false}
                  />
                  <SelectInput
                    source="path_key"
                    label="Match"
                    choices={[
                      { id: "starts_with", name: "starts_with" },
                      { id: "equals", name: "equals" },
                      { id: "ends_with", name: "ends_with" },
                    ]}
                    helperText={false}
                  />
                  <SelectArrayInput
                    source="methods"
                    label="Methods"
                    choices={METHODS}
                    helperText={false}
                  />
                  <SelectInput
                    source="auth"
                    label="Auth"
                    choices={[
                      { id: "none", name: "none" },
                      { id: "passthrough", name: "passthrough" },
                      { id: "api_key", name: "api_key" },
                      { id: "jwt", name: "jwt" },
                    ]}
                    helperText={false}
                  />
                  <TextInput
                    source="rate_profile"
                    label="Rate profile"
                    helperText={false}
                  />
                  <NumberInput
                    source="max_body_bytes"
                    label="Max body"
                    helperText={false}
                  />
                  <SelectInput
                    source="ivt_mode"
                    label="IVT"
                    choices={[
                      { id: "disabled", name: "disabled" },
                      { id: "audit", name: "audit" },
                      { id: "monitor", name: "monitor" },
                      { id: "block", name: "block" },
                    ]}
                    helperText={false}
                  />
                </SimpleFormIterator>
              </ArrayInput>
            </SectionCard>

            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Full reference:{" "}
              <Link href="/docs/api-gateway.md" target="_blank" rel="noreferrer">
                docs/api-gateway.md
              </Link>{" "}
              · schema: <code>docs/api-gw.schema.json</code> · migrating from
              Kong: <code>docs/api-gateway-kong-migration.md</code>
            </Typography>
          </>
        )
      }
    </FormDataConsumer>
  </div>
);

export default ApiGatewayTab;
