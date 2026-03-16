'use client';

import React from 'react';
import { Grid, TextField } from '@mui/material';
import { useRouter } from 'next/navigation';
import { useFormContext } from 'react-hook-form';
import ResourceForm from '@/components/ui/ResourceForm';
import { useApi } from '@/hooks/useApi';
import { useNotification } from '@/contexts/NotificationContext';

function SecretFields() {
  const { register, formState: { errors } } = useFormContext();

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
          label="Value"
          type="password"
          fullWidth
          required
          error={!!errors.value}
          helperText={errors.value?.message as string}
          {...register('value', { required: 'Value is required' })}
          inputProps={{ autoComplete: 'new-password' }}
        />
      </Grid>
      <Grid item xs={12}>
        <TextField
          label="Tags (comma-separated)"
          fullWidth
          helperText="Enter tags separated by commas"
          {...register('tags')}
        />
      </Grid>
    </Grid>
  );
}

export default function SecretsCreatePage() {
  const api = useApi();
  const router = useRouter();
  const { notify } = useNotification();

  const handleSubmit = async (data: Record<string, unknown>) => {
    const tags = typeof data.tags === 'string'
      ? data.tags.split(',').map((t: string) => t.trim()).filter(Boolean)
      : data.tags;
    await api.create('secrets', { data: { ...data, tags } });
    notify('Secret created successfully', { type: 'success' });
    router.push('/secrets');
  };

  return (
    <ResourceForm mode="create" title="Create Secret" onSubmit={handleSubmit}>
      <SecretFields />
    </ResourceForm>
  );
}
