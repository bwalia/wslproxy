import { Card, CardContent, Grid, Typography } from "@mui/material";
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

const Form = () => {
  return (
    <SimpleForm>
      <div className="form-container">

        {/* Basic Rule Information */}
        <SectionCard title="Basic Rule Information" subtitle="Configure the WAF rule name, category, and severity">
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6} md={4}>
              <TextInput
                source="name"
                label="Rule Name"
                validate={[required()]}
                fullWidth
                helperText="Unique name for this WAF rule"
              />
            </Grid>
            <Grid item xs={12} sm={6} md={4}>
              <SelectInput
                source="category"
                label="Category"
                fullWidth
                choices={[
                  { id: 'sqli', name: 'SQL Injection' },
                  { id: 'xss', name: 'Cross-Site Scripting' },
                  { id: 'cmdi', name: 'Command Injection' },
                  { id: 'lfi', name: 'Local File Inclusion' },
                  { id: 'rfi', name: 'Remote File Inclusion' },
                  { id: 'protocol', name: 'Protocol Violation' },
                  { id: 'custom', name: 'Custom Rule' },
                ]}
                helperText="Attack category this rule detects"
              />
            </Grid>
            <Grid item xs={12} sm={6} md={4}>
              <SelectInput
                source="severity"
                label="Severity"
                fullWidth
                choices={[
                  { id: 'critical', name: 'Critical' },
                  { id: 'high', name: 'High' },
                  { id: 'medium', name: 'Medium' },
                  { id: 'low', name: 'Low' },
                  { id: 'info', name: 'Info' },
                ]}
                helperText="Severity level of the threat"
              />
            </Grid>
            <Grid item xs={12}>
              <TextInput
                source="description"
                label="Description"
                multiline
                fullWidth
                minRows={2}
                helperText="Describe what this rule detects"
              />
            </Grid>
          </Grid>
        </SectionCard>

        {/* Pattern Configuration */}
        <SectionCard title="Pattern Configuration" subtitle="Define the detection pattern and target for this rule">
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6} md={4}>
              <SelectInput
                source="target"
                label="Target"
                fullWidth
                choices={[
                  { id: 'url', name: 'URL' },
                  { id: 'headers', name: 'Headers' },
                  { id: 'body', name: 'Body' },
                  { id: 'args', name: 'Arguments' },
                  { id: 'cookies', name: 'Cookies' },
                  { id: 'user_agent', name: 'User Agent' },
                  { id: 'all', name: 'All' },
                ]}
                helperText="Part of the request to inspect"
              />
            </Grid>
            <Grid item xs={12} sm={6} md={4}>
              <SelectInput
                source="pattern_type"
                label="Pattern Type"
                fullWidth
                defaultValue="regex"
                choices={[
                  { id: 'regex', name: 'Regular Expression' },
                  { id: 'string', name: 'String Match' },
                ]}
                helperText="Type of pattern matching"
              />
            </Grid>
            <Grid item xs={12}>
              <TextInput
                source="pattern"
                label="Pattern"
                validate={[required()]}
                multiline
                fullWidth
                minRows={3}
                helperText="Detection pattern (regex or string)"
              />
            </Grid>
          </Grid>
        </SectionCard>

        {/* Action Configuration */}
        <SectionCard title="Action Configuration" subtitle="Define what happens when this rule matches">
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6} md={4}>
              <SelectInput
                source="action"
                label="Action"
                fullWidth
                choices={[
                  { id: 'block', name: 'Block' },
                  { id: 'monitor', name: 'Monitor' },
                  { id: 'allow', name: 'Allow' },
                ]}
                helperText="Action to take on match"
              />
            </Grid>
            <Grid item xs={12} sm={6} md={4}>
              <NumberInput
                source="score"
                label="Anomaly Score"
                fullWidth
                helperText="Score added to anomaly threshold"
              />
            </Grid>
            <Grid item xs={12} sm={6} md={4}>
              <BooleanInput
                source="enabled"
                label="Enabled"
                defaultValue={true}
                helperText="Enable or disable this rule"
              />
            </Grid>
          </Grid>
        </SectionCard>

        {/* Tags */}
        <SectionCard title="Tags" subtitle="Add tags for organizing and filtering rules">
          <ArrayInput source="tags" label="">
            <SimpleFormIterator
              inline
              disableReordering
            >
              <TextInput
                source=""
                label="Tag"
                helperText="Rule tag"
              />
            </SimpleFormIterator>
          </ArrayInput>
        </SectionCard>

      </div>
    </SimpleForm>
  );
};

export default Form;