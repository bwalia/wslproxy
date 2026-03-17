'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  useTheme,
  alpha,
  Chip,
  IconButton,
  Tooltip,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Grid,
  LinearProgress,
} from '@mui/material';
import MonitorHeartRoundedIcon from '@mui/icons-material/MonitorHeartRounded';
import RefreshIcon from '@mui/icons-material/RefreshRounded';
import CheckCircleIcon from '@mui/icons-material/CheckCircleRounded';
import CancelIcon from '@mui/icons-material/CancelRounded';
import WarningIcon from '@mui/icons-material/WarningAmberRounded';
import StorageIcon from '@mui/icons-material/StorageRounded';
import DnsIcon from '@mui/icons-material/DnsRounded';
import FolderIcon from '@mui/icons-material/FolderRounded';
import SettingsIcon from '@mui/icons-material/SettingsRounded';
import CodeIcon from '@mui/icons-material/CodeRounded';
import InfoIcon from '@mui/icons-material/InfoRounded';
import MemoryIcon from '@mui/icons-material/MemoryRounded';
import CloudIcon from '@mui/icons-material/CloudRounded';
import LockIcon from '@mui/icons-material/LockRounded';
import PageHeader from '@/components/ui/PageHeader';
import { useApi } from '@/hooks/useApi';
import { config } from '@/lib/config/env';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ServiceStatus {
  status?: string;
  version?: string;
  message?: string;
  host?: string;
  port?: number;
  worker_count?: number;
}

interface DirInfo {
  exists?: boolean;
  readable?: boolean;
  writable?: boolean;
}

interface HealthData {
  status?: string;
  timestamp?: string;
  _http_status?: number;
  _authenticated?: boolean;
  _api_url?: string;
  _latency?: number;
  services?: Record<string, ServiceStatus>;
  data_directories?: Record<string, DirInfo>;
  settings?: Record<string, any>;
  frontend_env?: Record<string, any>;
  environment?: Record<string, any>;
  system?: Record<string, any>;
  error?: string;
}

interface InstanceInfoData {
  hostname?: string;
  fqdn?: string;
  os?: string;
  kernel?: string;
  uptime?: string;
  load_average?: string;
  cpu?: { model?: string; cores?: number; usage_percent?: string };
  memory?: { total?: string; used?: string; available?: string; free?: string };
  disk?: { total?: string; used?: string; available?: string; percent?: string };
  ip_addresses?: string[];
  network?: { interfaces?: string[]; routes?: string[] };
  environment?: string;
}

interface CacheStatsData {
  available?: boolean;
  total_entries?: number;
  total_size_bytes?: number;
  cache_dict_capacity?: number;
  cache_dict_free_space?: number;
}

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

const StatusIcon: React.FC<{ status?: string; size?: number }> = ({ status, size = 20 }) => {
  if (status === 'ok' || status === 'healthy') {
    return <CheckCircleIcon sx={{ fontSize: size, color: '#10b981' }} />;
  }
  if (status === 'warning' || status === 'degraded') {
    return <WarningIcon sx={{ fontSize: size, color: '#f59e0b' }} />;
  }
  if (status === 'skipped') {
    return <InfoIcon sx={{ fontSize: size, color: '#94a3b8' }} />;
  }
  return <CancelIcon sx={{ fontSize: size, color: '#ef4444' }} />;
};

const getStatusColor = (status?: string): string => {
  if (status === 'ok' || status === 'healthy') return '#10b981';
  if (status === 'warning' || status === 'degraded') return '#f59e0b';
  if (status === 'skipped') return '#94a3b8';
  return '#ef4444';
};

// ---------------------------------------------------------------------------
// Overall status banner
// ---------------------------------------------------------------------------

interface OverallBannerProps {
  status?: string;
  timestamp?: string;
  httpStatus?: number;
  authenticated?: boolean;
  apiUrl?: string;
}

const OverallBanner: React.FC<OverallBannerProps> = ({ status, timestamp, httpStatus, authenticated, apiUrl }) => {
  const color = getStatusColor(status);
  const labels: Record<string, string> = {
    healthy: 'All Systems Operational',
    degraded: 'Some Services Degraded',
    unhealthy: 'Critical Issues Detected',
    unreachable: 'API Unreachable',
  };
  const subtitle = httpStatus
    ? `HTTP ${httpStatus} ${authenticated ? '(Authenticated)' : '(Unauthenticated)'} -- ${apiUrl || ''}`
    : apiUrl
      ? `${apiUrl} -- No response`
      : undefined;

  return (
    <Box
      sx={{
        p: 3,
        borderRadius: 3,
        background: `linear-gradient(135deg, ${alpha(color, 0.15)} 0%, ${alpha(color, 0.05)} 100%)`,
        border: `2px solid ${alpha(color, 0.3)}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 2,
        mb: 3,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <StatusIcon status={status} size={36} />
        <Box>
          <Typography variant="h5" fontWeight={700} sx={{ color }}>
            {(status && labels[status]) || status}
          </Typography>
          {subtitle && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontFamily: 'monospace', fontSize: '0.7rem' }}>
              {subtitle}
            </Typography>
          )}
          {timestamp && (
            <Typography variant="caption" color="text.secondary">
              Last checked: {new Date(timestamp).toLocaleString()}
            </Typography>
          )}
        </Box>
      </Box>
      <Chip
        label={status?.toUpperCase()}
        sx={{
          fontWeight: 700,
          fontSize: '0.8rem',
          backgroundColor: alpha(color, 0.15),
          color,
          border: `1px solid ${alpha(color, 0.3)}`,
        }}
      />
    </Box>
  );
};

// ---------------------------------------------------------------------------
// Section card wrapper
// ---------------------------------------------------------------------------

interface SectionCardProps {
  title: string;
  icon: React.ElementType;
  accentColor?: string;
  children: React.ReactNode;
}

const SectionCard: React.FC<SectionCardProps> = ({ title, icon: Icon, accentColor, children }) => {
  const theme = useTheme();
  const accent = accentColor || theme.palette.primary.main;

  return (
    <Card
      sx={{
        borderRadius: 3,
        border: `1px solid ${alpha(theme.palette.divider, 0.3)}`,
        borderLeft: `4px solid ${accent}`,
        height: '100%',
      }}
    >
      <CardContent sx={{ p: 2.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: 2,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: `linear-gradient(135deg, ${alpha(accent, 0.2)}, ${alpha(accent, 0.08)})`,
            }}
          >
            <Icon sx={{ fontSize: 20, color: accent }} />
          </Box>
          <Typography variant="subtitle1" fontWeight={700}>
            {title}
          </Typography>
        </Box>
        {children}
      </CardContent>
    </Card>
  );
};

// ---------------------------------------------------------------------------
// Key-value row
// ---------------------------------------------------------------------------

interface InfoRowProps {
  label: string;
  value?: string | number | null;
  status?: string;
  mono?: boolean;
}

const InfoRow: React.FC<InfoRowProps> = ({ label, value, status, mono = false }) => {
  const theme = useTheme();
  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        py: 0.75,
        px: 1,
        borderRadius: 1,
        '&:hover': { backgroundColor: alpha(theme.palette.primary.main, 0.03) },
      }}
    >
      <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.8rem' }}>
        {label}
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        {status && <StatusIcon status={status} size={16} />}
        <Typography
          variant="body2"
          sx={{
            fontWeight: 600,
            fontSize: '0.8rem',
            fontFamily: mono ? 'monospace' : 'inherit',
            color: status ? getStatusColor(status) : 'text.primary',
          }}
        >
          {value ?? 'N/A'}
        </Typography>
      </Box>
    </Box>
  );
};

// ---------------------------------------------------------------------------
// Health page
// ---------------------------------------------------------------------------

export default function HealthPage() {
  const api = useApi();
  const theme = useTheme();

  const [health, setHealth] = useState<HealthData | null>(null);
  const [instanceInfo, setInstanceInfo] = useState<InstanceInfoData | null>(null);
  const [cacheStats, setCacheStats] = useState<CacheStatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [apiLatency, setApiLatency] = useState<number | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const start = Date.now();

    const [healthRes, instanceRes, cacheRes] = await Promise.allSettled([
      api.getDetailedHealth('system'),
      api.getInstanceInfo('system'),
      api.getCacheStats('system'),
    ]);

    setApiLatency(Date.now() - start);

    if (healthRes.status === 'fulfilled') {
      setHealth((healthRes.value as { data: HealthData }).data || {});
    } else {
      setHealth({
        status: 'unreachable',
        error: healthRes.reason?.message || 'Failed to reach API',
        _api_url: config.apiUrl,
        _http_status: undefined,
        _latency: undefined,
        _authenticated: false,
      });
    }

    if (instanceRes.status === 'fulfilled') {
      setInstanceInfo((instanceRes.value as { data: InstanceInfoData }).data || {});
    }
    if (cacheRes.status === 'fulfilled') {
      setCacheStats((cacheRes.value as { data: CacheStatsData }).data || {});
    }

    setLoading(false);
  }, [api]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const services = (health?.services || {}) as Record<string, ServiceStatus>;
  const dirs = (health?.data_directories || {}) as Record<string, DirInfo>;
  const settings = (health?.settings || {}) as Record<string, any>;
  const frontendEnv = (health?.frontend_env || {}) as Record<string, any>;
  const environment = (health?.environment || {}) as Record<string, any>;
  const system = (health?.system || {}) as Record<string, any>;

  return (
    <Box sx={{ maxWidth: 1400, mx: 'auto', p: { xs: 2, md: 3 } }}>
      <PageHeader
        title="System Health"
        subtitle="Microservice status, configuration, and diagnostics"
        icon={<MonitorHeartRoundedIcon />}
        actions={
          <Tooltip title="Refresh all health checks">
            <IconButton
              onClick={fetchAll}
              disabled={loading}
              sx={{
                backgroundColor: alpha(theme.palette.primary.main, 0.1),
                '&:hover': { backgroundColor: alpha(theme.palette.primary.main, 0.2) },
              }}
            >
              <RefreshIcon />
            </IconButton>
          </Tooltip>
        }
      />

      {loading && <LinearProgress sx={{ mb: 2, borderRadius: 1 }} />}

      {/* Overall Status Banner */}
      {health && (
        <OverallBanner
          status={health.status}
          timestamp={health.timestamp}
          httpStatus={health._http_status}
          authenticated={health._authenticated}
          apiUrl={health._api_url}
        />
      )}

      {/* Row 1: Services + API Responsiveness */}
      <Grid container spacing={2.5} sx={{ mb: 2.5 }}>
        <Grid item xs={12} md={6}>
          <SectionCard title="Services" icon={CloudIcon} accentColor="#6366f1">
            <InfoRow
              label="OpenResty"
              value={services.openresty?.version || 'unknown'}
              status={services.openresty?.status}
            />
            <InfoRow
              label="Nginx Workers"
              value={services.nginx_workers?.worker_count !== undefined ? `${services.nginx_workers.worker_count} workers` : 'unknown'}
              status={services.nginx_workers?.status}
            />
            <InfoRow
              label="Redis"
              value={services.redis?.message || 'unknown'}
              status={services.redis?.status}
            />
            {services.redis?.host && services.redis?.status !== 'skipped' && (
              <InfoRow
                label="Redis Endpoint"
                value={`${services.redis.host}:${services.redis.port}`}
                mono
              />
            )}
          </SectionCard>
        </Grid>

        <Grid item xs={12} md={6}>
          <SectionCard title="API Health" icon={DnsIcon} accentColor="#10b981">
            <InfoRow label="API URL" value={health?._api_url || 'N/A'} mono />
            <InfoRow
              label="HTTP Status"
              value={health?._http_status ? `${health._http_status}` : 'N/A'}
              status={health?._http_status === 200 ? 'ok' : health?._http_status ? 'error' : undefined}
            />
            <InfoRow
              label="Authenticated"
              value={health?._authenticated ? 'Yes' : 'No'}
              status={health?._authenticated ? 'ok' : 'error'}
            />
            <InfoRow
              label="API Status"
              value={health?.status === 'unreachable' ? 'Unreachable' : 'Responsive'}
              status={health?.status === 'unreachable' ? 'error' : 'ok'}
            />
            <InfoRow
              label="Response Time"
              value={health?._latency != null ? `${health._latency}ms` : apiLatency !== null ? `${apiLatency}ms` : 'N/A'}
              status={(() => {
                const lat = health?._latency ?? apiLatency;
                if (lat == null) return undefined;
                if (lat < 1000) return 'ok';
                if (lat < 3000) return 'warning';
                return 'error';
              })()}
            />
            <InfoRow label="Storage Type" value={String(system.storage_type || settings.storage_type || 'unknown')} mono />
            <InfoRow label="Environment Profile" value={String(system.env_profile || settings.env_profile || 'unknown')} mono />
          </SectionCard>
        </Grid>
      </Grid>

      {/* Row 2: System Info + Build/Version */}
      <Grid container spacing={2.5} sx={{ mb: 2.5 }}>
        <Grid item xs={12} md={6}>
          <SectionCard title="System Info" icon={MemoryIcon} accentColor="#06b6d4">
            <InfoRow label="Hostname" value={String(system.hostname || instanceInfo?.hostname || 'unknown')} mono />
            {instanceInfo?.fqdn && <InfoRow label="FQDN" value={instanceInfo.fqdn} mono />}
            <InfoRow label="OS" value={instanceInfo?.os || 'unknown'} />
            {instanceInfo?.kernel && <InfoRow label="Kernel" value={instanceInfo.kernel} mono />}
            <InfoRow label="Uptime" value={instanceInfo?.uptime || String(system.uptime || 'unknown')} />
            {instanceInfo?.load_average && <InfoRow label="Load Average" value={instanceInfo.load_average} />}
            {instanceInfo?.cpu?.model && (
              <InfoRow label="CPU" value={`${instanceInfo.cpu.model} (${instanceInfo.cpu.cores} cores)`} />
            )}
            {instanceInfo?.cpu?.usage_percent && (
              <InfoRow
                label="CPU Usage"
                value={`${instanceInfo.cpu.usage_percent}%`}
                status={parseFloat(instanceInfo.cpu.usage_percent) > 90 ? 'error' : parseFloat(instanceInfo.cpu.usage_percent) > 70 ? 'warning' : 'ok'}
              />
            )}
            {instanceInfo?.memory && (
              <InfoRow label="Memory" value={`${instanceInfo.memory.used} / ${instanceInfo.memory.total}`} />
            )}
            {instanceInfo?.disk && (
              <InfoRow
                label="Disk"
                value={`${instanceInfo.disk.used} / ${instanceInfo.disk.total} (${instanceInfo.disk.percent})`}
                status={parseInt(instanceInfo.disk.percent || '0') > 90 ? 'error' : parseInt(instanceInfo.disk.percent || '0') > 75 ? 'warning' : 'ok'}
              />
            )}
          </SectionCard>
        </Grid>

        <Grid item xs={12} md={6}>
          <SectionCard title="Build & Version" icon={InfoIcon} accentColor="#8b5cf6">
            <InfoRow label="App Name" value={String(system.app || 'wslproxy')} />
            <InfoRow label="Backend Version" value={String(system.version || 'unknown')} mono />
            <InfoRow label="OpenResty Version" value={String(system.openresty_version || 'unknown')} mono />
            <InfoRow label="Frontend Version" value={config.appVersion} mono />
            <InfoRow label="Build Number" value={config.buildNumber} mono />
            <InfoRow label="Deployment Time" value={config.deploymentTime || String(system.deployment_time || 'unknown')} />
            <InfoRow label="Platform" value={config.targetPlatform} mono />
            {system.swagger_url ? <InfoRow label="API Docs" value={String(system.swagger_url)} mono /> : null}
          </SectionCard>
        </Grid>
      </Grid>

      {/* Row 3: Settings Validation + Frontend Env */}
      <Grid container spacing={2.5} sx={{ mb: 2.5 }}>
        <Grid item xs={12} md={6}>
          <SectionCard title="Settings Validation" icon={SettingsIcon} accentColor="#f59e0b">
            <InfoRow
              label="Settings File"
              value={settings.file_exists ? 'Found' : 'Missing'}
              status={settings.file_exists ? 'ok' : 'error'}
            />
            <InfoRow
              label="Valid JSON"
              value={settings.valid_json ? 'Yes' : 'No'}
              status={settings.valid_json ? 'ok' : 'error'}
            />
            <InfoRow label="Overall" value={String(settings.status || 'unknown')} status={String(settings.status || '')} />
            {settings.error ? (
              <Box sx={{ mt: 1, p: 1.5, borderRadius: 1, backgroundColor: alpha('#ef4444', 0.08) }}>
                <Typography variant="caption" sx={{ color: '#ef4444', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                  {String(settings.error)}
                </Typography>
              </Box>
            ) : null}
            {Array.isArray(settings.missing_keys) && (settings.missing_keys as string[]).length > 0 ? (
              <Box sx={{ mt: 1 }}>
                <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
                  Missing keys:
                </Typography>
                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                  {(settings.missing_keys as string[]).map((key: string) => (
                    <Chip
                      key={key}
                      label={key}
                      size="small"
                      sx={{
                        fontSize: '0.7rem',
                        height: 22,
                        fontFamily: 'monospace',
                        backgroundColor: alpha('#f59e0b', 0.12),
                        color: '#f59e0b',
                      }}
                    />
                  ))}
                </Box>
              </Box>
            ) : null}
          </SectionCard>
        </Grid>

        <Grid item xs={12} md={6}>
          <SectionCard title="Frontend Environment" icon={CodeIcon} accentColor="#ec4899">
            <InfoRow
              label="Env File"
              value={frontendEnv.file_exists ? 'Found' : (frontendEnv.status === 'ok' ? 'Build-time' : 'Missing')}
              status={frontendEnv.status === 'ok' ? 'ok' : frontendEnv.file_exists ? 'ok' : 'error'}
            />
            <InfoRow label="Overall" value={String(frontendEnv.status || 'unknown')} status={String(frontendEnv.status || '')} />
            {(frontendEnv as Record<string, unknown>).note ? (
              <Box sx={{ mt: 0.5, mb: 1, px: 1 }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic', fontSize: '0.7rem' }}>
                  {String((frontendEnv as Record<string, unknown>).note)}
                </Typography>
              </Box>
            ) : null}
            {frontendEnv.variables ? Object.entries(frontendEnv.variables as Record<string, string>).map(([key, val]) => (
              <InfoRow
                key={key}
                label={key}
                value={val === 'NOT SET' ? 'Not Set' : val}
                status={val === 'NOT SET' ? 'warning' : 'ok'}
                mono
              />
            )) : null}
            {Array.isArray(frontendEnv.missing) && (frontendEnv.missing as string[]).length > 0 && (
              <Box sx={{ mt: 1 }}>
                <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
                  Missing variables:
                </Typography>
                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                  {(frontendEnv.missing as string[]).map((v: string) => (
                    <Chip
                      key={v}
                      label={v}
                      size="small"
                      sx={{
                        fontSize: '0.7rem',
                        height: 22,
                        fontFamily: 'monospace',
                        backgroundColor: alpha('#ef4444', 0.12),
                        color: '#ef4444',
                      }}
                    />
                  ))}
                </Box>
              </Box>
            )}
          </SectionCard>
        </Grid>
      </Grid>

      {/* Row 4: Backend Environment + Data Directories */}
      <Grid container spacing={2.5} sx={{ mb: 2.5 }}>
        <Grid item xs={12} md={6}>
          <SectionCard title="Backend Environment" icon={LockIcon} accentColor="#14b8a6">
            {(environment as Record<string, any>).backend &&
              Object.entries((environment as Record<string, Record<string, string>>).backend).map(([key, val]) => (
                <InfoRow
                  key={key}
                  label={key}
                  value={val}
                  status={val === 'Not Found' ? 'error' : 'ok'}
                  mono={key.includes('URL')}
                />
              ))}
          </SectionCard>
        </Grid>

        <Grid item xs={12} md={6}>
          <SectionCard title="Data Directories" icon={FolderIcon} accentColor="#f97316">
            {Object.keys(dirs).length > 0 ? (
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.7rem', py: 0.75 }}>Directory</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 700, fontSize: '0.7rem', py: 0.75 }}>Exists</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 700, fontSize: '0.7rem', py: 0.75 }}>Readable</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 700, fontSize: '0.7rem', py: 0.75 }}>Writable</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {Object.entries(dirs).map(([dir, info]) => (
                    <TableRow key={dir}>
                      <TableCell sx={{ fontSize: '0.75rem', py: 0.5, fontFamily: 'monospace' }}>{dir}</TableCell>
                      <TableCell align="center" sx={{ py: 0.5 }}>
                        <StatusIcon status={info.exists ? 'ok' : 'error'} size={16} />
                      </TableCell>
                      <TableCell align="center" sx={{ py: 0.5 }}>
                        <StatusIcon status={info.readable ? 'ok' : 'error'} size={16} />
                      </TableCell>
                      <TableCell align="center" sx={{ py: 0.5 }}>
                        <StatusIcon status={info.writable ? 'ok' : 'error'} size={16} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <Typography variant="body2" color="text.secondary">
                No directory data available
              </Typography>
            )}
          </SectionCard>
        </Grid>
      </Grid>

      {/* Row 5: Cache Stats + Network */}
      <Grid container spacing={2.5}>
        <Grid item xs={12} md={6}>
          <SectionCard title="Cache" icon={StorageIcon} accentColor="#0ea5e9">
            <InfoRow
              label="Cache Status"
              value={cacheStats?.available ? 'Available' : 'Unavailable'}
              status={cacheStats?.available ? 'ok' : 'warning'}
            />
            <InfoRow label="Total Entries" value={cacheStats?.total_entries || 0} />
            <InfoRow
              label="Total Size"
              value={cacheStats?.total_size_bytes ? `${(cacheStats.total_size_bytes / 1024 / 1024).toFixed(2)} MB` : '0 MB'}
            />
            {cacheStats?.cache_dict_capacity != null && (
              <InfoRow label="Dict Capacity" value={cacheStats.cache_dict_capacity} />
            )}
            {cacheStats?.cache_dict_free_space != null && (
              <InfoRow label="Dict Free Space" value={cacheStats.cache_dict_free_space} />
            )}
          </SectionCard>
        </Grid>

        <Grid item xs={12} md={6}>
          <SectionCard title="Network" icon={DnsIcon} accentColor="#6366f1">
            {instanceInfo?.ip_addresses && instanceInfo.ip_addresses.length > 0 ? (
              <>
                <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block', fontWeight: 600 }}>
                  IP Addresses
                </Typography>
                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 1.5 }}>
                  {instanceInfo.ip_addresses.map((ip, i) => (
                    <Chip
                      key={i}
                      label={ip}
                      size="small"
                      sx={{ fontSize: '0.7rem', height: 24, fontFamily: 'monospace' }}
                    />
                  ))}
                </Box>
              </>
            ) : (
              <InfoRow label="IP Addresses" value="N/A" />
            )}
            {(environment as Record<string, Record<string, string>>).backend?.PRIMARY_DNS_RESOLVER && (
              <InfoRow label="Primary DNS" value={(environment as Record<string, Record<string, string>>).backend.PRIMARY_DNS_RESOLVER} mono />
            )}
            {(environment as Record<string, Record<string, string>>).backend?.SECONDARY_DNS_RESOLVER && (
              <InfoRow label="Secondary DNS" value={(environment as Record<string, Record<string, string>>).backend.SECONDARY_DNS_RESOLVER} mono />
            )}
            {(environment as Record<string, Record<string, string>>).backend?.DNS_RESOLVER_PORT && (
              <InfoRow label="DNS Port" value={(environment as Record<string, Record<string, string>>).backend.DNS_RESOLVER_PORT} mono />
            )}
          </SectionCard>
        </Grid>
      </Grid>
    </Box>
  );
}
