'use client';
import React from 'react';
import { Box, Typography, Link } from '@mui/material';
import { useThemeMode } from '@/providers/ThemeProvider';
import { config } from '@/lib/config/env';

const VersionFooter: React.FC = () => {
  const { mode } = useThemeMode();
  const isDark = mode === 'dark';

  return (
    <Box
      sx={{
        position: 'sticky',
        right: 0,
        bottom: 0,
        left: 0,
        zIndex: 100,
        py: 1.5,
        px: 3,
        backgroundColor: isDark ? '#1e293b' : '#f1f5f9',
        borderTop: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 1,
      }}
    >
      <Typography
        variant="caption"
        sx={{
          color: isDark ? '#94a3b8' : '#64748b',
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          flexWrap: 'wrap',
        }}
      >
        <span>
          Version: <strong>{config.appVersion}</strong>
        </span>
        <span>
          Build: <strong>{config.buildNumber}</strong>
        </span>
        <span>Deployed: {config.deploymentTime}</span>
      </Typography>
      <Link
        href="/swagger/"
        target="_blank"
        sx={{
          fontSize: '0.75rem',
          color: isDark ? '#818cf8' : '#6366f1',
          textDecoration: 'none',
          fontWeight: 500,
          '&:hover': { textDecoration: 'underline' },
        }}
      >
        API Documentation →
      </Link>
    </Box>
  );
};

export default VersionFooter;
