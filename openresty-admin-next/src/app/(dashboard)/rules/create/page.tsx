'use client';

import React from 'react';
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
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import { useRouter } from 'next/navigation';
import { useFormContext, useFieldArray, Controller } from 'react-hook-form';
import ResourceForm from '@/components/ui/ResourceForm';
import { useApi, useFetch } from '@/hooks/useApi';
import { useNotification } from '@/contexts/NotificationContext';

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

function RuleFormFields() {
  const { register, control, watch } = useFormContext();
  const responseCode = watch('match.response.code');
  const isConsul = watch('match.response.is_consul');
  const jwtValidation = watch('match.rules.jwt_token_validation');
  const jwtValidationValue = watch('match.rules.jwt_token_validation_value');
  const jwtValidationKey = watch('match.rules.jwt_token_validation_key');
  const isS3 = jwtValidation === 'amazon_s3_signed_header_validation';
  const routingMode = watch('match.response.routing.mode');

  const api = useApi();
  const { data: profilesData } = useFetch(() => api.getList('profiles', { pagination: { page: 1, perPage: 100 } }));
  const profiles = (profilesData?.data || []) as Array<{ id: string; name: string }>;

  const { fields: backendFields, append: addBackend, remove: removeBackend } = useFieldArray({ control, name: 'match.response.backends' });

  return (
    <>
      {/* Basic Rule Information */}
      <SectionCard title="Basic Rule Information" subtitle="Configure the rule name, profile, and metadata">
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6} md={4}>
            <TextField label="Rule Name" fullWidth required {...register('name', { required: 'Required' })} helperText="Unique name for this rule" />
          </Grid>
          <Grid item xs={12} sm={6} md={4}>
            <TextField label="Profile" select fullWidth required {...register('profile_id', { required: 'Required' })} helperText="Environment profile">
              {profiles.map((p) => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid item xs={12} sm={6} md={4}>
            <TextField label="Tags (comma-separated)" fullWidth {...register('rules_tags')} helperText="Organization tags" />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <TextField label="Version" type="number" fullWidth {...register('version', { valueAsNumber: true })} helperText="Rule version" />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <TextField label="Priority" type="number" fullWidth {...register('priority', { valueAsNumber: true })} helperText="Execution priority" />
          </Grid>
        </Grid>
      </SectionCard>

      {/* Match Rules */}
      <SectionCard title="Match Rules" subtitle="Define conditions for when this rule should be applied">
        {/* URL Path Matching */}
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>URL Path Matching</Typography>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={4}>
            <TextField label="Match Type" select fullWidth defaultValue="starts_with" {...register('match.rules.path_key')} helperText="How to match the URL path">
              <MenuItem value="starts_with">Starts With</MenuItem>
              <MenuItem value="ends_with">Ends With</MenuItem>
              <MenuItem value="equals">Equals</MenuItem>
            </TextField>
          </Grid>
          <Grid item xs={12} sm={8}>
            <TextField label="URL Path Value" fullWidth required {...register('match.rules.path', { required: 'Required' })} helperText="The path pattern to match (e.g., /api/, .php)" />
          </Grid>
        </Grid>

        <Divider sx={{ my: 2 }} />

        {/* Geographic Filtering */}
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Geographic Filtering</Typography>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={4}>
            <TextField label="Match Type" select fullWidth defaultValue="equals" {...register('match.rules.country_key')}>
              <MenuItem value="equals">Equals</MenuItem>
            </TextField>
          </Grid>
          <Grid item xs={12} sm={8}>
            <TextField label="Country" select fullWidth {...register('match.rules.country')} helperText="Select a country to filter">
              <MenuItem value="">None</MenuItem>
              <MenuItem value="GB">United Kingdom (GB)</MenuItem>
              <MenuItem value="US">United States (US)</MenuItem>
              <MenuItem value="EU">All European Countries (EU)</MenuItem>
              <MenuItem value="DE">Germany (DE)</MenuItem>
              <MenuItem value="FR">France (FR)</MenuItem>
              <MenuItem value="CN">China (CN)</MenuItem>
              <MenuItem value="RU">Russian Federation (RU)</MenuItem>
              <MenuItem value="IN">India (IN)</MenuItem>
              <MenuItem value="JP">Japan (JP)</MenuItem>
              <MenuItem value="AU">Australia (AU)</MenuItem>
              <MenuItem value="CA">Canada (CA)</MenuItem>
              <MenuItem value="BR">Brazil (BR)</MenuItem>
            </TextField>
          </Grid>
        </Grid>

        <Divider sx={{ my: 2 }} />

        {/* Client IP Filtering */}
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Client IP Filtering</Typography>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={4}>
            <TextField label="Match Type" select fullWidth defaultValue="equals" {...register('match.rules.client_ip_key')}>
              <MenuItem value="equals">Equals</MenuItem>
              <MenuItem value="starts_with">Starts With</MenuItem>
              <MenuItem value="ipheader">Get IP from Header</MenuItem>
            </TextField>
          </Grid>
          <Grid item xs={12} sm={8}>
            <TextField label="Client IP Value" fullWidth {...register('match.rules.client_ip')} helperText="IP address or pattern to match" />
          </Grid>
        </Grid>

        <Divider sx={{ my: 2 }} />

        {/* Token Validation */}
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Token Validation</Typography>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={4}>
            <TextField label="Validation Type" select fullWidth defaultValue="equals" {...register('match.rules.jwt_token_validation')} helperText="Token validation method">
              <MenuItem value="equals">None (=)</MenuItem>
              <MenuItem value="cookie_jwt_token_validation">Cookie JWT Token</MenuItem>
              <MenuItem value="cookie_key_value">Cookie Key Value</MenuItem>
              <MenuItem value="header_jwt_token_validation">Header JWT Token</MenuItem>
              <MenuItem value="amazon_s3_signed_header_validation">Amazon S3 Signed Header</MenuItem>
            </TextField>
          </Grid>
          <Grid item xs={12} sm={8}>
            <TextField
              label={isS3 ? 'Bucket Name' : 'Token Value'}
              fullWidth
              {...register('match.rules.jwt_token_validation_value')}
              helperText={isS3 ? 'S3 bucket name' : 'Token to validate'}
            />
          </Grid>
          {jwtValidationValue && (
            <Grid item xs={12}>
              <TextField
                label={isS3 ? 'Bucket File Paths' : 'Token Secret Key'}
                type={isS3 ? 'text' : 'password'}
                fullWidth
                {...register('match.rules.jwt_token_validation_key')}
                helperText={isS3 ? 'Comma-separated file paths' : 'Secret key for validation'}
                inputProps={{ autoComplete: 'new-password' }}
              />
            </Grid>
          )}
          {jwtValidationKey && isS3 && (
            <>
              <Grid item xs={12} sm={4}>
                <TextField label="AWS Region" fullWidth {...register('match.rules.amazon_s3_region')} helperText="S3 bucket region (e.g., eu-west-2)" />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField label="Amazon S3 Access Key" type="password" fullWidth {...register('match.rules.amazon_s3_access_key')} helperText="AWS access key ID" />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField label="Amazon S3 Secret Key" type="password" fullWidth {...register('match.rules.amazon_s3_secret_key')} helperText="AWS secret access key" />
              </Grid>
            </>
          )}
        </Grid>
      </SectionCard>

      {/* Response Configuration */}
      <SectionCard title="Response Configuration" subtitle="Define the response behavior when this rule matches">
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6} md={3}>
            <Controller name="match.response.allow" control={control} defaultValue={false} render={({ field }) => (
              <FormControlLabel control={<Switch checked={!!field.value} onChange={(e) => field.onChange(e.target.checked)} />} label="Allow Request" />
            )} />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <TextField label="Response Code" type="number" fullWidth {...register('match.response.code', { valueAsNumber: true })} helperText="HTTP status code" />
          </Grid>
          <Grid item xs={12} md={6}>
            <TextField
              label={responseCode >= 301 && responseCode <= 305 ? 'Redirect URL (Required)' : 'Proxy Pass / Redirect URL'}
              fullWidth
              {...register('match.response.redirect_uri')}
              helperText="Target URL for redirect or proxy"
            />
          </Grid>
        </Grid>

        <Divider sx={{ my: 2 }} />

        <Grid container spacing={2}>
          <Grid item xs={12} sm={6} md={3}>
            <Controller name="match.response.strip_path" control={control} defaultValue={false} render={({ field }) => (
              <FormControlLabel control={<Switch checked={!!field.value} onChange={(e) => field.onChange(e.target.checked)} />} label="Strip Path Prefix" />
            )} />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Controller name="match.response.auto_redirect_https" control={control} defaultValue={false} render={({ field }) => (
              <FormControlLabel control={<Switch checked={!!field.value} onChange={(e) => field.onChange(e.target.checked)} />} label="Auto Redirect HTTP to HTTPS" />
            )} />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Controller name="match.response.is_consul" control={control} defaultValue={false} render={({ field }) => (
              <FormControlLabel control={<Switch checked={!!field.value} onChange={(e) => field.onChange(e.target.checked)} />} label="Use Consul" />
            )} />
          </Grid>
          {isConsul && (
            <Grid item xs={12} sm={6} md={9}>
              <TextField label="Consul Domain Name" fullWidth required {...register('match.response.consul_domain_name')} helperText="Consul service domain" />
            </Grid>
          )}
        </Grid>

        <Divider sx={{ my: 2 }} />

        <Grid container spacing={2}>
          <Grid item xs={12}>
            <TextField label="Response Body (HTML)" fullWidth multiline rows={4} {...register('match.response.message')} />
          </Grid>
        </Grid>
      </SectionCard>

      {/* Traffic Splitting - shown when response code is 305 */}
      {responseCode === 305 && (
        <SectionCard title="Traffic Splitting" subtitle="Configure multi-backend routing for canary releases, A/B testing, or weighted load balancing">
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6} md={4}>
              <TextField label="Routing Mode" select fullWidth defaultValue="weighted" {...register('match.response.routing.mode')} helperText="How traffic is distributed across backends">
                <MenuItem value="weighted">Weighted Random</MenuItem>
                <MenuItem value="round_robin">Round Robin</MenuItem>
                <MenuItem value="header">Header Match</MenuItem>
                <MenuItem value="cookie">Cookie / Sticky</MenuItem>
                <MenuItem value="least_conn">Least Busy</MenuItem>
              </TextField>
            </Grid>
            {routingMode === 'header' && (
              <>
                <Grid item xs={12} sm={6} md={4}>
                  <TextField label="Header Name" fullWidth {...register('match.response.routing.header_name')} helperText="Header to match for canary routing" />
                </Grid>
                <Grid item xs={12} sm={6} md={4}>
                  <TextField label="Header Value" fullWidth {...register('match.response.routing.header_value')} helperText="Value that routes to canary backend" />
                </Grid>
              </>
            )}
            {routingMode === 'cookie' && (
              <>
                <Grid item xs={12} sm={6} md={4}>
                  <TextField label="Cookie Name" fullWidth {...register('match.response.routing.cookie_name')} helperText="Cookie for sticky session routing" />
                </Grid>
                <Grid item xs={12} sm={6} md={4}>
                  <Controller name="match.response.routing.sticky" control={control} defaultValue={false} render={({ field }) => (
                    <FormControlLabel control={<Switch checked={!!field.value} onChange={(e) => field.onChange(e.target.checked)} />} label="Sticky Sessions" />
                  )} />
                </Grid>
              </>
            )}
          </Grid>

          <Divider sx={{ my: 2 }} />

          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
            <Typography variant="body2" color="text.secondary">Backends</Typography>
            <Button size="small" startIcon={<AddIcon />} onClick={() => addBackend({ address: '', weight: 50, label: 'stable' })}>Add Backend</Button>
          </Box>
          <Alert severity="info" sx={{ mb: 2 }}>
            <Typography variant="caption">
              Weights should sum to 100. Each backend needs an address (host:port), weight (0-100), and a label.
            </Typography>
          </Alert>
          {backendFields.map((field, index) => (
            <Box key={field.id} sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'center' }}>
              <TextField size="small" label="Address (host:port)" required {...register(`match.response.backends.${index}.address`)} helperText="e.g., 10.0.0.1:8080" />
              <TextField size="small" label="Weight %" type="number" sx={{ width: 120 }} {...register(`match.response.backends.${index}.weight`, { valueAsNumber: true })} />
              <TextField size="small" label="Label" required {...register(`match.response.backends.${index}.label`)} helperText="e.g., stable, canary" />
              <IconButton size="small" color="error" onClick={() => removeBackend(index)}><DeleteIcon fontSize="small" /></IconButton>
            </Box>
          ))}
        </SectionCard>
      )}

      {/* Version History */}
      <Card variant="outlined" sx={{ mb: 2, borderColor: 'primary.main', borderWidth: 2 }}>
        <CardContent>
          <Typography variant="subtitle1" fontWeight={700} color="primary.main">Version History &amp; Change Control</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            All changes stay in draft until a Change Request is created and approved. Two approvers are required (4-eyes principle).
          </Typography>
        </CardContent>
      </Card>
    </>
  );
}

export default function RulesCreatePage() {
  const api = useApi();
  const router = useRouter();
  const { notify } = useNotification();

  const handleSubmit = async (data: Record<string, unknown>) => {
    if (typeof data.rules_tags === 'string') {
      data.rules_tags = (data.rules_tags as string).split(',').map((t: string) => t.trim()).filter(Boolean);
    }
    await api.create('rules', { data });
    notify('Rule created successfully', { type: 'success' });
    router.push('/rules');
  };

  return (
    <ResourceForm
      mode="create"
      title="Create Rule"
      defaultValues={{
        version: 1,
        priority: 1,
        match: {
          rules: {
            path_key: 'starts_with',
            path: '/',
            country_key: 'equals',
            country: '',
            client_ip_key: 'equals',
            client_ip: '',
            jwt_token_validation: 'equals',
          },
          response: {
            allow: false,
            code: 403,
            redirect_uri: '',
            strip_path: false,
            auto_redirect_https: false,
            is_consul: false,
            message: '',
            routing: {
              mode: 'weighted',
            },
            backends: [],
          },
        },
      }}
      onSubmit={handleSubmit}
    >
      <RuleFormFields />
    </ResourceForm>
  );
}
