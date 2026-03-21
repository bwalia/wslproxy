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
  Divider,
} from "@mui/material";
import {
  AccountTree as TopologyIcon,
  Refresh as RefreshIcon,
  DnsRounded as ServerIcon,
  RuleRounded as RuleIcon,
  Storage as BackendIcon,
  Close as CloseIcon,
  Lock as SslIcon,
  LockOpen as NoSslIcon,
  Shield as WafIcon,
  Speed as CacheIcon,
} from "@mui/icons-material";
import { useThemeMode } from "../Theme";

// Column colours
const COL_SERVER = "#0ea5e9";
const COL_RULE = "#8b5cf6";
const COL_BACKEND = "#10b981";

// Node heights per kind (taller to fit metadata)
const NODE_HEIGHTS = { server: 88, rule: 100, backend: 72 };

// Action badge helper
const actionBadge = (node) => {
  const code = node?.status_code;
  if (code === 301 || code === 302) return { label: `${code} REDIRECT`, color: "#f59e0b" };
  if (code === 403) return { label: "403 BLOCK", color: "#ef4444" };
  if (node?.action === "consul") return { label: "CONSUL", color: "#06b6d4" };
  if (node?.has_backends && node?.routing_mode && node.routing_mode !== "weighted") {
    return { label: node.routing_mode.toUpperCase(), color: "#8b5cf6" };
  }
  if (node?.has_backends) return { label: "PROXY", color: "#10b981" };
  if (node?.action === "proxy") return { label: "PROXY", color: "#10b981" };
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

// ─── SVG Topology Canvas (rich cards with metadata) ─────────────────────────
const TopologyCanvas = ({ nodes, edges, selectedId, onSelectNode }) => {
  const theme = useTheme();

  if (!nodes || nodes.length === 0) {
    return (
      <Box sx={{ p: 4, textAlign: "center" }}>
        <Typography color="text.secondary">No topology data available</Typography>
      </Box>
    );
  }

  const servers = nodes.filter((n) => n.kind === "server");
  const rules = nodes.filter((n) => n.kind === "rule");
  const backends = nodes.filter((n) => n.kind === "backend");

  // Layout
  const colW = 240;
  const padX = 30;
  const padY = 50;
  const gapY = 12;
  const col1X = padX;
  const col2X = padX + colW + 60;
  const col3X = padX + (colW + 60) * 2;

  const pos = {};

  const placeColumn = (arr, x, kind) => {
    const h = NODE_HEIGHTS[kind] || 60;
    const totalH = arr.length * (h + gapY) - gapY;
    const startY = padY;
    arr.forEach((n, i) => {
      pos[n.id] = { x, y: startY + i * (h + gapY), w: colW, h };
    });
    return totalH + padY * 2;
  };

  const h1 = placeColumn(servers, col1X, "server");
  const h2 = placeColumn(rules, col2X, "rule");
  const h3 = placeColumn(backends, col3X, "backend");
  const svgHeight = Math.max(h1, h2, h3, 250);
  const svgWidth = col3X + colW + padX;

  const colColor = (kind) => kind === "server" ? COL_SERVER : kind === "rule" ? COL_RULE : COL_BACKEND;
  const truncate = (s, max) => (s && s.length > max ? s.substring(0, max) + "..." : s || "");
  const secondaryColor = theme.palette.text.secondary;
  const textColor = theme.palette.text.primary;

  // Pill helper for inline badges
  const renderPill = (x, y, label, color) => (
    <>
      <rect x={x} y={y} width={label.length * 5.5 + 10} height={14} rx={3} fill={alpha(color, 0.15)} stroke={alpha(color, 0.3)} strokeWidth={0.5} />
      <text x={x + (label.length * 5.5 + 10) / 2} y={y + 10} textAnchor="middle" fill={color} fontSize={7.5} fontWeight={700}>{label}</text>
    </>
  );

  return (
    <Box sx={{ width: "100%", overflowX: "auto", overflowY: "auto", maxHeight: "100%" }}>
      <svg width={svgWidth} height={svgHeight} viewBox={`0 0 ${svgWidth} ${svgHeight}`} style={{ minWidth: svgWidth }}>
        <defs>
          <marker id="topo-arrow" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
            <polygon points="0 0, 8 3, 0 6" fill={theme.palette.text.secondary} opacity={0.4} />
          </marker>
        </defs>

        {/* Column headers */}
        <text x={col1X + colW / 2} y={22} textAnchor="middle" fill={secondaryColor} fontSize={11} fontWeight={700} letterSpacing="0.08em">VIRTUAL SERVERS</text>
        <text x={col2X + colW / 2} y={22} textAnchor="middle" fill={secondaryColor} fontSize={11} fontWeight={700} letterSpacing="0.08em">RULES</text>
        <text x={col3X + colW / 2} y={22} textAnchor="middle" fill={secondaryColor} fontSize={11} fontWeight={700} letterSpacing="0.08em">BACKEND ORIGINS</text>

        {/* Edges with weight labels */}
        {edges.map((edge, i) => {
          const from = pos[edge.from];
          const to = pos[edge.to];
          if (!from || !to) return null;
          const hl = selectedId && (edge.from === selectedId || edge.to === selectedId);
          const x1 = from.x + from.w;
          const y1 = from.y + from.h / 2;
          const x2 = to.x;
          const y2 = to.y + to.h / 2;
          const cp = Math.abs(x2 - x1) * 0.4;
          const midX = (x1 + x2) / 2;
          const midY = (y1 + y2) / 2;
          return (
            <g key={`edge-${i}`}>
              <path
                d={`M ${x1} ${y1} C ${x1 + cp} ${y1}, ${x2 - cp} ${y2}, ${x2} ${y2}`}
                fill="none"
                stroke={hl ? theme.palette.primary.main : theme.palette.text.disabled}
                strokeWidth={hl ? 2.5 : 1.5}
                strokeOpacity={hl ? 0.9 : 0.3}
                markerEnd="url(#topo-arrow)"
              />
              {/* Weight label on edge */}
              {edge.weight > 0 && (
                <text x={midX} y={midY - 4} textAnchor="middle" fill={secondaryColor} fontSize={8} fontWeight={600}>
                  {edge.weight}%
                </text>
              )}
            </g>
          );
        })}

        {/* ── Server nodes ── */}
        {servers.map((node) => {
          const p = pos[node.id];
          if (!p) return null;
          const color = COL_SERVER;
          const isSel = selectedId === node.id;
          const ports = (node.listen_ports || ["80"]).join(", ");
          return (
            <g key={node.id} style={{ cursor: "pointer" }} onClick={() => onSelectNode(isSel ? null : node.id)}>
              <rect x={p.x} y={p.y} width={p.w} height={p.h} rx={8}
                fill={isSel ? alpha(color, 0.18) : alpha(color, 0.06)}
                stroke={isSel ? color : alpha(color, 0.2)} strokeWidth={isSel ? 2 : 1} />
              {/* Health dot */}
              <circle cx={p.x + 14} cy={p.y + 14} r={4}
                fill={node.status === "error" ? "#ef4444" : node.status === "warning" ? "#f59e0b" : "#10b981"} />
              {/* Name */}
              <text x={p.x + 24} y={p.y + 18} fill={textColor} fontSize={11} fontWeight={700}>
                {truncate(node.label || node.name, 26)}
              </text>
              {/* Ports */}
              <text x={p.x + 14} y={p.y + 34} fill={secondaryColor} fontSize={9}>
                Ports: {ports}
              </text>
              {/* SSL / WAF / Cache pills */}
              <g>
                {node.ssl_enabled && renderPill(p.x + 14, p.y + 42, node.ssl_force_https ? "SSL+HTTPS" : "SSL", "#0ea5e9")}
                {node.waf_enabled && renderPill(p.x + (node.ssl_enabled ? 80 : 14), p.y + 42, "WAF", "#f59e0b")}
                {node.cache_enabled && renderPill(p.x + (node.ssl_enabled ? (node.waf_enabled ? 115 : 80) : (node.waf_enabled ? 50 : 14)), p.y + 42, "CACHE", "#8b5cf6")}
                {node.rate_limit_enabled && renderPill(p.x + 14, p.y + 58, "RATE-LIMIT", "#ef4444")}
              </g>
              {/* Rules count */}
              <text x={p.x + 14} y={p.y + (node.rate_limit_enabled ? 78 : 72)} fill={secondaryColor} fontSize={8.5}>
                {node.rule_count || 0} rule{(node.rule_count || 0) !== 1 ? "s" : ""} attached
              </text>
            </g>
          );
        })}

        {/* ── Rule nodes ── */}
        {rules.map((node) => {
          const p = pos[node.id];
          if (!p) return null;
          const color = COL_RULE;
          const isSel = selectedId === node.id;
          const badge = actionBadge(node);
          return (
            <g key={node.id} style={{ cursor: "pointer" }} onClick={() => onSelectNode(isSel ? null : node.id)}>
              <rect x={p.x} y={p.y} width={p.w} height={p.h} rx={8}
                fill={isSel ? alpha(color, 0.18) : alpha(color, 0.06)}
                stroke={isSel ? color : alpha(color, 0.2)} strokeWidth={isSel ? 2 : 1} />
              {/* Health dot */}
              <circle cx={p.x + 14} cy={p.y + 14} r={4}
                fill={node.status === "error" ? "#ef4444" : node.status === "warning" ? "#f59e0b" : "#10b981"} />
              {/* Name */}
              <text x={p.x + 24} y={p.y + 18} fill={textColor} fontSize={11} fontWeight={700}>
                {truncate(node.label || node.name, 22)}
              </text>
              {/* Action badge */}
              {badge && renderPill(p.x + p.w - (badge.label.length * 5.5 + 14), p.y + 6, badge.label, badge.color)}
              {/* Path match */}
              <text x={p.x + 14} y={p.y + 34} fill={secondaryColor} fontSize={9}>
                {node.path_key || "starts_with"} "{truncate(node.path || "/", 20)}"
              </text>
              {/* Priority */}
              <text x={p.x + 14} y={p.y + 48} fill={secondaryColor} fontSize={9}>
                Priority: {node.priority || 0} · Code: {node.status_code || "305"}
              </text>
              {/* Conditions */}
              {node.conditions && node.conditions.length > 0 && (
                <text x={p.x + 14} y={p.y + 62} fill={secondaryColor} fontSize={8.5}>
                  Conditions: {node.conditions.join(", ")}
                </text>
              )}
              {/* Routing mode */}
              {node.has_backends && (
                <text x={p.x + 14} y={p.y + 76} fill={secondaryColor} fontSize={8.5}>
                  Routing: {node.routing_mode || "weighted"} · {node.backend_count || 0} backend{(node.backend_count || 0) !== 1 ? "s" : ""}
                </text>
              )}
              {/* Flags */}
              <g>
                {node.strip_path && renderPill(p.x + 14, p.y + 82, "STRIP-PATH", "#06b6d4")}
                {node.auto_redirect_https && renderPill(p.x + (node.strip_path ? 80 : 14), p.y + 82, "FORCE-HTTPS", "#0ea5e9")}
              </g>
            </g>
          );
        })}

        {/* ── Backend nodes ── */}
        {backends.map((node) => {
          const p = pos[node.id];
          if (!p) return null;
          const color = COL_BACKEND;
          const isSel = selectedId === node.id;
          const stats = node.stats || {};
          return (
            <g key={node.id} style={{ cursor: "pointer" }} onClick={() => onSelectNode(isSel ? null : node.id)}>
              <rect x={p.x} y={p.y} width={p.w} height={p.h} rx={8}
                fill={isSel ? alpha(color, 0.18) : alpha(color, 0.06)}
                stroke={isSel ? color : alpha(color, 0.2)} strokeWidth={isSel ? 2 : 1} />
              {/* Health dot */}
              <circle cx={p.x + 14} cy={p.y + 14} r={4}
                fill={node.status === "error" ? "#ef4444" : node.status === "warning" ? "#f59e0b" : "#10b981"} />
              {/* Host */}
              <text x={p.x + 24} y={p.y + 18} fill={textColor} fontSize={11} fontWeight={700}>
                {truncate(node.host || node.label || node.name, 26)}
              </text>
              {/* Address + port + type */}
              <text x={p.x + 14} y={p.y + 34} fill={secondaryColor} fontSize={9}>
                {node.scheme || "http"}://{truncate(node.address || node.host, 20)}
              </text>
              <text x={p.x + 14} y={p.y + 48} fill={secondaryColor} fontSize={9}>
                Port: {node.port || "80"} · Type: {node.backend_type || "origin"}{node.weight != null ? ` · W:${node.weight}%` : ""}
              </text>
              {/* Stats if available */}
              {(stats.requests > 0 || stats.errors > 0) && (
                <text x={p.x + 14} y={p.y + 62} fill={secondaryColor} fontSize={8.5}>
                  Req: {stats.requests || 0} · Err: {stats.errors || 0} · Latency: {stats.avg_latency_ms || 0}ms
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </Box>
  );
};

// ─── Detail Panel (reads flat node properties) ──────────────────────────────
const DetailPanel = ({ node, edges, allNodes, onClose }) => {
  const theme = useTheme();
  if (!node) return null;
  const color = node.kind === "server" ? COL_SERVER : node.kind === "rule" ? COL_RULE : COL_BACKEND;

  const DetailRow = ({ label, value, mono }) => (
    <Box sx={{ display: "flex", justifyContent: "space-between", py: 0.4 }}>
      <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0, mr: 1 }}>{label}</Typography>
      <Typography variant="caption" fontWeight={600} sx={{ maxWidth: "65%", wordBreak: "break-all", textAlign: "right", fontFamily: mono ? "monospace" : "inherit" }}>{value ?? "—"}</Typography>
    </Box>
  );

  // Find connected edges
  const outEdges = edges.filter((e) => e.from === node.id);
  const inEdges = edges.filter((e) => e.to === node.id);

  return (
    <Card sx={{ borderRadius: 3, border: `1px solid ${theme.palette.divider}`, borderTop: `3px solid ${color}`, position: "sticky", top: 16 }}>
      <CardContent sx={{ p: 2 }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            {node.kind === "server" && <ServerIcon sx={{ fontSize: 18, color }} />}
            {node.kind === "rule" && <RuleIcon sx={{ fontSize: 18, color }} />}
            {node.kind === "backend" && <BackendIcon sx={{ fontSize: 18, color }} />}
            <Typography variant="subtitle2" fontWeight={700} sx={{ wordBreak: "break-all" }}>{node.label || node.name}</Typography>
          </Box>
          <IconButton size="small" onClick={onClose}><CloseIcon fontSize="small" /></IconButton>
        </Box>
        <Chip label={node.kind.toUpperCase()} size="small" sx={{ mb: 1.5, backgroundColor: alpha(color, 0.1), color, fontWeight: 700, fontSize: "0.65rem" }} />

        {node.kind === "server" && (
          <>
            <DetailRow label="Server Name" value={node.name} mono />
            <DetailRow label="Proxy Name" value={node.proxy_server_name} mono />
            <DetailRow label="Listen Ports" value={(node.listen_ports || []).join(", ")} />
            <DetailRow label="SSL" value={node.ssl_enabled ? (node.ssl_force_https ? "Enabled + Force HTTPS" : "Enabled") : "Disabled"} />
            <DetailRow label="WAF" value={node.waf_enabled ? "Enabled" : "Disabled"} />
            <DetailRow label="Cache" value={node.cache_enabled ? "Enabled" : "Disabled"} />
            <DetailRow label="Rate Limit" value={node.rate_limit_enabled ? "Enabled" : "Disabled"} />
            <DetailRow label="Rules" value={node.rule_count || 0} />
            <DetailRow label="Custom Headers" value={node.custom_headers_count || 0} />
            <DetailRow label="Response Headers" value={node.custom_response_headers_count || 0} />
            {outEdges.length > 0 && (
              <>
                <Divider sx={{ my: 1 }} />
                <Typography variant="caption" fontWeight={700} sx={{ mb: 0.5, display: "block" }}>Connected Rules</Typography>
                {outEdges.map((e, i) => {
                  const target = allNodes.find((n) => n.id === e.to);
                  return <DetailRow key={i} label={`→ ${target?.label || target?.name || e.to}`} value={target?.action || ""} />;
                })}
              </>
            )}
          </>
        )}

        {node.kind === "rule" && (
          <>
            <DetailRow label="Action" value={node.action?.toUpperCase()} />
            <DetailRow label="Status Code" value={node.status_code} />
            <DetailRow label="Priority" value={node.priority} />
            <Divider sx={{ my: 0.5 }} />
            <Typography variant="caption" fontWeight={700} sx={{ mb: 0.3, display: "block", color: theme.palette.text.secondary }}>Path Matching</Typography>
            <DetailRow label="Path" value={node.path} mono />
            <DetailRow label="Match Type" value={node.path_key} />
            <DetailRow label="Strip Path" value={node.strip_path ? "Yes" : "No"} />
            <DetailRow label="Force HTTPS" value={node.auto_redirect_https ? "Yes" : "No"} />
            <Divider sx={{ my: 0.5 }} />
            <Typography variant="caption" fontWeight={700} sx={{ mb: 0.3, display: "block", color: theme.palette.text.secondary }}>Conditions</Typography>
            <DetailRow label="Count" value={node.condition_count || 0} />
            {node.conditions?.length > 0 && <DetailRow label="Types" value={node.conditions.join(", ")} />}
            {node.has_backends && (
              <>
                <Divider sx={{ my: 0.5 }} />
                <Typography variant="caption" fontWeight={700} sx={{ mb: 0.3, display: "block", color: theme.palette.text.secondary }}>Traffic Routing</Typography>
                <DetailRow label="Mode" value={node.routing_mode || "weighted"} />
                <DetailRow label="Backends" value={node.backend_count || 0} />
                {node.routing_sticky && <DetailRow label="Sticky Sessions" value="Enabled" />}
                {node.routing_header_name && <DetailRow label="Header" value={node.routing_header_name} />}
                {node.routing_cookie_name && <DetailRow label="Cookie" value={node.routing_cookie_name} />}
              </>
            )}
            {inEdges.length > 0 && (
              <>
                <Divider sx={{ my: 0.5 }} />
                <Typography variant="caption" fontWeight={700} sx={{ mb: 0.3, display: "block", color: theme.palette.text.secondary }}>Parent Servers</Typography>
                {inEdges.map((e, i) => {
                  const src = allNodes.find((n) => n.id === e.from);
                  return <DetailRow key={i} label={`← ${src?.label || src?.name || e.from}`} value="" />;
                })}
              </>
            )}
            {outEdges.length > 0 && (
              <>
                <Divider sx={{ my: 0.5 }} />
                <Typography variant="caption" fontWeight={700} sx={{ mb: 0.3, display: "block", color: theme.palette.text.secondary }}>Backend Targets</Typography>
                {outEdges.map((e, i) => {
                  const target = allNodes.find((n) => n.id === e.to);
                  return <DetailRow key={i} label={`→ ${target?.label || target?.name || e.to}`} value={e.weight ? `${e.weight}%` : ""} />;
                })}
              </>
            )}
          </>
        )}

        {node.kind === "backend" && (
          <>
            <DetailRow label="Address" value={node.address} mono />
            <DetailRow label="Host" value={node.host} mono />
            <DetailRow label="Port" value={node.port || "80"} />
            <DetailRow label="Scheme" value={node.scheme || "http"} />
            <DetailRow label="Type" value={node.backend_type || "origin"} />
            {node.path && <DetailRow label="Path" value={node.path} mono />}
            {node.weight != null && <DetailRow label="Weight" value={`${node.weight}%`} />}
            {node.stats && (
              <>
                <Divider sx={{ my: 0.5 }} />
                <Typography variant="caption" fontWeight={700} sx={{ mb: 0.3, display: "block", color: theme.palette.text.secondary }}>Traffic Stats</Typography>
                <DetailRow label="Requests" value={node.stats.requests || 0} />
                <DetailRow label="Errors" value={node.stats.errors || 0} />
                <DetailRow label="Error Rate" value={node.stats.error_rate ? `${(node.stats.error_rate * 100).toFixed(1)}%` : "0%"} />
                <DetailRow label="Avg Latency" value={`${node.stats.avg_latency_ms || 0}ms`} />
                {node.stats.total_bytes > 0 && <DetailRow label="Total Bytes" value={node.stats.total_bytes} />}
              </>
            )}
            {inEdges.length > 0 && (
              <>
                <Divider sx={{ my: 0.5 }} />
                <Typography variant="caption" fontWeight={700} sx={{ mb: 0.3, display: "block", color: theme.palette.text.secondary }}>Served by Rules</Typography>
                {inEdges.map((e, i) => {
                  const src = allNodes.find((n) => n.id === e.from);
                  return <DetailRow key={i} label={`← ${src?.label || src?.name || e.from}`} value={e.weight ? `${e.weight}%` : ""} />;
                })}
              </>
            )}
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

  useEffect(() => { fetchData(); }, [fetchData]);

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
            <Typography variant="h5" sx={{ fontWeight: 800, lineHeight: 1.2 }}>Service Topology</Typography>
            <Typography variant="caption" color="text.secondary">
              Request flow: Virtual Servers → Rules (priority, path match, conditions) → Backend Origins
            </Typography>
          </Box>
        </Box>
        <Tooltip title="Refresh">
          <IconButton onClick={fetchData} disabled={loading}><RefreshIcon /></IconButton>
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
        <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}><CircularProgress /></Box>
      ) : (
        <Grid container spacing={2}>
          <Grid item xs={12} md={selectedNode ? 8 : 12}>
            <Card sx={{ borderRadius: 3, border: `1px solid ${theme.palette.divider}`, overflow: "hidden" }}>
              <CardContent sx={{ p: 0, "&:last-child": { pb: 0 } }}>
                <Box sx={{ p: 2, borderBottom: `1px solid ${theme.palette.divider}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <Typography variant="subtitle2" fontWeight={700}>Topology Graph</Typography>
                  <Typography variant="caption" color="text.secondary">Click a node for full details</Typography>
                </Box>
                <Box sx={{ minHeight: 500 }}>
                  <TopologyCanvas nodes={nodes} edges={edges} selectedId={selectedId} onSelectNode={setSelectedId} />
                </Box>
              </CardContent>
            </Card>
          </Grid>
          {selectedNode && (
            <Grid item xs={12} md={4}>
              <DetailPanel node={selectedNode} edges={edges} allNodes={nodes} onClose={() => setSelectedId(null)} />
            </Grid>
          )}
        </Grid>
      )}
    </Box>
  );
};

export default Topology;
