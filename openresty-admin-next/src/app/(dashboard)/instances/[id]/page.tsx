'use client';

import React from 'react';
import { Grid, TextField } from '@mui/material';
import { useParams, useRouter } from 'next/navigation';
import { useFormContext } from 'react-hook-form';
import ResourceForm from '@/components/ui/ResourceForm';
import { useApi, useFetch } from '@/hooks/useApi';
import { useNotification } from '@/contexts/NotificationContext';

function InstanceFields() {
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
    </Grid>
  );
}

export default function InstancesEditPage() {
  const api = useApi();
  const router = useRouter();
  const params = useParams();
  const { notify } = useNotification();
  const id = params.id as string;

  const { data, loading } = useFetch(() => api.getOne('instances', { id }));

  const handleSubmit = async (formData: Record<string, unknown>) => {
    await api.update('instances', { id, data: formData });
    notify('Instance updated successfully', { type: 'success' });
    router.push('/instances');
  };

  const handleDelete = async () => {
    await api.delete('instances', { id });
    notify('Instance deleted', { type: 'success' });
    router.push('/instances');
  };

  if (loading || !data) return null;

  return (
    <ResourceForm
      mode="edit"
      title="Edit Instance"
      defaultValues={data.data as Record<string, unknown>}
      onSubmit={handleSubmit}
      onDelete={handleDelete}
    >
      <InstanceFields />
    </ResourceForm>
  );
}
