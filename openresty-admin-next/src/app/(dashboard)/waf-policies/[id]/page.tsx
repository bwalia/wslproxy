'use client';

import React from 'react';
import { Grid, TextField, MenuItem, FormControlLabel, Switch } from '@mui/material';
import { useParams, useRouter } from 'next/navigation';
import { useFormContext, Controller } from 'react-hook-form';
import ResourceForm from '@/components/ui/ResourceForm';
import { useApi, useFetch } from '@/hooks/useApi';
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
          InputLabelProps={{ shrink: true }}
        />
      </Grid>
      <Grid item xs={12} sm={3}>
        <TextField
          label="Mode"
          select
          fullWidth
          defaultValue="monitor"
          {...register('mode')}
          InputLabelProps={{ shrink: true }}
        >
          <MenuItem value="monitor">Monitor</MenuItem>
          <MenuItem value="block">Block</MenuItem>
        </TextField>
      </Grid>
      <Grid item xs={12} sm={3}>
        <Controller
          name="enabled"
          control={control}
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
          helperText="Score threshold to trigger action"
          {...register('anomaly_threshold', { valueAsNumber: true })}
          InputLabelProps={{ shrink: true }}
        />
      </Grid>
      <Grid item xs={12} sm={4}>
        <TextField
          label="Paranoia Level"
          type="number"
          fullWidth
          helperText="1 = low, 4 = high sensitivity"
          {...register('paranoia_level', { valueAsNumber: true })}
          inputProps={{ min: 1, max: 4 }}
          InputLabelProps={{ shrink: true }}
        />
      </Grid>
      <Grid item xs={12} sm={4}>
        <TextField
          label="Sampling Rate"
          type="number"
          fullWidth
          helperText="Percentage of requests to inspect (1-100)"
          {...register('sampling_rate', { valueAsNumber: true })}
          inputProps={{ min: 1, max: 100 }}
          InputLabelProps={{ shrink: true }}
        />
      </Grid>
      <Grid item xs={12}>
        <TextField
          label="Description"
          fullWidth
          multiline
          rows={2}
          {...register('description')}
          InputLabelProps={{ shrink: true }}
        />
      </Grid>
    </Grid>
  );
}

export default function WafPoliciesEditPage() {
  const api = useApi();
  const router = useRouter();
  const params = useParams();
  const { notify } = useNotification();
  const id = params.id as string;

  const { data, loading } = useFetch(() => api.getOne('waf_policies', { id }));

  const handleSubmit = async (formData: Record<string, unknown>) => {
    await api.update('waf_policies', { id, data: formData });
    notify('WAF policy updated successfully', { type: 'success' });
    router.push('/waf-policies');
  };

  const handleDelete = async () => {
    await api.delete('waf_policies', { id });
    notify('WAF policy deleted', { type: 'success' });
    router.push('/waf-policies');
  };

  if (loading || !data?.data) return null;

  return (
    <ResourceForm
      mode="edit"
      title="Edit WAF Policy"
      defaultValues={data.data as Record<string, unknown>}
      onSubmit={handleSubmit}
      onDelete={handleDelete}
    >
      <WafPolicyFields />
    </ResourceForm>
  );
}
