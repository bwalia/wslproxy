'use client';

import React from 'react';
import { Grid, TextField } from '@mui/material';
import { useParams, useRouter } from 'next/navigation';
import { useFormContext } from 'react-hook-form';
import ResourceForm from '@/components/ui/ResourceForm';
import { useApi, useFetch } from '@/hooks/useApi';
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
          InputLabelProps={{ shrink: true }}
        />
      </Grid>
      <Grid item xs={12} sm={6}>
        <TextField
          label="Value"
          type="password"
          fullWidth
          helperText="Leave blank to keep current value"
          {...register('value')}
          inputProps={{ autoComplete: 'new-password' }}
          InputLabelProps={{ shrink: true }}
        />
      </Grid>
      <Grid item xs={12}>
        <TextField
          label="Tags (comma-separated)"
          fullWidth
          helperText="Enter tags separated by commas"
          {...register('tags')}
          InputLabelProps={{ shrink: true }}
        />
      </Grid>
    </Grid>
  );
}

export default function SecretsEditPage() {
  const api = useApi();
  const router = useRouter();
  const params = useParams();
  const { notify } = useNotification();
  const id = params.id as string;

  const { data, loading } = useFetch(() => api.getOne('secrets', { id }));

  const handleSubmit = async (formData: Record<string, unknown>) => {
    const tags = typeof formData.tags === 'string'
      ? formData.tags.split(',').map((t: string) => t.trim()).filter(Boolean)
      : formData.tags;
    await api.update('secrets', { id, data: { ...formData, tags } });
    notify('Secret updated successfully', { type: 'success' });
    router.push('/secrets');
  };

  const handleDelete = async () => {
    await api.delete('secrets', { id });
    notify('Secret deleted', { type: 'success' });
    router.push('/secrets');
  };

  if (loading || !data?.data) return null;

  const record = data.data as Record<string, unknown>;
  const defaultValues = {
    ...record,
    tags: Array.isArray(record.tags) ? (record.tags as string[]).join(', ') : record.tags,
  };

  return (
    <ResourceForm
      mode="edit"
      title="Edit Secret"
      defaultValues={defaultValues}
      onSubmit={handleSubmit}
      onDelete={handleDelete}
    >
      <SecretFields />
    </ResourceForm>
  );
}
