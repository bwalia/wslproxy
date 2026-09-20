import { Card, CardContent, Divider, Grid, Typography } from "@mui/material";
import React from "react";
import {
  BooleanInput,
  NumberInput,
  SimpleForm,
  TextInput,
  SelectInput,
  SelectArrayInput,
  ArrayInput,
  SimpleFormIterator,
  required,
} from "react-admin";
import "../styles/forms.css";

// HTTP methods offered in the method allow-list and per-route/OpenAPI selectors.
const METHOD_CHOICES = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].map(
  (m) => ({ id: m, name: m })
);
const ALG_CHOICES = ["none", "HS256", "HS384", "HS512", "RS256", "RS384", "RS512", "ES256", "ES384", "PS256"].map(
  (a) => ({ id: a, name: a })
);

// Section Card component for consistent styling
const SectionCard = ({ title, subtitle, children }) => (
  <Card variant="outlined" className="section-card">
    <CardContent>
      <Typography variant="subtitle1" className="section-card__title">
        {title}
      </Typography>
      {subtitle && (
        <Typography variant="body2" color="text.secondary" className="section-card__subtitle">
          {subtitle}
        </Typography>
      )}
      {!subtitle && <div className="section-card__spacer" />}
      {children}
    </CardContent>
  </Card>
);

// Sub-section label
const SubSectionLabel = ({ children }) => (
  <Typography variant="body2" color="text.secondary" className="sub-section-label">
    {children}
  </Typography>
);

const Form = () => {
  return (
    <SimpleForm>
      <div className="form-container">

        {/* Basic Policy Information */}
        <SectionCard title="Basic Policy Information" subtitle="Configure the WAF policy name and enforcement mode">
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6} md={4}>
              <TextInput
                source="name"
                label="Policy Name"
                validate={[required()]}
                fullWidth
                helperText="Unique name for this WAF policy"
              />
            </Grid>
            <Grid item xs={12} sm={6} md={4}>
              <SelectInput
                source="mode"
                label="Enforcement Mode"
                validate={[required()]}
                fullWidth
                choices={[
                  { id: 'block', name: 'Block' },
                  { id: 'monitor', name: 'Monitor' },
                ]}
                helperText="Block threats or monitor only"
              />
            </Grid>
            <Grid item xs={12} sm={6} md={4}>
              <BooleanInput
                source="enabled"
                label="Enabled"
                defaultValue={true}
                helperText="Enable or disable this policy"
              />
            </Grid>
            <Grid item xs={12} sm={6} md={4}>
              <TextInput
                source="service"
                label="Service"
                fullWidth
                helperText="Logical app label recorded on findings (e.g. payments)"
              />
            </Grid>
            <Grid item xs={12}>
              <TextInput
                source="description"
                label="Description"
                multiline
                fullWidth
                minRows={2}
                helperText="Describe the purpose of this policy"
              />
            </Grid>
          </Grid>
        </SectionCard>

        {/* Detection Configuration */}
        <SectionCard title="Detection Configuration" subtitle="Configure anomaly scoring and paranoia level">
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6} md={4}>
              <NumberInput
                source="anomaly_threshold"
                label="Anomaly Threshold"
                defaultValue={5}
                fullWidth
                helperText="Score threshold to trigger action"
              />
            </Grid>
            <Grid item xs={12} sm={6} md={4}>
              <SelectInput
                source="paranoia_level"
                label="Paranoia Level"
                fullWidth
                choices={[
                  { id: 1, name: 'Level 1 - Low (Recommended)' },
                  { id: 2, name: 'Level 2 - Medium' },
                  { id: 3, name: 'Level 3 - High' },
                  { id: 4, name: 'Level 4 - Maximum' },
                ]}
                helperText="Higher levels detect more but may have false positives"
              />
            </Grid>
          </Grid>
        </SectionCard>

        {/* Body Inspection */}
        <SectionCard title="Body Inspection" subtitle="Configure request body inspection settings">
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6} md={4}>
              <BooleanInput
                source="body_inspection"
                label="Enable Body Inspection"
                helperText="Inspect request body content"
              />
            </Grid>
            <Grid item xs={12} sm={6} md={4}>
              <NumberInput
                source="max_body_size"
                label="Max Body Size (bytes)"
                fullWidth
                helperText="Maximum body size to inspect"
              />
            </Grid>
          </Grid>
        </SectionCard>

        {/* WAF Rules */}
        <SectionCard title="WAF Rules" subtitle="Assign WAF rules to this policy">
          <ArrayInput source="waf_rules" label="">
            <SimpleFormIterator
              inline
              disableReordering
            >
              <TextInput
                source=""
                label="Rule ID"
                helperText="WAF rule identifier"
              />
            </SimpleFormIterator>
          </ArrayInput>
        </SectionCard>

        {/* Positive security: methods + filetypes */}
        <SectionCard title="Positive Security" subtitle="Allow-list HTTP methods and deny risky file types">
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <SelectArrayInput
                source="methods.allow"
                label="Allowed Methods"
                choices={METHOD_CHOICES}
                fullWidth
                helperText="Any method not listed is rejected (VIOL_METHOD). Leave empty to allow all."
              />
            </Grid>
          </Grid>
          <SubSectionLabel>Denied file types</SubSectionLabel>
          <ArrayInput source="filetypes.deny" label="">
            <SimpleFormIterator inline disableReordering>
              <TextInput source="" label="Extension" helperText="e.g. .env, .sql, .git" />
            </SimpleFormIterator>
          </ArrayInput>
        </SectionCard>

        {/* API controls: JWT + JSON profile */}
        <SectionCard title="API Controls" subtitle="JWT algorithm policy and JSON body limits">
          <Grid container spacing={2}>
            <Grid item xs={12} sm={4}>
              <TextInput source="jwt.header" label="JWT Header" defaultValue="Authorization" fullWidth
                helperText="Header carrying the bearer token" />
            </Grid>
            <Grid item xs={12} sm={4}>
              <SelectArrayInput source="jwt.denyAlg" label="Denied Algorithms" choices={ALG_CHOICES} fullWidth
                helperText="Reject tokens with these alg values (e.g. none, HS256)" />
            </Grid>
            <Grid item xs={12} sm={4}>
              <SelectArrayInput source="jwt.requireAlg" label="Required Algorithms" choices={ALG_CHOICES} fullWidth
                helperText="If set, only these algs are permitted" />
            </Grid>
            <Grid item xs={12} sm={6}>
              <NumberInput source="jsonProfile.maxDepth" label="JSON Max Depth" fullWidth
                helperText="Reject JSON bodies nested deeper than this" />
            </Grid>
            <Grid item xs={12} sm={6}>
              <NumberInput source="jsonProfile.maxBytes" label="JSON Max Bytes" fullWidth
                helperText="Reject JSON bodies larger than this" />
            </Grid>
          </Grid>
        </SectionCard>

        {/* Brute-force velocity */}
        <SectionCard title="Brute-force Protection" subtitle="Per-client attempt ceilings on sensitive paths">
          <ArrayInput source="bruteForce" label="">
            <SimpleFormIterator disableReordering>
              <TextInput source="path" label="Path" helperText="e.g. /api/login" />
              <NumberInput source="windowSec" label="Window (s)" defaultValue={60} />
              <NumberInput source="maxAttempts" label="Max Attempts" defaultValue={5} />
              <SelectInput source="action" label="Action" defaultValue="block"
                choices={[{ id: 'block', name: 'Block' }, { id: 'alarm', name: 'Alarm' }]} />
              <SelectArrayInput source="keyBy" label="Key By"
                choices={[{ id: 'ip', name: 'Client IP' }, { id: 'usernameParam', name: 'Username param' }]} />
            </SimpleFormIterator>
          </ArrayInput>
        </SectionCard>

        {/* Geo / IP lists */}
        <SectionCard title="Geo & IP Lists" subtitle="Country deny-list and IP allow/deny lists">
          <SubSectionLabel>Denied countries (ISO-2)</SubSectionLabel>
          <ArrayInput source="geo.denyCountries" label="">
            <SimpleFormIterator inline disableReordering>
              <TextInput source="" label="Country" helperText="e.g. KP, RU" />
            </SimpleFormIterator>
          </ArrayInput>
          <Divider className="form-divider" />
          <SubSectionLabel>IP allow list (bypasses IP/geo)</SubSectionLabel>
          <ArrayInput source="ipLists.allow" label="">
            <SimpleFormIterator inline disableReordering>
              <TextInput source="" label="IP / CIDR" helperText="e.g. 10.0.0.0/8" />
            </SimpleFormIterator>
          </ArrayInput>
          <Divider className="form-divider" />
          <SubSectionLabel>IP deny list</SubSectionLabel>
          <ArrayInput source="ipLists.deny" label="">
            <SimpleFormIterator inline disableReordering>
              <TextInput source="" label="IP / CIDR" helperText="e.g. 5.6.7.0/24" />
            </SimpleFormIterator>
          </ArrayInput>
        </SectionCard>

        {/* Signature governance */}
        <SectionCard title="Signature Governance" subtitle="Set toggles, disabled IDs, and staged (log-only) rollout">
          <SubSectionLabel>Signature sets</SubSectionLabel>
          <ArrayInput source="signatureSets" label="">
            <SimpleFormIterator disableReordering>
              <TextInput source="id" label="Set ID" helperText="e.g. SET_SQLI" />
              <BooleanInput source="block" label="Block" defaultValue={true} />
              <BooleanInput source="alarm" label="Alarm" defaultValue={true} />
            </SimpleFormIterator>
          </ArrayInput>
          <Divider className="form-divider" />
          <SubSectionLabel>Disabled signature IDs</SubSectionLabel>
          <ArrayInput source="signatures.disable" label="">
            <SimpleFormIterator inline disableReordering>
              <TextInput source="" label="Rule ID" helperText="e.g. waf-rule-xss-005" />
            </SimpleFormIterator>
          </ArrayInput>
          <Divider className="form-divider" />
          <SubSectionLabel>Staged signatures (alarm-only until date)</SubSectionLabel>
          <ArrayInput source="signatures.stage" label="">
            <SimpleFormIterator disableReordering>
              <TextInput source="id" label="Rule ID" />
              <TextInput source="until" label="Until (ISO-8601)" helperText="e.g. 2026-12-31T00:00:00Z" />
            </SimpleFormIterator>
          </ArrayInput>
        </SectionCard>

        {/* OpenAPI positive security */}
        <SectionCard title="OpenAPI Positive Security" subtitle="Allow only declared path+method pairs under a base path">
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <TextInput source="openapi.basePath" label="Base Path" fullWidth
                helperText="Only enforce under this prefix, e.g. /api" />
            </Grid>
          </Grid>
          <SubSectionLabel>Declared endpoints</SubSectionLabel>
          <ArrayInput source="openapi.paths" label="">
            <SimpleFormIterator disableReordering>
              <TextInput source="path" label="Path" helperText="e.g. /api/accounts/{id}" />
              <SelectArrayInput source="methods" label="Methods" choices={METHOD_CHOICES} />
            </SimpleFormIterator>
          </ArrayInput>
        </SectionCard>

        {/* Route overrides (binding precedence) */}
        <SectionCard title="Route Overrides" subtitle="Per-route enforcement — route beats server beats domain">
          <ArrayInput source="routeOverrides" label="">
            <SimpleFormIterator disableReordering>
              <TextInput source="path" label="Path Prefix" helperText="e.g. /preview" />
              <SelectArrayInput source="methods" label="Methods (blank = all)" choices={METHOD_CHOICES} />
              <SelectInput source="enforcementMode" label="Mode"
                choices={[{ id: 'blocking', name: 'Blocking' }, { id: 'transparent', name: 'Transparent' }]} />
            </SimpleFormIterator>
          </ArrayInput>
        </SectionCard>

        {/* Whitelist Configuration */}
        <SectionCard title="Whitelist Configuration" subtitle="Define exceptions that bypass WAF inspection">

          <SubSectionLabel>Whitelisted IP Addresses</SubSectionLabel>
          <ArrayInput source="whitelist.ips" label="">
            <SimpleFormIterator
              inline
              disableReordering
            >
              <TextInput
                source=""
                label="IP Address"
                helperText="e.g., 192.168.1.0/24"
              />
            </SimpleFormIterator>
          </ArrayInput>

          <Divider className="form-divider" />

          <SubSectionLabel>Whitelisted Paths</SubSectionLabel>
          <ArrayInput source="whitelist.paths" label="">
            <SimpleFormIterator
              inline
              disableReordering
            >
              <TextInput
                source=""
                label="Path"
                helperText="e.g., /api/health"
              />
            </SimpleFormIterator>
          </ArrayInput>

          <Divider className="form-divider" />

          <SubSectionLabel>Whitelisted User Agents</SubSectionLabel>
          <ArrayInput source="whitelist.user_agents" label="">
            <SimpleFormIterator
              inline
              disableReordering
            >
              <TextInput
                source=""
                label="User Agent"
                helperText="e.g., Googlebot"
              />
            </SimpleFormIterator>
          </ArrayInput>

        </SectionCard>

      </div>
    </SimpleForm>
  );
};

export default Form;