import React, { useState, useEffect, useCallback } from "react";
import { useDataProvider, useNotify, Title } from "react-admin";
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  useTheme,
  alpha,
  IconButton,
  Tooltip,
  Chip,
  Slider,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
  Divider,
} from "@mui/material";
import {
  AccountTree as TopologyIcon,
  Refresh as RefreshIcon,
  CheckCircle as HealthyIcon,
  Cancel as UnhealthyIcon,
  TrendingUp as TrendingUpIcon,
  RocketLaunch as PromoteIcon,
  Undo as RollbackIcon,
  Speed as LatencyIcon,
  Http as RequestsIcon,
  ErrorOutline as ErrorIcon,
  DnsRounded as ServerIcon,
  RuleRounded as RuleIcon,
  Storage as BackendIcon,
} from "@mui/icons-material";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
} from "recharts";
import { useThemeMode } from "../Theme";

// Color palette for backends
const BACKEND_COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#84cc16"];

// ─── Stat Card (local, compact version) ──────────────────────────────────────
const StatCard = ({ title, value, icon: Icon, color, subtitle }) => {
  const theme = useTheme();
  return (
    <Card
      sx={{
        background: `linear-gradient(135deg, ${alpha(color, 0.08)} 0%, ${alpha(color, 0.02)} 100%)`,
        border: `1px solid ${alpha(color, 0.15)}`,
        borderRadius: 3,
        transition: "all 0.3s ease",
        "&:hover": { transform: "translateY(-4px)", boxShadow: `0 8px 24px ${alpha(color, 0.15)}` },
      }}
    >
      <CardContent sx={{ p: 2.5, "&:last-child": { pb: 2.5 } }}>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Box>
            <Typography variant="overline" sx={{ color: theme.palette.text.secondary, fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.08em" }}>
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
          <Box sx={{ width: 48, height: 48, borderRadius: 2, display: "flex", alignItems: "center", justifyContent: "center", background: `linear-gradient(135deg, ${alpha(color, 0.2)}, ${alpha(color, 0.1)})` }}>
            <Icon sx={{ fontSize: 24, color }} />
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
};

// ─── Chart Card wrapper ──────────────────────────────────────────────────────
const ChartCard = ({ title, subtitle, children, onRefresh, accentColor }) => {
  const theme = useTheme();
  return (
    <Card sx={{ borderRadius: 3, border: `1px solid ${theme.palette.divider}`, borderLeft: `3px solid ${accentColor || theme.palette.primary.main}`, overflow: "visible" }}>
      <CardContent>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700, fontSize: "1rem" }}>{title}</Typography>
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

// ─── Backend Health Chip ─────────────────────────────────────────────────────
const BackendHealthChip = ({ label, address, healthy, weight }) => {
  const theme = useTheme();
  const color = healthy ? "#10b981" : "#ef4444";
  return (
    <Chip
      icon={healthy ? <HealthyIcon sx={{ fontSize: 16, color: `${color} !important` }} /> : <UnhealthyIcon sx={{ fontSize: 16, color: `${color} !important` }} />}
      label={`${label} (${weight}%) - ${address}`}
      size="small"
      sx={{
        m: 0.5,
        backgroundColor: alpha(color, 0.1),
        color: theme.palette.text.primary,
        border: `1px solid ${alpha(color, 0.3)}`,
        fontWeight: 500,
        "& .MuiChip-label": { fontSize: "0.75rem" },
      }}
    />
  );
};

// ─── Traffic Split Pie Chart ─────────────────────────────────────────────────
const TrafficSplitPieChart = ({ backends }) => {
  const theme = useTheme();
  const data = (backends || []).map((b, i) => ({
    name: b.label || b.address,
    value: b.weight || 0,
    color: BACKEND_COLORS[i % BACKEND_COLORS.length],
  }));

  if (data.length === 0) return null;

  return (
    <Box sx={{ width: "100%", height: 200 }}>
      <ResponsiveContainer>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={50}
            outerRadius={80}
            paddingAngle={3}
            dataKey="value"
            stroke="none"
          >
            {data.map((entry, index) => (
              <Cell key={index} fill={entry.color} />
            ))}
          </Pie>
          <RechartsTooltip
            contentStyle={{
              backgroundColor: theme.palette.background.paper,
              border: `1px solid ${theme.palette.divider}`,
              borderRadius: 8,
              fontSize: "0.8rem",
            }}
            formatter={(value, name) => [`${value}%`, name]}
          />
          <Legend
            content={({ payload }) => (
              <Box sx={{ display: "flex", justifyContent: "center", gap: 2, mt: 1, flexWrap: "wrap" }}>
                {payload?.map((entry, index) => (
                  <Box key={index} sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                    <Box sx={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: entry.color }} />
                    <Typography variant="caption" color="text.secondary" fontWeight={500}>
                      {entry.value} ({data[index]?.value}%)
                    </Typography>
                  </Box>
                ))}
              </Box>
            )}
          />
        </PieChart>
      </ResponsiveContainer>
    </Box>
  );
};

// ─── Backend Comparison Bar Chart ────────────────────────────────────────────
const BackendComparisonChart = ({ stats }) => {
  const theme = useTheme();
  if (!stats || stats.length === 0) return <Typography variant="body2" color="text.secondary">No stats available</Typography>;

  const data = stats.map((s, i) => ({
    name: s.label || s.address || `backend-${i}`,
    requests: s.stats?.total_requests || 0,
    errors: s.stats?.total_errors || 0,
    avgLatency: s.stats?.avg_latency_ms || 0,
  }));

  return (
    <Box sx={{ width: "100%", height: 250 }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} vertical={false} />
          <XAxis dataKey="name" stroke={theme.palette.text.secondary} fontSize={12} />
          <YAxis stroke={theme.palette.text.secondary} fontSize={12} />
          <RechartsTooltip
            contentStyle={{
              backgroundColor: theme.palette.background.paper,
              border: `1px solid ${theme.palette.divider}`,
              borderRadius: 8,
            }}
          />
          <Legend
            content={({ payload }) => (
              <Box sx={{ display: "flex", justifyContent: "center", gap: 3, mt: 1 }}>
                {payload?.map((entry, index) => (
                  <Box key={index} sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                    <Box sx={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: entry.color }} />
                    <Typography variant="caption" color="text.secondary" fontWeight={500}>{entry.value}</Typography>
                  </Box>
                ))}
              </Box>
            )}
          />
          <Bar dataKey="requests" fill="#6366f1" name="Requests" radius={[4, 4, 0, 0]} />
          <Bar dataKey="errors" fill="#ef4444" name="Errors" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </Box>
  );
};

// ─── Topology Canvas (SVG: servers → backends) ──────────────────────────────
const TopologyCanvas = ({ topology }) => {
  const theme = useTheme();

  if (!topology || !topology.servers || topology.servers.length === 0) {
    return (
      <Box sx={{ p: 4, textAlign: "center" }}>
        <Typography color="text.secondary">No servers configured</Typography>
      </Box>
    );
  }

  const servers = topology.servers || [];
  const connections = topology.connections || [];

  // Calculate layout
  const serverSpacing = 80;
  const svgHeight = Math.max(300, servers.length * serverSpacing + 60);
  const svgWidth = 800;
  const serverX = 60;
  const backendX = 640;

  // Collect unique backends from connections
  const uniqueBackends = [];
  const backendSet = new Set();
  connections.forEach((c) => {
    if (!backendSet.has(c.to)) {
      backendSet.add(c.to);
      uniqueBackends.push({ address: c.to, label: c.label });
    }
  });
  const backendSpacing = Math.max(60, svgHeight / (uniqueBackends.length + 1));

  const serverPositions = {};
  servers.forEach((s, i) => {
    serverPositions[s.server_name] = { x: serverX, y: 40 + i * serverSpacing };
  });

  const backendPositions = {};
  uniqueBackends.forEach((b, i) => {
    backendPositions[b.address] = { x: backendX, y: 40 + i * backendSpacing };
  });

  const textColor = theme.palette.text.primary;
  const secondaryColor = theme.palette.text.secondary;
  const lineColor = alpha(theme.palette.primary.main, 0.3);

  return (
    <Box sx={{ width: "100%", overflowX: "auto" }}>
      <svg width={svgWidth} height={svgHeight} viewBox={`0 0 ${svgWidth} ${svgHeight}`}>
        <defs>
          <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
            <polygon points="0 0, 8 3, 0 6" fill={theme.palette.primary.main} opacity={0.5} />
          </marker>
        </defs>

        {/* Connection lines */}
        {connections.map((conn, i) => {
          const from = serverPositions[conn.from];
          const to = backendPositions[conn.to];
          if (!from || !to) return null;
          const weight = Math.max(1, Math.min(6, (conn.weight || 1) / 20));
          return (
            <g key={`conn-${i}`}>
              <line
                x1={from.x + 160}
                y1={from.y + 16}
                x2={to.x - 10}
                y2={to.y + 16}
                stroke={BACKEND_COLORS[i % BACKEND_COLORS.length]}
                strokeWidth={weight}
                strokeOpacity={0.4}
                markerEnd="url(#arrowhead)"
              />
              <text
                x={(from.x + 160 + to.x - 10) / 2}
                y={(from.y + to.y) / 2 + 12}
                textAnchor="middle"
                fill={secondaryColor}
                fontSize={10}
              >
                {conn.weight}%
              </text>
            </g>
          );
        })}

        {/* Server nodes */}
        {servers.map((server, i) => {
          const pos = serverPositions[server.server_name];
          return (
            <g key={`server-${i}`}>
              <rect
                x={pos.x}
                y={pos.y}
                width={160}
                height={32}
                rx={8}
                fill={alpha(theme.palette.primary.main, 0.1)}
                stroke={alpha(theme.palette.primary.main, 0.3)}
                strokeWidth={1}
              />
              <text x={pos.x + 80} y={pos.y + 20} textAnchor="middle" fill={textColor} fontSize={11} fontWeight={600}>
                {server.server_name?.length > 22 ? server.server_name.substring(0, 22) + "..." : server.server_name}
              </text>
            </g>
          );
        })}

        {/* Backend nodes */}
        {uniqueBackends.map((backend, i) => {
          const pos = backendPositions[backend.address];
          const color = BACKEND_COLORS[i % BACKEND_COLORS.length];
          return (
            <g key={`backend-${i}`}>
              <rect
                x={pos.x}
                y={pos.y}
                width={140}
                height={32}
                rx={8}
                fill={alpha(color, 0.1)}
                stroke={alpha(color, 0.3)}
                strokeWidth={1}
              />
              <text x={pos.x + 70} y={pos.y + 14} textAnchor="middle" fill={textColor} fontSize={10} fontWeight={600}>
                {backend.label || "backend"}
              </text>
              <text x={pos.x + 70} y={pos.y + 26} textAnchor="middle" fill={secondaryColor} fontSize={9}>
                {backend.address?.length > 20 ? backend.address.substring(0, 20) + "..." : backend.address}
              </text>
            </g>
          );
        })}

        {/* Labels */}
        <text x={serverX + 80} y={16} textAnchor="middle" fill={secondaryColor} fontSize={11} fontWeight={700}>VIRTUAL SERVERS</text>
        <text x={backendX + 70} y={16} textAnchor="middle" fill={secondaryColor} fontSize={11} fontWeight={700}>BACKENDS</text>
      </svg>
    </Box>
  );
};

// ─── Rule Traffic Split Card ─────────────────────────────────────────────────
const RuleTrafficSplitCard = ({ rule, onUpdateWeights, onPromote, onRollback }) => {
  const theme = useTheme();
  const backends = rule.backends || [];
  const stats = rule.backend_stats || [];

  // Local weight state for the slider
  const [weights, setWeights] = useState({});
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const initial = {};
    backends.forEach((b) => { initial[b.label || b.address] = b.weight || 0; });
    setWeights(initial);
    setDirty(false);
  }, [backends]);

  const handleWeightChange = (label, newWeight) => {
    const labels = Object.keys(weights);
    if (labels.length !== 2) {
      // For >2 backends, just set directly
      setWeights((prev) => ({ ...prev, [label]: newWeight }));
    } else {
      // For 2 backends, auto-balance
      const other = labels.find((l) => l !== label);
      setWeights({ [label]: newWeight, [other]: 100 - newWeight });
    }
    setDirty(true);
  };

  const handleSave = () => {
    const backendsUpdate = Object.entries(weights).map(([label, weight]) => ({ label, weight }));
    onUpdateWeights(rule.rule_id, backendsUpdate);
    setDirty(false);
  };

  return (
    <Card sx={{ borderRadius: 3, border: `1px solid ${theme.palette.divider}`, mb: 2 }}>
      <CardContent>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700, fontSize: "1rem", display: "flex", alignItems: "center", gap: 1 }}>
              <RuleIcon sx={{ fontSize: 20, color: theme.palette.primary.main }} />
              {rule.rule_name || rule.rule_id}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {rule.server_name} &bull; {rule.path || "/"} &bull; Mode: {rule.routing?.mode || "weighted"}
            </Typography>
          </Box>
          <Box sx={{ display: "flex", gap: 1 }}>
            {backends.length >= 2 && (
              <>
                {backends.map((b) => (
                  <Tooltip key={b.label} title={`Promote ${b.label} to 100%`}>
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<PromoteIcon />}
                      onClick={() => onPromote(rule.rule_id, b.label)}
                      sx={{ textTransform: "none", fontSize: "0.75rem" }}
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
                    startIcon={<RollbackIcon />}
                    onClick={() => onRollback(rule.rule_id)}
                    sx={{ textTransform: "none", fontSize: "0.75rem" }}
                  >
                    Rollback
                  </Button>
                </Tooltip>
              </>
            )}
          </Box>
        </Box>

        <Grid container spacing={3}>
          {/* Pie chart */}
          <Grid item xs={12} md={4}>
            <TrafficSplitPieChart backends={backends} />
          </Grid>

          {/* Weight sliders */}
          <Grid item xs={12} md={4}>
            <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600 }}>Traffic Weights</Typography>
            {Object.entries(weights).map(([label, weight], i) => (
              <Box key={label} sx={{ mb: 2 }}>
                <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
                  <Typography variant="caption" fontWeight={600} sx={{ color: BACKEND_COLORS[i % BACKEND_COLORS.length] }}>
                    {label}
                  </Typography>
                  <Typography variant="caption" fontWeight={700}>{weight}%</Typography>
                </Box>
                <Slider
                  value={weight}
                  onChange={(_, v) => handleWeightChange(label, v)}
                  min={0}
                  max={100}
                  size="small"
                  sx={{
                    color: BACKEND_COLORS[i % BACKEND_COLORS.length],
                    "& .MuiSlider-thumb": { width: 14, height: 14 },
                  }}
                />
              </Box>
            ))}
            {dirty && (
              <Button variant="contained" size="small" onClick={handleSave} sx={{ mt: 1, textTransform: "none" }}>
                Apply Weights
              </Button>
            )}
          </Grid>

          {/* Backend comparison chart */}
          <Grid item xs={12} md={4}>
            <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>Request Distribution</Typography>
            <BackendComparisonChart stats={stats} />
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
            <BackendHealthChip key={i} label={b.label} address={b.address} healthy={true} weight={b.weight || 0} />
          ))}
        </Box>
      </CardContent>
    </Card>
  );
};

// ─── Main IngressOverview Page ───────────────────────────────────────────────
const IngressOverview = () => {
  const theme = useTheme();
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const { mode } = useThemeMode();

  const [loading, setLoading] = useState(true);
  const [topology, setTopology] = useState(null);
  const [health, setHealth] = useState([]);
  const [confirmDialog, setConfirmDialog] = useState({ open: false, title: "", action: null });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [topoRes, healthRes] = await Promise.all([
        dataProvider.getTrafficTopology(),
        dataProvider.getTrafficHealth(),
      ]);
      setTopology(topoRes?.data || null);
      setHealth(healthRes?.data || []);
    } catch (err) {
      console.error("IngressOverview fetch error:", err);
      notify("Failed to load ingress data", { type: "error" });
    } finally {
      setLoading(false);
    }
  }, [dataProvider, notify]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleUpdateWeights = async (ruleId, backends) => {
    try {
      await dataProvider.updateTrafficWeights({ rule_id: ruleId, backends });
      notify("Traffic weights updated", { type: "success" });
      fetchData();
    } catch (err) {
      notify("Failed to update weights: " + (err.message || err), { type: "error" });
    }
  };

  const handlePromote = (ruleId, label) => {
    setConfirmDialog({
      open: true,
      title: `Promote "${label}" to 100% traffic for rule ${ruleId}?`,
      action: async () => {
        try {
          await dataProvider.promoteBackend({ rule_id: ruleId, promote_label: label });
          notify(`Backend "${label}" promoted to 100%`, { type: "success" });
          fetchData();
        } catch (err) {
          notify("Promote failed: " + (err.message || err), { type: "error" });
        }
      },
    });
  };

  const handleRollback = (ruleId) => {
    setConfirmDialog({
      open: true,
      title: `Rollback rule ${ruleId} to single-backend routing?`,
      action: async () => {
        try {
          await dataProvider.rollbackBackend({ rule_id: ruleId });
          notify("Rolled back to single backend", { type: "success" });
          fetchData();
        } catch (err) {
          notify("Rollback failed: " + (err.message || err), { type: "error" });
        }
      },
    });
  };

  // Summary stats
  const serverCount = topology?.servers?.length || 0;
  const rulesWithBackends = topology?.rules_with_backends || [];
  const totalBackends = rulesWithBackends.reduce((sum, r) => sum + (r.backends?.length || 0), 0);
  const healthyCount = health.reduce((sum, r) => sum + (r.backends?.filter((b) => b.healthy !== false).length || 0), 0);
  const totalHealthBackends = health.reduce((sum, r) => sum + (r.backends?.length || 0), 0);

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: 400 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ pt: 2, px: 1 }}>
      <Title title="Ingress Overview" />

      {/* Page Header */}
      <Box sx={{ mb: 3, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          <Box sx={{ width: 48, height: 48, borderRadius: 2, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: alpha(theme.palette.primary.main, 0.1) }}>
            <TopologyIcon sx={{ fontSize: 24, color: theme.palette.primary.main }} />
          </Box>
          <Box>
            <Typography variant="h5" fontWeight={700}>Ingress Overview</Typography>
            <Typography variant="body2" color="text.secondary">
              Traffic routing topology, backend health, and canary management
            </Typography>
          </Box>
        </Box>
        <Tooltip title="Refresh data">
          <IconButton onClick={fetchData} color="primary">
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Summary Stats */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={6} sm={3}>
          <StatCard title="Virtual Servers" value={serverCount} icon={ServerIcon} color="#6366f1" />
        </Grid>
        <Grid item xs={6} sm={3}>
          <StatCard title="Traffic Rules" value={rulesWithBackends.length} icon={RuleIcon} color="#10b981" subtitle="With backends" />
        </Grid>
        <Grid item xs={6} sm={3}>
          <StatCard title="Backends" value={totalBackends} icon={BackendIcon} color="#f59e0b" />
        </Grid>
        <Grid item xs={6} sm={3}>
          <StatCard
            title="Health"
            value={totalHealthBackends > 0 ? `${healthyCount}/${totalHealthBackends}` : "N/A"}
            icon={HealthyIcon}
            color={healthyCount === totalHealthBackends ? "#10b981" : "#ef4444"}
            subtitle={healthyCount === totalHealthBackends ? "All healthy" : "Degraded"}
          />
        </Grid>
      </Grid>

      {/* Topology Graph */}
      <Box sx={{ mb: 3 }}>
        <ChartCard title="Traffic Topology" subtitle="Virtual servers to backend routing map" accentColor="#6366f1" onRefresh={fetchData}>
          <TopologyCanvas topology={topology} />
        </ChartCard>
      </Box>

      {/* Traffic Split Cards */}
      {rulesWithBackends.length > 0 ? (
        <Box sx={{ mb: 3 }}>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
            Traffic Splits
          </Typography>
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
          <CardContent sx={{ textAlign: "center", py: 6 }}>
            <TopologyIcon sx={{ fontSize: 48, color: theme.palette.text.disabled, mb: 2 }} />
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
        <ChartCard title="Backend Health Overview" subtitle="Health status across all rules with backends" accentColor="#10b981">
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
        </ChartCard>
      )}

      {/* Confirmation Dialog */}
      <Dialog open={confirmDialog.open} onClose={() => setConfirmDialog({ open: false, title: "", action: null })}>
        <DialogTitle>Confirm Action</DialogTitle>
        <DialogContent>
          <Typography>{confirmDialog.title}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDialog({ open: false, title: "", action: null })}>Cancel</Button>
          <Button
            variant="contained"
            onClick={() => {
              confirmDialog.action?.();
              setConfirmDialog({ open: false, title: "", action: null });
            }}
          >
            Confirm
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default IngressOverview;
