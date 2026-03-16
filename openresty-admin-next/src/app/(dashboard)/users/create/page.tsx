'use client';

import React from 'react';
import { Grid, TextField, MenuItem } from '@mui/material';
import { useRouter } from 'next/navigation';
import { useFormContext } from 'react-hook-form';
import ResourceForm from '@/components/ui/ResourceForm';
import { useApi } from '@/hooks/useApi';
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
        />
      </Grid>
      <Grid item xs={12} sm={6}>
        <TextField
          label="Password"
          type="password"
          fullWidth
          required
          error={!!errors.password}
          helperText={errors.password?.message as string}
          {...register('password', { required: 'Password is required' })}
          inputProps={{ autoComplete: 'new-password' }}
        />
      </Grid>
      <Grid item xs={12} sm={6}>
        <TextField
          label="Phone"
          fullWidth
          {...register('phone')}
        />
      </Grid>
      <Grid item xs={12} sm={6}>
        <TextField
          label="Address"
          fullWidth
          multiline
          rows={2}
          {...register('address')}
        />
      </Grid>
      <Grid item xs={12} sm={6}>
        <TextField
          label="Role"
          select
          fullWidth
          defaultValue="user"
          {...register('role')}
        >
          <MenuItem value="user">User</MenuItem>
          <MenuItem value="admin">Admin</MenuItem>
          <MenuItem value="editor">Editor</MenuItem>
        </TextField>
      </Grid>
    </Grid>
  );
}

export default function UsersCreatePage() {
  const api = useApi();
  const router = useRouter();
  const { notify } = useNotification();

  const handleSubmit = async (data: Record<string, unknown>) => {
    await api.create('users', { data });
    notify('User created successfully', { type: 'success' });
    router.push('/users');
  };

  return (
    <ResourceForm mode="create" title="Create User" onSubmit={handleSubmit}>
      <UserFields />
    </ResourceForm>
  );
}
