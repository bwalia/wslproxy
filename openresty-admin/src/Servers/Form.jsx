import { Box, Card, CardContent, Divider, Grid, Link, Stack, Typography, Alert } from "@mui/material";
import React from "react";
import {
  TextInput,
  TabbedForm,
  ArrayInput,
  SimpleFormIterator,
  SelectInput,
  useDataProvider,
  ReferenceArrayInput,
  FormDataConsumer,
  Menu,
  required,
  ReferenceInput,
  SelectArrayInput,
  AutocompleteInput,
  BooleanInput,
  email,
  useRecordContext,
} from "react-admin";

import LocationInput from "./input/LocationInput";
import CreateServerText from "./input/CreateServerText";
import Toolbar from "./toolbar/Toolbar";
import CreateTags from "../component/CreateTags";
import get from 'lodash/get';

const handleProfileChange = (e) => {
  localStorage.setItem('environment', e.target.value);
}

// Section Card component for consistent styling
const SectionCard = ({ title, subtitle, children, noPadding = false }) => (
  <Card variant="outlined" sx={{ mb: 3, width: '100%' }}>
    <CardContent sx={{ pb: noPadding ? 0 : 2 }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 0.5 }}>
        {title}
      </Typography>
      {subtitle && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {subtitle}
        </Typography>
      )}
      {!subtitle && <Box sx={{ mb: 1 }} />}
      {children}
    </CardContent>
  </Card>
);

// Sub-section label
const SubSectionLabel = ({ children }) => (
  <Typography variant="body2" sx={{ fontWeight: 500, color: 'text.secondary', mb: 1 }}>
    {children}
  </Typography>
);

const Form = ({ type }) => {
  const dataProvider = useDataProvider();
  const [totalResults, setTotalResults] = React.useState(0);
  const record = useRecordContext();
  const serverName = get(record, "server_name");

  React.useEffect(() => {
    const fetchData = async () => {
      try {
        const { total } = await dataProvider.getList("rules", {
          filter: {},
          pagination: { page: 1, perPage: 10 },
        });
        setTotalResults(total);
      } catch (error) {
        console.log({ error });
      }
    };
    fetchData();
  }, [dataProvider]);

  const secretTags = localStorage.getItem('servers.tags') || "";

  const [choices, setChoices] = React.useState([]);
  React.useEffect(() => {
    if (secretTags && secretTags !== "undefined") {
      try {
        const tags = JSON.parse(secretTags);
        const prevTags = tags.map((tag) => ({ id: tag, name: tag }));
        setChoices(prevTags);
      } catch (e) {
        console.log('Error parsing tags:', e);
      }
    }
  }, [secretTags]);

  return (
    <TabbedForm toolbar={<Toolbar />} syncWithLocation={false}>
      <TabbedForm.Tab label="Nginx Server">
        <Box sx={{ width: '100%', maxWidth: 1200, py: 2 }}>

          {/* Basic Server Configuration */}
          <SectionCard title="Basic Server Configuration" subtitle="Configure the primary server settings including domain and profile">
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6} md={3}>
                <TextInput
                  source="server_name"
                  fullWidth
                  label="Server/Domain Name"
                  validate={[required()]}
                  disabled={type === "edit"}
                  helperText={
                    serverName ? (
                      <Stack spacing={0.5}>
                        <Link href={`https://${serverName}`} target="_blank" sx={{ fontSize: '0.75rem' }}>
                          {`https://${serverName}`}
                        </Link>
                        <Link href={`http://${serverName}`} target="_blank" sx={{ fontSize: '0.75rem' }}>
                          {`http://${serverName}`}
                        </Link>
                      </Stack>
                    ) : "e.g., example.com"
                  }
                />
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <TextInput
                  source="proxy_server_name"
                  fullWidth
                  label="Proxy Server/Domain Name"
                  helperText="Optional proxy hostname"
                />
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <ReferenceInput source="profile_id" reference="profiles">
                  <SelectInput
                    fullWidth
                    optionText="name"
                    onChange={handleProfileChange}
                    validate={[required()]}
                    helperText="Environment profile"
                  />
                </ReferenceInput>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <SelectArrayInput
                  source="servers_tags"
                  choices={choices}
                  create={<CreateTags choices={choices} />}
                  fullWidth
                  helperText="Organization tags"
                />
              </Grid>
            </Grid>
          </SectionCard>

          {/* Server Paths & Ports */}
          <SectionCard title="Server Paths & Ports" subtitle="Configure document root, ports, and log file locations">
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6} md={3}>
                <TextInput
                  source="root"
                  defaultValue="/var/www/html"
                  fullWidth
                  label="Document Root"
                  helperText="Root directory"
                />
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <TextInput
                  source="index"
                  defaultValue="index.html"
                  fullWidth
                  label="Index File"
                  helperText="Default index"
                />
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <TextInput
                  source="access_log"
                  defaultValue="logs/access.log"
                  fullWidth
                  label="Access Log"
                  helperText="Access log path"
                />
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <TextInput
                  source="error_log"
                  defaultValue="logs/error.log"
                  fullWidth
                  label="Error Log"
                  helperText="Error log path"
                />
              </Grid>
            </Grid>

            <Divider sx={{ my: 2 }} />

            <SubSectionLabel>Listen Ports</SubSectionLabel>
            <ArrayInput source="listens" label="" defaultValue={[{ listen: "" }]}>
              <SimpleFormIterator inline disableReordering>
                <TextInput source="listen" label="Port" helperText="e.g., 80, 443" sx={{ width: 150 }} />
              </SimpleFormIterator>
            </ArrayInput>
          </SectionCard>

          {/* SSL Certificate Section */}
          <SectionCard title="SSL Certificate (Let's Encrypt)" subtitle="Enable automatic SSL certificate provisioning">
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6} md={3}>
                <BooleanInput
                  source="ssl_enabled"
                  label="Enable SSL Certificate"
                  defaultValue={false}
                  helperText="Auto-obtain from Let's Encrypt"
                />
              </Grid>
              <FormDataConsumer>
                {({ formData }) => formData?.ssl_enabled && (
                  <>
                    <Grid item xs={12} sm={6} md={3}>
                      <TextInput
                        source="ssl_email"
                        label="SSL Contact Email"
                        fullWidth
                        validate={[required(), email()]}
                        helperText="For notifications"
                      />
                    </Grid>
                    <Grid item xs={12} sm={6} md={3}>
                      <BooleanInput
                        source="ssl_auto_renew"
                        label="Auto-renew"
                        defaultValue={true}
                        helperText="Renew before expiry"
                      />
                    </Grid>
                    <Grid item xs={12} sm={6} md={3}>
                      <BooleanInput
                        source="ssl_force_https"
                        label="Force HTTPS"
                        defaultValue={true}
                        helperText="Redirect HTTP to HTTPS"
                      />
                    </Grid>
                    <Grid item xs={12} sm={6} md={3}>
                      <BooleanInput
                        source="ssl_staging"
                        label="Staging Mode (Testing)"
                        defaultValue={true}
                        helperText="Use Let's Encrypt staging for testing"
                      />
                    </Grid>
                    <Grid item xs={12}>
                      <FormDataConsumer>
                        {({ formData: innerFormData }) => innerFormData?.ssl_staging ? (
                          <Alert severity="warning">
                            <strong>Staging Mode Enabled:</strong> Certificates will be issued by Let's Encrypt staging environment.
                            These are test certificates and will show browser warnings. Disable staging mode for production use.
                          </Alert>
                        ) : (
                          <Alert severity="info">
                            <strong>Production Mode:</strong> Real certificates will be obtained from Let's Encrypt.
                            Ensure your domain DNS is properly configured and pointing to this server.
                          </Alert>
                        )}
                      </FormDataConsumer>
                    </Grid>
                  </>
                )}
              </FormDataConsumer>
            </Grid>
          </SectionCard>

          {/* Custom Headers */}
          <SectionCard title="Custom Headers" subtitle="Add custom HTTP headers to responses">
            <ArrayInput source="custom_headers" label="">
              <SimpleFormIterator inline disableReordering>
                <TextInput source="header_key" label="Header Name" sx={{ minWidth: 200 }} />
                <TextInput source="header_value" label="Header Value" sx={{ minWidth: 300 }} />
              </SimpleFormIterator>
            </ArrayInput>
          </SectionCard>

          {/* Location Blocks */}
          <SectionCard title="Location Blocks" subtitle="Configure URL path routing and proxy settings" noPadding>
            <LocationInput source="locations" />
          </SectionCard>

          {/* Advanced Configuration */}
          <SectionCard title="Advanced Configuration" subtitle="Add custom nginx configuration blocks">
            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <SubSectionLabel>Additional Server Block</SubSectionLabel>
                <ArrayInput source="custom_block" label="">
                  <SimpleFormIterator disableReordering>
                    <TextInput
                      multiline
                      fullWidth
                      source="additional_block"
                      className="config-block"
                      label=""
                      minRows={4}
                      placeholder="# Add custom server block directives here"
                    />
                  </SimpleFormIterator>
                </ArrayInput>
              </Grid>
              <Grid item xs={12} md={6}>
                <SubSectionLabel>Additional Location Block</SubSectionLabel>
                <ArrayInput source="custom_location_block" label="">
                  <SimpleFormIterator disableReordering>
                    <TextInput
                      multiline
                      fullWidth
                      source="additional_location_block"
                      className="config-block"
                      label=""
                      minRows={4}
                      placeholder="# Add custom location block directives here"
                    />
                  </SimpleFormIterator>
                </ArrayInput>
              </Grid>
              <Grid item xs={12}>
                <SubSectionLabel>Additional HTTP Block</SubSectionLabel>
                <ArrayInput source="custom_http_block" label="">
                  <SimpleFormIterator disableReordering>
                    <TextInput
                      multiline
                      fullWidth
                      source="additional_http_block"
                      className="config-block"
                      label=""
                      minRows={4}
                      placeholder="# Add custom http block directives here"
                    />
                  </SimpleFormIterator>
                </ArrayInput>
              </Grid>
            </Grid>
          </SectionCard>

          {/* Generated Configuration Preview */}
          <SectionCard title="Generated Configuration" subtitle="Preview of the generated nginx configuration">
            <CreateServerText source="config" />
          </SectionCard>

        </Box>
      </TabbedForm.Tab>

      <TabbedForm.Tab label="Varnish Server">
        <Box sx={{ width: '100%', maxWidth: 1200, py: 2 }}>
          {totalResults >= 1 ? (
            <SectionCard title="Varnish Server Configuration" subtitle="Generated Varnish VCL configuration">
              <TextInput
                multiline
                fullWidth
                source="varnish_vcl_config"
                label=""
                className="code_area"
                minRows={15}
              />
            </SectionCard>
          ) : (
            <Card variant="outlined">
              <CardContent sx={{ textAlign: 'center', py: 4 }}>
                <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
                  There are no rules available yet. Please create rules first.
                </Typography>
                <Menu.Item to="/rules" primaryText="Create Rules" />
              </CardContent>
            </Card>
          )}
        </Box>
      </TabbedForm.Tab>

      <TabbedForm.Tab label="Server Rules">
        <Box sx={{ width: '100%', maxWidth: 1200, py: 2 }}>
          {totalResults >= 1 ? (
            <SectionCard title="Server Rules" subtitle="Select and configure rules for this server">
              <Grid container spacing={2}>
                <Grid item xs={12}>
                  <ReferenceArrayInput source="rules" reference="rules" perPage={1000}>
                    <AutocompleteInput optionText="name" fullWidth label="Select Rules" />
                  </ReferenceArrayInput>
                </Grid>
                <FormDataConsumer>
                  {({ formData }) => formData?.rules && totalResults > 1 && (
                    <Grid item xs={12}>
                      <Divider sx={{ my: 2 }} />
                      <SubSectionLabel>Match Conditions</SubSectionLabel>
                      <ArrayInput source="match_cases" label="">
                        <SimpleFormIterator inline disableReordering>
                          <SelectInput
                            defaultValue="none"
                            source="condition"
                            label="Condition"
                            sx={{ minWidth: 120 }}
                            choices={[
                              { id: "none", name: "N/A" },
                              { id: "or", name: "OR" },
                              { id: "and", name: "AND" },
                            ]}
                          />
                          <ReferenceArrayInput
                            source="statement"
                            queryOptions={{ meta: { exclude: formData?.rules } }}
                            reference="rules"
                            perPage={1000}
                          >
                            <AutocompleteInput optionText="name" sx={{ minWidth: 300 }} label="Rule" />
                          </ReferenceArrayInput>
                        </SimpleFormIterator>
                      </ArrayInput>
                    </Grid>
                  )}
                </FormDataConsumer>
              </Grid>
            </SectionCard>
          ) : (
            <Card variant="outlined">
              <CardContent sx={{ textAlign: 'center', py: 4 }}>
                <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
                  There are no rules available yet. Please create rules first.
                </Typography>
                <Menu.Item to="/rules" primaryText="Create Rules" />
              </CardContent>
            </Card>
          )}
        </Box>
      </TabbedForm.Tab>
    </TabbedForm>
  );
};

export default Form;
