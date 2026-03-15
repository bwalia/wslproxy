'use client';

import React from 'react';
import { Grid, TextField } from '@mui/material';
import { useRouter } from 'next/navigation';
import { useFormContext } from 'react-hook-form';
import ResourceForm from '@/components/ui/ResourceForm';
import { useApi } from '@/hooks/useApi';
import { useNotification } from '@/contexts/NotificationContext';

function BookmarkFields() {
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
          label="URL"
          fullWidth
          required
          error={!!errors.url}
          helperText={errors.url?.message as string}
          {...register('url', { required: 'URL is required' })}
          placeholder="https://example.com"
        />
      </Grid>
    </Grid>
  );
}

export default function BookmarksCreatePage() {
  const api = useApi();
  const router = useRouter();
  const { notify } = useNotification();

  const handleSubmit = async (data: Record<string, unknown>) => {
    await api.create('bookmarks', { data });
    notify('Bookmark created successfully', { type: 'success' });
    router.push('/bookmarks');
  };

  return (
    <ResourceForm mode="create" title="Create Bookmark" onSubmit={handleSubmit}>
      <BookmarkFields />
    </ResourceForm>
  );
}
