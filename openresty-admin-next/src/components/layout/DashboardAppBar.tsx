'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AppBar,
  Toolbar,
  Box,
  IconButton,
  Tooltip,
  Divider,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Typography,
  useTheme,
  alpha,
} from '@mui/material';
import CloudSyncIcon from '@mui/icons-material/CloudSync';
import SdStorageIcon from '@mui/icons-material/SdStorage';
import ScreenSearchDesktopIcon from '@mui/icons-material/ScreenSearchDesktop';
import RememberMeIcon from '@mui/icons-material/RememberMe';
import SettingsIcon from '@mui/icons-material/Settings';
import LightModeIcon from '@mui/icons-material/LightMode';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import LogoutIcon from '@mui/icons-material/Logout';
import Logo from '@/components/ui/Logo';
import { ApiHealthIndicator } from '@/components/ui/ApiHealthBanner';
import { useThemeMode } from '@/providers/ThemeProvider';
import { useAuth } from '@/contexts/AuthContext';
import { useSettings } from '@/contexts/SettingsContext';
import { useNotification } from '@/contexts/NotificationContext';
import { useApi } from '@/hooks/useApi';
import { config } from '@/lib/config/env';

const DashboardAppBar: React.FC = () => {
  const theme = useTheme();
  const router = useRouter();
  const { mode, toggleTheme } = useThemeMode();
  const { logout } = useAuth();
  const { settings } = useSettings();
  const { notify } = useNotification();
  const { syncAPI, checkORStatus } = useApi();

  const [userMenuAnchor, setUserMenuAnchor] = useState<null | HTMLElement>(null);
  const [isProfileModalOpen, setProfileModalOpen] = useState(false);
  const [isStorageModalOpen, setStorageModalOpen] = useState(false);

  const handleSyncAPI = async () => {
    try {
      await syncAPI('frontdoor/opsapi/sync', { data: {} });
      notify('API sync completed successfully', { type: 'success' });
    } catch {
      notify('API sync failed', { type: 'error' });
    }
  };

  const handleCheckORStatus = async () => {
    try {
      const opStatus = await checkORStatus('openresty_status', {}) as any;
      notify(opStatus?.message ?? 'Status check complete', {
        autoHideDuration: 30000,
        type: opStatus?.check_status ?? 'info',
      });
    } catch {
      notify('Status check failed', { type: 'error' });
    }
  };

  const handleSettings = () => {
    router.push('/settings');
  };

  const handleOpenUserMenu = (event: React.MouseEvent<HTMLElement>) => {
    setUserMenuAnchor(event.currentTarget);
  };

  const handleCloseUserMenu = () => {
    setUserMenuAnchor(null);
  };

  const handleLogout = () => {
    handleCloseUserMenu();
    logout();
    router.push('/login');
  };

  const iconButtonSx = {
    transition: 'all 0.2s ease',
    '&:hover': {
      backgroundColor: alpha(theme.palette.primary.main, 0.1),
    },
  };

  return (
    <AppBar
      position="fixed"
      elevation={0}
      sx={{
        backgroundColor: theme.palette.background.paper,
        color: theme.palette.text.primary,
        borderBottom: `1px solid ${theme.palette.divider}`,
        boxShadow: 'none',
        zIndex: theme.zIndex.drawer + 1,
      }}
    >
      <Toolbar sx={{ minHeight: 64, px: 2 }}>
        {/* Logo */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            mr: 2,
            py: 1,
          }}
        >
          <Logo width={180} height={40} theme={mode} />
        </Box>

        {/* Page Title Area */}
        <Box sx={{ flex: 1 }} />

        {/* Action Buttons */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
          }}
        >
          {/* API Sync - only if not DOCKER */}
          {config.targetPlatform !== 'DOCKER' && (
            <Tooltip title="Sync API Storage">
              <IconButton color="inherit" onClick={handleSyncAPI} sx={iconButtonSx}>
                <CloudSyncIcon />
              </IconButton>
            </Tooltip>
          )}

          {/* Storage Type - only if disk */}
          {settings?.storage_type === 'disk' && (
            <Tooltip title="Select Storage Type">
              <IconButton
                color="inherit"
                onClick={() => setStorageModalOpen(true)}
                sx={iconButtonSx}
              >
                <SdStorageIcon />
              </IconButton>
            </Tooltip>
          )}

          {/* API Health Indicator */}
          <ApiHealthIndicator />

          {/* Check OR Status */}
          <Tooltip title="Check Openresty Status">
            <IconButton color="inherit" onClick={handleCheckORStatus} sx={iconButtonSx}>
              <ScreenSearchDesktopIcon />
            </IconButton>
          </Tooltip>

          {/* Environment Profile */}
          <Tooltip title="Select Environment Profile">
            <IconButton
              color="inherit"
              onClick={() => setProfileModalOpen(true)}
              sx={iconButtonSx}
            >
              <RememberMeIcon />
            </IconButton>
          </Tooltip>

          {/* Settings */}
          <Tooltip title="Basic site settings">
            <IconButton color="inherit" onClick={handleSettings} sx={iconButtonSx}>
              <SettingsIcon />
            </IconButton>
          </Tooltip>

          <Divider
            orientation="vertical"
            flexItem
            sx={{
              mx: 1,
              borderColor: theme.palette.divider,
            }}
          />

          {/* Theme Toggle */}
          <Tooltip title={mode === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}>
            <IconButton
              color="inherit"
              onClick={toggleTheme}
              sx={{
                ...iconButtonSx,
                '&:hover': {
                  ...iconButtonSx['&:hover'],
                  transform: 'rotate(12deg)',
                },
              }}
            >
              {mode === 'dark' ? (
                <LightModeIcon sx={{ color: '#fbbf24' }} />
              ) : (
                <DarkModeIcon sx={{ color: '#6366f1' }} />
              )}
            </IconButton>
          </Tooltip>

          {/* User Menu */}
          <Tooltip title="Account">
            <IconButton color="inherit" onClick={handleOpenUserMenu} sx={iconButtonSx}>
              <AccountCircleIcon />
            </IconButton>
          </Tooltip>

          <Menu
            anchorEl={userMenuAnchor}
            open={Boolean(userMenuAnchor)}
            onClose={handleCloseUserMenu}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            slotProps={{
              paper: {
                sx: {
                  mt: 1,
                  minWidth: 180,
                  borderRadius: 2,
                  border: `1px solid ${theme.palette.divider}`,
                  boxShadow: theme.palette.mode === 'dark'
                    ? '0 8px 32px rgba(0, 0, 0, 0.5)'
                    : '0 8px 32px rgba(0, 0, 0, 0.1)',
                },
              },
            }}
          >
            <MenuItem onClick={handleLogout}>
              <ListItemIcon>
                <LogoutIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText>
                <Typography variant="body2">Logout</Typography>
              </ListItemText>
            </MenuItem>
          </Menu>
        </Box>
      </Toolbar>
    </AppBar>
  );
};

export default DashboardAppBar;
