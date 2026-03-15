'use client';
import React, { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Button,
  Typography,
  CircularProgress,
  Alert,
} from '@mui/material';
import { useForm, FormProvider } from 'react-hook-form';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SaveIcon from '@mui/icons-material/Save';
import DeleteIcon from '@mui/icons-material/Delete';
import { useRouter } from 'next/navigation';
import ConfirmDialog from '@/components/ui/ConfirmDialog';

interface ResourceFormProps {
  children: React.ReactNode;
  onSubmit: (data: Record<string, unknown>) => Promise<void>;
  onDelete?: () => Promise<void>;
  defaultValues?: Record<string, unknown>;
  title?: string;
  loading?: boolean;
  mode?: 'create' | 'edit';
}

const ResourceForm: React.FC<ResourceFormProps> = ({
  children,
  onSubmit,
  onDelete,
  defaultValues = {},
  title,
  loading = false,
  mode = 'create',
}) => {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const methods = useForm({
    defaultValues,
  });

  const handleSubmit = async (data: Record<string, unknown>) => {
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit(data);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'An unexpected error occurred';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    setDeleteDialogOpen(false);
    if (!onDelete) return;
    setError(null);
    setSubmitting(true);
    try {
      await onDelete();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to delete resource';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <FormProvider {...methods}>
      <Box component="form" onSubmit={methods.handleSubmit(handleSubmit)}>
        {/* Top bar */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            mb: 3,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Button
              startIcon={<ArrowBackIcon />}
              onClick={() => router.back()}
              size="small"
            >
              Back
            </Button>
            {title && (
              <Typography variant="h6" fontWeight="bold" sx={{ ml: 1 }}>
                {title}
              </Typography>
            )}
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {mode === 'edit' && onDelete && (
              <Button
                variant="outlined"
                color="error"
                startIcon={<DeleteIcon />}
                onClick={() => setDeleteDialogOpen(true)}
                disabled={submitting}
              >
                Delete
              </Button>
            )}
            <Button
              type="submit"
              variant="contained"
              startIcon={
                submitting ? <CircularProgress size={18} color="inherit" /> : <SaveIcon />
              }
              disabled={submitting || loading}
            >
              {mode === 'create' ? 'Create' : 'Save'}
            </Button>
          </Box>
        </Box>

        {/* Error display */}
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {/* Form body */}
        <Card variant="outlined">
          <CardContent>{children}</CardContent>
        </Card>
      </Box>

      {/* Delete confirmation dialog */}
      <ConfirmDialog
        open={deleteDialogOpen}
        title="Confirm Delete"
        message="Are you sure you want to delete this resource? This action cannot be undone."
        confirmLabel="Delete"
        confirmColor="error"
        onConfirm={handleDelete}
        onCancel={() => setDeleteDialogOpen(false)}
      />
    </FormProvider>
  );
};

export { ResourceForm };
export default ResourceForm;
