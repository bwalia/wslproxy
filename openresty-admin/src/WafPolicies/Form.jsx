import { Card, CardContent, Divider, Grid, Typography } from "@mui/material";
import React from "react";
import {
  BooleanInput,
  NumberInput,
  SimpleForm,
  TextInput,
  SelectInput,
  ArrayInput,
  SimpleFormIterator,
  required,
} from "react-admin";
import "../styles/forms.css";

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