'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  CircularProgress,
  IconButton,
  Tooltip,
  Chip,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Divider,
  Slider,
  useTheme,
  alpha,
} from '@mui/material';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import RefreshIcon from '@mui/icons-material/Refresh';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch';
import UndoIcon from '@mui/icons-material/Undo';
import DnsRoundedIcon from '@mui/icons-material/DnsRounded';
import RuleRoundedIcon from '@mui/icons-material/RuleRounded';
import StorageIcon from '@mui/icons-material/Storage';
import PageHeader from '@/components/ui/PageHeader';
import { useApi } from '@/hooks/useApi';
import { useNotification } from '@/contexts/NotificationContext';
import { config } from '@/lib/config/env';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Backend {
  label?: string;
  address?: string;
  weight?: number;
  healthy?: boolean;
  stats?: { total_requests?: number; total_errors?: number; avg_latency_ms?: number };
}

interface RuleWithBackends {
  rule_id?: string;
  rule_name?: string;
  server_name?: string;
  path?: string;
  routing?: { mode?: string };
  backends?: Backend[];
  backend_stats?: Backend[];
}

interface TopologyData {
  servers?: Array<{ server_name: string }>;
  connections?: Array<{ from: string; to: string; weight?: number; label?: string }>;
  rules_with_backends?: RuleWithBackends[];
}

interface HealthRule {
  rule_id?: string;
  rule_name?: string;
  backends?: Backend[];
}

// ---------------------------------------------------------------------------
// Colors
// ---------------------------------------------------------------------------

const BACKEND_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];

// ---------------------------------------------------------------------------
// Stat Card
// ---------------------------------------------------------------------------

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
  subtitle?: string;
}

const StatCard: React.FC<StatCardProps> = ({ title, value, icon: Icon, color, subtitle }) => {
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

// ---------------------------------------------------------------------------
// Backend Health Chip
// ---------------------------------------------------------------------------

const BackendHealthChip: React.FC<{ label?: string; address?: string; healthy?: boolean; weight?: number }> = ({ label, address, healthy, weight }) => {
  const theme = useTheme();
  const color = healthy ? '#10b981' : '#ef4444';
  return (
    <Chip
      icon={healthy ? <CheckCircleIcon sx={{ fontSize: 16, color: `${color} !important` }} /> : <CancelIcon sx={{ fontSize: 16, color: `${color} !important` }} />}
      label={`${label} (${weight}%) - ${address}`}
      size="small"
      sx={{
        m: 0.5,
        backgroundColor: alpha(color, 0.1),
        color: theme.palette.text.primary,
        border: `1px solid ${alpha(color, 0.3)}`,
        fontWeight: 500,
        '& .MuiChip-label': { fontSize: '0.75rem' },
      }}
    />
  );
};

// ---------------------------------------------------------------------------
// Rule Traffic Split Card
// ---------------------------------------------------------------------------

interface RuleTrafficSplitCardProps {
  rule: RuleWithBackends;
  onUpdateWeights: (ruleId: string, backends: Array<{ label: string; weight: number }>) => void;
  onPromote: (ruleId: string, label: string) => void;
  onRollback: (ruleId: string) => void;
}

const RuleTrafficSplitCard: React.FC<RuleTrafficSplitCardProps> = ({ rule, onUpdateWeights, onPromote, onRollback }) => {
  const theme = useTheme();
  const backends = rule.backends || [];
  const stats = rule.backend_stats || [];

  const [weights, setWeights] = useState<Record<string, number>>({});
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const initial: Record<string, number> = {};
    backends.forEach((b) => { initial[b.label || b.address || ''] = b.weight || 0; });
    setWeights(initial);
    setDirty(false);
  }, [backends]);

  const handleWeightChange = (label: string, newWeight: number) => {
    const labels = Object.keys(weights);
    if (labels.length === 2) {
      const other = labels.find((l) => l !== label)!;
      setWeights({ [label]: newWeight, [other]: 100 - newWeight });
    } else {
      setWeights((prev) => ({ ...prev, [label]: newWeight }));
    }
    setDirty(true);
  };

  const handleSave = () => {
    const backendsUpdate = Object.entries(weights).map(([label, weight]) => ({ label, weight }));
    onUpdateWeights(rule.rule_id || '', backendsUpdate);
    setDirty(false);
  };

  return (
    <Card sx={{ borderRadius: 3, border: `1px solid ${theme.palette.divider}`, mb: 2 }}>
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: 1 }}>
              <RuleRoundedIcon sx={{ fontSize: 20, color: theme.palette.primary.main }} />
              {rule.rule_name || rule.rule_id}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {rule.server_name} -- {rule.path || '/'} -- Mode: {rule.routing?.mode || 'weighted'}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            {backends.length >= 2 && (
              <>
                {backends.map((b) => (
                  <Tooltip key={b.label} title={`Promote ${b.label} to 100%`}>
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<RocketLaunchIcon />}
                      onClick={() => onPromote(rule.rule_id || '', b.label || '')}
                      sx={{ textTransform: 'none', fontSize: '0.75rem' }}
                    >
                      Promote {b.label}
                    </Button>
                  </Tooltip>
                ))}
                <Tooltip title="Rollback to single backend">
                  <Button
                    size="small"
                    variant="outlined"
                    color="warning"
                    startIcon={<UndoIcon />}
                    onClick={() => onRollback(rule.rule_id || '')}
                    sx={{ textTransform: 'none', fontSize: '0.75rem' }}
                  >
                    Rollback
                  </Button>
                </Tooltip>
              </>
            )}
          </Box>
        </Box>

        <Grid container spacing={3}>
          {/* Weight sliders */}
          <Grid item xs={12} md={6}>
            <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600 }}>Traffic Weights</Typography>
            {Object.entries(weights).map(([label, weight], i) => (
              <Box key={label} sx={{ mb: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                  <Typography variant="caption" fontWeight={600} sx={{ color: BACKEND_COLORS[i % BACKEND_COLORS.length] }}>
                    {label}
                  </Typography>
                  <Typography variant="caption" fontWeight={700}>{weight}%</Typography>
                </Box>
                <Slider
                  value={weight}
                  onChange={(_, v) => handleWeightChange(label, v as number)}
                  min={0}
                  max={100}
                  size="small"
                  sx={{
                    color: BACKEND_COLORS[i % BACKEND_COLORS.length],
                    '& .MuiSlider-thumb': { width: 14, height: 14 },
                  }}
                />
              </Box>
            ))}
            {dirty && (
              <Button variant="contained" size="small" onClick={handleSave} sx={{ mt: 1, textTransform: 'none' }}>
                Apply Weights
              </Button>
            )}
          </Grid>

          {/* Backend stats summary */}
          <Grid item xs={12} md={6}>
            <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>Request Distribution</Typography>
            {stats.length > 0 ? (
              stats.map((s, i) => (
                <Box key={i} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5 }}>
                  <Typography variant="body2">{s.label || s.address}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {s.stats?.total_requests || 0} requests, {s.stats?.total_errors || 0} errors
                  </Typography>
                </Box>
              ))
            ) : (
              <Typography variant="body2" color="text.secondary">No stats available</Typography>
            )}
          </Grid>
        </Grid>

        {/* Health chips */}
        <Divider sx={{ my: 2 }} />
        <Box>
          <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>Backend Health</Typography>
          {stats.map((s, i) => (
            <BackendHealthChip
              key={i}
              label={s.label}
              address={s.address}
              healthy={s.healthy !== false}
              weight={s.weight || backends.find((b) => b.label === s.label)?.weight || 0}
            />
          ))}
          {stats.length === 0 && backends.map((b, i) => (
            <BackendHealthChip key={i} label={b.label} address={b.address} healthy weight={b.weight || 0} />
          ))}
        </Box>
      </CardContent>
    </Card>
  );
};

// ---------------------------------------------------------------------------
// Ingress Overview Page
// ---------------------------------------------------------------------------

export default function IngressOverviewPage() {
  const theme = useTheme();
  const api = useApi();
  const { notify } = useNotification();

  const [loading, setLoading] = useState(true);
  const [topology, setTopology] = useState<TopologyData | null>(null);
  const [health, setHealth] = useState<HealthRule[]>([]);
  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; title: string; action: (() => Promise<void>) | null }>({ open: false, title: '', action: null });

  // Guard: only show on Kubernetes platform
  const isKubernetes = config.targetPlatform === 'KUBERNETES';

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [topoRes, healthRes] = await Promise.all([
        api.getTrafficTopology('system'),
        api.getTrafficHealth('system'),
      ]);
      setTopology((topoRes as { data: TopologyData }).data || null);
      setHealth(((healthRes as { data: HealthRule[] }).data) || []);
    } catch (err) {
      console.error('IngressOverview fetch error:', err);
      notify('Failed to load ingress data', { type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [api, notify]);

  useEffect(() => {
    if (isKubernetes) {
      fetchData();
    } else {
      setLoading(false);
    }
  }, [fetchData, isKubernetes]);

  const handleUpdateWeights = async (ruleId: string, backends: Array<{ label: string; weight: number }>) => {
    try {
      await api.updateTrafficWeights('system', { data: { rule_id: ruleId, backends } });
      notify('Traffic weights updated', { type: 'success' });
      fetchData();
    } catch (err: unknown) {
      notify('Failed to update weights: ' + (err instanceof Error ? err.message : String(err)), { type: 'error' });
    }
  };

  const handlePromote = (ruleId: string, label: string) => {
    setConfirmDialog({
      open: true,
      title: `Promote "${label}" to 100% traffic for rule ${ruleId}?`,
      action: async () => {
        try {
          await api.promoteBackend('system', { data: { rule_id: ruleId, promote_label: label } });
          notify(`Backend "${label}" promoted to 100%`, { type: 'success' });
          fetchData();
        } catch (err: unknown) {
          notify('Promote failed: ' + (err instanceof Error ? err.message : String(err)), { type: 'error' });
        }
      },
    });
  };

  const handleRollback = (ruleId: string) => {
    setConfirmDialog({
      open: true,
      title: `Rollback rule ${ruleId} to single-backend routing?`,
      action: async () => {
        try {
          await api.rollbackBackend('system', { data: { rule_id: ruleId } });
          notify('Rolled back to single backend', { type: 'success' });
          fetchData();
        } catch (err: unknown) {
          notify('Rollback failed: ' + (err instanceof Error ? err.message : String(err)), { type: 'error' });
        }
      },
    });
  };

  if (!isKubernetes) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <AccountTreeIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
        <Typography variant="h5" color="text.secondary">
          Ingress Overview is only available on Kubernetes deployments
        </Typography>
        <Typography variant="body2" color="text.disabled" sx={{ mt: 1 }}>
          Current platform: {config.targetPlatform}
        </Typography>
      </Box>
    );
  }

  const serverCount = topology?.servers?.length || 0;
  const rulesWithBackends = topology?.rules_with_backends || [];
  const totalBackends = rulesWithBackends.reduce((sum, r) => sum + (r.backends?.length || 0), 0);
  const healthyCount = health.reduce((sum, r) => sum + (r.backends?.filter((b) => b.healthy !== false).length || 0), 0);
  const totalHealthBackends = health.reduce((sum, r) => sum + (r.backends?.length || 0), 0);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <PageHeader
        title="Ingress Overview"
        subtitle="Traffic routing topology, backend health, and canary management"
        icon={<AccountTreeIcon />}
        actions={
          <Tooltip title="Refresh data">
            <IconButton onClick={fetchData} color="primary">
              <RefreshIcon />
            </IconButton>
          </Tooltip>
        }
      />

      {/* Summary Stats */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={6} sm={3}>
          <StatCard title="Virtual Servers" value={serverCount} icon={DnsRoundedIcon} color="#6366f1" />
        </Grid>
        <Grid item xs={6} sm={3}>
          <StatCard title="Traffic Rules" value={rulesWithBackends.length} icon={RuleRoundedIcon} color="#10b981" subtitle="With backends" />
        </Grid>
        <Grid item xs={6} sm={3}>
          <StatCard title="Backends" value={totalBackends} icon={StorageIcon} color="#f59e0b" />
        </Grid>
        <Grid item xs={6} sm={3}>
          <StatCard
            title="Health"
            value={totalHealthBackends > 0 ? `${healthyCount}/${totalHealthBackends}` : 'N/A'}
            icon={CheckCircleIcon}
            color={healthyCount === totalHealthBackends ? '#10b981' : '#ef4444'}
            subtitle={healthyCount === totalHealthBackends ? 'All healthy' : 'Degraded'}
          />
        </Grid>
      </Grid>

      {/* Traffic Split Cards */}
      {rulesWithBackends.length > 0 ? (
        <Box sx={{ mb: 3 }}>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>Traffic Splits</Typography>
          {rulesWithBackends.map((rule, i) => (
            <RuleTrafficSplitCard
              key={rule.rule_id || i}
              rule={rule}
              onUpdateWeights={handleUpdateWeights}
              onPromote={handlePromote}
              onRollback={handleRollback}
            />
          ))}
        </Box>
      ) : (
        <Card sx={{ borderRadius: 3, border: `1px solid ${theme.palette.divider}`, mb: 3 }}>
          <CardContent sx={{ textAlign: 'center', py: 6 }}>
            <AccountTreeIcon sx={{ fontSize: 48, color: theme.palette.text.disabled, mb: 2 }} />
            <Typography variant="h6" color="text.secondary">
              No Traffic Splits Configured
            </Typography>
            <Typography variant="body2" color="text.disabled" sx={{ mt: 1 }}>
              Add backends to a Server Rule to enable traffic splitting, canary releases, and A/B testing.
            </Typography>
          </CardContent>
        </Card>
      )}

      {/* Backend Health Grid */}
      {health.length > 0 && (
        <Card sx={{ borderRadius: 3, border: `1px solid ${theme.palette.divider}` }}>
          <CardContent>
            <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>Backend Health Overview</Typography>
            <Grid container spacing={2}>
              {health.map((rule, i) => (
                <Grid item xs={12} sm={6} md={4} key={i}>
                  <Box sx={{ p: 2, borderRadius: 2, backgroundColor: alpha(theme.palette.background.default, 0.5), border: `1px solid ${theme.palette.divider}` }}>
                    <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
                      {rule.rule_name || rule.rule_id}
                    </Typography>
                    {rule.backends?.map((b, j) => (
                      <BackendHealthChip key={j} label={b.label} address={b.address} healthy={b.healthy !== false} weight={b.weight || 0} />
                    ))}
                  </Box>
                </Grid>
              ))}
            </Grid>
          </CardContent>
        </Card>
      )}

      {/* Confirmation Dialog */}
      <Dialog open={confirmDialog.open} onClose={() => setConfirmDialog({ open: false, title: '', action: null })}>
        <DialogTitle>Confirm Action</DialogTitle>
        <DialogContent>
          <Typography>{confirmDialog.title}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDialog({ open: false, title: '', action: null })}>Cancel</Button>
          <Button
            variant="contained"
            onClick={() => {
              confirmDialog.action?.();
              setConfirmDialog({ open: false, title: '', action: null });
            }}
          >
            Confirm
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
