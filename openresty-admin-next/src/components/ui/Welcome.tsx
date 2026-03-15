'use client';

import React, { useState } from 'react';
import {
  Box,
  Card,
  CardActions,
  Button,
  Typography,
  useTheme,
  alpha,
  Chip,
  IconButton,
  Tooltip,
} from '@mui/material';
import ServerIcon from '@mui/icons-material/DnsRounded';
import RuleIcon from '@mui/icons-material/RuleRounded';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import ContentCopyIcon from '@mui/icons-material/ContentCopyRounded';
import CheckIcon from '@mui/icons-material/CheckRounded';
import { useThemeMode } from '@/providers/ThemeProvider';
import { config } from '@/lib/config/env';

interface InstanceInfo {
  hostname?: string;
  ip_addresses?: string[];
  os?: string;
  cpu?: { model?: string; cores?: string | number; usage_percent?: string };
  memory?: { total?: string; used?: string; available?: string; free?: string };
  disk?: { total?: string; used?: string; available?: string; percent?: string };
  uptime?: string;
}

interface WelcomeProps {
  instanceInfo?: InstanceInfo;
}

const Welcome: React.FC<WelcomeProps> = ({ instanceInfo = {} }) => {
  const theme = useTheme();
  const { mode } = useThemeMode();
  const isDark = mode === 'dark';
  const [copiedIp, setCopiedIp] = useState(false);

  const handleCopyIp = (ip: string) => {
    navigator.clipboard.writeText(ip).then(() => {
      setCopiedIp(true);
      setTimeout(() => setCopiedIp(false), 2000);
    });
  };

  return (
    <Card
      sx={{
        position: 'relative',
        overflow: 'hidden',
        width: '100%',
        boxSizing: 'border-box',
        borderRadius: 3,
        background: isDark
          ? `linear-gradient(135deg, ${alpha('#6366f1', 0.15)} 0%, ${alpha('#8b5cf6', 0.1)} 50%, ${alpha('#10b981', 0.1)} 100%)`
          : `linear-gradient(135deg, ${alpha('#6366f1', 0.08)} 0%, ${alpha('#8b5cf6', 0.05)} 50%, ${alpha('#10b981', 0.05)} 100%)`,
        border: `1px solid ${isDark ? alpha('#6366f1', 0.2) : alpha('#6366f1', 0.15)}`,
        padding: 0,
        marginTop: 0,
        marginBottom: 0,
      }}
    >
      {/* Decorative elements */}
      <Box
        sx={{
          position: 'absolute',
          top: -50,
          right: -50,
          width: 200,
          height: 200,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${alpha('#6366f1', 0.1)} 0%, transparent 70%)`,
        }}
      />
      <Box
        sx={{
          position: 'absolute',
          bottom: -30,
          left: '30%',
          width: 150,
          height: 150,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${alpha('#10b981', 0.1)} 0%, transparent 70%)`,
        }}
      />

      <Box display="flex" sx={{ p: 4, position: 'relative', zIndex: 1 }}>
        <Box flex="1">
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
            <Chip
              label="Admin Portal"
              size="small"
              sx={{
                backgroundColor: alpha(theme.palette.primary.main, 0.1),
                color: theme.palette.primary.main,
                fontWeight: 600,
                fontSize: '0.7rem',
              }}
            />
            {config.appVersion !== 'dev' && (
              <Chip
                label={`v${config.appVersion}`}
                size="small"
                variant="outlined"
                sx={{
                  fontSize: '0.65rem',
                  height: 22,
                  borderColor: alpha(theme.palette.primary.main, 0.3),
                }}
              />
            )}
          </Box>

          <Typography
            variant="h4"
            component="h2"
            gutterBottom
            sx={{
              fontWeight: 700,
              color: theme.palette.text.primary,
              letterSpacing: '-0.02em',
            }}
          >
            Welcome to {config.appDisplayName}
          </Typography>

          <Box maxWidth="36em">
            <Typography
              variant="body1"
              component="p"
              gutterBottom
              sx={{
                color: theme.palette.text.secondary,
                lineHeight: 1.7,
                mb: 3,
              }}
            >
              Manage your reverse proxy configurations, routing rules, and server
              instances from this centralized control panel.
            </Typography>
          </Box>

          <CardActions sx={{ padding: 0, gap: 2 }}>
            <Button
              variant="contained"
              href="/servers"
              startIcon={<ServerIcon />}
              endIcon={<ArrowForwardIcon sx={{ fontSize: '1rem !important' }} />}
              sx={{
                backgroundColor: theme.palette.primary.main,
                color: '#fff',
                px: 3,
                py: 1.25,
                fontWeight: 600,
                boxShadow: `0 4px 14px ${alpha(theme.palette.primary.main, 0.4)}`,
                '&:hover': {
                  backgroundColor: theme.palette.primary.dark,
                  transform: 'translateY(-2px)',
                  boxShadow: `0 6px 20px ${alpha(theme.palette.primary.main, 0.5)}`,
                },
                transition: 'all 0.2s ease',
              }}
            >
              Manage Servers
            </Button>
            <Button
              variant="outlined"
              href="/rules"
              startIcon={<RuleIcon />}
              sx={{
                borderColor: theme.palette.primary.main,
                color: theme.palette.primary.main,
                px: 3,
                py: 1.25,
                fontWeight: 600,
                '&:hover': {
                  backgroundColor: alpha(theme.palette.primary.main, 0.08),
                  borderColor: theme.palette.primary.dark,
                },
              }}
            >
              Configure Rules
            </Button>
          </CardActions>
        </Box>

        {/* Right side instance info */}
        <Box
          display={{ xs: 'none', md: 'flex' }}
          flexDirection="column"
          sx={{
            ml: 4,
            minWidth: '280px',
            gap: 1.5,
          }}
        >
          <Typography
            variant="overline"
            sx={{
              color: theme.palette.text.secondary,
              fontWeight: 600,
              fontSize: '0.7rem',
              letterSpacing: '0.1em',
            }}
          >
            Instance Info
          </Typography>

          <Box
            sx={{
              backgroundColor: isDark ? alpha('#0f172a', 0.6) : alpha('#fff', 0.7),
              borderRadius: 2,
              p: 2,
              border: `1px solid ${isDark ? alpha('#334155', 0.5) : alpha('#cbd5e1', 0.5)}`,
            }}
          >
            <Box sx={{ mb: 1.5 }}>
              <Typography
                variant="caption"
                sx={{ color: theme.palette.text.secondary, fontSize: '0.7rem' }}
              >
                Hostname
              </Typography>
              <Typography
                variant="body2"
                sx={{
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  fontFamily: 'JetBrains Mono, monospace',
                }}
              >
                {instanceInfo.hostname || 'Loading...'}
              </Typography>
            </Box>

            <Box sx={{ mb: 1.5 }}>
              <Typography
                variant="caption"
                sx={{ color: theme.palette.text.secondary, fontSize: '0.7rem' }}
              >
                IP Address
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Typography
                  variant="body2"
                  sx={{
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    fontFamily: 'JetBrains Mono, monospace',
                  }}
                >
                  {instanceInfo.ip_addresses && instanceInfo.ip_addresses.length > 0
                    ? instanceInfo.ip_addresses[0]
                    : 'Loading...'}
                </Typography>
                {instanceInfo.ip_addresses && instanceInfo.ip_addresses.length > 0 && (
                  <Tooltip title={copiedIp ? 'Copied!' : 'Copy IP'} arrow>
                    <IconButton
                      size="small"
                      onClick={() => handleCopyIp(instanceInfo.ip_addresses![0])}
                      sx={{
                        p: 0.3,
                        color: copiedIp
                          ? theme.palette.success.main
                          : theme.palette.text.secondary,
                        '&:hover': {
                          backgroundColor: alpha(theme.palette.primary.main, 0.08),
                          color: theme.palette.primary.main,
                        },
                      }}
                    >
                      {copiedIp ? (
                        <CheckIcon sx={{ fontSize: 14 }} />
                      ) : (
                        <ContentCopyIcon sx={{ fontSize: 14 }} />
                      )}
                    </IconButton>
                  </Tooltip>
                )}
              </Box>
            </Box>

            <Box sx={{ mb: 1.5 }}>
              <Typography
                variant="caption"
                sx={{ color: theme.palette.text.secondary, fontSize: '0.7rem' }}
              >
                CPU Cores
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 500, fontSize: '0.75rem' }}>
                {instanceInfo.cpu?.cores || '?'} cores
              </Typography>
            </Box>

            <Box sx={{ mb: 1.5 }}>
              <Typography
                variant="caption"
                sx={{ color: theme.palette.text.secondary, fontSize: '0.7rem' }}
              >
                Memory Available
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 500, fontSize: '0.75rem' }}>
                {instanceInfo.memory?.available || 'Loading...'} /{' '}
                {instanceInfo.memory?.total || '?'}
              </Typography>
            </Box>

            <Box>
              <Typography
                variant="caption"
                sx={{ color: theme.palette.text.secondary, fontSize: '0.7rem' }}
              >
                Storage Available
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 500, fontSize: '0.75rem' }}>
                {instanceInfo.disk?.available || 'Loading...'} /{' '}
                {instanceInfo.disk?.total || '?'}
              </Typography>
            </Box>
          </Box>

          <Button
            variant="text"
            href="/instances"
            size="small"
            sx={{
              fontSize: '0.7rem',
              fontWeight: 600,
              color: theme.palette.primary.main,
              textAlign: 'right',
              justifyContent: 'flex-end',
              '&:hover': {
                backgroundColor: alpha(theme.palette.primary.main, 0.08),
              },
            }}
          >
            View Details &rarr;
          </Button>
        </Box>
      </Box>
    </Card>
  );
};

export default Welcome;
