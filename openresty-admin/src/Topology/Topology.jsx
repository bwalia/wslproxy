import React, { useState, useEffect, useCallback, useRef } from "react";
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
  CircularProgress,
} from "@mui/material";
import {
  AccountTree as TopologyIcon,
  Refresh as RefreshIcon,
  DnsRounded as ServerIcon,
  RuleRounded as RuleIcon,
  Storage as BackendIcon,
  OpenInNew as ExternalLinkIcon,
  Close as CloseIcon,
} from "@mui/icons-material";
import { useThemeMode } from "../Theme";

// Column colours
const COL_SERVER = "#0ea5e9";
const COL_RULE = "#8b5cf6";
const COL_BACKEND = "#10b981";

// Action badge helper
const actionBadge = (node) => {
  const resp = node?.metadata?.response || {};
  const code = resp.code;
  if (code === 301 || code === 302) return { label: `${code}`, color: "#f59e0b" };
  if (code === 403) return { label: "403", color: "#ef4444" };
  if (resp.is_consul) return { label: "CONSUL", color: "#06b6d4" };
  if (node?.metadata?.backends?.length > 0) return { label: "PROXY", color: "#10b981" };
  return null;
};

// ─── Stat Card ──────────────────────────────────────────────────────────────
const StatCard = ({ title, value, icon: Icon, color }) => {
  const theme = useTheme();
  return (
    <Card
      sx={{
        background: `linear-gradient(135deg, ${alpha(color, 0.08)} 0%, ${alpha(color, 0.02)} 100%)`,
        border: `1px solid ${alpha(color, 0.15)}`,
        borderRadius: 3,
        transition: "all 0.3s ease",
        "&:hover": { transform: "translateY(-2px)", boxShadow: `0 6px 20px ${alpha(color, 0.12)}` },
      }}
    >
      <CardContent sx={{ p: 2, "&:last-child": { pb: 2 } }}>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Box>
            <Typography variant="overline" sx={{ color: theme.palette.text.secondary, fontSize: "0.6rem", fontWeight: 700 }}>
              {title}
            </Typography>
            <Typography variant="h4" sx={{ fontWeight: 800, color: theme.palette.text.primary, lineHeight: 1.2 }}>
              {value}
            </Typography>
          </Box>
          <Box sx={{ width: 44, height: 44, borderRadius: 2, display: "flex", alignItems: "center", justifyContent: "center", background: `linear-gradient(135deg, ${alpha(color, 0.2)}, ${alpha(color, 0.1)})` }}>
            <Icon sx={{ fontSize: 22, color }} />
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
};

// ─── SVG Topology Canvas ────────────────────────────────────────────────────
const TopologyCanvas = ({ nodes, edges, selectedId, onSelectNode }) => {
  const theme = useTheme();
  const containerRef = useRef(null);

  if (!nodes || nodes.length === 0) {
    return (
      <Box sx={{ p: 4, textAlign: "center" }}>
        <Typography color="text.secondary">No topology data available</Typography>
      </Box>
    );
  }

  // Separate by kind
  const servers = nodes.filter((n) => n.kind === "server");
  const rules = nodes.filter((n) => n.kind === "rule");
  const backends = nodes.filter((n) => n.kind === "backend");

  // Layout columns
  const colW = 200;
  const nodeH = 40;
  const padX = 40;
  const padY = 50;
  const gapY = 16;
  const col1X = padX;
  const col2X = padX + colW + 80;
  const col3X = padX + (colW + 80) * 2;

  const colHeight = (arr) => arr.length * (nodeH + gapY) - gapY + padY * 2;
  const svgHeight = Math.max(colHeight(servers), colHeight(rules), colHeight(backends), 200);
  const svgWidth = col3X + colW + padX;

  // Position maps
  const pos = {};
  const placeColumn = (arr, x) => {
    const totalH = arr.length * (nodeH + gapY) - gapY;
    const startY = Math.max(padY, (svgHeight - totalH) / 2);
    arr.forEach((n, i) => {
      pos[n.id] = { x, y: startY + i * (nodeH + gapY), w: colW, h: nodeH };
    });
  };
  placeColumn(servers, col1X);
  placeColumn(rules, col2X);
  placeColumn(backends, col3X);

  const colColor = (kind) => kind === "server" ? COL_SERVER : kind === "rule" ? COL_RULE : COL_BACKEND;

  // Truncate label
  const truncate = (s, max) => (s && s.length > max ? s.substring(0, max) + "..." : s || "");

  return (
    <Box ref={containerRef} sx={{ width: "100%", overflowX: "auto", overflowY: "auto", maxHeight: "100%" }}>
      <svg width={svgWidth} height={svgHeight} viewBox={`0 0 ${svgWidth} ${svgHeight}`} style={{ minWidth: svgWidth }}>
        <defs>
          <marker id="topo-arrow" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
            <polygon points="0 0, 8 3, 0 6" fill={theme.palette.text.secondary} opacity={0.4} />
          </marker>
        </defs>

        {/* Column headers */}
        <text x={col1X + colW / 2} y={20} textAnchor="middle" fill={theme.palette.text.secondary} fontSize={11} fontWeight={700} letterSpacing="0.08em">
          VIRTUAL SERVERS
        </text>
        <text x={col2X + colW / 2} y={20} textAnchor="middle" fill={theme.palette.text.secondary} fontSize={11} fontWeight={700} letterSpacing="0.08em">
          RULES
        </text>
        <text x={col3X + colW / 2} y={20} textAnchor="middle" fill={theme.palette.text.secondary} fontSize={11} fontWeight={700} letterSpacing="0.08em">
          BACKEND ORIGINS
        </text>

        {/* Edges */}
        {edges.map((edge, i) => {
          const from = pos[edge.from];
          const to = pos[edge.to];
          if (!from || !to) return null;
          const isHighlighted = selectedId && (edge.from === selectedId || edge.to === selectedId);
          const x1 = from.x + from.w;
          const y1 = from.y + from.h / 2;
          const x2 = to.x;
          const y2 = to.y + to.h / 2;
          const cpOffset = Math.abs(x2 - x1) * 0.4;
          return (
            <path
              key={`edge-${i}`}
              d={`M ${x1} ${y1} C ${x1 + cpOffset} ${y1}, ${x2 - cpOffset} ${y2}, ${x2} ${y2}`}
              fill="none"
              stroke={isHighlighted ? theme.palette.primary.main : theme.palette.text.disabled}
              strokeWidth={isHighlighted ? 2.5 : 1.5}
              strokeOpacity={isHighlighted ? 0.9 : 0.3}
              markerEnd="url(#topo-arrow)"
            />
          );
        })}

        {/* Nodes */}
        {nodes.map((node) => {
          const p = pos[node.id];
          if (!p) return null;
          const color = colColor(node.kind);
          const isSelected = selectedId === node.id;
          const badge = node.kind === "rule" ? actionBadge(node) : null;
          return (
            <g
              key={node.id}
              style={{ cursor: "pointer" }}
              onClick={() => onSelectNode(isSelected ? null : node.id)}
            >
              <rect
                x={p.x}
                y={p.y}
                width={p.w}
                height={p.h}
                rx={8}
                fill={isSelected ? alpha(color, 0.2) : alpha(color, 0.08)}
                stroke={isSelected ? color : alpha(color, 0.25)}
                strokeWidth={isSelected ? 2 : 1}
              />
              {/* Health dot */}
              <circle
                cx={p.x + 14}
                cy={p.y + p.h / 2}
                r={4}
                fill={node.status === "error" ? "#ef4444" : node.status === "warning" ? "#f59e0b" : "#10b981"}
              />
              {/* Label */}
              <text
                x={p.x + 26}
                y={p.y + p.h / 2 + 4}
                fill={theme.palette.text.primary}
                fontSize={11}
                fontWeight={isSelected ? 700 : 500}
              >
                {truncate(node.label, 22)}
              </text>
              {/* Action badge for rules */}
              {badge && (
                <>
                  <rect
                    x={p.x + p.w - 46}
                    y={p.y + 6}
                    width={38}
                    height={16}
                    rx={4}
                    fill={alpha(badge.color, 0.15)}
                    stroke={alpha(badge.color, 0.3)}
                    strokeWidth={0.5}
                  />
                  <text
                    x={p.x + p.w - 27}
                    y={p.y + 18}
                    textAnchor="middle"
                    fill={badge.color}
                    fontSize={8}
                    fontWeight={700}
                  >
                    {badge.label}
                  </text>
                </>
              )}
            </g>
          );
        })}
      </svg>
    </Box>
  );
};

// ─── Detail Panel ───────────────────────────────────────────────────────────
const DetailPanel = ({ node, onClose }) => {
  const theme = useTheme();
  if (!node) return null;
  const meta = node.metadata || {};
  const color = node.kind === "server" ? COL_SERVER : node.kind === "rule" ? COL_RULE : COL_BACKEND;

  const DetailRow = ({ label, value }) => (
    <Box sx={{ display: "flex", justifyContent: "space-between", py: 0.5 }}>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography variant="caption" fontWeight={600} sx={{ maxWidth: "60%", wordBreak: "break-all", textAlign: "right" }}>{value || "—"}</Typography>
    </Box>
  );

  return (
    <Card sx={{ borderRadius: 3, border: `1px solid ${theme.palette.divider}`, borderTop: `3px solid ${color}` }}>
      <CardContent sx={{ p: 2 }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1.5 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            {node.kind === "server" && <ServerIcon sx={{ fontSize: 18, color }} />}
            {node.kind === "rule" && <RuleIcon sx={{ fontSize: 18, color }} />}
            {node.kind === "backend" && <BackendIcon sx={{ fontSize: 18, color }} />}
            <Typography variant="subtitle2" fontWeight={700}>{node.label}</Typography>
          </Box>
          <IconButton size="small" onClick={onClose}><CloseIcon fontSize="small" /></IconButton>
        </Box>
        <Chip label={node.kind} size="small" sx={{ mb: 1.5, backgroundColor: alpha(color, 0.1), color, fontWeight: 600, fontSize: "0.7rem" }} />

        {node.kind === "server" && (
          <>
            <DetailRow label="Server Name" value={meta.server_name} />
            <DetailRow label="SSL" value={meta.ssl_enabled ? "Enabled" : "Disabled"} />
            <DetailRow label="WAF" value={meta.waf_enabled ? "Enabled" : "Disabled"} />
            <DetailRow label="Cache" value={meta.cache_enabled ? "Enabled" : "Disabled"} />
            {meta.listens?.length > 0 && <DetailRow label="Ports" value={meta.listens.map((l) => l.listen).join(", ")} />}
          </>
        )}
        {node.kind === "rule" && (
          <>
            <DetailRow label="Path" value={meta.path} />
            <DetailRow label="Path Match" value={meta.path_key} />
            <DetailRow label="Priority" value={meta.priority} />
            {meta.response?.code && <DetailRow label="Response Code" value={meta.response.code} />}
            {meta.response?.redirect_uri && <DetailRow label="Redirect" value={meta.response.redirect_uri} />}
            {meta.backends?.length > 0 && <DetailRow label="Backends" value={`${meta.backends.length} configured`} />}
          </>
        )}
        {node.kind === "backend" && (
          <>
            <DetailRow label="Address" value={meta.address} />
            <DetailRow label="Weight" value={meta.weight != null ? `${meta.weight}%` : "—"} />
            <DetailRow label="Type" value={meta.type || "http"} />
            {meta.port && <DetailRow label="Port" value={meta.port} />}
            {meta.latency_ms != null && <DetailRow label="Latency" value={`${meta.latency_ms}ms`} />}
          </>
        )}
      </CardContent>
    </Card>
  );
};

// ─── Main Topology Page ─────────────────────────────────────────────────────
const Topology = () => {
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const theme = useTheme();

  const [loading, setLoading] = useState(true);
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [summary, setSummary] = useState({});
  const [selectedId, setSelectedId] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await dataProvider.getTopologyGraph();
      const d = res?.data || {};
      setNodes(d.nodes || []);
      setEdges(d.edges || []);
      setSummary(d.summary || {});
    } catch (err) {
      console.error("Topology fetch error:", err);
      notify("Failed to load topology", { type: "error" });
    } finally {
      setLoading(false);
    }
  }, [dataProvider, notify]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh every 30s
  useEffect(() => {
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const selectedNode = nodes.find((n) => n.id === selectedId) || null;

  return (
    <Box sx={{ pt: 2, px: 1 }}>
      <Title title="Service Topology" />

      {/* Header */}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 3 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <TopologyIcon sx={{ fontSize: 28, color: theme.palette.primary.main }} />
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 800, lineHeight: 1.2 }}>
              Service Topology
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Virtual Servers, Rules, and Backend Origins
            </Typography>
          </Box>
        </Box>
        <Tooltip title="Refresh">
          <IconButton onClick={fetchData} disabled={loading}>
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Stats */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={4}>
          <StatCard title="Virtual Servers" value={summary.servers || 0} icon={ServerIcon} color={COL_SERVER} />
        </Grid>
        <Grid item xs={12} sm={4}>
          <StatCard title="Rules" value={summary.rules || 0} icon={RuleIcon} color={COL_RULE} />
        </Grid>
        <Grid item xs={12} sm={4}>
          <StatCard title="Backend Origins" value={summary.backends || 0} icon={BackendIcon} color={COL_BACKEND} />
        </Grid>
      </Grid>

      {/* Canvas + Detail Panel */}
      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
          <CircularProgress />
        </Box>
      ) : (
        <Grid container spacing={2}>
          <Grid item xs={12} md={selectedNode ? 8 : 12}>
            <Card sx={{ borderRadius: 3, border: `1px solid ${theme.palette.divider}`, overflow: "hidden" }}>
              <CardContent sx={{ p: 0, "&:last-child": { pb: 0 } }}>
                <Box sx={{ p: 2, borderBottom: `1px solid ${theme.palette.divider}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <Typography variant="subtitle2" fontWeight={700}>Topology Graph</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Click a node for details
                  </Typography>
                </Box>
                <Box sx={{ minHeight: 400 }}>
                  <TopologyCanvas
                    nodes={nodes}
                    edges={edges}
                    selectedId={selectedId}
                    onSelectNode={setSelectedId}
                  />
                </Box>
              </CardContent>
            </Card>
          </Grid>
          {selectedNode && (
            <Grid item xs={12} md={4}>
              <DetailPanel node={selectedNode} onClose={() => setSelectedId(null)} />
            </Grid>
          )}
        </Grid>
      )}
    </Box>
  );
};

export default Topology;
