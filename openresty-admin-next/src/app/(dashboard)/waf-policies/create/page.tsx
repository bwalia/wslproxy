'use client';

import React from 'react';
import { Grid, TextField, MenuItem, FormControlLabel, Switch } from '@mui/material';
import { useRouter } from 'next/navigation';
import { useFormContext, Controller } from 'react-hook-form';
import ResourceForm from '@/components/ui/ResourceForm';
import { useApi } from '@/hooks/useApi';
import { useNotification } from '@/contexts/NotificationContext';

function WafPolicyFields() {
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
      <Grid item xs={12} sm={3}>
        <TextField
          label="Mode"
          select
          fullWidth
          defaultValue="monitor"
          {...register('mode')}
        >
          <MenuItem value="monitor">Monitor</MenuItem>
          <MenuItem value="block">Block</MenuItem>
        </TextField>
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
      <Grid item xs={12} sm={4}>
        <TextField
          label="Anomaly Threshold"
          type="number"
          fullWidth
          defaultValue={5}
          helperText="Score threshold to trigger action"
          {...register('anomaly_threshold', { valueAsNumber: true })}
        />
      </Grid>
      <Grid item xs={12} sm={4}>
        <TextField
          label="Paranoia Level"
          type="number"
          fullWidth
          defaultValue={1}
          helperText="1 = low, 4 = high sensitivity"
          {...register('paranoia_level', { valueAsNumber: true })}
          inputProps={{ min: 1, max: 4 }}
        />
      </Grid>
      <Grid item xs={12} sm={4}>
        <TextField
          label="Sampling Rate"
          type="number"
          fullWidth
          defaultValue={100}
          helperText="Percentage of requests to inspect (1-100)"
          {...register('sampling_rate', { valueAsNumber: true })}
          inputProps={{ min: 1, max: 100 }}
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

export default function WafPoliciesCreatePage() {
  const api = useApi();
  const router = useRouter();
  const { notify } = useNotification();

  const handleSubmit = async (data: Record<string, unknown>) => {
    await api.create('waf_policies', { data });
    notify('WAF policy created successfully', { type: 'success' });
    router.push('/waf-policies');
  };

  return (
    <ResourceForm
      mode="create"
      title="Create WAF Policy"
      defaultValues={{ enabled: true, mode: 'monitor', anomaly_threshold: 5, paranoia_level: 1, sampling_rate: 100 }}
      onSubmit={handleSubmit}
    >
      <WafPolicyFields />
    </ResourceForm>
  );
}
