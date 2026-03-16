'use client';

import React from 'react';
import { Grid, TextField, MenuItem } from '@mui/material';
import { useParams, useRouter } from 'next/navigation';
import { useFormContext } from 'react-hook-form';
import ResourceForm from '@/components/ui/ResourceForm';
import { useApi, useFetch } from '@/hooks/useApi';
import { useNotification } from '@/contexts/NotificationContext';

function UserFields() {
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
          label="Email"
          type="email"
          fullWidth
          required
          error={!!errors.email}
          helperText={errors.email?.message as string}
          {...register('email', { required: 'Email is required' })}
          InputLabelProps={{ shrink: true }}
        />
      </Grid>
      <Grid item xs={12} sm={6}>
        <TextField
          label="Password"
          type="password"
          fullWidth
          helperText="Leave blank to keep current password"
          {...register('password')}
          inputProps={{ autoComplete: 'new-password' }}
          InputLabelProps={{ shrink: true }}
        />
      </Grid>
      <Grid item xs={12} sm={6}>
        <TextField
          label="Phone"
          fullWidth
          {...register('phone')}
          InputLabelProps={{ shrink: true }}
        />
      </Grid>
      <Grid item xs={12} sm={6}>
        <TextField
          label="Address"
          fullWidth
          multiline
          rows={2}
          {...register('address')}
          InputLabelProps={{ shrink: true }}
        />
      </Grid>
      <Grid item xs={12} sm={6}>
        <TextField
          label="Role"
          select
          fullWidth
          defaultValue="user"
          {...register('role')}
          InputLabelProps={{ shrink: true }}
        >
          <MenuItem value="user">User</MenuItem>
          <MenuItem value="admin">Admin</MenuItem>
          <MenuItem value="editor">Editor</MenuItem>
        </TextField>
      </Grid>
    </Grid>
  );
}

export default function UsersEditPage() {
  const api = useApi();
  const router = useRouter();
  const params = useParams();
  const { notify } = useNotification();
  const id = params.id as string;

  const { data, loading } = useFetch(() => api.getOne('users', { id }));

  const handleSubmit = async (formData: Record<string, unknown>) => {
    await api.update('users', { id, data: formData });
    notify('User updated successfully', { type: 'success' });
    router.push('/users');
  };

  const handleDelete = async () => {
    await api.delete('users', { id });
    notify('User deleted', { type: 'success' });
    router.push('/users');
  };

  if (loading || !data?.data) return null;

  return (
    <ResourceForm
      mode="edit"
      title="Edit User"
      defaultValues={data.data as Record<string, unknown>}
      onSubmit={handleSubmit}
      onDelete={handleDelete}
    >
      <UserFields />
    </ResourceForm>
  );
}
