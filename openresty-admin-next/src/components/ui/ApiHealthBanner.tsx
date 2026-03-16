'use client';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Box, Typography, Chip } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import WarningIcon from '@mui/icons-material/Warning';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import { config } from '@/lib/config/env';

const POLL_INTERVAL = 30000;
const SLOW_THRESHOLD = 3000;
const TIMEOUT_MS = 8000;

type HealthStatus = 'healthy' | 'slow' | 'unhealthy' | 'checking';

interface HealthState {
  status: HealthStatus;
  responseTime: number | null;
  lastChecked: Date | null;
  error: string | null;
}

const AUTH_STATUS_CONFIG: Record<HealthStatus, { color: string; bgColor: string; icon: React.ReactNode; label: string }> = {
  healthy: {
    color: '#16a34a',
    bgColor: '#dcfce7',
    icon: <CheckCircleIcon sx={{ fontSize: 16 }} />,
    label: 'API Healthy',
  },
  slow: {
    color: '#d97706',
    bgColor: '#fef3c7',
    icon: <WarningIcon sx={{ fontSize: 16 }} />,
    label: 'API Slow',
  },
  unhealthy: {
    color: '#dc2626',
    bgColor: '#fee2e2',
    icon: <ErrorIcon sx={{ fontSize: 16 }} />,
    label: 'API Unreachable',
  },
  checking: {
    color: '#6b7280',
    bgColor: '#f3f4f6',
    icon: <HourglassEmptyIcon sx={{ fontSize: 16 }} />,
    label: 'Checking...',
  },
};

const UNAUTH_STATUS_CONFIG: Record<HealthStatus, { color: string; bgColor: string; borderColor: string; icon: React.ReactNode; label: string; message: string }> = {
  healthy: {
    color: '#16a34a',
    bgColor: '#f0fdf4',
    borderColor: '#bbf7d0',
    icon: <CheckCircleIcon sx={{ fontSize: 20 }} />,
    label: 'API Connected',
    message: 'The API server is reachable and responding normally.',
  },
  slow: {
    color: '#d97706',
    bgColor: '#fffbeb',
    borderColor: '#fde68a',
    icon: <WarningIcon sx={{ fontSize: 20 }} />,
    label: 'API Slow',
    message: 'The API server is responding slowly. Login may take longer than usual.',
  },
  unhealthy: {
    color: '#dc2626',
    bgColor: '#fef2f2',
    borderColor: '#fecaca',
    icon: <ErrorIcon sx={{ fontSize: 20 }} />,
    label: 'API Unreachable',
    message: 'Cannot connect to the API server. Please check your network connection.',
  },
  checking: {
    color: '#6b7280',
    bgColor: '#f9fafb',
    borderColor: '#e5e7eb',
    icon: <HourglassEmptyIcon sx={{ fontSize: 20 }} />,
    label: 'Checking API...',
    message: 'Verifying API server connectivity...',
  },
};

function getAuthHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const token = localStorage.getItem('token');
  if (token) {
    return { Authorization: `Bearer ${token}` };
  }
  return {};
}

export function useApiHealth(authenticated: boolean) {
  const [health, setHealth] = useState<HealthState>({
    status: 'checking',
    responseTime: null,
    lastChecked: null,
    error: null,
  });
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const checkHealth = useCallback(async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const startTime = performance.now();

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (authenticated) {
        Object.assign(headers, getAuthHeaders());
      }

      // Use the public /health endpoint — no auth required and works in all states
      const response = await fetch(`/health`, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });

      const responseTime = Math.round(performance.now() - startTime);
      clearTimeout(timeoutId);

      if (response.ok) {
        setHealth({
          status: responseTime > SLOW_THRESHOLD ? 'slow' : 'healthy',
          responseTime,
          lastChecked: new Date(),
          error: null,
        });
      } else {
        setHealth({
          status: 'unhealthy',
          responseTime,
          lastChecked: new Date(),
          error: `HTTP ${response.status}`,
        });
      }
    } catch (err) {
      clearTimeout(timeoutId);
      setHealth({
        status: 'unhealthy',
        responseTime: null,
        lastChecked: new Date(),
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }, [authenticated]);

  useEffect(() => {
    checkHealth();
    intervalRef.current = setInterval(checkHealth, POLL_INTERVAL);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [checkHealth]);

  return health;
}

interface ApiHealthBannerProps {
  authenticated?: boolean;
}

export const ApiHealthBanner: React.FC<ApiHealthBannerProps> = ({ authenticated = false }) => {
  const health = useApiHealth(authenticated);
  const cfg = UNAUTH_STATUS_CONFIG[health.status];

  return (
    <Box
      sx={{
        width: '100%',
        p: 1.5,
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        backgroundColor: cfg.bgColor,
        border: `1px solid ${cfg.borderColor}`,
        borderRadius: 1,
      }}
    >
      <Box sx={{ color: cfg.color, display: 'flex', alignItems: 'center' }}>
        {cfg.icon}
      </Box>
      <Box sx={{ flex: 1 }}>
        <Typography variant="body2" sx={{ fontWeight: 600, color: cfg.color }}>
          {cfg.label}
        </Typography>
        <Typography variant="caption" sx={{ color: cfg.color, opacity: 0.8 }}>
          {cfg.message}
        </Typography>
      </Box>
      {health.responseTime !== null && (
        <Typography variant="caption" sx={{ color: cfg.color, opacity: 0.7 }}>
          {health.responseTime}ms
        </Typography>
      )}
    </Box>
  );
};

export const ApiHealthIndicator: React.FC = () => {
  const health = useApiHealth(true);
  const cfg = AUTH_STATUS_CONFIG[health.status];

  return (
    <Chip
      icon={<Box sx={{ color: cfg.color, display: 'flex', alignItems: 'center' }}>{cfg.icon}</Box>}
      label={
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <span>{cfg.label}</span>
          {health.responseTime !== null && (
            <Typography component="span" variant="caption" sx={{ opacity: 0.7 }}>
              ({health.responseTime}ms)
            </Typography>
          )}
        </Box>
      }
      size="small"
      sx={{
        backgroundColor: cfg.bgColor,
        color: cfg.color,
        fontWeight: 500,
        fontSize: '0.75rem',
        '& .MuiChip-icon': { color: cfg.color },
      }}
    />
  );
};

export default ApiHealthBanner;
