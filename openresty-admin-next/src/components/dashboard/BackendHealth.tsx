'use client';

import React, { useMemo, useState, useEffect, useCallback } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  useTheme,
  alpha,
  IconButton,
  Tooltip,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Button,
} from '@mui/material';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ChartTooltip,
} from 'recharts';
import Grid from '@mui/material/Unstable_Grid2';
import RefreshIcon from '@mui/icons-material/RefreshRounded';
import StorageIcon from '@mui/icons-material/StorageRounded';
import CheckCircleIcon from '@mui/icons-material/CheckCircleRounded';
import CancelIcon from '@mui/icons-material/CancelRounded';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutlineRounded';
import AccountTreeIcon from '@mui/icons-material/AccountTreeRounded';
import DnsRoundedIcon from '@mui/icons-material/DnsRounded';
import { useThemeMode } from '@/providers/ThemeProvider';
import { useApi } from '@/hooks/useApi';

const BACKEND_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];

const ROUTING_MODES: Record<string, { label: string; color: string }> = {
  weighted: { label: 'Weighted', color: '#6366f1' },
  least_conn: { label: 'Least Busy', color: '#10b981' },
  round_robin: { label: 'Round Robin', color: '#f59e0b' },
  ip_hash: { label: 'IP Hash', color: '#8b5cf6' },
  header: { label: 'Header', color: '#06b6d4' },
  cookie: { label: 'Cookie', color: '#ec4899' },
};

// ─── Helpers ────────────────────────────────────────────────────────────────
const formatNumber = (num: number): string => {
  if (!num) return '0';
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
};

const formatBytes = (bytes: number, decimals = 2): string => {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

const getLatencyColor = (ms: number): string => {
  if (ms < 100) return '#10b981';
  if (ms < 500) return '#f59e0b';
  return '#ef4444';
};

// ─── Compact StatCard ─────────────────────────────────────────────────────
interface MiniStatCardProps {
  title: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
  subtitle?: string;
}

const MiniStatCard: React.FC<MiniStatCardProps> = ({ title, value, icon: Icon, color, subtitle }) => {
  const theme = useTheme();
  return (
    <Card
      sx={{
        background: `linear-gradient(135deg, ${alpha(color, 0.08)} 0%, ${alpha(color, 0.02)} 100%)`,
        border: `1px solid ${alpha(color, 0.15)}`,
        borderRadius: 3,
        transition: 'all 0.3s ease',
        '&:hover': { transform: 'translateY(-4px)', boxShadow: `0 8px 24px ${alpha(color, 0.15)}` },
      }}
    >
      <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box>
            <Typography variant="overline" sx={{ color: theme.palette.text.secondary, fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em' }}>
              {title}
            </Typography>
            <Typography variant="h4" sx={{ fontWeight: 800, color: theme.palette.text.primary, lineHeight: 1.2 }}>
              {value}
            </Typography>
            {subtitle && (
              <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
                {subtitle}
              </Typography>
            )}
          </Box>
          <Box sx={{ width: 48, height: 48, borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `linear-gradient(135deg, ${alpha(color, 0.2)}, ${alpha(color, 0.1)})` }}>
            <Icon sx={{ fontSize: 24, color }} />
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
};

// ─── Chart Card wrapper ─────────────────────────────────────────────────────
interface ChartCardProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onRefresh?: () => void;
  accentColor?: string;
}

const ChartCard: React.FC<ChartCardProps> = ({ title, subtitle, children, onRefresh, accentColor }) => {
  const theme = useTheme();
  return (
    <Card sx={{ borderRadius: 3, border: `1px solid ${theme.palette.divider}`, borderLeft: `3px solid ${accentColor || theme.palette.primary.main}`, overflow: 'visible' }}>
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1rem' }}>{title}</Typography>
            {subtitle && <Typography variant="caption" color="text.secondary">{subtitle}</Typography>}
          </Box>
          {onRefresh && (
            <Tooltip title="Refresh">
              <IconButton size="small" onClick={onRefresh}><RefreshIcon fontSize="small" /></IconButton>
            </Tooltip>
          )}
        </Box>
        {children}
      </CardContent>
    </Card>
  );
};

// ─── Per-Rule Health Card ─────────────────────────────────────────────────
interface BackendStat {
  requests?: number;
  errors?: number;
  avg_latency_ms?: number;
  total_bytes?: number;
  error_rate?: number;
}

interface Backend {
  label?: string;
  address: string;
  weight?: number;
  healthy?: boolean;
  stats?: BackendStat;
}

interface Rule {
  rule_id: string;
  rule_name?: string;
  server_name?: string;
  path?: string;
  routing?: { mode?: string };
  backends?: Backend[];
  backend_stats?: Record<string, BackendStat>;
}

interface RuleHealthCardProps {
  rule: Rule;
}

const RuleHealthCard: React.FC<RuleHealthCardProps> = ({ rule }) => {
  const theme = useTheme();
  const { mode } = useThemeMode();
  const isDark = mode === 'dark';

  const routingMode = rule.routing?.mode || 'weighted';
  const modeConfig = ROUTING_MODES[routingMode] || ROUTING_MODES.weighted;

  const trafficChartData = (rule.backends || []).map((b, i) => ({
    name: b.label || b.address,
    requests: b.stats?.requests || 0,
    errors: b.stats?.errors || 0,
    fill: BACKEND_COLORS[i % BACKEND_COLORS.length],
  }));

  const latencyChartData = (rule.backends || []).map((b) => ({
    name: b.label || b.address,
    latency: b.stats?.avg_latency_ms || 0,
  }));

  return (
    <Card
      sx={{
        mb: 2,
        borderRadius: 2,
        border: `1px solid ${isDark ? alpha(theme.palette.divider, 0.3) : theme.palette.divider}`,
        backgroundColor: isDark ? alpha(theme.palette.background.paper, 0.5) : theme.palette.background.paper,
      }}
    >
      <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1, mb: 2 }}>
          <Typography variant="subtitle2" fontWeight={700}>
            {rule.rule_name || rule.rule_id}
          </Typography>
          {rule.server_name && (
            <Chip label={rule.server_name} size="small" variant="outlined" sx={{ fontSize: '0.7rem', height: 22 }} />
          )}
          {rule.path && rule.path !== '/' && (
            <Chip label={rule.path} size="small" sx={{ fontSize: '0.7rem', height: 22, fontFamily: 'monospace', backgroundColor: alpha(theme.palette.info.main, 0.1) }} />
          )}
          <Chip
            label={modeConfig.label}
            size="small"
            sx={{
              fontSize: '0.7rem',
              height: 22,
              fontWeight: 600,
              backgroundColor: alpha(modeConfig.color, 0.12),
              color: modeConfig.color,
              border: `1px solid ${alpha(modeConfig.color, 0.3)}`,
            }}
          />
        </Box>

        {/* Backend Table */}
        <Table size="small" sx={{ mb: 2 }}>
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700, fontSize: '0.7rem', py: 1 }}>Backend</TableCell>
              <TableCell sx={{ fontWeight: 700, fontSize: '0.7rem', py: 1 }}>Address</TableCell>
              <TableCell align="center" sx={{ fontWeight: 700, fontSize: '0.7rem', py: 1 }}>Weight</TableCell>
              <TableCell align="center" sx={{ fontWeight: 700, fontSize: '0.7rem', py: 1 }}>Health</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.7rem', py: 1 }}>Requests</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.7rem', py: 1 }}>Errors</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.7rem', py: 1 }}>Error Rate</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.7rem', py: 1 }}>Latency</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {(rule.backends || []).map((b, i) => {
              const healthColor = b.healthy ? '#10b981' : '#ef4444';
              const latColor = getLatencyColor(b.stats?.avg_latency_ms || 0);
              return (
                <TableRow key={b.label || b.address}>
                  <TableCell sx={{ fontSize: '0.75rem', py: 0.75 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Box sx={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: BACKEND_COLORS[i % BACKEND_COLORS.length], flexShrink: 0 }} />
                      {b.label || `backend-${i}`}
                    </Box>
                  </TableCell>
                  <TableCell sx={{ fontSize: '0.75rem', py: 0.75, fontFamily: 'monospace' }}>{b.address}</TableCell>
                  <TableCell align="center" sx={{ fontSize: '0.75rem', py: 0.75 }}>{b.weight || 0}%</TableCell>
                  <TableCell align="center" sx={{ py: 0.75 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>
                      {b.healthy ? (
                        <CheckCircleIcon sx={{ fontSize: 16, color: healthColor }} />
                      ) : (
                        <CancelIcon sx={{ fontSize: 16, color: healthColor }} />
                      )}
                      <Typography variant="caption" sx={{ color: healthColor, fontWeight: 600, fontSize: '0.7rem' }}>
                        {b.healthy ? 'Healthy' : 'Down'}
                      </Typography>
                    </Box>
                  </TableCell>
                  <TableCell align="right" sx={{ fontSize: '0.75rem', py: 0.75 }}>{formatNumber(b.stats?.requests || 0)}</TableCell>
                  <TableCell align="right" sx={{ fontSize: '0.75rem', py: 0.75, color: (b.stats?.errors || 0) > 0 ? '#ef4444' : 'inherit' }}>
                    {formatNumber(b.stats?.errors || 0)}
                  </TableCell>
                  <TableCell align="right" sx={{ fontSize: '0.75rem', py: 0.75 }}>
                    {(b.stats?.error_rate || 0).toFixed(1)}%
                  </TableCell>
                  <TableCell align="right" sx={{ fontSize: '0.75rem', py: 0.75, color: latColor, fontWeight: 600 }}>
                    {(b.stats?.avg_latency_ms || 0).toFixed(0)}ms
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>

        {/* Charts */}
        {trafficChartData.length > 1 && (
          <Grid container spacing={2}>
            <Grid xs={12} md={6}>
              <Typography variant="caption" fontWeight={600} color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                Requests & Errors by Backend
              </Typography>
              <Box sx={{ width: '100%', height: 200 }}>
                <ResponsiveContainer>
                  <BarChart data={trafficChartData} margin={{ top: 5, right: 5, left: -15, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke={theme.palette.text.secondary} />
                    <YAxis tick={{ fontSize: 11 }} stroke={theme.palette.text.secondary} />
                    <ChartTooltip
                      contentStyle={{
                        backgroundColor: theme.palette.background.paper,
                        border: `1px solid ${theme.palette.divider}`,
                        borderRadius: 8,
                        fontSize: '0.8rem',
                      }}
                    />
                    <Bar dataKey="requests" fill="#6366f1" radius={[4, 4, 0, 0]} name="Requests" />
                    <Bar dataKey="errors" fill="#ef4444" radius={[4, 4, 0, 0]} name="Errors" />
                  </BarChart>
                </ResponsiveContainer>
              </Box>
            </Grid>
            <Grid xs={12} md={6}>
              <Typography variant="caption" fontWeight={600} color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                Average Latency by Backend
              </Typography>
              <Box sx={{ width: '100%', height: 200 }}>
                <ResponsiveContainer>
                  <BarChart data={latencyChartData} margin={{ top: 5, right: 5, left: -15, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke={theme.palette.text.secondary} />
                    <YAxis tick={{ fontSize: 11 }} stroke={theme.palette.text.secondary} unit="ms" />
                    <ChartTooltip
                      contentStyle={{
                        backgroundColor: theme.palette.background.paper,
                        border: `1px solid ${theme.palette.divider}`,
                        borderRadius: 8,
                        fontSize: '0.8rem',
                      }}
                      formatter={(value: number) => [`${value.toFixed(0)}ms`, 'Latency']}
                    />
                    <Bar dataKey="latency" radius={[4, 4, 0, 0]} name="Latency">
                      {latencyChartData.map((entry, index) => (
                        <Cell key={index} fill={getLatencyColor(entry.latency)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </Box>
            </Grid>
          </Grid>
        )}
      </CardContent>
    </Card>
  );
};

// ─── Main BackendHealth Component ─────────────────────────────────────────
const BackendHealth: React.FC = () => {
  const theme = useTheme();
  const { mode } = useThemeMode();
  const isDark = mode === 'dark';
  const api = useApi();

  const [healthData, setHealthData] = useState<Rule[]>([]);
  const [topologyData, setTopologyData] = useState<any>(null);

  const fetchData = useCallback(() => {
    Promise.all([
      api.getTrafficHealth('analytics'),
      api.getTrafficBackendStats('analytics'),
    ])
      .then(([healthRes, topoRes]) => {
        const hData = (healthRes as any)?.data;
        const tData = (topoRes as any)?.data;
        setHealthData(hData?.rules || []);
        setTopologyData(tData || null);
      })
      .catch((error) => {
        console.error('Failed to fetch backend health:', error);
      });
  }, [api]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Merge health + topology data by rule_id
  const mergedRules = useMemo(() => {
    const healthMap: Record<string, any> = {};
    (healthData || []).forEach((rule) => {
      healthMap[rule.rule_id] = rule;
    });

    return (topologyData?.rules_with_backends || [])
      .filter((rule: Rule) => rule.backends && rule.backends.length > 0)
      .map((rule: Rule) => {
        const healthRule = healthMap[rule.rule_id] || {};
        const healthBackendMap: Record<string, any> = {};
        (healthRule.backends || []).forEach((b: Backend) => {
          healthBackendMap[b.label || b.address] = b;
        });

        return {
          ...rule,
          backends: (rule.backends || []).map((b) => {
            const hb = healthBackendMap[b.label || b.address] || {};
            const stats = rule.backend_stats?.[b.label || ''] || {};
            return {
              ...b,
              healthy: hb.healthy !== undefined ? hb.healthy : true,
              stats: {
                requests: stats.requests || 0,
                errors: stats.errors || 0,
                avg_latency_ms: stats.avg_latency_ms || 0,
                total_bytes: stats.total_bytes || 0,
                error_rate: stats.error_rate || 0,
              },
            };
          }),
        };
      });
  }, [healthData, topologyData]);

  // Summary stats
  const totalRules = mergedRules.length;
  const totalBackends = mergedRules.reduce((s: number, r: Rule) => s + (r.backends?.length || 0), 0);
  const healthyBackends = mergedRules.reduce(
    (s: number, r: Rule) => s + (r.backends || []).filter((b: Backend) => b.healthy).length,
    0,
  );
  const totalRequests = mergedRules.reduce(
    (s: number, r: Rule) => s + (r.backends || []).reduce((bs: number, b: Backend) => bs + (b.stats?.requests || 0), 0),
    0,
  );
  const totalErrors = mergedRules.reduce(
    (s: number, r: Rule) => s + (r.backends || []).reduce((bs: number, b: Backend) => bs + (b.stats?.errors || 0), 0),
    0,
  );
  const errorRate = totalRequests > 0 ? ((totalErrors / totalRequests) * 100).toFixed(1) : '0.0';

  // Empty state
  if (mergedRules.length === 0) {
    return (
      <ChartCard title="Backend Health & Traffic" subtitle="Multi-backend routing overview" onRefresh={fetchData} accentColor="#10b981">
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 6, gap: 2 }}>
          <Box sx={{ width: 64, height: 64, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: alpha(theme.palette.info.main, 0.1) }}>
            <StorageIcon sx={{ fontSize: 32, color: theme.palette.info.main }} />
          </Box>
          <Typography variant="body1" color="text.secondary">No backend traffic data</Typography>
          <Typography variant="caption" color="text.disabled">Configure backends in a rule&apos;s routing settings to see health and traffic metrics here</Typography>
        </Box>
      </ChartCard>
    );
  }

  return (
    <ChartCard
      title="Backend Health & Traffic"
      subtitle={`${totalRules} rule${totalRules !== 1 ? 's' : ''} with ${totalBackends} backend${totalBackends !== 1 ? 's' : ''}`}
      onRefresh={fetchData}
      accentColor="#10b981"
    >
      {/* Summary Stats */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 2, mb: 3 }}>
        <MiniStatCard title="Rules with Backends" value={totalRules} icon={AccountTreeIcon} color="#6366f1" />
        <MiniStatCard title="Total Backends" value={totalBackends} icon={DnsRoundedIcon} color="#06b6d4" />
        <MiniStatCard
          title="Backend Health"
          value={`${healthyBackends}/${totalBackends}`}
          icon={CheckCircleIcon}
          color={healthyBackends === totalBackends ? '#10b981' : '#f59e0b'}
          subtitle={healthyBackends === totalBackends ? 'All healthy' : `${totalBackends - healthyBackends} unhealthy`}
        />
        <MiniStatCard
          title="Error Rate"
          value={`${errorRate}%`}
          icon={ErrorOutlineIcon}
          color={parseFloat(errorRate) > 5 ? '#ef4444' : parseFloat(errorRate) > 1 ? '#f59e0b' : '#10b981'}
          subtitle={`${formatNumber(totalErrors)} errors / ${formatNumber(totalRequests)} requests`}
        />
      </Box>

      {/* Per-Rule Cards */}
      {mergedRules.map((rule: Rule) => (
        <RuleHealthCard key={rule.rule_id} rule={rule} />
      ))}
    </ChartCard>
  );
};

export default BackendHealth;
