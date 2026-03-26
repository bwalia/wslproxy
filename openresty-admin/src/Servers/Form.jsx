import {
  Card,
  CardContent,
  Divider,
  Grid,
  Link,
  Stack,
  Typography,
  Alert,
} from "@mui/material";
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
import VarnishSnippetEditor from "./VarnishSnippetEditor";
import VarnishDeployPanel from "./VarnishDeployPanel";
import VersionHistoryTab from "../Versions/VersionHistoryTab";
import TopologyTab from "../Topology/TopologyTab";
import get from "lodash/get";
import "../styles/forms.css";

const handleProfileChange = (e) => {
  localStorage.setItem("environment", e.target.value);
};

// Section Card component for consistent styling
const SectionCard = ({ title, subtitle, children, noPadding = false }) => (
  <Card
    variant="outlined"
    className={`section-card${noPadding ? " section-card--no-padding" : ""}`}
  >
    <CardContent>
      <Typography variant="subtitle1" className="section-card__title">
        {title}
      </Typography>
      {subtitle && (
        <Typography
          variant="body2"
          color="text.secondary"
          className="section-card__subtitle"
        >
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
  <Typography
    variant="body2"
    color="text.secondary"
    className="sub-section-label"
  >
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

  const secretTags = localStorage.getItem("servers.tags") || "";

  const [choices, setChoices] = React.useState([]);
  React.useEffect(() => {
    if (secretTags && secretTags !== "undefined") {
      try {
        const tags = JSON.parse(secretTags);
        const prevTags = tags.map((tag) => ({ id: tag, name: tag }));
        setChoices(prevTags);
      } catch (e) {
        console.log("Error parsing tags:", e);
      }
    }
  }, [secretTags]);

  return (
    <TabbedForm toolbar={<Toolbar />} syncWithLocation={false}>
      <TabbedForm.Tab label="Nginx Server">
        <div className="form-container">
          {/* Basic Server Configuration */}
          <SectionCard
            title="Basic Server Configuration"
            subtitle="Configure the primary server settings including domain and profile"
          >
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
                        <Link
                          href={`https://${serverName}`}
                          target="_blank"
                          className="server-link"
                        >
                          {`https://${serverName}`}
                        </Link>
                        <Link
                          href={`http://${serverName}`}
                          target="_blank"
                          className="server-link"
                        >
                          {`http://${serverName}`}
                        </Link>
                      </Stack>
                    ) : (
                      "e.g., example.com"
                    )
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
          <SectionCard
            title="Server Paths & Ports"
            subtitle="Configure document root, ports, and log file locations"
          >
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

            <Divider className="form-divider" />

            <SubSectionLabel>Listen Ports</SubSectionLabel>
            <ArrayInput
              source="listens"
              label=""
              defaultValue={[{ listen: "" }]}
            >
              <SimpleFormIterator
                inline
                disableReordering
                className="server-listen-ports"
              >
                <TextInput
                  source="listen"
                  label="Port"
                  helperText="e.g., 80, 443"
                />
              </SimpleFormIterator>
            </ArrayInput>
          </SectionCard>

          {/* SSL Certificate Section */}
          <SectionCard
            title="SSL Certificate (Let's Encrypt)"
            subtitle="Enable automatic SSL certificate provisioning"
          >
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
                {({ formData }) =>
                  formData?.ssl_enabled && (
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
                          {({ formData: innerFormData }) =>
                            innerFormData?.ssl_staging ? (
                              <Alert severity="warning">
                                <strong>Staging Mode Enabled:</strong>{" "}
                                Certificates will be issued by Let's Encrypt
                                staging environment. These are test certificates
                                and will show browser warnings. Disable staging
                                mode for production use.
                              </Alert>
                            ) : (
                              <Alert severity="info">
                                <strong>Production Mode:</strong> Real
                                certificates will be obtained from Let's
                                Encrypt. Ensure your domain DNS is properly
                                configured and pointing to this server.
                              </Alert>
                            )
                          }
                        </FormDataConsumer>
                      </Grid>
                    </>
                  )
                }
              </FormDataConsumer>
            </Grid>
          </SectionCard>

          {/* Static Content Caching Section */}
          <SectionCard
            title="Static Content Caching"
            subtitle="Cache static files (JS, CSS, images, fonts) in memory for faster delivery"
          >
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6} md={3}>
                <BooleanInput
                  source="cache_enabled"
                  label="Enable Caching"
                  defaultValue={false}
                  helperText="Cache static content in memory"
                />
              </Grid>
              <FormDataConsumer>
                {({ formData }) =>
                  formData?.cache_enabled && (
                    <>
                      <Grid item xs={12} sm={6} md={3}>
                        <TextInput
                          source="cache_ttl"
                          label="Cache TTL (seconds)"
                          fullWidth
                          defaultValue="3600"
                          helperText="Time to keep in cache"
                        />
                      </Grid>
                      <Grid item xs={12} sm={6} md={3}>
                        <BooleanInput
                          source="cache_bypass_auth"
                          label="Bypass for Authenticated"
                          defaultValue={true}
                          helperText="Skip cache if Authorization header present"
                        />
                      </Grid>
                      <Grid item xs={12} sm={6} md={3}>
                        <TextInput
                          source="cache_bypass_cookie"
                          label="Bypass Cookie Name"
                          fullWidth
                          helperText="Cookie that bypasses cache"
                        />
                      </Grid>
                      <Grid item xs={12}>
                        <SelectArrayInput
                          source="cached_mime_types"
                          label="Cached MIME Types (Optional Override)"
                          fullWidth
                          helperText="Leave empty to use defaults, or select specific MIME types to cache"
                          choices={[
                            { id: "text/css", name: "CSS (text/css)" },
                            { id: "text/javascript", name: "JavaScript (text/javascript)" },
                            { id: "application/javascript", name: "JavaScript (application/javascript)" },
                            { id: "application/json", name: "JSON (application/json)" },
                            { id: "application/xml", name: "XML (application/xml)" },
                            { id: "text/xml", name: "XML (text/xml)" },
                            { id: "text/plain", name: "Plain Text (text/plain)" },
                            { id: "text/html", name: "HTML (text/html)" },
                            { id: "image/jpeg", name: "JPEG (image/jpeg)" },
                            { id: "image/png", name: "PNG (image/png)" },
                            { id: "image/gif", name: "GIF (image/gif)" },
                            { id: "image/webp", name: "WebP (image/webp)" },
                            { id: "image/svg+xml", name: "SVG (image/svg+xml)" },
                            { id: "image/x-icon", name: "ICO (image/x-icon)" },
                            { id: "font/woff", name: "WOFF (font/woff)" },
                            { id: "font/woff2", name: "WOFF2 (font/woff2)" },
                            { id: "font/ttf", name: "TTF (font/ttf)" },
                            { id: "font/otf", name: "OTF (font/otf)" },
                            { id: "application/font-woff", name: "WOFF (application/font-woff)" },
                            { id: "application/font-woff2", name: "WOFF2 (application/font-woff2)" },
                            { id: "application/pdf", name: "PDF (application/pdf)" },
                            { id: "audio/mpeg", name: "MP3 (audio/mpeg)" },
                            { id: "video/mp4", name: "MP4 (video/mp4)" },
                            { id: "video/webm", name: "WebM (video/webm)" },
                          ]}
                        />
                      </Grid>
                      <Grid item xs={12}>
                        <Alert severity="info" className="form-alert">
                          <strong>Default cached types:</strong> JavaScript (.js),
                          CSS (.css), Images (.jpg, .png, .gif, .svg, .webp,
                          .ico), Fonts (.woff, .woff2, .ttf, .otf), Documents
                          (.pdf), and other static assets. Only GET/HEAD
                          requests with 200/301/302 responses are cached.
                          <br />
                          <strong>Note:</strong> If you specify custom MIME types above,
                          only those types will be cached (defaults will not apply).
                        </Alert>
                      </Grid>
                    </>
                  )
                }
              </FormDataConsumer>
            </Grid>
          </SectionCard>

          {/* Web Application Firewall */}
          <SectionCard
            title="Web Application Firewall"
            subtitle="Attach a WAF policy to protect this virtual server"
          >
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6} md={3}>
                <BooleanInput
                  source="waf_enabled"
                  label="Enable WAF"
                  defaultValue={false}
                  helperText="Enable WAF inspection for this server"
                />
              </Grid>
              <FormDataConsumer>
                {({ formData }) =>
                  formData?.waf_enabled && (
                    <>
                      <Grid item xs={12} sm={6} md={4}>
                        <ReferenceInput source="waf_policy_id" reference="waf_policies">
                          <AutocompleteInput
                            optionText="name"
                            fullWidth
                            label="WAF Policy"
                            validate={[required()]}
                            helperText="Select a WAF policy to apply"
                          />
                        </ReferenceInput>
                      </Grid>
                      <Grid item xs={12} sm={6} md={3}>
                        <SelectInput
                          source="waf_mode_override"
                          label="Mode Override"
                          fullWidth
                          choices={[
                            { id: '', name: 'Use Policy Default' },
                            { id: 'block', name: 'Block' },
                            { id: 'monitor', name: 'Monitor' },
                          ]}
                          helperText="Override the policy's enforcement mode for this server"
                        />
                      </Grid>
                    </>
                  )
                }
              </FormDataConsumer>
            </Grid>
          </SectionCard>

          {/* Rate Limiting */}
          <SectionCard
            title="Rate Limiting"
            subtitle="Per-server request rate limiting"
          >
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6} md={3}>
                <BooleanInput
                  source="rate_limit_enabled"
                  label="Enable Rate Limiting"
                  defaultValue={false}
                  helperText="Limit requests per IP address"
                />
              </Grid>
              <FormDataConsumer>
                {({ formData }) =>
                  formData?.rate_limit_enabled && (
                    <>
                      <Grid item xs={12} sm={6} md={3}>
                        <TextInput
                          source="rate_limit.requests_per_second"
                          label="Requests/Second"
                          fullWidth
                          defaultValue={100}
                          helperText="Max requests per second per IP"
                        />
                      </Grid>
                      <Grid item xs={12} sm={6} md={3}>
                        <TextInput
                          source="rate_limit.burst"
                          label="Burst"
                          fullWidth
                          defaultValue={50}
                          helperText="Extra burst capacity above the limit"
                        />
                      </Grid>
                    </>
                  )
                }
              </FormDataConsumer>
            </Grid>
          </SectionCard>

          {/* Proxy Timeouts */}
          <SectionCard
            title="Proxy Timeouts"
            subtitle="Configure upstream proxy timeouts (in seconds). Leave empty to use nginx defaults (60s)."
          >
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6} md={4}>
                <TextInput
                  source="proxy_timeouts.connect_timeout"
                  label="Connect Timeout (s)"
                  fullWidth
                  helperText="Time to establish connection with backend"
                />
              </Grid>
              <Grid item xs={12} sm={6} md={4}>
                <TextInput
                  source="proxy_timeouts.send_timeout"
                  label="Send Timeout (s)"
                  fullWidth
                  helperText="Time to transmit request to backend"
                />
              </Grid>
              <Grid item xs={12} sm={6} md={4}>
                <TextInput
                  source="proxy_timeouts.read_timeout"
                  label="Read Timeout (s)"
                  fullWidth
                  helperText="Time to wait for backend response"
                />
              </Grid>
            </Grid>
          </SectionCard>

          {/* Upstream Backend Request Headers */}
          <SectionCard
            title="Upstream Backend Request Headers"
            subtitle="Headers appended to requests sent to upstream backend servers"
          >
            <ArrayInput source="custom_headers" label="">
              <SimpleFormIterator
                inline
                disableReordering
                className="server-custom-headers"
              >
                <TextInput
                  source="header_key"
                  label="Header Name"
                />
                <TextInput
                  source="header_value"
                  label="Header Value"
                />
              </SimpleFormIterator>
            </ArrayInput>
          </SectionCard>

          {/* Client Response Headers */}
          <SectionCard
            title="Client Response Headers"
            subtitle="Headers returned to the browser (e.g. CORS, Content-Security-Policy, security headers)"
          >
            <ArrayInput source="custom_response_headers" label="">
              <SimpleFormIterator
                inline
                disableReordering
                className="server-custom-headers"
              >
                <TextInput
                  source="header_key"
                  label="Header Name"
                />
                <TextInput
                  source="header_value"
                  label="Header Value"
                />
              </SimpleFormIterator>
            </ArrayInput>
          </SectionCard>

          {/* Location Blocks */}
          <SectionCard
            title="Location Blocks"
            subtitle="Configure URL path routing and proxy settings"
            noPadding
          >
            <LocationInput source="locations" />
          </SectionCard>

          {/* Advanced Configuration */}
          <SectionCard
            title="Advanced Configuration"
            subtitle="Add custom nginx configuration blocks"
          >
            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <SubSectionLabel>Additional Server Block</SubSectionLabel>
                <ArrayInput source="custom_block" label="">
                  <SimpleFormIterator disableReordering className="server-config-blocks">
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
                  <SimpleFormIterator disableReordering className="server-config-blocks">
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
                  <SimpleFormIterator disableReordering className="server-config-blocks">
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
          <SectionCard
            title="Generated Configuration"
            subtitle="Preview of the generated nginx configuration"
          >
            <CreateServerText source="config" />
          </SectionCard>
        </div>
      </TabbedForm.Tab>

      <TabbedForm.Tab label="Topology">
        <div className="form-container">
          <TopologyTab useRecord resourceType="servers" />
        </div>
      </TabbedForm.Tab>

      <TabbedForm.Tab label="Varnish Server">
        <div className="form-container">
          {/* Enable Toggle */}
          <SectionCard
            title="Varnish Reverse Proxy / Cache"
            subtitle="Enable and configure Varnish HTTP accelerator for this server"
          >
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6} md={4}>
                <BooleanInput
                  source="varnish_enabled"
                  label="Enable Varnish"
                  defaultValue={false}
                  helperText="Route traffic through Varnish before reaching origin"
                />
              </Grid>
            </Grid>
          </SectionCard>

          <FormDataConsumer>
            {({ formData }) =>
              formData?.varnish_enabled && (
                <>
                  {/* Listener Settings */}
                  <SectionCard
                    title="Varnish Listener"
                    subtitle="Local Varnish listen address and port"
                  >
                    <Grid container spacing={2}>
                      <Grid item xs={12} sm={6} md={4}>
                        <TextInput
                          source="varnish_config.listen_address"
                          label="Listen Address"
                          defaultValue="127.0.0.1"
                          fullWidth
                        />
                      </Grid>
                      <Grid item xs={12} sm={6} md={4}>
                        <TextInput
                          source="varnish_config.listen_port"
                          label="Listen Port"
                          defaultValue="6081"
                          fullWidth
                        />
                      </Grid>
                      <Grid item xs={12} sm={6} md={4}>
                        <TextInput
                          source="varnish_config.admin_listen_port"
                          label="Admin Port"
                          defaultValue="6082"
                          fullWidth
                        />
                      </Grid>
                    </Grid>
                  </SectionCard>

                  {/* Cache Settings */}
                  <SectionCard
                    title="Cache Settings"
                    subtitle="TTL, grace, and storage configuration"
                  >
                    <Grid container spacing={2}>
                      <Grid item xs={12} sm={6} md={3}>
                        <TextInput
                          source="varnish_config.cache_ttl_default"
                          label="Default TTL (seconds)"
                          defaultValue="120"
                          fullWidth
                        />
                      </Grid>
                      <Grid item xs={12} sm={6} md={3}>
                        <TextInput
                          source="varnish_config.cache_grace"
                          label="Grace Period (seconds)"
                          defaultValue="3600"
                          fullWidth
                        />
                      </Grid>
                      <Grid item xs={12} sm={6} md={3}>
                        <TextInput
                          source="varnish_config.cache_keep"
                          label="Keep Period (seconds)"
                          defaultValue="7200"
                          fullWidth
                        />
                      </Grid>
                      <Grid item xs={12} sm={6} md={3}>
                        <TextInput
                          source="varnish_config.cache_size"
                          label="Cache Size"
                          defaultValue="256m"
                          fullWidth
                        />
                      </Grid>
                    </Grid>
                  </SectionCard>

                  {/* Backend Timeouts */}
                  <SectionCard
                    title="Backend Timeouts"
                    subtitle="Connection timeouts to origin server"
                  >
                    <Grid container spacing={2}>
                      <Grid item xs={12} sm={6} md={4}>
                        <TextInput
                          source="varnish_config.backend_connect_timeout"
                          label="Connect Timeout"
                          defaultValue="5s"
                          fullWidth
                        />
                      </Grid>
                      <Grid item xs={12} sm={6} md={4}>
                        <TextInput
                          source="varnish_config.backend_first_byte_timeout"
                          label="First Byte Timeout"
                          defaultValue="30s"
                          fullWidth
                        />
                      </Grid>
                      <Grid item xs={12} sm={6} md={4}>
                        <TextInput
                          source="varnish_config.backend_between_bytes_timeout"
                          label="Between Bytes Timeout"
                          defaultValue="5s"
                          fullWidth
                        />
                      </Grid>
                    </Grid>
                  </SectionCard>

                  {/* Health Check */}
                  <SectionCard
                    title="Backend Health Check"
                    subtitle="Varnish probe configuration for backend health"
                  >
                    <Grid container spacing={2}>
                      <Grid item xs={12} sm={6} md={3}>
                        <BooleanInput
                          source="varnish_config.health_check_enabled"
                          label="Enable Health Check"
                          defaultValue={true}
                        />
                      </Grid>
                      <Grid item xs={12} sm={6} md={3}>
                        <TextInput
                          source="varnish_config.health_check_url"
                          label="Health Check URL"
                          defaultValue="/health"
                          fullWidth
                        />
                      </Grid>
                      <Grid item xs={12} sm={6} md={3}>
                        <TextInput
                          source="varnish_config.health_check_interval"
                          label="Interval"
                          defaultValue="5s"
                          fullWidth
                        />
                      </Grid>
                      <Grid item xs={12} sm={6} md={3}>
                        <TextInput
                          source="varnish_config.health_check_timeout"
                          label="Timeout"
                          defaultValue="2s"
                          fullWidth
                        />
                      </Grid>
                    </Grid>
                  </SectionCard>

                  {/* VCL Snippets */}
                  <SectionCard
                    title="VCL Snippets"
                    subtitle="Custom VCL code injected at defined hook points in the Varnish request lifecycle"
                  >
                    <VarnishSnippetEditor />
                  </SectionCard>

                  {/* Deploy Panel */}
                  <SectionCard
                    title="Deployment"
                    subtitle="Deploy Varnish configuration and monitor status"
                  >
                    <VarnishDeployPanel />
                  </SectionCard>

                  {/* Legacy VCL Override */}
                  <SectionCard
                    title="Custom VCL Override"
                    subtitle="Raw VCL text (overrides generated configuration if provided)"
                  >
                    <TextInput
                      multiline
                      fullWidth
                      source="varnish_vcl_config"
                      label=""
                      className="code_area"
                      minRows={10}
                    />
                  </SectionCard>
                </>
              )
            }
          </FormDataConsumer>
        </div>
      </TabbedForm.Tab>

      <TabbedForm.Tab label="Server Rules">
        <div className="form-container">
          {totalResults >= 1 ? (
            <SectionCard
              title="Server Rules"
              subtitle="Select and configure rules for this server"
            >
              <Grid container spacing={2}>
                <Grid item xs={12}>
                  <ReferenceArrayInput
                    source="rules"
                    reference="rules"
                    perPage={1000}
                  >
                    <AutocompleteInput
                      optionText="name"
                      fullWidth
                      label="Select Rules"
                    />
                  </ReferenceArrayInput>
                </Grid>
                <FormDataConsumer>
                  {({ formData }) =>
                    formData?.rules &&
                    totalResults > 1 && (
                      <Grid item xs={12}>
                        <Divider className="form-divider" />
                        <SubSectionLabel>Match Conditions</SubSectionLabel>
                        <ArrayInput source="match_cases" label="">
                          <SimpleFormIterator
                            inline
                            disableReordering
                            className="server-match-conditions"
                          >
                            <SelectInput
                              defaultValue="none"
                              source="condition"
                              label="Condition"
                              choices={[
                                { id: "none", name: "N/A" },
                                { id: "or", name: "OR" },
                                { id: "and", name: "AND" },
                              ]}
                            />
                            <ReferenceArrayInput
                              source="statement"
                              queryOptions={{
                                meta: { exclude: formData?.rules },
                              }}
                              reference="rules"
                              perPage={1000}
                            >
                              <AutocompleteInput
                                optionText="name"
                                label="Rule"
                              />
                            </ReferenceArrayInput>
                          </SimpleFormIterator>
                        </ArrayInput>
                      </Grid>
                    )
                  }
                </FormDataConsumer>
              </Grid>
            </SectionCard>
          ) : (
            <Card variant="outlined" className="empty-state">
              <CardContent>
                <Typography
                  variant="body1"
                  color="text.secondary"
                  className="empty-state__message"
                >
                  There are no rules available yet. Please create rules first.
                </Typography>
                <Menu.Item to="/rules" primaryText="Create Rules" />
              </CardContent>
            </Card>
          )}
        </div>
      </TabbedForm.Tab>

      <TabbedForm.Tab label="WAF Protection">
        <div className="form-container">
          <SectionCard
            title="WAF Protection"
            subtitle="Enable and configure Web Application Firewall protection for this server"
          >
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6} md={4}>
                <BooleanInput
                  source="waf_enabled"
                  label="Enable WAF"
                  defaultValue={false}
                  helperText="Enable Web Application Firewall protection"
                />
              </Grid>
              <FormDataConsumer>
                {({ formData }) =>
                  formData?.waf_enabled && (
                    <Grid item xs={12} sm={6} md={8}>
                      <ReferenceInput
                        source="waf_policy_id"
                        reference="waf_policies"
                      >
                        <SelectInput
                          fullWidth
                          optionText="name"
                          label="WAF Policy"
                          helperText="Select a WAF policy to apply to this server"
                        />
                      </ReferenceInput>
                    </Grid>
                  )
                }
              </FormDataConsumer>
            </Grid>
          </SectionCard>
        </div>
      </TabbedForm.Tab>

      <TabbedForm.Tab label="Version History">
        <div className="form-container">
          <VersionHistoryTab resourceType="servers" />
        </div>
      </TabbedForm.Tab>

    </TabbedForm>
  );
};

export default Form;
