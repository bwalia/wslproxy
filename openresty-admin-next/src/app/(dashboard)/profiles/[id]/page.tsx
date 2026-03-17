'use client';


import React from 'react';
import { Grid, TextField } from '@mui/material';
import { useParams, useRouter } from 'next/navigation';
import { useFormContext } from 'react-hook-form';
import ResourceForm from '@/components/ui/ResourceForm';
import { useApi, useFetch } from '@/hooks/useApi';
import { useNotification } from '@/contexts/NotificationContext';

function ProfileFields() {
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
      <Grid item xs={12}>
        <TextField
          label="Description"
          fullWidth
          multiline
          rows={3}
          {...register('description')}
          InputLabelProps={{ shrink: true }}
        />
      </Grid>
    </Grid>
  );
}

export default function ProfilesEditPage() {
  const api = useApi();
  const router = useRouter();
  const params = useParams();
  const { notify } = useNotification();
  const id = params.id as string;

  const { data, loading } = useFetch(() => api.getOne('profiles', { id }));

  const handleSubmit = async (formData: Record<string, unknown>) => {
    await api.update('profiles', { id, data: formData });
    notify('Profile updated successfully', { type: 'success' });
    router.push('/profiles');
  };

  const handleDelete = async () => {
    await api.delete('profiles', { id });
    notify('Profile deleted', { type: 'success' });
    router.push('/profiles');
  };

  if (loading || !data?.data) return null;

  return (
    <ResourceForm
      mode="edit"
      title="Edit Profile"
      defaultValues={data.data as Record<string, unknown>}
      onSubmit={handleSubmit}
      onDelete={handleDelete}
    >
      <ProfileFields />
    </ResourceForm>
  );
}
