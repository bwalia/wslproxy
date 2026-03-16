'use client';

import React, { useState, FormEvent } from 'react';
import {
  Box,
  Card,
  CardContent,
  TextField,
  Button,
  Typography,
  CircularProgress,
} from '@mui/material';
import { useApi } from '@/hooks/useApi';
import { useNotification } from '@/contexts/NotificationContext';

export default function PasswordResetPage() {
  const { resetPassword } = useApi();
  const { notify } = useNotification();

  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!oldPassword.trim() || !newPassword.trim() || !confirmPassword.trim()) {
      notify('Please fill in all fields.', { type: 'warning' });
      return;
    }

    if (newPassword !== confirmPassword) {
      notify('New password and confirm password do not match.', { type: 'error' });
      return;
    }

    setLoading(true);
    try {
      const response = await resetPassword('password/reset', {
        data: { oldPassword, newPassword, confirmPassword },
      });

      if ((response as any)?.error) {
        notify((response as any).error, { type: 'error' });
      } else {
        notify('Password updated successfully.', { type: 'success' });
        setOldPassword('');
        setNewPassword('');
        setConfirmPassword('');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to reset password.';
      notify(message, { type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ maxWidth: 480, mx: 'auto', mt: 4 }}>
      <Typography variant="h5" gutterBottom fontWeight={600}>
        Reset Password
      </Typography>
      <Card>
        <CardContent>
          <Box component="form" onSubmit={handleSubmit} noValidate>
            <TextField
              label="Current Password"
              type="password"
              fullWidth
              required
              margin="normal"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              autoComplete="current-password"
            />
            <TextField
              label="New Password"
              type="password"
              fullWidth
              required
              margin="normal"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
            />
            <TextField
              label="Confirm New Password"
              type="password"
              fullWidth
              required
              margin="normal"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
            />
            <Button
              type="submit"
              variant="contained"
              fullWidth
              size="large"
              disabled={loading}
              sx={{ mt: 3, py: 1.5 }}
            >
              {loading ? <CircularProgress size={24} color="inherit" /> : 'Update Password'}
            </Button>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}
