'use client';

import React, { useState } from 'react';
import {
  Grid,
  TextField,
  MenuItem,
  FormControlLabel,
  Switch,
  Typography,
  IconButton,
  Button,
  Box,
  Card,
  CardContent,
  Divider,
  Alert,
  Tabs,
  Tab,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import { useRouter } from 'next/navigation';
import { useFormContext, useFieldArray, Controller } from 'react-hook-form';
import ResourceForm from '@/components/ui/ResourceForm';
import { useApi, useFetch } from '@/hooks/useApi';
import { useNotification } from '@/contexts/NotificationContext';

interface TabPanelProps {
  children: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel({ children, value, index }: TabPanelProps) {
  return value === index ? <Box sx={{ pt: 2 }}>{children}</Box> : null;
}

// ---------------------------------------------------------------------------
// Section Card
// ---------------------------------------------------------------------------
function SectionCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <Card variant="outlined" sx={{ mb: 2 }}>
      <CardContent>
        <Typography variant="subtitle1" fontWeight={700}>{title}</Typography>
        {subtitle && <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{subtitle}</Typography>}
        {!subtitle && <Box sx={{ mb: 1 }} />}
        {children}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Nginx Server Tab
// ---------------------------------------------------------------------------
function NginxServerTab() {
  const { register, control, watch } = useFormContext();
  const sslEnabled = watch('ssl_enabled');
  const sslStaging = watch('ssl_staging');
  const cacheEnabled = watch('cache_enabled');
  const wafEnabled = watch('waf_enabled');
  const rateLimitEnabled = watch('rate_limit_enabled');

  const { fields: listenFields, append: addListen, remove: removeListen } = useFieldArray({ control, name: 'listens' });
  const { fields: headerFields, append: addHeader, remove: removeHeader } = useFieldArray({ control, name: 'custom_headers' });
  const { fields: respHeaderFields, append: addRespHeader, remove: removeRespHeader } = useFieldArray({ control, name: 'custom_response_headers' });
  const { fields: locationFields, append: addLocation, remove: removeLocation } = useFieldArray({ control, name: 'locations' });
  const { fields: customBlockFields, append: addCustomBlock, remove: removeCustomBlock } = useFieldArray({ control, name: 'custom_block' });
  const { fields: customLocBlockFields, append: addCustomLocBlock, remove: removeCustomLocBlock } = useFieldArray({ control, name: 'custom_location_block' });
  const { fields: customHttpBlockFields, append: addCustomHttpBlock, remove: removeCustomHttpBlock } = useFieldArray({ control, name: 'custom_http_block' });

  const api = useApi();
  const { data: profilesData } = useFetch(() => api.getList('profiles', { pagination: { page: 1, perPage: 100 } }));
  const profiles = (profilesData?.data || []) as Array<{ id: string; name: string }>;

  const { data: wafPoliciesData } = useFetch(() => api.getList('waf_policies', { pagination: { page: 1, perPage: 100 } }));
  const wafPolicies = (wafPoliciesData?.data || []) as Array<{ id: string; name: string }>;

  return (
    <>
      {/* Basic Server Configuration */}
      <SectionCard title="Basic Server Configuration" subtitle="Configure the primary server settings including domain and profile">
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6} md={3}>
            <TextField label="Server/Domain Name" fullWidth required {...register('server_name', { required: 'Required' })} helperText="e.g., example.com" />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <TextField label="Proxy Server/Domain Name" fullWidth {...register('proxy_server_name')} helperText="Optional proxy hostname" />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <TextField label="Profile" select fullWidth required {...register('profile_id', { required: 'Required' })} helperText="Environment profile">
              {profiles.map((p) => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <TextField label="Tags (comma-separated)" fullWidth {...register('servers_tags')} helperText="Organization tags" />
          </Grid>
        </Grid>
      </SectionCard>

      {/* Server Paths & Ports */}
      <SectionCard title="Server Paths & Ports" subtitle="Configure document root, ports, and log file locations">
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6} md={3}>
            <TextField label="Document Root" fullWidth {...register('root')} helperText="Root directory" />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <TextField label="Index File" fullWidth {...register('index')} helperText="Default index" />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <TextField label="Access Log" fullWidth {...register('access_log')} helperText="Access log path" />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <TextField label="Error Log" fullWidth {...register('error_log')} helperText="Error log path" />
          </Grid>
        </Grid>
        <Divider sx={{ my: 2 }} />
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
          <Typography variant="body2" color="text.secondary">Listen Ports</Typography>
          <Button size="small" startIcon={<AddIcon />} onClick={() => addListen({ listen: '' })}>Add Port</Button>
        </Box>
        {listenFields.map((field, index) => (
          <Box key={field.id} sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'center' }}>
            <TextField size="small" label="Port" {...register(`listens.${index}.listen`)} helperText="e.g., 80, 443" />
            <IconButton size="small" color="error" onClick={() => removeListen(index)}><DeleteIcon fontSize="small" /></IconButton>
          </Box>
        ))}
      </SectionCard>

      {/* SSL Certificate */}
      <SectionCard title="SSL Certificate (Let's Encrypt)" subtitle="Enable automatic SSL certificate provisioning">
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6} md={3}>
            <Controller name="ssl_enabled" control={control} defaultValue={false} render={({ field }) => (
              <FormControlLabel control={<Switch checked={!!field.value} onChange={(e) => field.onChange(e.target.checked)} />} label="Enable SSL Certificate" />
            )} />
          </Grid>
          {sslEnabled && (
            <>
              <Grid item xs={12} sm={6} md={3}>
                <TextField label="SSL Contact Email" fullWidth required {...register('ssl_email')} helperText="For notifications" />
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Controller name="ssl_auto_renew" control={control} defaultValue={true} render={({ field }) => (
                  <FormControlLabel control={<Switch checked={!!field.value} onChange={(e) => field.onChange(e.target.checked)} />} label="Auto-renew" />
                )} />
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Controller name="ssl_force_https" control={control} defaultValue={true} render={({ field }) => (
                  <FormControlLabel control={<Switch checked={!!field.value} onChange={(e) => field.onChange(e.target.checked)} />} label="Force HTTPS" />
                )} />
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Controller name="ssl_staging" control={control} defaultValue={true} render={({ field }) => (
                  <FormControlLabel control={<Switch checked={!!field.value} onChange={(e) => field.onChange(e.target.checked)} />} label="Staging Mode (Testing)" />
                )} />
              </Grid>
              <Grid item xs={12}>
                {sslStaging ? (
                  <Alert severity="warning">
                    <strong>Staging Mode Enabled:</strong> Certificates will be issued by Let&apos;s Encrypt staging environment. These are test certificates and will show browser warnings.
                  </Alert>
                ) : (
                  <Alert severity="info">
                    <strong>Production Mode:</strong> Real certificates will be obtained from Let&apos;s Encrypt. Ensure your domain DNS is properly configured.
                  </Alert>
                )}
              </Grid>
            </>
          )}
        </Grid>
      </SectionCard>

      {/* Static Content Caching */}
      <SectionCard title="Static Content Caching" subtitle="Cache static files in memory for faster delivery">
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6} md={3}>
            <Controller name="cache_enabled" control={control} defaultValue={false} render={({ field }) => (
              <FormControlLabel control={<Switch checked={!!field.value} onChange={(e) => field.onChange(e.target.checked)} />} label="Enable Caching" />
            )} />
          </Grid>
          {cacheEnabled && (
            <>
              <Grid item xs={12} sm={6} md={3}>
                <TextField label="Cache TTL (seconds)" fullWidth {...register('cache_ttl')} helperText="Time to keep in cache" />
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Controller name="cache_bypass_auth" control={control} defaultValue={true} render={({ field }) => (
                  <FormControlLabel control={<Switch checked={!!field.value} onChange={(e) => field.onChange(e.target.checked)} />} label="Bypass for Authenticated" />
                )} />
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <TextField label="Bypass Cookie Name" fullWidth {...register('cache_bypass_cookie')} helperText="Cookie that bypasses cache" />
              </Grid>
            </>
          )}
        </Grid>
      </SectionCard>

      {/* Web Application Firewall */}
      <SectionCard title="Web Application Firewall" subtitle="Attach a WAF policy to protect this virtual server">
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6} md={3}>
            <Controller name="waf_enabled" control={control} defaultValue={false} render={({ field }) => (
              <FormControlLabel control={<Switch checked={!!field.value} onChange={(e) => field.onChange(e.target.checked)} />} label="Enable WAF" />
            )} />
          </Grid>
          {wafEnabled && (
            <>
              <Grid item xs={12} sm={6} md={4}>
                <TextField label="WAF Policy" select fullWidth required {...register('waf_policy_id')} helperText="Select a WAF policy to apply">
                  <MenuItem value="">None</MenuItem>
                  {wafPolicies.map((p) => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
                </TextField>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <TextField label="Mode Override" select fullWidth {...register('waf_mode_override')} helperText="Override the policy enforcement mode">
                  <MenuItem value="">Use Policy Default</MenuItem>
                  <MenuItem value="block">Block</MenuItem>
                  <MenuItem value="monitor">Monitor</MenuItem>
                </TextField>
              </Grid>
            </>
          )}
        </Grid>
      </SectionCard>

      {/* Rate Limiting */}
      <SectionCard title="Rate Limiting" subtitle="Per-server request rate limiting">
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6} md={3}>
            <Controller name="rate_limit_enabled" control={control} defaultValue={false} render={({ field }) => (
              <FormControlLabel control={<Switch checked={!!field.value} onChange={(e) => field.onChange(e.target.checked)} />} label="Enable Rate Limiting" />
            )} />
          </Grid>
          {rateLimitEnabled && (
            <>
              <Grid item xs={12} sm={6} md={3}>
                <TextField label="Requests/Second" fullWidth {...register('rate_limit.requests_per_second')} helperText="Max requests per second per IP" />
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <TextField label="Burst" fullWidth {...register('rate_limit.burst')} helperText="Extra burst capacity above the limit" />
              </Grid>
            </>
          )}
        </Grid>
      </SectionCard>

      {/* Upstream Backend Request Headers */}
      <SectionCard title="Upstream Backend Request Headers" subtitle="Headers appended to requests sent to upstream backend servers">
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
          <Button size="small" startIcon={<AddIcon />} onClick={() => addHeader({ header_key: '', header_value: '' })}>Add Header</Button>
        </Box>
        {headerFields.map((field, index) => (
          <Box key={field.id} sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'center' }}>
            <TextField size="small" label="Header Name" {...register(`custom_headers.${index}.header_key`)} />
            <TextField size="small" label="Header Value" sx={{ flex: 1 }} {...register(`custom_headers.${index}.header_value`)} />
            <IconButton size="small" color="error" onClick={() => removeHeader(index)}><DeleteIcon fontSize="small" /></IconButton>
          </Box>
        ))}
      </SectionCard>

      {/* Client Response Headers */}
      <SectionCard title="Client Response Headers" subtitle="Headers returned to the browser (e.g. CORS, security headers)">
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
          <Button size="small" startIcon={<AddIcon />} onClick={() => addRespHeader({ header_key: '', header_value: '' })}>Add Header</Button>
        </Box>
        {respHeaderFields.map((field, index) => (
          <Box key={field.id} sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'center' }}>
            <TextField size="small" label="Header Name" {...register(`custom_response_headers.${index}.header_key`)} />
            <TextField size="small" label="Header Value" sx={{ flex: 1 }} {...register(`custom_response_headers.${index}.header_value`)} />
            <IconButton size="small" color="error" onClick={() => removeRespHeader(index)}><DeleteIcon fontSize="small" /></IconButton>
          </Box>
        ))}
      </SectionCard>

      {/* Location Blocks */}
      <SectionCard title="Location Blocks" subtitle="Configure URL path routing and proxy settings">
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
          <Button size="small" startIcon={<AddIcon />} onClick={() => addLocation({ path: '/', proxy_pass: '', proxy_set_header_host: '', custom_config: '' })}>Add Location</Button>
        </Box>
        {locationFields.map((field, index) => (
          <Card key={field.id} variant="outlined" sx={{ mb: 1 }}>
            <CardContent sx={{ py: 1, '&:last-child': { pb: 1 } }}>
              <Grid container spacing={1} alignItems="center">
                <Grid item xs={12} sm={3}>
                  <TextField size="small" label="Path" fullWidth {...register(`locations.${index}.path`)} />
                </Grid>
                <Grid item xs={12} sm={4}>
                  <TextField size="small" label="Proxy Pass" fullWidth {...register(`locations.${index}.proxy_pass`)} placeholder="http://backend:8080" />
                </Grid>
                <Grid item xs={12} sm={3}>
                  <TextField size="small" label="Proxy Host Header" fullWidth {...register(`locations.${index}.proxy_set_header_host`)} />
                </Grid>
                <Grid item xs="auto">
                  <IconButton size="small" color="error" onClick={() => removeLocation(index)}><DeleteIcon fontSize="small" /></IconButton>
                </Grid>
                <Grid item xs={12}>
                  <TextField size="small" label="Custom Config" fullWidth multiline rows={2} {...register(`locations.${index}.custom_config`)} placeholder="# Additional location directives" />
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        ))}
      </SectionCard>

      {/* Advanced Configuration */}
      <SectionCard title="Advanced Configuration" subtitle="Add custom nginx configuration blocks">
        <Grid container spacing={2}>
          <Grid item xs={12} md={6}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
              <Typography variant="body2" color="text.secondary">Additional Server Block</Typography>
              <Button size="small" startIcon={<AddIcon />} onClick={() => addCustomBlock({ additional_block: '' })}>Add</Button>
            </Box>
            {customBlockFields.map((field, index) => (
              <Box key={field.id} sx={{ display: 'flex', gap: 1, mb: 1 }}>
                <TextField fullWidth multiline rows={4} {...register(`custom_block.${index}.additional_block`)} placeholder="# Add custom server block directives here" />
                <IconButton size="small" color="error" onClick={() => removeCustomBlock(index)}><DeleteIcon fontSize="small" /></IconButton>
              </Box>
            ))}
          </Grid>
          <Grid item xs={12} md={6}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
              <Typography variant="body2" color="text.secondary">Additional Location Block</Typography>
              <Button size="small" startIcon={<AddIcon />} onClick={() => addCustomLocBlock({ additional_location_block: '' })}>Add</Button>
            </Box>
            {customLocBlockFields.map((field, index) => (
              <Box key={field.id} sx={{ display: 'flex', gap: 1, mb: 1 }}>
                <TextField fullWidth multiline rows={4} {...register(`custom_location_block.${index}.additional_location_block`)} placeholder="# Add custom location block directives here" />
                <IconButton size="small" color="error" onClick={() => removeCustomLocBlock(index)}><DeleteIcon fontSize="small" /></IconButton>
              </Box>
            ))}
          </Grid>
          <Grid item xs={12}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
              <Typography variant="body2" color="text.secondary">Additional HTTP Block</Typography>
              <Button size="small" startIcon={<AddIcon />} onClick={() => addCustomHttpBlock({ additional_http_block: '' })}>Add</Button>
            </Box>
            {customHttpBlockFields.map((field, index) => (
              <Box key={field.id} sx={{ display: 'flex', gap: 1, mb: 1 }}>
                <TextField fullWidth multiline rows={4} {...register(`custom_http_block.${index}.additional_http_block`)} placeholder="# Add custom http block directives here" />
                <IconButton size="small" color="error" onClick={() => removeCustomHttpBlock(index)}><DeleteIcon fontSize="small" /></IconButton>
              </Box>
            ))}
          </Grid>
        </Grid>
      </SectionCard>
    </>
  );
}

// ---------------------------------------------------------------------------
// Varnish Server Tab
// ---------------------------------------------------------------------------
function VarnishServerTab() {
  const { register, control, watch } = useFormContext();
  const varnishEnabled = watch('varnish_enabled');

  return (
    <>
      <SectionCard title="Varnish Reverse Proxy / Cache" subtitle="Enable and configure Varnish HTTP accelerator for this server">
        <Controller name="varnish_enabled" control={control} defaultValue={false} render={({ field }) => (
          <FormControlLabel control={<Switch checked={!!field.value} onChange={(e) => field.onChange(e.target.checked)} />} label="Enable Varnish" />
        )} />
      </SectionCard>

      {varnishEnabled && (
        <>
          <SectionCard title="Varnish Listener" subtitle="Local Varnish listen address and port">
            <Grid container spacing={2}>
              <Grid item xs={12} sm={4}><TextField label="Listen Address" fullWidth {...register('varnish_config.listen_address')} /></Grid>
              <Grid item xs={12} sm={4}><TextField label="Listen Port" fullWidth {...register('varnish_config.listen_port')} /></Grid>
              <Grid item xs={12} sm={4}><TextField label="Admin Port" fullWidth {...register('varnish_config.admin_listen_port')} /></Grid>
            </Grid>
          </SectionCard>

          <SectionCard title="Cache Settings" subtitle="TTL, grace, and storage configuration">
            <Grid container spacing={2}>
              <Grid item xs={12} sm={3}><TextField label="Default TTL (seconds)" fullWidth {...register('varnish_config.cache_ttl_default')} /></Grid>
              <Grid item xs={12} sm={3}><TextField label="Grace Period (seconds)" fullWidth {...register('varnish_config.cache_grace')} /></Grid>
              <Grid item xs={12} sm={3}><TextField label="Keep Period (seconds)" fullWidth {...register('varnish_config.cache_keep')} /></Grid>
              <Grid item xs={12} sm={3}><TextField label="Cache Size" fullWidth {...register('varnish_config.cache_size')} /></Grid>
            </Grid>
          </SectionCard>

          <SectionCard title="Backend Timeouts" subtitle="Connection timeouts to origin server">
            <Grid container spacing={2}>
              <Grid item xs={12} sm={4}><TextField label="Connect Timeout" fullWidth {...register('varnish_config.backend_connect_timeout')} /></Grid>
              <Grid item xs={12} sm={4}><TextField label="First Byte Timeout" fullWidth {...register('varnish_config.backend_first_byte_timeout')} /></Grid>
              <Grid item xs={12} sm={4}><TextField label="Between Bytes Timeout" fullWidth {...register('varnish_config.backend_between_bytes_timeout')} /></Grid>
            </Grid>
          </SectionCard>

          <SectionCard title="Backend Health Check" subtitle="Varnish probe configuration for backend health">
            <Grid container spacing={2}>
              <Grid item xs={12} sm={3}>
                <Controller name="varnish_config.health_check_enabled" control={control} defaultValue={true} render={({ field }) => (
                  <FormControlLabel control={<Switch checked={!!field.value} onChange={(e) => field.onChange(e.target.checked)} />} label="Enable Health Check" />
                )} />
              </Grid>
              <Grid item xs={12} sm={3}><TextField label="Health Check URL" fullWidth {...register('varnish_config.health_check_url')} /></Grid>
              <Grid item xs={12} sm={3}><TextField label="Interval" fullWidth {...register('varnish_config.health_check_interval')} /></Grid>
              <Grid item xs={12} sm={3}><TextField label="Timeout" fullWidth {...register('varnish_config.health_check_timeout')} /></Grid>
            </Grid>
          </SectionCard>

          <SectionCard title="Custom VCL Override" subtitle="Raw VCL text (overrides generated configuration if provided)">
            <TextField multiline fullWidth label="VCL Configuration" rows={10} {...register('varnish_vcl_config')} />
          </SectionCard>
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Server Rules Tab
// ---------------------------------------------------------------------------
function ServerRulesTab() {
  const { register, control } = useFormContext();
  const api = useApi();
  const { data: rulesData } = useFetch(() => api.getList('rules', { pagination: { page: 1, perPage: 1000 } }));
  const rules = (rulesData?.data || []) as Array<{ id: string; name: string }>;

  const { fields: matchFields, append: addMatch, remove: removeMatch } = useFieldArray({ control, name: 'match_cases' });

  return (
    <SectionCard title="Server Rules" subtitle="Select and configure rules for this server">
      <Grid container spacing={2}>
        <Grid item xs={12}>
          <TextField label="Select Rules" select fullWidth SelectProps={{ multiple: true }} {...register('rules')}>
            {rules.map((r) => <MenuItem key={r.id} value={r.id}>{r.name}</MenuItem>)}
          </TextField>
        </Grid>
        <Grid item xs={12}>
          <Divider sx={{ my: 1 }} />
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
            <Typography variant="body2" color="text.secondary">Match Conditions</Typography>
            <Button size="small" startIcon={<AddIcon />} onClick={() => addMatch({ condition: 'none', statement: '' })}>Add Condition</Button>
          </Box>
          {matchFields.map((field, index) => (
            <Box key={field.id} sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'center' }}>
              <TextField size="small" label="Condition" select sx={{ minWidth: 120 }} {...register(`match_cases.${index}.condition`)}>
                <MenuItem value="none">N/A</MenuItem>
                <MenuItem value="or">OR</MenuItem>
                <MenuItem value="and">AND</MenuItem>
              </TextField>
              <TextField size="small" label="Rule" select fullWidth {...register(`match_cases.${index}.statement`)}>
                {rules.map((r) => <MenuItem key={r.id} value={r.id}>{r.name}</MenuItem>)}
              </TextField>
              <IconButton size="small" color="error" onClick={() => removeMatch(index)}><DeleteIcon fontSize="small" /></IconButton>
            </Box>
          ))}
        </Grid>
      </Grid>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Main Form
// ---------------------------------------------------------------------------
function ServerFormContent() {
  const [tab, setTab] = useState(0);

  return (
    <>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 1, borderBottom: 1, borderColor: 'divider' }}>
        <Tab label="Nginx Server" />
        <Tab label="Varnish Server" />
        <Tab label="Server Rules" />
      </Tabs>
      <TabPanel value={tab} index={0}><NginxServerTab /></TabPanel>
      <TabPanel value={tab} index={1}><VarnishServerTab /></TabPanel>
      <TabPanel value={tab} index={2}><ServerRulesTab /></TabPanel>
    </>
  );
}

export default function ServersCreatePage() {
  const api = useApi();
  const router = useRouter();
  const { notify } = useNotification();

  const handleSubmit = async (data: Record<string, unknown>) => {
    // Process tags
    if (typeof data.servers_tags === 'string') {
      data.servers_tags = (data.servers_tags as string).split(',').map((t: string) => t.trim()).filter(Boolean);
    }
    await api.create('servers', { data });
    notify('Server created successfully', { type: 'success' });
    router.push('/servers');
  };

  return (
    <ResourceForm
      mode="create"
      title="Create Server"
      defaultValues={{
        root: '/var/www/html',
        index: 'index.html',
        access_log: 'logs/access.log',
        error_log: 'logs/error.log',
        listens: [{ listen: '' }],
        ssl_enabled: false,
        ssl_staging: true,
        ssl_auto_renew: true,
        ssl_force_https: true,
        cache_enabled: false,
        cache_ttl: '3600',
        cache_bypass_auth: true,
        waf_enabled: false,
        rate_limit_enabled: false,
        varnish_enabled: false,
        varnish_config: {
          listen_address: '127.0.0.1',
          listen_port: '6081',
          admin_listen_port: '6082',
          cache_ttl_default: '120',
          cache_grace: '3600',
          cache_keep: '7200',
          cache_size: '256m',
          backend_connect_timeout: '5s',
          backend_first_byte_timeout: '30s',
          backend_between_bytes_timeout: '5s',
          health_check_enabled: true,
          health_check_url: '/health',
          health_check_interval: '5s',
          health_check_timeout: '2s',
        },
        custom_headers: [],
        custom_response_headers: [],
        locations: [],
        custom_block: [],
        custom_location_block: [],
        custom_http_block: [],
        match_cases: [],
      }}
      onSubmit={handleSubmit}
    >
      <ServerFormContent />
    </ResourceForm>
  );
}
