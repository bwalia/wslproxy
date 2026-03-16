'use client';

import React from 'react';
import { Grid, TextField } from '@mui/material';
import { useRouter } from 'next/navigation';
import { useFormContext } from 'react-hook-form';
import ResourceForm from '@/components/ui/ResourceForm';
import { useApi } from '@/hooks/useApi';
import { useNotification } from '@/contexts/NotificationContext';

function SettingFields() {
  const { register, formState: { errors } } = useFormContext();

  return (
    <Grid container spacing={2}>
      <Grid item xs={12} sm={6}>
        <TextField
          label="Key"
          fullWidth
          required
          error={!!errors.key}
          helperText={errors.key?.message as string}
          {...register('key', { required: 'Key is required' })}
        />
      </Grid>
      <Grid item xs={12}>
        <TextField
          label="Value"
          fullWidth
          multiline
          rows={4}
          {...register('value')}
        />
      </Grid>
    </Grid>
  );
}

export default function SettingsCreatePage() {
  const api = useApi();
  const router = useRouter();
  const { notify } = useNotification();

  const handleSubmit = async (data: Record<string, unknown>) => {
    await api.create('settings', { data });
    notify('Setting created successfully', { type: 'success' });
    router.push('/settings');
  };

  return (
    <ResourceForm mode="create" title="Create Setting" onSubmit={handleSubmit}>
      <SettingFields />
    </ResourceForm>
  );
}
