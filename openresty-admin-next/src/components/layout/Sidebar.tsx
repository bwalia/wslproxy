'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Box,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
  Divider,
  IconButton,
  Tooltip,
  useTheme,
  alpha,
} from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import DashboardIcon from '@mui/icons-material/DashboardRounded';
import UserIcon from '@mui/icons-material/GroupRounded';
import SessionIcon from '@mui/icons-material/HistoryToggleOffRounded';
import ServerIcon from '@mui/icons-material/DnsRounded';
import RuleIcon from '@mui/icons-material/RuleRounded';
import ProfileIcon from '@mui/icons-material/RecentActorsRounded';
import SecretIcon from '@mui/icons-material/KeyRounded';
import InstanceIcon from '@mui/icons-material/ViewInArRounded';
import WafRuleIcon from '@mui/icons-material/ShieldRounded';
import WafPolicyIcon from '@mui/icons-material/VerifiedUserRounded';
import WafEventIcon from '@mui/icons-material/NotificationsActiveRounded';
import IngressIcon from '@mui/icons-material/AccountTree';
import HealthIcon from '@mui/icons-material/MonitorHeartRounded';
import BookmarkIcon from '@mui/icons-material/BookmarkRounded';
import ChangeRequestIcon from '@mui/icons-material/AssignmentTurnedInRounded';
import AuditIcon from '@mui/icons-material/HistoryRounded';
import { useSettings } from '@/contexts/SettingsContext';
import { useThemeMode } from '@/providers/ThemeProvider';
import { config } from '@/lib/config/env';

const EXPANDED_WIDTH = 240;
const COLLAPSED_WIDTH = 72;

interface NavItem {
  path: string;
  label: string;
  icon: React.ReactNode;
  condition?: boolean;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

interface SidebarProps {
  open: boolean;
  onToggle: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ open, onToggle }) => {
  const pathname = usePathname();
  const theme = useTheme();
  const { settings } = useSettings();
  const { mode } = useThemeMode();

  const isActive = (path: string): boolean => {
    if (path === '/') return pathname === '/';
    return pathname.startsWith(path);
  };

  const sections: NavSection[] = [
    {
      title: 'Navigation',
      items: [
        { path: '/', label: 'Dashboard', icon: <DashboardIcon /> },
        { path: '/users', label: 'Users', icon: <UserIcon /> },
        {
          path: '/sessions',
          label: 'Sessions',
          icon: <SessionIcon />,
          condition: settings?.storage_type === 'redis',
        },
        { path: '/health', label: 'System Health', icon: <HealthIcon /> },
        { path: '/bookmarks', label: 'Bookmarks', icon: <BookmarkIcon /> },
      ],
    },
    {
      title: 'Configuration',
      items: [
        { path: '/servers', label: 'Virtual Servers', icon: <ServerIcon /> },
        { path: '/rules', label: 'Server Rules', icon: <RuleIcon /> },
        { path: '/profiles', label: 'Profiles', icon: <ProfileIcon /> },
        { path: '/secrets', label: 'Secrets', icon: <SecretIcon /> },
        { path: '/instances', label: 'Instances', icon: <InstanceIcon /> },
        {
          path: '/ingress',
          label: 'Ingress Overview',
          icon: <IngressIcon />,
          condition: config.targetPlatform === 'KUBERNETES',
        },
      ],
    },
    {
      title: 'Change Management',
      items: [
        { path: '/change-requests', label: 'Change Requests', icon: <ChangeRequestIcon /> },
        { path: '/audit', label: 'Audit Log', icon: <AuditIcon /> },
      ],
    },
    {
      title: 'Security',
      items: [
        { path: '/waf-rules', label: 'WAF Rules', icon: <WafRuleIcon /> },
        { path: '/waf-policies', label: 'WAF Policies', icon: <WafPolicyIcon /> },
        { path: '/waf-events', label: 'WAF Events', icon: <WafEventIcon /> },
      ],
    },
  ];

  const drawerWidth = open ? EXPANDED_WIDTH : COLLAPSED_WIDTH;

  return (
    <Drawer
      variant="permanent"
      sx={{
        width: drawerWidth,
        flexShrink: 0,
        whiteSpace: 'nowrap',
        transition: theme.transitions.create('width', {
          easing: theme.transitions.easing.sharp,
          duration: theme.transitions.duration.enteringScreen,
        }),
        '& .MuiDrawer-paper': {
          width: drawerWidth,
          overflowX: 'hidden',
          transition: theme.transitions.create('width', {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.enteringScreen,
          }),
          backgroundColor: theme.palette.background.paper,
          borderRight: `1px solid ${theme.palette.divider}`,
          top: 64,
          height: 'calc(100% - 64px)',
        },
      }}
    >
      {/* Toggle Button */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: open ? 'flex-end' : 'center',
          p: 1,
        }}
      >
        <IconButton
          onClick={onToggle}
          size="small"
          sx={{
            transition: 'all 0.2s ease',
            '&:hover': {
              backgroundColor: alpha(theme.palette.primary.main, 0.1),
            },
          }}
        >
          {open ? <ChevronLeftIcon /> : <ChevronRightIcon />}
        </IconButton>
      </Box>

      {/* Navigation Sections */}
      <Box
        sx={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflowY: 'auto',
          overflowX: 'hidden',
        }}
      >
        {sections.map((section, sectionIndex) => (
          <React.Fragment key={section.title}>
            {sectionIndex > 0 && (
              <Divider sx={{ my: 1, mx: 2, borderColor: theme.palette.divider }} />
            )}

            <Box sx={{ px: 1 }}>
              {open && (
                <Typography
                  variant="overline"
                  sx={{
                    px: 2,
                    py: 1,
                    color: theme.palette.text.secondary,
                    fontSize: '0.65rem',
                    fontWeight: 700,
                    letterSpacing: '0.1em',
                    display: 'block',
                  }}
                >
                  {section.title}
                </Typography>
              )}

              <List disablePadding>
                {section.items
                  .filter((item) => item.condition === undefined || item.condition)
                  .map((item) => {
                    const active = isActive(item.path);

                    const listItemButton = (
                      <ListItemButton
                        component={Link}
                        href={item.path}
                        selected={active}
                        sx={{
                          borderRadius: 2,
                          mx: 1,
                          my: 0.5,
                          minHeight: 44,
                          justifyContent: open ? 'initial' : 'center',
                          px: open ? 2 : 2.5,
                          position: 'relative',
                          transition: 'all 0.2s ease',
                          '&:hover': {
                            backgroundColor: alpha(theme.palette.primary.main, 0.08),
                            transform: 'translateX(4px)',
                          },
                          '&.Mui-selected': {
                            backgroundColor: alpha(theme.palette.primary.main, 0.12),
                            color: theme.palette.primary.main,
                            fontWeight: 600,
                            '&:hover': {
                              backgroundColor: alpha(theme.palette.primary.main, 0.16),
                            },
                            '&::before': {
                              content: '""',
                              position: 'absolute',
                              left: 0,
                              top: '50%',
                              transform: 'translateY(-50%)',
                              width: 4,
                              height: '60%',
                              backgroundColor: theme.palette.primary.main,
                              borderRadius: '0 4px 4px 0',
                            },
                          },
                        }}
                      >
                        <ListItemIcon
                          sx={{
                            minWidth: 0,
                            mr: open ? 2 : 'auto',
                            justifyContent: 'center',
                            color: active
                              ? theme.palette.primary.main
                              : theme.palette.text.secondary,
                            transition: 'color 0.2s ease',
                            '& .MuiSvgIcon-root': {
                              fontSize: '1.25rem',
                            },
                          }}
                        >
                          {item.icon}
                        </ListItemIcon>
                        {open && (
                          <ListItemText
                            primary={item.label}
                            primaryTypographyProps={{
                              fontSize: '0.875rem',
                              fontWeight: active ? 600 : 500,
                            }}
                          />
                        )}
                      </ListItemButton>
                    );

                    return (
                      <ListItem key={item.path} disablePadding sx={{ display: 'block' }}>
                        {open ? (
                          listItemButton
                        ) : (
                          <Tooltip title={item.label} placement="right" arrow>
                            {listItemButton}
                          </Tooltip>
                        )}
                      </ListItem>
                    );
                  })}
              </List>
            </Box>
          </React.Fragment>
        ))}
      </Box>

      {/* Footer */}
      {open && (
        <Box
          sx={{
            px: 2,
            py: 2,
            mt: 'auto',
            borderTop: `1px solid ${theme.palette.divider}`,
          }}
        >
          <Typography
            variant="caption"
            sx={{
              color: theme.palette.text.disabled,
              display: 'block',
              textAlign: 'center',
            }}
          >
            WSL Proxy Admin v1.0
          </Typography>
        </Box>
      )}
    </Drawer>
  );
};

export default Sidebar;
