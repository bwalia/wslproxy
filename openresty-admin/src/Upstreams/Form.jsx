import { Box, Card, CardContent, Divider, Grid, Typography, Alert } from "@mui/material";
import React from "react";
import {
  TextInput,
  SimpleForm,
  ArrayInput,
  SimpleFormIterator,
  SelectInput,
  required,
  BooleanInput,
  NumberInput,
  FormDataConsumer,
} from "react-admin";

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

// Load balancing method choices
const loadBalancingMethods = [
  { id: 'round_robin', name: 'Round Robin (Default)' },
  { id: 'least_conn', name: 'Least Connections' },
  { id: 'ip_hash', name: 'IP Hash' },
  { id: 'hash', name: 'Generic Hash' },
  { id: 'random', name: 'Random' },
];

// Server state choices
const serverStateChoices = [
  { id: 'active', name: 'Active' },
  { id: 'backup', name: 'Backup' },
  { id: 'down', name: 'Down' },
];

// Helper function to generate upstream config preview
// Note: slow_start, max_conns, and resolve are NGINX Plus (commercial) features
// They are stored but not included in the actual nginx config for open-source NGINX/OpenResty
const generateUpstreamConfig = (formData) => {
  if (!formData || !formData.name) {
    return '# Configure upstream name to see preview';
  }

  let config = `upstream ${formData.name} {\n`;

  // Zone configuration
  if (formData.zone_name) {
    config += `    zone ${formData.zone_name} ${formData.zone_size || '64k'};\n\n`;
  }

  // Load balancing method
  if (formData.load_balancing_method && formData.load_balancing_method !== 'round_robin') {
    if (formData.load_balancing_method === 'hash' && formData.hash_key) {
      config += `    hash ${formData.hash_key};\n`;
    } else if (formData.load_balancing_method !== 'hash') {
      config += `    ${formData.load_balancing_method};\n`;
    }
  }

  // Servers
  if (formData.servers && formData.servers.length > 0) {
    formData.servers.forEach(server => {
      if (server && server.address) {
        let serverLine = `    server ${server.address}`;
        if (server.port && server.port !== '80') {
          serverLine += `:${server.port}`;
        }
        if (server.weight && server.weight !== 1) {
          serverLine += ` weight=${server.weight}`;
        }
        if (server.max_fails !== undefined && server.max_fails !== 3) {
          serverLine += ` max_fails=${server.max_fails}`;
        }
        if (server.fail_timeout && server.fail_timeout !== '10s') {
          serverLine += ` fail_timeout=${server.fail_timeout}`;
        }
        // Note: slow_start, max_conns, resolve are NGINX Plus only - not included in config
        if (server.state === 'backup') {
          serverLine += ' backup';
        } else if (server.state === 'down') {
          serverLine += ' down';
        }
        config += serverLine + ';\n';
      }
    });
  }

  // Keepalive
  if (formData.keepalive) {
    config += `\n    keepalive ${formData.keepalive};\n`;
  }
  if (formData.keepalive_timeout) {
    config += `    keepalive_timeout ${formData.keepalive_timeout};\n`;
  }
  if (formData.keepalive_requests) {
    config += `    keepalive_requests ${formData.keepalive_requests};\n`;
  }

  config += '}\n';

  // Add health check info as comment if enabled
  if (formData.health_check_enabled) {
    config += '\n# Health Check Configuration (lua-resty-upstream-healthcheck)\n';
    config += `# Interval: ${formData.health_check_interval || '5s'}\n`;
    config += `# Fail threshold: ${formData.health_check_fails || 3}\n`;
    config += `# Pass threshold: ${formData.health_check_passes || 2}\n`;
    config += `# Health check URI: ${formData.health_check_uri || '/'}\n`;
    config += '# Note: Requires healthcheck.lua in init_worker_by_lua_block\n';
  }

  return config;
};

// Configuration Preview component using FormDataConsumer for real-time updates
const ConfigPreview = () => {
  return (
    <FormDataConsumer>
      {({ formData }) => (
        <Box
          component="pre"
          sx={{
            backgroundColor: '#f5f5f5',
            p: 2,
            borderRadius: 1,
            overflow: 'auto',
            fontSize: '0.875rem',
            fontFamily: 'monospace',
          }}
        >
          {generateUpstreamConfig(formData)}
        </Box>
      )}
    </FormDataConsumer>
  );
};

const Form = ({ type }) => {
  return (
    <SimpleForm>
      <Box sx={{ width: '100%', maxWidth: 1200, py: 2 }}>

        {/* Basic Upstream Configuration */}
        <SectionCard title="Basic Upstream Configuration" subtitle="Configure the upstream name and zone settings">
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6} md={4}>
              <TextInput
                source="name"
                fullWidth
                label="Upstream Name"
                validate={[required()]}
                disabled={type === "edit"}
                helperText="Unique name for this upstream (e.g., backend_servers)"
              />
            </Grid>
            <Grid item xs={12} sm={6} md={4}>
              <TextInput
                source="zone_name"
                fullWidth
                label="Zone Name"
                helperText="Shared memory zone name (optional)"
              />
            </Grid>
            <Grid item xs={12} sm={6} md={4}>
              <TextInput
                source="zone_size"
                fullWidth
                label="Zone Size"
                defaultValue="64k"
                helperText="Shared memory size (e.g., 64k, 1m)"
              />
            </Grid>
          </Grid>

          <Divider sx={{ my: 2 }} />

          <Grid container spacing={2}>
            <Grid item xs={12} sm={6} md={4}>
              <SelectInput
                source="load_balancing_method"
                fullWidth
                label="Load Balancing Method"
                choices={loadBalancingMethods}
                defaultValue="round_robin"
                helperText="Algorithm for distributing requests"
              />
            </Grid>
            <Grid item xs={12} sm={6} md={4}>
              <FormDataConsumer>
                {({ formData }) => formData?.load_balancing_method === 'hash' && (
                  <TextInput
                    source="hash_key"
                    fullWidth
                    label="Hash Key"
                    helperText="Variable for hashing (e.g., $request_uri)"
                  />
                )}
              </FormDataConsumer>
            </Grid>
            <Grid item xs={12} sm={6} md={4}>
              <BooleanInput
                source="enabled"
                label="Enabled"
                defaultValue={true}
                helperText="Include in nginx configuration"
              />
            </Grid>
          </Grid>
        </SectionCard>

        {/* Upstream Servers */}
        <SectionCard title="Upstream Servers" subtitle="Add backend servers to this upstream group" noPadding>
          <Box sx={{ p: 2 }}>
            <Alert severity="info" sx={{ mb: 2 }}>
              <Typography variant="body2">
                Add one or more backend servers. Each server can have individual settings like weight, max_fails, and fail_timeout.
              </Typography>
            </Alert>

            <ArrayInput source="servers" label="">
              <SimpleFormIterator
                disableReordering
                fullWidth
                getItemLabel={(index) => `Server ${index + 1}`}
                sx={{
                  '& .RaSimpleFormIterator-line': {
                    borderBottom: '1px solid #e0e0e0',
                    paddingBottom: 2,
                    marginBottom: 2,
                  }
                }}
              >
                <FormDataConsumer>
                  {({ scopedFormData, getSource }) => (
                    <Grid container spacing={2} sx={{ width: '100%', pt: 1 }}>
                      <Grid item xs={12} sm={6} md={3}>
                        <TextInput
                          source={getSource('address')}
                          label="Server Address"
                          fullWidth
                          validate={[required()]}
                          helperText="IP or hostname"
                        />
                      </Grid>
                      <Grid item xs={12} sm={6} md={2}>
                        <TextInput
                          source={getSource('port')}
                          label="Port"
                          fullWidth
                          helperText="Server port"
                        />
                      </Grid>
                      <Grid item xs={12} sm={6} md={2}>
                        <NumberInput
                          source={getSource('weight')}
                          label="Weight"
                          fullWidth
                          min={1}
                          helperText="Load weight (1-100)"
                        />
                      </Grid>
                      <Grid item xs={12} sm={6} md={2}>
                        <NumberInput
                          source={getSource('max_fails')}
                          label="Max Fails"
                          fullWidth
                          min={0}
                          helperText="Failures before down"
                        />
                      </Grid>
                      <Grid item xs={12} sm={6} md={3}>
                        <TextInput
                          source={getSource('fail_timeout')}
                          label="Fail Timeout"
                          fullWidth
                          helperText="e.g., 10s, 30s"
                        />
                      </Grid>
                      <Grid item xs={12} sm={6} md={2}>
                        <SelectInput
                          source={getSource('state')}
                          label="State"
                          fullWidth
                          choices={serverStateChoices}
                          helperText="Server state"
                        />
                      </Grid>
                      {/* Note: The following fields are NGINX Plus (commercial) only */}
                      {/* They are stored but not included in the generated config for open-source NGINX/OpenResty */}
                      <Grid item xs={12} sm={6} md={2}>
                        <TextInput
                          source={getSource('slow_start')}
                          label="Slow Start"
                          fullWidth
                          helperText="NGINX Plus only"
                          disabled
                        />
                      </Grid>
                      <Grid item xs={12} sm={6} md={2}>
                        <NumberInput
                          source={getSource('max_conns')}
                          label="Max Connections"
                          fullWidth
                          min={0}
                          helperText="NGINX Plus only"
                          disabled
                        />
                      </Grid>
                      <Grid item xs={12} sm={6} md={3}>
                        <BooleanInput
                          source={getSource('resolve')}
                          label="Resolve DNS"
                          helperText="NGINX Plus only"
                          disabled
                        />
                      </Grid>
                    </Grid>
                  )}
                </FormDataConsumer>
              </SimpleFormIterator>
            </ArrayInput>
          </Box>
        </SectionCard>

        {/* Health Check Configuration (Optional) */}
        <SectionCard title="Health Check Settings" subtitle="Active health checks using lua-resty-upstream-healthcheck module">
          <Alert severity="info" sx={{ mb: 2 }}>
            <Typography variant="body2">
              Active health checks require the <code>lua-resty-upstream-healthcheck</code> module and a shared memory zone.
              A <code>healthcheck.lua</code> file will be generated that should be included in <code>init_worker_by_lua_block</code>.
            </Typography>
          </Alert>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6} md={3}>
              <BooleanInput
                source="health_check_enabled"
                label="Enable Health Check"
                defaultValue={false}
                helperText="Enable active health checks"
              />
            </Grid>
            <FormDataConsumer>
              {({ formData }) => formData?.health_check_enabled && (
                <>
                  <Grid item xs={12} sm={6} md={3}>
                    <TextInput
                      source="health_check_interval"
                      label="Check Interval"
                      fullWidth
                      defaultValue="5s"
                      helperText="e.g., 5s, 10s, 1m"
                    />
                  </Grid>
                  <Grid item xs={12} sm={6} md={3}>
                    <NumberInput
                      source="health_check_fails"
                      label="Fail Threshold"
                      fullWidth
                      defaultValue={3}
                      min={1}
                      helperText="Consecutive fails to mark unhealthy"
                    />
                  </Grid>
                  <Grid item xs={12} sm={6} md={3}>
                    <NumberInput
                      source="health_check_passes"
                      label="Pass Threshold"
                      fullWidth
                      defaultValue={2}
                      min={1}
                      helperText="Consecutive passes to mark healthy"
                    />
                  </Grid>
                  <Grid item xs={12} sm={6} md={6}>
                    <TextInput
                      source="health_check_uri"
                      label="Health Check URI"
                      fullWidth
                      defaultValue="/"
                      helperText="URI path to check (e.g., /health, /status)"
                    />
                  </Grid>
                </>
              )}
            </FormDataConsumer>
          </Grid>
        </SectionCard>

        {/* Advanced Configuration */}
        <SectionCard title="Advanced Configuration" subtitle="Additional upstream parameters">
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6} md={3}>
              <NumberInput
                source="keepalive"
                label="Keepalive Connections"
                fullWidth
                min={0}
                helperText="Idle connections to keep"
              />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <TextInput
                source="keepalive_timeout"
                label="Keepalive Timeout"
                fullWidth
                helperText="e.g., 60s"
              />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <NumberInput
                source="keepalive_requests"
                label="Keepalive Requests"
                fullWidth
                min={0}
                helperText="Max requests per connection"
              />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <BooleanInput
                source="ntlm"
                label="NTLM Authentication"
                helperText="Enable NTLM (commercial)"
              />
            </Grid>
          </Grid>
        </SectionCard>

        {/* Configuration Preview */}
        <SectionCard title="Generated Configuration Preview" subtitle="Preview of the nginx upstream configuration">
          <ConfigPreview />
        </SectionCard>

      </Box>
    </SimpleForm>
  );
};

export default Form;
