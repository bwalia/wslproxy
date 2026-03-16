'use client';

import React from 'react';
import {
  Grid,
  TextField,
  Typography,
  IconButton,
  Button,
  Box,
  Card,
  CardContent,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import { useParams, useRouter } from 'next/navigation';
import { useFormContext, useFieldArray } from 'react-hook-form';
import ResourceForm from '@/components/ui/ResourceForm';
import { useApi, useFetch } from '@/hooks/useApi';
import { useNotification } from '@/contexts/NotificationContext';

function UpstreamFields() {
  const { register, control, formState: { errors } } = useFormContext();
  const { fields, append, remove } = useFieldArray({
    control,
    name: 'servers',
  });

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
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
          <Typography variant="subtitle2">Backend Servers</Typography>
          <Button
            size="small"
            startIcon={<AddIcon />}
            onClick={() =>
              append({ address: '', port: '80', weight: '1', max_fails: '3', fail_timeout: '10s' })
            }
          >
            Add Server
          </Button>
        </Box>
        {fields.map((field, index) => (
          <Card key={field.id} variant="outlined" sx={{ mb: 1 }}>
            <CardContent sx={{ py: 1, '&:last-child': { pb: 1 } }}>
              <Grid container spacing={1} alignItems="center">
                <Grid item xs={12} sm={3}>
                  <TextField
                    label="Address"
                    size="small"
                    fullWidth
                    {...register(`servers.${index}.address`)}
                    InputLabelProps={{ shrink: true }}
                  />
                </Grid>
                <Grid item xs={6} sm={2}>
                  <TextField
                    label="Port"
                    size="small"
                    fullWidth
                    {...register(`servers.${index}.port`)}
                    InputLabelProps={{ shrink: true }}
                  />
                </Grid>
                <Grid item xs={6} sm={2}>
                  <TextField
                    label="Weight"
                    size="small"
                    fullWidth
                    {...register(`servers.${index}.weight`)}
                    InputLabelProps={{ shrink: true }}
                  />
                </Grid>
                <Grid item xs={6} sm={2}>
                  <TextField
                    label="Max Fails"
                    size="small"
                    fullWidth
                    {...register(`servers.${index}.max_fails`)}
                    InputLabelProps={{ shrink: true }}
                  />
                </Grid>
                <Grid item xs={6} sm={2}>
                  <TextField
                    label="Fail Timeout"
                    size="small"
                    fullWidth
                    {...register(`servers.${index}.fail_timeout`)}
                    InputLabelProps={{ shrink: true }}
                  />
                </Grid>
                <Grid item xs="auto">
                  <IconButton size="small" color="error" onClick={() => remove(index)}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        ))}
        {fields.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
            No servers added yet. Click &quot;Add Server&quot; to add a backend.
          </Typography>
        )}
      </Grid>
    </Grid>
  );
}

export default function UpstreamsEditPage() {
  const api = useApi();
  const router = useRouter();
  const params = useParams();
  const { notify } = useNotification();
  const id = params.id as string;

  const { data, loading } = useFetch(() => api.getOne('upstreams', { id }));

  const handleSubmit = async (formData: Record<string, unknown>) => {
    await api.update('upstreams', { id, data: formData });
    notify('Upstream updated successfully', { type: 'success' });
    router.push('/upstreams');
  };

  const handleDelete = async () => {
    await api.delete('upstreams', { id });
    notify('Upstream deleted', { type: 'success' });
    router.push('/upstreams');
  };

  if (loading || !data) return null;

  return (
    <ResourceForm
      mode="edit"
      title="Edit Upstream"
      defaultValues={data.data as Record<string, unknown>}
      onSubmit={handleSubmit}
      onDelete={handleDelete}
    >
      <UpstreamFields />
    </ResourceForm>
  );
}
