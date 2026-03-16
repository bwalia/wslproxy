'use client';

import React from 'react';
import { Grid, TextField, MenuItem, FormControlLabel, Switch } from '@mui/material';
import { useRouter } from 'next/navigation';
import { useFormContext, Controller } from 'react-hook-form';
import ResourceForm from '@/components/ui/ResourceForm';
import { useApi } from '@/hooks/useApi';
import { useNotification } from '@/contexts/NotificationContext';

function WafRuleFields() {
  const { register, control, formState: { errors } } = useFormContext();

  return (
    <Grid container spacing={2}>
      <Grid item xs={12} sm={6}>
        <TextField
          label="Name"
          fullWidth
          required
          error={!!errors.name}
          helperText={errors.name?.message as string}
          {...register('name', { required: 'Name is required' })}
        />
      </Grid>
      <Grid item xs={12} sm={6}>
        <TextField
          label="Category"
          select
          fullWidth
          defaultValue=""
          {...register('category')}
        >
          <MenuItem value="">None</MenuItem>
          <MenuItem value="sqli">SQL Injection</MenuItem>
          <MenuItem value="xss">Cross-Site Scripting</MenuItem>
          <MenuItem value="rce">Remote Code Execution</MenuItem>
          <MenuItem value="lfi">Local File Inclusion</MenuItem>
          <MenuItem value="rfi">Remote File Inclusion</MenuItem>
          <MenuItem value="scanner">Scanner Detection</MenuItem>
          <MenuItem value="protocol">Protocol Enforcement</MenuItem>
          <MenuItem value="custom">Custom</MenuItem>
        </TextField>
      </Grid>
      <Grid item xs={12} sm={4}>
        <TextField
          label="Severity"
          select
          fullWidth
          defaultValue="medium"
          {...register('severity')}
        >
          <MenuItem value="critical">Critical</MenuItem>
          <MenuItem value="high">High</MenuItem>
          <MenuItem value="medium">Medium</MenuItem>
          <MenuItem value="low">Low</MenuItem>
        </TextField>
      </Grid>
      <Grid item xs={12} sm={4}>
        <TextField
          label="Target"
          select
          fullWidth
          defaultValue="request"
          {...register('target')}
        >
          <MenuItem value="request">Request</MenuItem>
          <MenuItem value="request_headers">Request Headers</MenuItem>
          <MenuItem value="request_body">Request Body</MenuItem>
          <MenuItem value="request_uri">Request URI</MenuItem>
          <MenuItem value="response">Response</MenuItem>
          <MenuItem value="response_headers">Response Headers</MenuItem>
          <MenuItem value="response_body">Response Body</MenuItem>
        </TextField>
      </Grid>
      <Grid item xs={12} sm={4}>
        <TextField
          label="Action"
          select
          fullWidth
          defaultValue="block"
          {...register('action')}
        >
          <MenuItem value="block">Block</MenuItem>
          <MenuItem value="allow">Allow</MenuItem>
          <MenuItem value="log">Log Only</MenuItem>
          <MenuItem value="score">Score</MenuItem>
          <MenuItem value="redirect">Redirect</MenuItem>
        </TextField>
      </Grid>
      <Grid item xs={12} sm={6}>
        <TextField
          label="Pattern"
          fullWidth
          multiline
          rows={3}
          helperText="Regex pattern to match"
          {...register('pattern')}
        />
      </Grid>
      <Grid item xs={12} sm={3}>
        <TextField
          label="Score"
          type="number"
          fullWidth
          defaultValue={5}
          {...register('score', { valueAsNumber: true })}
        />
      </Grid>
      <Grid item xs={12} sm={3}>
        <Controller
          name="enabled"
          control={control}
          defaultValue={true}
          render={({ field }) => (
            <FormControlLabel
              control={
                <Switch
                  checked={!!field.value}
                  onChange={(e) => field.onChange(e.target.checked)}
                />
              }
              label="Enabled"
            />
          )}
        />
      </Grid>
      <Grid item xs={12}>
        <TextField
          label="Description"
          fullWidth
          multiline
          rows={2}
          {...register('description')}
        />
      </Grid>
    </Grid>
  );
}

export default function WafRulesCreatePage() {
  const api = useApi();
  const router = useRouter();
  const { notify } = useNotification();

  const handleSubmit = async (data: Record<string, unknown>) => {
    await api.create('waf_rules', { data });
    notify('WAF rule created successfully', { type: 'success' });
    router.push('/waf-rules');
  };

  return (
    <ResourceForm
      mode="create"
      title="Create WAF Rule"
      defaultValues={{ enabled: true, severity: 'medium', action: 'block', target: 'request', score: 5 }}
      onSubmit={handleSubmit}
    >
      <WafRuleFields />
    </ResourceForm>
  );
}
