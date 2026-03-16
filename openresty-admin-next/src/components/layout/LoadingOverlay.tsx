'use client';

import React from 'react';
import { Backdrop, CircularProgress } from '@mui/material';
import { useSettings } from '@/contexts/SettingsContext';

const LoadingOverlay: React.FC = () => {
  const { isLoading } = useSettings();

  return (
    <Backdrop
      open={isLoading}
      sx={{
        zIndex: (theme) => theme.zIndex.drawer + 2,
        color: '#fff',
        backdropFilter: 'blur(4px)',
        backgroundColor: 'rgba(0, 0, 0, 0.3)',
      }}
    >
      <CircularProgress
        color="primary"
        size={48}
        thickness={4}
      />
    </Backdrop>
  );
};

export default LoadingOverlay;
