'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Card,
  Typography,
  useTheme,
  alpha,
  IconButton,
  Tooltip,
  Chip,
  Tabs,
  Tab,
} from '@mui/material';
import Grid from '@mui/material/Unstable_Grid2';
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ChartTooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  Legend,
  BarChart,
  Bar,
} from 'recharts';
import HttpIcon from '@mui/icons-material/HttpRounded';
import ErrorIcon from '@mui/icons-material/ErrorOutlineRounded';
import SpeedIcon from '@mui/icons-material/SpeedRounded';
import SecurityIcon from '@mui/icons-material/SecurityRounded';
import LanguageIcon from '@mui/icons-material/LanguageRounded';
import DataUsageIcon from '@mui/icons-material/DataUsageRounded';
import ServerIcon from '@mui/icons-material/DnsRounded';
import RuleIcon from '@mui/icons-material/RuleRounded';
import UserIcon from '@mui/icons-material/GroupRounded';
import StorageIcon from '@mui/icons-material/StorageRounded';
import RefreshIcon from '@mui/icons-material/RefreshRounded';
import ShieldIcon from '@mui/icons-material/ShieldRounded';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUserRounded';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActiveRounded';
import BlockIcon from '@mui/icons-material/BlockRounded';
import MemoryIcon from '@mui/icons-material/MemoryRounded';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFileRounded';
import PublicIcon from '@mui/icons-material/PublicRounded';
import DashboardIcon from '@mui/icons-material/DashboardRounded';
import DnsIcon from '@mui/icons-material/DnsRounded';
import BookmarkIcon from '@mui/icons-material/BookmarkRounded';
import BookmarkBorderIcon from '@mui/icons-material/BookmarkBorderRounded';
import LaunchIcon from '@mui/icons-material/LaunchRounded';
import LockIcon from '@mui/icons-material/LockRounded';

import { useApi } from '@/hooks/useApi';
import { useThemeMode } from '@/providers/ThemeProvider';
import StatCard from '@/components/dashboard/StatCard';
import StorageModal from '@/components/dashboard/StorageModal';
import BackendHealth from '@/components/dashboard/BackendHealth';
import GeoTrafficMap from '@/components/dashboard/GeoTrafficMap';
import Welcome from '@/components/ui/Welcome';
import Logs from '@/components/ui/Logs';

// ─── Format helpers ─────────────────────────────────────────────────────────
const formatBytes = (bytes: number, decimals = 2): string => {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

const formatNumber = (num: number): string => {
  if (!num) return '0';
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
};

// ─── Chart Card Component ─────────────────────────────────────────────────
interface ChartCardProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onRefresh?: () => void;
  height?: number | string;
  accentColor?: string;
}

const ChartCard: React.FC<ChartCardProps> = ({
  title,
  subtitle,
  children,
  onRefresh,
  height = 'auto',
  accentColor,
}) => {
  const theme = useTheme();
  const { mode } = useThemeMode();
  const isDark = mode === 'dark';
  const accent = accentColor || theme.palette.primary.main;

  return (
    <Card
      sx={{
        height,
        border: `1px solid ${isDark ? alpha(theme.palette.divider, 0.5) : theme.palette.divider}`,
        borderRadius: 3,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        transition: 'all 0.3s ease',
        '&:hover': {
          boxShadow: isDark
            ? `0 8px 24px ${alpha('#000', 0.3)}`
            : `0 8px 24px ${alpha('#000', 0.08)}`,
        },
      }}
    >
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          px: 2.5,
          py: 2,
          borderBottom: `1px solid ${theme.palette.divider}`,
          backgroundColor: isDark
            ? alpha(theme.palette.background.paper, 0.5)
            : theme.palette.grey[50],
          position: 'relative',
          '&::before': {
            content: '""',
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: 3,
            background: `linear-gradient(180deg, ${accent}, ${alpha(accent, 0.3)})`,
            borderRadius: '0 2px 2px 0',
          },
        }}
      >
        <Box sx={{ pl: 1 }}>
          <Typography variant="subtitle1" fontWeight={700} color="text.primary" sx={{ mb: 0.25 }}>
            {title}
          </Typography>
          {subtitle && (
            <Typography variant="caption" color="text.secondary" fontSize="0.7rem">
              {subtitle}
            </Typography>
          )}
        </Box>
        {onRefresh && (
          <Tooltip title="Refresh data">
            <IconButton
              size="small"
              onClick={onRefresh}
              sx={{
                color: theme.palette.text.secondary,
                backgroundColor: alpha(accent, 0.08),
                '&:hover': {
                  backgroundColor: alpha(accent, 0.15),
                  color: accent,
                },
                transition: 'all 0.2s ease',
              }}
            >
              <RefreshIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Box>
      <Box sx={{ p: 2.5, flex: 1 }}>{children}</Box>
    </Card>
  );
};

// ─── Custom Legend ─────────────────────────────────────────────────────────
interface LegendPayload {
  color: string;
  value: string;
}

const CustomLegend: React.FC<{ payload?: LegendPayload[] }> = ({ payload }) => {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', gap: 3, mt: 1 }}>
      {payload?.map((entry, index) => (
        <Box key={index} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <Box
            sx={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              backgroundColor: entry.color,
            }}
          />
          <Typography variant="caption" color="text.secondary" fontWeight={500}>
            {entry.value}
          </Typography>
        </Box>
      ))}
    </Box>
  );
};

// ─── Interfaces ─────────────────────────────────────────────────────────────
interface TrafficSummary {
  total_requests_24h: number;
  total_success_24h: number;
  total_errors_24h: number;
  total_bandwidth_24h: number;
  success_rate: number;
  avg_requests_per_hour: number;
}

interface TrafficDataItem {
  name: string;
  uv: number;
  pv: number;
  errors: number;
  bandwidth: number;
}

interface DomainItem {
  domain: string;
  requests: number;
}

interface ErrorCodeItem {
  code: number;
  count: number;
}

interface GeoDataItem {
  country_code: string;
  requests: number;
}

interface InstanceInfo {
  hostname?: string;
  ip_addresses?: string[];
  os?: string;
  cpu?: { model?: string; cores?: string | number; usage_percent?: string };
  memory?: { total?: string; used?: string; available?: string; free?: string };
  disk?: { total?: string; used?: string; available?: string; percent?: string };
  uptime?: string;
}

interface CacheStats {
  available: boolean;
  total_entries: number;
  total_size_bytes: number;
  entries_by_host: { host: string; count: number }[];
  entries_by_extension: { extension: string; count: number }[];
  top_urls: { host: string; url: string; size: number }[];
}

interface WafStats {
  totalRules: number;
  totalPolicies: number;
  recentEvents: number;
  blockedEvents: number;
}

interface WafServerRow {
  id: string;
  server_name: string;
  waf_enabled: boolean;
  policy_name: string;
  mode: string;
  inspected: number;
  blocked: number;
  monitored: number;
}

interface Bookmark {
  id: string;
  title?: string;
  host: string;
  description?: string;
  url?: string;
  ssl_enabled?: boolean;
  category?: string;
  auto_generated?: boolean;
}

// ─── Dashboard Page ─────────────────────────────────────────────────────────
export default function DashboardPage() {
  const api = useApi();
  const theme = useTheme();
  const { mode } = useThemeMode();
  const isDark = mode === 'dark';

  // State
  const [errorLogData, setErrorLogData] = useState<string | string[] | Record<string, unknown> | null>(null);
  const [accessLogData, setAccessLogData] = useState<string | string[] | Record<string, unknown> | null>(null);
  const [trafficData, setTrafficData] = useState<TrafficDataItem[]>([]);
  const [trafficSummary, setTrafficSummary] = useState<TrafficSummary>({
    total_requests_24h: 0,
    total_success_24h: 0,
    total_errors_24h: 0,
    total_bandwidth_24h: 0,
    success_rate: 0,
    avg_requests_per_hour: 0,
  });
  const [topDomains, setTopDomains] = useState<DomainItem[]>([]);
  const [errorCodes, setErrorCodes] = useState<ErrorCodeItem[]>([]);
  const [geoData, setGeoData] = useState<GeoDataItem[]>([]);
  const [logMetrics, setLogMetrics] = useState<{ available: boolean; metrics: Record<string, unknown>; message?: string }>({
    available: false,
    metrics: {},
  });
  const [stats, setStats] = useState({ servers: 0, rules: 0, users: 0, profiles: 0 });
  const [instanceInfo, setInstanceInfo] = useState<InstanceInfo>({
    hostname: 'Loading...',
    ip_addresses: [],
    os: 'Loading...',
    cpu: { model: 'Loading...', cores: 'Loading...', usage_percent: '0' },
    memory: { total: 'Loading...', used: 'Loading...', available: 'Loading...', free: 'Loading...' },
    disk: { total: 'Loading...', used: 'Loading...', available: 'Loading...', percent: '0%' },
    uptime: 'Loading...',
  });
  const [cacheStats, setCacheStats] = useState<CacheStats>({
    available: false,
    total_entries: 0,
    total_size_bytes: 0,
    entries_by_host: [],
    entries_by_extension: [],
    top_urls: [],
  });
  const [wafStats, setWafStats] = useState<WafStats>({
    totalRules: 0,
    totalPolicies: 0,
    recentEvents: 0,
    blockedEvents: 0,
  });
  const [wafServerActivity, setWafServerActivity] = useState<WafServerRow[]>([]);
  const [activeTab, setActiveTab] = useState(0);
  const [recentBookmarks, setRecentBookmarks] = useState<Bookmark[]>([]);
  const [storageManagement, setStorageManagement] = useState<string | null>(null);

  // Check storage management on mount — default to 'disk' if not set
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('storageManagement');
      if (!stored) {
        // Default to disk storage — avoids blocking modal on first login
        localStorage.setItem('storageManagement', 'disk');
        setStorageManagement('disk');
      } else {
        setStorageManagement(stored);
      }
    }
  }, []);

  // ─── Data fetchers ──────────────────────────────────────────────────────
  const fetchBookmarks = useCallback(() => {
    api
      .getList('bookmarks', {
        pagination: { page: 1, perPage: 8 },
        sort: { field: 'auto_generated', order: 'ASC' },
        filter: {},
      })
      .then((response) => {
        setRecentBookmarks((response?.data as unknown as Bookmark[]) || []);
      })
      .catch(() => {});
  }, [api]);

  const fetchErrorLogs = useCallback(() => {
    api
      .getLogs('openresty/error_logs')
      .then((response) => {
        const data = response?.data as any;
        setErrorLogData(data?.logs);
      })
      .catch((error) => console.error('Failed to fetch error logs:', error));
  }, [api]);

  const fetchAccessLogs = useCallback(() => {
    api
      .getLogs('openresty/access_logs')
      .then((response) => {
        const data = response?.data as any;
        setAccessLogData(data?.logs);
      })
      .catch((error) => console.error('Failed to fetch access logs:', error));
  }, [api]);

  const fetchTrafficStats = useCallback(() => {
    api
      .getTrafficStats('analytics')
      .then((response) => {
        const data = (response?.data as any) || {};

        const chartData = Array.isArray(data.chart_data) ? data.chart_data : [];
        const transformedData = chartData.map((item: any) => ({
          name: item.name,
          uv: item.requests || 0,
          pv: item.responses || 0,
          errors: item.errors || 0,
          bandwidth: item.bandwidth || 0,
        }));
        setTrafficData(transformedData);

        setTrafficSummary(
          data.summary && typeof data.summary === 'object'
            ? data.summary
            : {
                total_requests_24h: 0,
                total_success_24h: 0,
                total_errors_24h: 0,
                total_bandwidth_24h: 0,
                success_rate: 0,
                avg_requests_per_hour: 0,
              },
        );

        setTopDomains(Array.isArray(data.top_domains) ? data.top_domains : []);
        setErrorCodes(Array.isArray(data.error_codes) ? data.error_codes : []);
        setGeoData(Array.isArray(data.geo_data) ? data.geo_data : []);
      })
      .catch((error) => {
        console.error('Failed to fetch traffic stats:', error);
      });
  }, [api]);

  const fetchLogMetrics = useCallback(() => {
    api
      .getLogMetrics('analytics')
      .then((response) => {
        const data = (response?.data as any) || {};
        setLogMetrics({
          available: data.available || false,
          metrics: data.metrics || {},
          message: data.message || '',
        });
      })
      .catch(() => {
        setLogMetrics({ available: false, metrics: {} });
      });
  }, [api]);

  const fetchInstanceInfo = useCallback(() => {
    api
      .getInstanceInfo('system')
      .then((response) => {
        const data = (response?.data as any) || {};
        setInstanceInfo(data);
      })
      .catch((error) => {
        console.error('Failed to fetch instance info:', error);
      });
  }, [api]);

  const fetchCacheStats = useCallback(() => {
    api
      .getCacheStats('analytics')
      .then((response) => {
        const data = (response?.data as any) || {};
        setCacheStats({
          available: data.available !== false,
          total_entries: data.total_entries || 0,
          total_size_bytes: data.total_size_bytes || 0,
          entries_by_host: data.entries_by_host || [],
          entries_by_extension: data.entries_by_extension || [],
          top_urls: data.top_urls || [],
        });
      })
      .catch(() => {
        setCacheStats({
          available: false,
          total_entries: 0,
          total_size_bytes: 0,
          entries_by_host: [],
          entries_by_extension: [],
          top_urls: [],
        });
      });
  }, [api]);

  // ─── Initial fetch + auto-refresh ───────────────────────────────────────
  useEffect(() => {
    fetchErrorLogs();
    fetchAccessLogs();
    fetchTrafficStats();
    fetchLogMetrics();
    fetchInstanceInfo();
    fetchCacheStats();
    fetchBookmarks();

    // Fetch entity counts
    Promise.all([
      api.getList('servers', { pagination: { page: 1, perPage: 1 }, sort: { field: 'id', order: 'ASC' }, filter: {} }),
      api.getList('rules', { pagination: { page: 1, perPage: 1 }, sort: { field: 'id', order: 'ASC' }, filter: {} }),
      api.getList('users', { pagination: { page: 1, perPage: 1 }, sort: { field: 'id', order: 'ASC' }, filter: {} }),
      api.getList('profiles', { pagination: { page: 1, perPage: 1 }, sort: { field: 'id', order: 'ASC' }, filter: {} }),
    ])
      .then(([servers, rules, users, profiles]) => {
        setStats({
          servers: servers?.total || 0,
          rules: rules?.total || 0,
          users: users?.total || 0,
          profiles: profiles?.total || 0,
        });
      })
      .catch(() => {});

    // Fetch WAF stats
    Promise.all([
      api.getList('waf_rules', { pagination: { page: 1, perPage: 1 }, sort: { field: 'id', order: 'ASC' }, filter: {} }),
      api.getList('waf_policies', { pagination: { page: 1, perPage: 1 }, sort: { field: 'id', order: 'ASC' }, filter: {} }),
      api.getList('waf_events', { pagination: { page: 1, perPage: 1 }, sort: { field: 'id', order: 'ASC' }, filter: {} }),
      api.getList('waf_events', { pagination: { page: 1, perPage: 1 }, sort: { field: 'id', order: 'ASC' }, filter: { type: 'blocked' } }),
    ])
      .then(([wafRules, wafPolicies, wafEvents, blockedEvents]) => {
        setWafStats({
          totalRules: wafRules?.total || 0,
          totalPolicies: wafPolicies?.total || 0,
          recentEvents: wafEvents?.total || 0,
          blockedEvents: blockedEvents?.total || 0,
        });
      })
      .catch(() => {});

    // Fetch per-server WAF activity
    Promise.all([
      api.getList('servers', { pagination: { page: 1, perPage: 1000 }, sort: { field: 'id', order: 'ASC' }, filter: {} }),
      api.getList('waf_events', { pagination: { page: 1, perPage: 1000 }, sort: { field: 'timestamp', order: 'DESC' }, filter: {} }),
      api.getList('waf_policies', { pagination: { page: 1, perPage: 1000 }, sort: { field: 'id', order: 'ASC' }, filter: {} }),
    ])
      .then(([serversRes, eventsRes, policiesRes]) => {
        const servers = (serversRes?.data as any[]) || [];
        const events = (eventsRes?.data as any[]) || [];
        const policies = (policiesRes?.data as any[]) || [];
        const policyMap: Record<string, any> = {};
        policies.forEach((p) => {
          policyMap[p.id] = p;
        });

        const eventsByHost: Record<string, { inspected: number; blocked: number; monitored: number }> = {};
        events.forEach((evt) => {
          const host = evt.host || 'unknown';
          if (!eventsByHost[host]) {
            eventsByHost[host] = { inspected: 0, blocked: 0, monitored: 0 };
          }
          eventsByHost[host].inspected++;
          if (evt.type === 'blocked') eventsByHost[host].blocked++;
          if (evt.type === 'monitored') eventsByHost[host].monitored++;
        });

        const activity = servers
          .filter((s: any) => s.waf_enabled)
          .map((s: any) => {
            const hostEvents = eventsByHost[s.server_name] || { inspected: 0, blocked: 0, monitored: 0 };
            const policy = s.waf_policy_id ? policyMap[s.waf_policy_id] : null;
            return {
              id: s.id,
              server_name: s.server_name,
              waf_enabled: true,
              policy_name: policy?.name || s.waf_policy_id || 'N/A',
              mode: s.waf_mode_override || policy?.mode || 'N/A',
              inspected: hostEvents.inspected,
              blocked: hostEvents.blocked,
              monitored: hostEvents.monitored,
            };
          });

        setWafServerActivity(activity);
      })
      .catch(() => {});

    // Auto-refresh every 15 seconds
    const trafficInterval = setInterval(() => {
      fetchTrafficStats();
    }, 15000);
    return () => clearInterval(trafficInterval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Box
      sx={{
        width: '100%',
        maxWidth: '100%',
        minHeight: '100vh',
        boxSizing: 'border-box',
      }}
    >
      {/* Welcome Section */}
      <Box sx={{ mb: 2, width: '100%' }}>
        <Welcome instanceInfo={instanceInfo} />
      </Box>

      {/* Traffic Stats Cards */}
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 3,
          mb: 4,
          width: '100%',
          '& > *': {
            flex: {
              xs: '1 1 calc(50% - 12px)',
              sm: '1 1 calc(50% - 12px)',
              md: '1 1 calc(33.333% - 16px)',
              lg: '1 1 calc(16.666% - 20px)',
            },
            minWidth: {
              xs: 'calc(50% - 12px)',
              sm: 'calc(50% - 12px)',
              md: 'calc(33.333% - 16px)',
              lg: 'calc(16.666% - 20px)',
            },
            maxWidth: {
              xs: 'calc(50% - 12px)',
              sm: 'calc(50% - 12px)',
              md: 'calc(33.333% - 16px)',
              lg: 'calc(16.666% - 20px)',
            },
          },
        }}
      >
        <Box>
          <StatCard
            title="Requests (24h)"
            value={formatNumber(trafficSummary.total_requests_24h)}
            icon={HttpIcon}
            color="#6366f1"
            subtitle="Total requests"
            large
          />
        </Box>
        <Box>
          <StatCard
            title="Bandwidth (24h)"
            value={formatBytes(trafficSummary.total_bandwidth_24h)}
            icon={DataUsageIcon}
            color="#06b6d4"
            subtitle="Data transferred"
            large
          />
        </Box>
        <Box>
          <StatCard
            title="Errors (24h)"
            value={formatNumber(trafficSummary.total_errors_24h)}
            icon={ErrorIcon}
            color="#ef4444"
            subtitle={`${100 - (trafficSummary.success_rate || 0)}% error rate`}
            large
          />
        </Box>
        <Box>
          <StatCard
            title="Active Domains"
            value={topDomains.length}
            icon={LanguageIcon}
            color="#8b5cf6"
            subtitle="Unique domains"
            large
          />
        </Box>
        <Box>
          <StatCard
            title="Avg/Hour"
            value={formatNumber(trafficSummary.avg_requests_per_hour)}
            icon={SpeedIcon}
            color="#f59e0b"
            subtitle="Requests per hour"
            large
          />
        </Box>
        <Box>
          <StatCard
            title="Success Rate"
            value={`${trafficSummary.success_rate || 0}%`}
            icon={SecurityIcon}
            color="#10b981"
            subtitle="2xx & 3xx responses"
            large
          />
        </Box>
      </Box>

      {/* Content Tabs */}
      <Box sx={{ mb: 3, width: '100%' }}>
        <Tabs
          value={activeTab}
          onChange={(_, v) => setActiveTab(v)}
          sx={{
            borderBottom: `1px solid ${theme.palette.divider}`,
            '& .MuiTab-root': {
              textTransform: 'none',
              fontWeight: 600,
              fontSize: '0.9rem',
              minHeight: 48,
              gap: 1,
            },
            '& .MuiTabs-indicator': {
              height: 3,
              borderRadius: '3px 3px 0 0',
            },
          }}
        >
          <Tab icon={<DashboardIcon sx={{ fontSize: 20 }} />} iconPosition="start" label="Overview" />
          <Tab icon={<DnsIcon sx={{ fontSize: 20 }} />} iconPosition="start" label="Backend Health & Traffic" />
          <Tab icon={<SecurityIcon sx={{ fontSize: 20 }} />} iconPosition="start" label="SSL/TLS" />
          <Tab icon={<StorageIcon sx={{ fontSize: 20 }} />} iconPosition="start" label="Cache" />
          <Tab icon={<ShieldIcon sx={{ fontSize: 20 }} />} iconPosition="start" label="WAF" />
        </Tabs>
      </Box>

      {/* ── Tab: Overview ─────────────────────────────────────────────── */}
      {activeTab === 0 && (
        <>
          {/* Geographic Traffic Map */}
          <Box sx={{ mb: 4, width: '100%' }}>
            <ChartCard
              title="Geographic Traffic Distribution"
              subtitle="Requests by country"
              onRefresh={fetchTrafficStats}
              height={420}
              accentColor="#8b5cf6"
            >
              {geoData.length > 0 ? (
                <GeoTrafficMap data={geoData} formatNumber={formatNumber} />
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 1.5 }}>
                  <Box sx={{ width: 64, height: 64, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: alpha(theme.palette.primary.main, 0.1) }}>
                    <PublicIcon sx={{ fontSize: 32, color: theme.palette.primary.main }} />
                  </Box>
                  <Typography variant="body2" color="text.secondary" fontWeight={500}>
                    No geographic data yet
                  </Typography>
                  <Typography variant="caption" color="text.disabled">
                    Country stats will appear after traffic
                  </Typography>
                </Box>
              )}
            </ChartCard>
          </Box>

          {/* Charts Row - Top Domains, Error Codes */}
          <Box
            sx={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 3,
              mb: 4,
              width: '100%',
              '& > *': {
                flex: { xs: '1 1 100%', sm: '1 1 calc(50% - 12px)' },
                minWidth: { xs: '100%', sm: 'calc(50% - 12px)' },
                maxWidth: { xs: '100%', sm: 'calc(50% - 12px)' },
              },
            }}
          >
            {/* Top Domains */}
            <Box>
              <ChartCard title="Top Domains" subtitle="By request count" height="100%" accentColor="#8b5cf6">
                <Box sx={{ height: 320, overflow: 'auto', scrollbarWidth: 'none', msOverflowStyle: 'none', '&::-webkit-scrollbar': { display: 'none' } }}>
                  {topDomains.slice(0, 8).map((domain, index) => {
                    const maxReq = topDomains[0]?.requests || 1;
                    const percentage = Math.round((domain.requests / maxReq) * 100);
                    return (
                      <Box
                        key={index}
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1.5,
                          py: 1.25,
                          px: 0.5,
                          borderRadius: 1.5,
                          transition: 'all 0.2s',
                          '&:hover': { backgroundColor: alpha(theme.palette.primary.main, 0.05) },
                        }}
                      >
                        <Box
                          sx={{
                            width: 24,
                            height: 24,
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: index < 3 ? alpha(theme.palette.primary.main, 0.15) : alpha(theme.palette.grey[500], 0.1),
                            color: index < 3 ? theme.palette.primary.main : theme.palette.text.secondary,
                            fontSize: '0.7rem',
                            fontWeight: 700,
                          }}
                        >
                          {index + 1}
                        </Box>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.8rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {domain.domain}
                          </Typography>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                            <Box sx={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: alpha(theme.palette.primary.main, 0.1), overflow: 'hidden' }}>
                              <Box sx={{ width: `${percentage}%`, height: '100%', borderRadius: 2, background: `linear-gradient(90deg, ${theme.palette.primary.main}, ${alpha(theme.palette.primary.main, 0.7)})` }} />
                            </Box>
                          </Box>
                        </Box>
                        <Typography variant="body2" sx={{ fontWeight: 700, color: theme.palette.text.primary, fontSize: '0.8rem' }}>
                          {formatNumber(domain.requests)}
                        </Typography>
                      </Box>
                    );
                  })}
                  {topDomains.length === 0 && (
                    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 1.5 }}>
                      <Box sx={{ width: 64, height: 64, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: alpha(theme.palette.primary.main, 0.1) }}>
                        <LanguageIcon sx={{ fontSize: 32, color: theme.palette.primary.main }} />
                      </Box>
                      <Typography variant="body2" color="text.secondary" fontWeight={500}>No domains yet</Typography>
                      <Typography variant="caption" color="text.disabled">Domain stats will appear after traffic</Typography>
                    </Box>
                  )}
                </Box>
              </ChartCard>
            </Box>

            {/* Error Codes */}
            <Box>
              <ChartCard title="Error Codes" subtitle="HTTP 4xx & 5xx" height="100%" accentColor="#ef4444">
                <Box sx={{ height: 320, overflow: 'auto', scrollbarWidth: 'none', msOverflowStyle: 'none', '&::-webkit-scrollbar': { display: 'none' } }}>
                  {errorCodes.slice(0, 8).map((error, index) => {
                    const isServerError = error.code >= 500;
                    const errorColor = isServerError ? theme.palette.error.main : theme.palette.warning.main;
                    const maxCount = errorCodes[0]?.count || 1;
                    const percentage = Math.round((error.count / maxCount) * 100);
                    return (
                      <Box
                        key={index}
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1.5,
                          py: 1.25,
                          px: 0.5,
                          borderRadius: 1.5,
                          transition: 'all 0.2s',
                          '&:hover': { backgroundColor: alpha(errorColor, 0.05) },
                        }}
                      >
                        <Chip
                          label={error.code}
                          size="small"
                          sx={{
                            minWidth: 52,
                            height: 26,
                            backgroundColor: alpha(errorColor, 0.15),
                            color: errorColor,
                            fontWeight: 700,
                            fontSize: '0.75rem',
                            '& .MuiChip-label': { px: 1 },
                          }}
                        />
                        <Box sx={{ flex: 1 }}>
                          <Box sx={{ height: 6, borderRadius: 3, backgroundColor: alpha(errorColor, 0.1), overflow: 'hidden' }}>
                            <Box sx={{ width: `${percentage}%`, height: '100%', borderRadius: 3, background: `linear-gradient(90deg, ${errorColor}, ${alpha(errorColor, 0.6)})` }} />
                          </Box>
                        </Box>
                        <Typography variant="body2" sx={{ fontWeight: 700, color: theme.palette.text.primary, fontSize: '0.8rem', minWidth: 45, textAlign: 'right' }}>
                          {formatNumber(error.count)}
                        </Typography>
                      </Box>
                    );
                  })}
                  {errorCodes.length === 0 && (
                    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 1.5 }}>
                      <Box sx={{ width: 64, height: 64, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: alpha(theme.palette.success.main, 0.1) }}>
                        <SecurityIcon sx={{ fontSize: 32, color: theme.palette.success.main }} />
                      </Box>
                      <Typography variant="body2" color="text.secondary" fontWeight={500}>No errors recorded</Typography>
                      <Typography variant="caption" color="text.disabled">All systems operational</Typography>
                    </Box>
                  )}
                </Box>
              </ChartCard>
            </Box>
          </Box>

          {/* Traffic Chart - Full Width */}
          <Box sx={{ mb: 3, width: '100%' }}>
            <ChartCard
              title="Traffic Overview"
              subtitle={`Last 24 hours - ${formatNumber(trafficSummary.total_requests_24h)} total requests`}
              onRefresh={fetchTrafficStats}
              accentColor="#6366f1"
            >
              <Box sx={{ width: '100%', height: 320 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trafficData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorUv" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={theme.palette.primary.main} stopOpacity={0.4} />
                        <stop offset="95%" stopColor={theme.palette.primary.main} stopOpacity={0.05} />
                      </linearGradient>
                      <linearGradient id="colorPv" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={theme.palette.success.main} stopOpacity={0.4} />
                        <stop offset="95%" stopColor={theme.palette.success.main} stopOpacity={0.05} />
                      </linearGradient>
                      <linearGradient id="colorErr" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={theme.palette.error.main} stopOpacity={0.4} />
                        <stop offset="95%" stopColor={theme.palette.error.main} stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="name"
                      stroke={theme.palette.text.secondary}
                      tick={{ fill: theme.palette.text.secondary, fontSize: 11 }}
                      axisLine={{ stroke: theme.palette.divider }}
                      tickLine={false}
                    />
                    <YAxis
                      stroke={theme.palette.text.secondary}
                      tick={{ fill: theme.palette.text.secondary, fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} vertical={false} />
                    <ChartTooltip
                      contentStyle={{
                        backgroundColor: theme.palette.background.paper,
                        border: `1px solid ${theme.palette.divider}`,
                        borderRadius: 8,
                        boxShadow: isDark ? '0 8px 24px rgba(0,0,0,0.4)' : '0 8px 24px rgba(0,0,0,0.12)',
                        padding: '10px 14px',
                      }}
                      labelStyle={{
                        color: theme.palette.text.primary,
                        fontWeight: 600,
                        marginBottom: 6,
                      }}
                    />
                    <Legend content={<CustomLegend />} />
                    <Area type="monotone" dataKey="uv" stroke={theme.palette.primary.main} strokeWidth={2} fillOpacity={1} fill="url(#colorUv)" name="Requests" dot={false} />
                    <Area type="monotone" dataKey="pv" stroke={theme.palette.success.main} strokeWidth={2} fillOpacity={1} fill="url(#colorPv)" name="Success" dot={false} />
                    <Area type="monotone" dataKey="errors" stroke={theme.palette.error.main} strokeWidth={2} fillOpacity={1} fill="url(#colorErr)" name="Errors" dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </Box>
            </ChartCard>
          </Box>
        </>
      )}

      {/* ── Tab: Backend Health & Traffic ──────────────────────────────── */}
      {activeTab === 1 && (
        <Box sx={{ mb: 4, width: '100%' }}>
          <BackendHealth />
        </Box>
      )}

      {/* ── Tab: SSL/TLS ──────────────────────────────────────────────── */}
      {activeTab === 2 && (
        <Box sx={{ mb: 3, width: '100%' }}>
          <ChartCard
            title="SSL/TLS Error Tracking"
            subtitle="Auto-SSL certificate and OCSP errors"
            onRefresh={fetchLogMetrics}
            height={320}
            accentColor="#ef4444"
          >
            {logMetrics.available ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, py: 2 }}>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: '1fr 1fr 1fr' }, gap: 2 }}>
                  {[
                    { title: 'SNI Detection Failures', level: 'WARN', color: theme.palette.warning.main, pattern: 'could not determine domain for request (SNI not supported?)' },
                    { title: 'OCSP Stapling Failures', level: 'WARN', color: theme.palette.warning.main, pattern: 'failed to set ocsp stapling - failed to get OCSP responder' },
                    { title: 'Domain Not Allowed', level: 'NOTICE', color: theme.palette.info.main, pattern: 'auto-ssl: domain not allowed - using fallback' },
                  ].map((item, index) => (
                    <Box
                      key={index}
                      sx={{
                        p: 2.5,
                        borderRadius: 2,
                        border: `1px solid ${alpha(item.color, 0.3)}`,
                        backgroundColor: alpha(item.color, 0.05),
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 1.5,
                        transition: 'all 0.2s',
                        '&:hover': {
                          backgroundColor: alpha(item.color, 0.08),
                          transform: 'translateY(-2px)',
                          boxShadow: `0 4px 16px ${alpha(item.color, 0.2)}`,
                        },
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <Box sx={{ width: 42, height: 42, borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: alpha(item.color, 0.15) }}>
                          <SecurityIcon sx={{ fontSize: 22, color: item.color }} />
                        </Box>
                        <Box sx={{ flex: 1 }}>
                          <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: '0.95rem', mb: 0.25 }}>{item.title}</Typography>
                          <Chip label={item.level} size="small" sx={{ height: 20, fontSize: '0.65rem', fontWeight: 700, backgroundColor: alpha(item.color, 0.15), color: item.color, '& .MuiChip-label': { px: 1 } }} />
                        </Box>
                      </Box>
                      <Typography variant="caption" sx={{ color: theme.palette.text.secondary, fontSize: '0.7rem', fontFamily: 'monospace', lineHeight: 1.4, p: 1, borderRadius: 1, backgroundColor: alpha(theme.palette.background.default, 0.5) }}>
                        {item.pattern}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              </Box>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 200, gap: 1.5 }}>
                <Box sx={{ width: 64, height: 64, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: alpha(theme.palette.warning.main, 0.1) }}>
                  <SecurityIcon sx={{ fontSize: 32, color: theme.palette.warning.main }} />
                </Box>
                <Typography variant="body2" color="text.secondary" fontWeight={500}>SSL metrics not available</Typography>
                <Typography variant="caption" color="text.disabled">Ensure log interceptor is initialized</Typography>
              </Box>
            )}
          </ChartCard>
        </Box>
      )}

      {/* ── Tab: Cache ────────────────────────────────────────────────── */}
      {activeTab === 3 && (
        <Box sx={{ mb: 3, width: '100%' }}>
          <ChartCard title="Cache Statistics" subtitle="Static content caching metrics and hit ratios" onRefresh={fetchCacheStats}>
            {cacheStats.available && cacheStats.total_entries > 0 ? (
              <Box>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' }, gap: 2, mb: 3 }}>
                  <StatCard title="Total Cached Items" value={formatNumber(cacheStats.total_entries)} icon={StorageIcon} color="#10b981" subtitle="Entries in cache" />
                  <StatCard title="Cache Size" value={formatBytes(cacheStats.total_size_bytes)} icon={MemoryIcon} color="#6366f1" subtitle="Total cached data" />
                  <StatCard title="Hosts Cached" value={formatNumber(cacheStats.entries_by_host?.length || 0)} icon={ServerIcon} color="#f59e0b" subtitle="Unique domains" />
                  <StatCard title="File Types" value={formatNumber(cacheStats.entries_by_extension?.length || 0)} icon={InsertDriveFileIcon} color="#8b5cf6" subtitle="Content types" />
                </Box>

                {cacheStats.entries_by_host && cacheStats.entries_by_host.length > 0 && (
                  <Box sx={{ mb: 3 }}>
                    <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>Cached Entries by Host</Typography>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={cacheStats.entries_by_host.slice(0, 10)}>
                        <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} />
                        <XAxis dataKey="host" stroke={theme.palette.text.secondary} tick={{ fontSize: 12 }} angle={-45} textAnchor="end" height={80} />
                        <YAxis stroke={theme.palette.text.secondary} />
                        <ChartTooltip contentStyle={{ backgroundColor: theme.palette.background.paper, border: `1px solid ${theme.palette.divider}`, borderRadius: 8 }} />
                        <Bar dataKey="count" fill="#10b981" radius={[8, 8, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </Box>
                )}

                {cacheStats.entries_by_extension && cacheStats.entries_by_extension.length > 0 && (
                  <Box sx={{ mb: 3 }}>
                    <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>Cached Entries by File Type</Typography>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={cacheStats.entries_by_extension.slice(0, 10)}>
                        <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} />
                        <XAxis dataKey="extension" stroke={theme.palette.text.secondary} tick={{ fontSize: 12 }} />
                        <YAxis stroke={theme.palette.text.secondary} />
                        <ChartTooltip contentStyle={{ backgroundColor: theme.palette.background.paper, border: `1px solid ${theme.palette.divider}`, borderRadius: 8 }} />
                        <Bar dataKey="count" fill="#6366f1" radius={[8, 8, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </Box>
                )}
              </Box>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 6, gap: 2 }}>
                <Box sx={{ width: 64, height: 64, borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: alpha(theme.palette.info.main, 0.1) }}>
                  <StorageIcon sx={{ fontSize: 32, color: theme.palette.info.main }} />
                </Box>
                <Typography variant="body2" color="text.secondary" fontWeight={500}>No cached items yet</Typography>
                <Typography variant="caption" color="text.disabled">Cache will populate as static content is served</Typography>
              </Box>
            )}
          </ChartCard>
        </Box>
      )}

      {/* ── Tab: WAF ──────────────────────────────────────────────────── */}
      {activeTab === 4 && (
        <>
          <Box sx={{ mb: 4, width: '100%' }}>
            <ChartCard title="WAF Security Overview" subtitle="Web Application Firewall status and recent activity" accentColor="#10b981">
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' }, gap: 2 }}>
                <StatCard title="WAF Rules" value={wafStats.totalRules} icon={ShieldIcon} color="#6366f1" subtitle="Active detection rules" />
                <StatCard title="WAF Policies" value={wafStats.totalPolicies} icon={VerifiedUserIcon} color="#10b981" subtitle="Configured policies" />
                <StatCard title="Total Events" value={formatNumber(wafStats.recentEvents)} icon={NotificationsActiveIcon} color="#f59e0b" subtitle="WAF events recorded" />
                <StatCard title="Blocked Threats" value={formatNumber(wafStats.blockedEvents)} icon={BlockIcon} color="#ef4444" subtitle="Requests blocked" />
              </Box>
            </ChartCard>
          </Box>

          {wafServerActivity.length > 0 && (
            <Box sx={{ mb: 4, width: '100%' }}>
              <ChartCard title="WAF Activity by Server" subtitle="Per-server WAF binding status and event counts" accentColor="#6366f1">
                <Box sx={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        {['Server', 'Status', 'Policy', 'Mode', 'Inspected', 'Blocked', 'Monitored'].map((header) => (
                          <th key={header} style={{ textAlign: header === 'Inspected' || header === 'Blocked' || header === 'Monitored' ? 'right' : 'left', padding: '8px 12px', fontWeight: 600, fontSize: '0.85rem', borderBottom: `1px solid ${theme.palette.divider}`, color: theme.palette.text.primary }}>
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {wafServerActivity.map((row) => (
                        <tr key={row.id}>
                          <td style={{ padding: '8px 12px', fontSize: '0.85rem', color: theme.palette.text.primary }}>{row.server_name}</td>
                          <td style={{ padding: '8px 12px' }}>
                            <Chip label="Active" size="small" sx={{ backgroundColor: alpha(theme.palette.success.main, 0.12), color: theme.palette.success.main, fontWeight: 500, fontSize: '0.75rem' }} />
                          </td>
                          <td style={{ padding: '8px 12px', fontSize: '0.85rem', color: theme.palette.text.primary }}>{row.policy_name}</td>
                          <td style={{ padding: '8px 12px' }}>
                            <Chip
                              label={row.mode === 'block' ? 'Block' : row.mode === 'monitor' ? 'Monitor' : row.mode}
                              size="small"
                              sx={{
                                backgroundColor: row.mode === 'block' ? alpha(theme.palette.error.main, 0.12) : alpha(theme.palette.warning.main, 0.12),
                                color: row.mode === 'block' ? theme.palette.error.main : theme.palette.warning.main,
                                fontWeight: 500,
                                fontSize: '0.75rem',
                              }}
                            />
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', fontSize: '0.85rem', color: theme.palette.text.primary }}>{row.inspected}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', fontSize: '0.85rem', color: row.blocked > 0 ? theme.palette.error.main : theme.palette.text.primary, fontWeight: row.blocked > 0 ? 600 : 400 }}>{row.blocked}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', fontSize: '0.85rem', color: row.monitored > 0 ? theme.palette.warning.main : theme.palette.text.primary }}>{row.monitored}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Box>
              </ChartCard>
            </Box>
          )}
        </>
      )}

      {/* Entity Stats Cards */}
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 2,
          mb: 4,
          width: '100%',
          '& > *': {
            flex: { xs: '1 1 calc(50% - 8px)', sm: '1 1 calc(50% - 8px)', md: '1 1 calc(25% - 12px)' },
            minWidth: { xs: 'calc(50% - 8px)', sm: 'calc(50% - 8px)', md: 'calc(25% - 12px)' },
            maxWidth: { xs: 'calc(50% - 8px)', sm: 'calc(50% - 8px)', md: 'calc(25% - 12px)' },
          },
        }}
      >
        <Box><StatCard title="Servers" value={stats.servers} icon={ServerIcon} color="#6366f1" subtitle="Active configs" /></Box>
        <Box><StatCard title="Rules" value={stats.rules} icon={RuleIcon} color="#ec4899" subtitle="Routing rules" /></Box>
        <Box><StatCard title="Users" value={stats.users} icon={UserIcon} color="#f59e0b" subtitle="Registered" /></Box>
        <Box><StatCard title="Profiles" value={stats.profiles} icon={StorageIcon} color="#06b6d4" subtitle="Environments" /></Box>
      </Box>

      {/* Recent Bookmarks */}
      {recentBookmarks.length > 0 && (
        <Box sx={{ mb: 4, width: '100%' }}>
          <ChartCard title="Recent Bookmarks" subtitle="Your saved and auto-discovered virtual servers" onRefresh={fetchBookmarks} accentColor="#8b5cf6">
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {recentBookmarks.map((bm) => (
                <Box
                  key={bm.id}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                    px: 2,
                    py: 1.25,
                    borderRadius: 2,
                    backgroundColor: bm.auto_generated ? 'transparent' : alpha('#8b5cf6', 0.04),
                    border: `1px solid ${bm.auto_generated ? alpha(theme.palette.divider, 0.5) : alpha('#8b5cf6', 0.15)}`,
                    transition: 'all 0.2s ease',
                    '&:hover': { backgroundColor: alpha('#8b5cf6', 0.08), borderColor: alpha('#8b5cf6', 0.3) },
                  }}
                >
                  {bm.auto_generated ? (
                    <BookmarkBorderIcon sx={{ fontSize: 18, color: theme.palette.text.disabled }} />
                  ) : (
                    <BookmarkIcon sx={{ fontSize: 18, color: '#8b5cf6' }} />
                  )}
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: bm.auto_generated ? 400 : 600, color: theme.palette.text.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {bm.title || bm.host}
                    </Typography>
                    {bm.description && (
                      <Typography variant="caption" color="text.secondary" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                        {bm.description}
                      </Typography>
                    )}
                  </Box>
                  {bm.ssl_enabled && <LockIcon sx={{ fontSize: 14, color: theme.palette.success.main }} />}
                  {bm.category && (
                    <Chip label={bm.category} size="small" sx={{ fontSize: '0.65rem', height: 20, backgroundColor: alpha(theme.palette.info.main, 0.1), color: theme.palette.info.main }} />
                  )}
                  <Tooltip title={`Open ${bm.host}`}>
                    <IconButton
                      size="small"
                      href={bm.url || `https://${bm.host}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      sx={{ opacity: 0.5, '&:hover': { opacity: 1, color: '#8b5cf6' } }}
                    >
                      <LaunchIcon sx={{ fontSize: 14 }} />
                    </IconButton>
                  </Tooltip>
                </Box>
              ))}
            </Box>
          </ChartCard>
        </Box>
      )}

      {/* Logs Section */}
      <Grid container spacing={2} sx={{ mb: 4 }}>
        <Grid xs={12} lg={6}>
          <Logs data={errorLogData} heading="Nginx Error Logs" onRefresh={fetchErrorLogs} />
        </Grid>
        <Grid xs={12} lg={6}>
          <Logs data={accessLogData} heading="Nginx Access Logs" onRefresh={fetchAccessLogs} />
        </Grid>
      </Grid>

      {/* Storage Modal */}
      {!storageManagement && <StorageModal isOpen={true} />}
    </Box>
  );
}
