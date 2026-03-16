'use client';

import React from 'react';
import { Grid, TextField } from '@mui/material';
import { useParams, useRouter } from 'next/navigation';
import { useFormContext } from 'react-hook-form';
import ResourceForm from '@/components/ui/ResourceForm';
import { useApi, useFetch } from '@/hooks/useApi';
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
          InputLabelProps={{ shrink: true }}
        />
      </Grid>
      <Grid item xs={12}>
        <TextField
          label="Value"
          fullWidth
          multiline
          rows={4}
          {...register('value')}
          InputLabelProps={{ shrink: true }}
        />
      </Grid>
    </Grid>
  );
}

export default function SettingsEditPage() {
  const api = useApi();
  const router = useRouter();
  const params = useParams();
  const { notify } = useNotification();
  const id = params.id as string;

  const { data, loading } = useFetch(() => api.getOne('settings', { id }));

  const handleSubmit = async (formData: Record<string, unknown>) => {
    await api.update('settings', { id, data: formData });
    notify('Setting updated successfully', { type: 'success' });
    router.push('/settings');
  };

  const handleDelete = async () => {
    await api.delete('settings', { id });
    notify('Setting deleted', { type: 'success' });
    router.push('/settings');
  };

  if (loading || !data?.data) return null;

  return (
    <ResourceForm
      mode="edit"
      title="Edit Setting"
      defaultValues={data.data as Record<string, unknown>}
      onSubmit={handleSubmit}
      onDelete={handleDelete}
    >
      <SettingFields />
    </ResourceForm>
  );
}
