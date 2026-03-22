import React, { useState, useEffect, useCallback } from "react";
import { useDataProvider, useRecordContext } from "react-admin";
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
  CircularProgress,
  Divider,
} from "@mui/material";
import {
  Refresh as RefreshIcon,
  DnsRounded as ServerIcon,
  RuleRounded as RuleIcon,
  Storage as BackendIcon,
  Close as CloseIcon,
} from "@mui/icons-material";

const COL_SERVER = "#0ea5e9";
const COL_RULE = "#8b5cf6";
const COL_BACKEND = "#10b981";

const NODE_HEIGHTS = { server: 110, rule: 120, backend: 90 };

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

/**
 * Embeddable topology canvas for server/rule detail pages.
 * Props:
 *   filterServerId — show only this server + its rules + backends
 *   filterRuleId   — show only this rule + parent servers + backends
 *   useRecord      — if true, auto-detect id from react-admin record context
 *   resourceType   — "servers" or "rules" (used with useRecord)
 */
const TopologyTab = ({ filterServerId, filterRuleId, useRecord = false, resourceType }) => {
  const dataProvider = useDataProvider();
  const record = useRecordContext();
  const theme = useTheme();

  const [loading, setLoading] = useState(true);
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [selectedId, setSelectedId] = useState(null);

  // Resolve IDs — record.id for servers has "host:" prefix, use server_name instead
  let serverId = filterServerId;
  let ruleId = filterRuleId;
  if (useRecord && record) {
    if (resourceType === "servers") serverId = record.server_name || record.id?.replace(/^host:/, "");
    if (resourceType === "rules") ruleId = record.id;
  }

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await dataProvider.getTopologyGraph();
      const d = res?.data || {};
      let allNodes = d.nodes || [];
      let allEdges = d.edges || [];

      // Filter if needed
      if (serverId) {
        const serverNode = allNodes.find(
          (n) => n.kind === "server" && (n.id === "server/" + serverId || n.name === serverId)
        );
        const sid = serverNode?.id || "server/" + serverId;
        const connectedRuleIds = new Set();
        const connectedBackendIds = new Set();
        allEdges.forEach((e) => {
          if (e.from === sid) connectedRuleIds.add(e.to);
        });
        allEdges.forEach((e) => {
          if (connectedRuleIds.has(e.from)) connectedBackendIds.add(e.to);
        });
        const keep = new Set([sid, ...connectedRuleIds, ...connectedBackendIds]);
        allNodes = allNodes.filter((n) => keep.has(n.id));
        allEdges = allEdges.filter((e) => keep.has(e.from) && keep.has(e.to));
      } else if (ruleId) {
        const rid = "rule/" + ruleId;
        const connectedServerIds = new Set();
        const connectedBackendIds = new Set();
        allEdges.forEach((e) => {
          if (e.to === rid) connectedServerIds.add(e.from);
          if (e.from === rid) connectedBackendIds.add(e.to);
        });
        const keep = new Set([rid, ...connectedServerIds, ...connectedBackendIds]);
        allNodes = allNodes.filter((n) => keep.has(n.id));
        allEdges = allEdges.filter((e) => keep.has(e.from) && keep.has(e.to));
      }

      setNodes(allNodes);
      setEdges(allEdges);
    } catch (err) {
      console.error("Topology fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [dataProvider, serverId, ruleId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const selectedNode = nodes.find((n) => n.id === selectedId) || null;

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
        <CircularProgress size={32} />
      </Box>
    );
  }

  if (nodes.length === 0) {
    return (
      <Box sx={{ p: 4, textAlign: "center" }}>
        <Typography color="text.secondary">No topology data available</Typography>
      </Box>
    );
  }

  // Layout
  const servers = nodes.filter((n) => n.kind === "server");
  const rules = nodes.filter((n) => n.kind === "rule");
  const backends = nodes.filter((n) => n.kind === "backend");

  const colW = 340;
  const padX = 30;
  const padY = 50;
  const gapY = 16;
  const col1X = padX;
  const col2X = padX + colW + 80;
  const col3X = padX + (colW + 80) * 2;

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

  const renderPill = (x, y, label, color) => {
    const w = label.length * 6.5 + 12;
    return (
      <>
        <rect x={x} y={y} width={w} height={16} rx={4} fill={alpha(color, 0.15)} stroke={alpha(color, 0.3)} strokeWidth={0.5} />
        <text x={x + w / 2} y={y + 11.5} textAnchor="middle" fill={color} fontSize={8.5} fontWeight={700}>{label}</text>
      </>
    );
  };

  // Detail row for side panel
  const DetailRow = ({ label, value, mono }) => (
    <Box sx={{ display: "flex", justifyContent: "space-between", py: 0.4 }}>
      <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0, mr: 1 }}>{label}</Typography>
      <Typography variant="caption" fontWeight={600} sx={{ maxWidth: "65%", wordBreak: "break-all", textAlign: "right", fontFamily: mono ? "monospace" : "inherit" }}>{value ?? "—"}</Typography>
    </Box>
  );

  const outEdges = selectedNode ? edges.filter((e) => e.from === selectedNode.id) : [];
  const inEdges = selectedNode ? edges.filter((e) => e.to === selectedNode.id) : [];

  return (
    <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
      <Box sx={{ flex: 1, minWidth: 400 }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1 }}>
          <Typography variant="caption" color="text.secondary">Click a node for details</Typography>
          <Tooltip title="Refresh">
            <IconButton size="small" onClick={fetchData}><RefreshIcon fontSize="small" /></IconButton>
          </Tooltip>
        </Box>
        <Box sx={{ width: "100%", overflowX: "auto", border: `1px solid ${theme.palette.divider}`, borderRadius: 2 }}>
          <svg width={svgWidth} height={svgHeight} viewBox={`0 0 ${svgWidth} ${svgHeight}`} style={{ minWidth: svgWidth }}>
            <defs>
              <marker id="topo-tab-arrow" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                <polygon points="0 0, 8 3, 0 6" fill={theme.palette.text.secondary} opacity={0.4} />
              </marker>
            </defs>

            <text x={col1X + colW / 2} y={24} textAnchor="middle" fill={secondaryColor} fontSize={13} fontWeight={700} letterSpacing="0.08em">VIRTUAL SERVERS</text>
            <text x={col2X + colW / 2} y={24} textAnchor="middle" fill={secondaryColor} fontSize={13} fontWeight={700} letterSpacing="0.08em">RULES</text>
            <text x={col3X + colW / 2} y={24} textAnchor="middle" fill={secondaryColor} fontSize={13} fontWeight={700} letterSpacing="0.08em">BACKEND ORIGINS</text>

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
                <g key={`e-${i}`}>
                  <path d={`M ${x1} ${y1} C ${x1 + cp} ${y1}, ${x2 - cp} ${y2}, ${x2} ${y2}`}
                    fill="none" stroke={hl ? theme.palette.primary.main : theme.palette.text.disabled}
                    strokeWidth={hl ? 2.5 : 1.5} strokeOpacity={hl ? 0.9 : 0.3} markerEnd="url(#topo-tab-arrow)" />
                  {edge.weight > 0 && (
                    <text x={midX} y={midY - 4} textAnchor="middle" fill={secondaryColor} fontSize={8} fontWeight={600}>
                      {edge.weight}%
                    </text>
                  )}
                </g>
              );
            })}

            {/* Server nodes */}
            {servers.map((node) => {
              const p = pos[node.id];
              if (!p) return null;
              const color = COL_SERVER;
              const isSel = selectedId === node.id;
              const ports = (node.listen_ports || ["80"]).join(", ");
              return (
                <g key={node.id} style={{ cursor: "pointer" }} onClick={() => setSelectedId(isSel ? null : node.id)}>
                  <rect x={p.x} y={p.y} width={p.w} height={p.h} rx={8}
                    fill={isSel ? alpha(color, 0.18) : alpha(color, 0.06)}
                    stroke={isSel ? color : alpha(color, 0.2)} strokeWidth={isSel ? 2 : 1} />
                  <circle cx={p.x + 16} cy={p.y + 16} r={5}
                    fill={node.status === "error" ? "#ef4444" : node.status === "warning" ? "#f59e0b" : "#10b981"} />
                  <text x={p.x + 28} y={p.y + 20} fill={textColor} fontSize={13} fontWeight={700}>
                    {truncate(node.label || node.name, 38)}
                  </text>
                  <text x={p.x + 16} y={p.y + 38} fill={secondaryColor} fontSize={10.5}>
                    Ports: {ports}
                  </text>
                  <g>
                    {node.ssl_enabled && renderPill(p.x + 16, p.y + 48, node.ssl_force_https ? "SSL+HTTPS" : "SSL", "#0ea5e9")}
                    {node.waf_enabled && renderPill(p.x + (node.ssl_enabled ? 90 : 16), p.y + 48, "WAF", "#f59e0b")}
                    {node.cache_enabled && renderPill(p.x + (node.ssl_enabled ? (node.waf_enabled ? 130 : 90) : (node.waf_enabled ? 56 : 16)), p.y + 48, "CACHE", "#8b5cf6")}
                    {node.rate_limit_enabled && renderPill(p.x + 16, p.y + 68, "RATE-LIMIT", "#ef4444")}
                  </g>
                  <text x={p.x + 16} y={p.y + (node.rate_limit_enabled ? 92 : 86)} fill={secondaryColor} fontSize={10}>
                    {node.rule_count || 0} rule{(node.rule_count || 0) !== 1 ? "s" : ""} attached
                  </text>
                </g>
              );
            })}

            {/* Rule nodes */}
            {rules.map((node) => {
              const p = pos[node.id];
              if (!p) return null;
              const color = COL_RULE;
              const isSel = selectedId === node.id;
              const badge = actionBadge(node);
              return (
                <g key={node.id} style={{ cursor: "pointer" }} onClick={() => setSelectedId(isSel ? null : node.id)}>
                  <rect x={p.x} y={p.y} width={p.w} height={p.h} rx={8}
                    fill={isSel ? alpha(color, 0.18) : alpha(color, 0.06)}
                    stroke={isSel ? color : alpha(color, 0.2)} strokeWidth={isSel ? 2 : 1} />
                  <circle cx={p.x + 16} cy={p.y + 16} r={5}
                    fill={node.status === "error" ? "#ef4444" : node.status === "warning" ? "#f59e0b" : "#10b981"} />
                  <text x={p.x + 28} y={p.y + 20} fill={textColor} fontSize={13} fontWeight={700}>
                    {truncate(node.label || node.name, 34)}
                  </text>
                  {badge && renderPill(p.x + p.w - (badge.label.length * 6.5 + 16), p.y + 6, badge.label, badge.color)}
                  <text x={p.x + 16} y={p.y + 38} fill={secondaryColor} fontSize={10.5}>
                    {node.path_key || "starts_with"} "{truncate(node.path || "/", 30)}"
                  </text>
                  <text x={p.x + 16} y={p.y + 54} fill={secondaryColor} fontSize={10.5}>
                    Priority: {node.priority || 0} · Code: {node.status_code || "305"}
                  </text>
                  {node.conditions && node.conditions.length > 0 && (
                    <text x={p.x + 16} y={p.y + 70} fill={secondaryColor} fontSize={10}>
                      Conditions: {node.conditions.join(", ")}
                    </text>
                  )}
                  {node.has_backends && (
                    <text x={p.x + 16} y={p.y + 86} fill={secondaryColor} fontSize={10}>
                      Routing: {node.routing_mode || "weighted"} · {node.backend_count || 0} backend{(node.backend_count || 0) !== 1 ? "s" : ""}
                    </text>
                  )}
                  <g>
                    {node.strip_path && renderPill(p.x + 16, p.y + 96, "STRIP-PATH", "#06b6d4")}
                    {node.auto_redirect_https && renderPill(p.x + (node.strip_path ? 90 : 16), p.y + 96, "FORCE-HTTPS", "#0ea5e9")}
                  </g>
                </g>
              );
            })}

            {/* Backend nodes */}
            {backends.map((node) => {
              const p = pos[node.id];
              if (!p) return null;
              const color = COL_BACKEND;
              const isSel = selectedId === node.id;
              const stats = node.stats || {};
              return (
                <g key={node.id} style={{ cursor: "pointer" }} onClick={() => setSelectedId(isSel ? null : node.id)}>
                  <rect x={p.x} y={p.y} width={p.w} height={p.h} rx={8}
                    fill={isSel ? alpha(color, 0.18) : alpha(color, 0.06)}
                    stroke={isSel ? color : alpha(color, 0.2)} strokeWidth={isSel ? 2 : 1} />
                  <circle cx={p.x + 16} cy={p.y + 16} r={5}
                    fill={node.status === "error" ? "#ef4444" : node.status === "warning" ? "#f59e0b" : "#10b981"} />
                  <text x={p.x + 28} y={p.y + 20} fill={textColor} fontSize={13} fontWeight={700}>
                    {truncate(node.host || node.label || node.name, 38)}
                  </text>
                  <text x={p.x + 16} y={p.y + 38} fill={secondaryColor} fontSize={10.5}>
                    {node.scheme || "http"}://{truncate(node.address || node.host, 34)}
                  </text>
                  <text x={p.x + 16} y={p.y + 54} fill={secondaryColor} fontSize={10.5}>
                    Port: {node.port || "80"} · Type: {node.backend_type || "origin"}{node.weight != null ? ` · W:${node.weight}%` : ""}
                  </text>
                  {(stats.requests > 0 || stats.errors > 0) && (
                    <text x={p.x + 16} y={p.y + 72} fill={secondaryColor} fontSize={10}>
                      Req: {stats.requests || 0} · Err: {stats.errors || 0} · Latency: {stats.avg_latency_ms || 0}ms
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </Box>
      </Box>

      {/* Detail Panel */}
      {selectedNode && (
        <Box sx={{ width: 300, flexShrink: 0 }}>
          <Card sx={{ borderRadius: 3, border: `1px solid ${theme.palette.divider}`, borderTop: `3px solid ${colColor(selectedNode.kind)}`, position: "sticky", top: 16 }}>
            <CardContent sx={{ p: 2 }}>
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1 }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  {selectedNode.kind === "server" && <ServerIcon sx={{ fontSize: 18, color: colColor(selectedNode.kind) }} />}
                  {selectedNode.kind === "rule" && <RuleIcon sx={{ fontSize: 18, color: colColor(selectedNode.kind) }} />}
                  {selectedNode.kind === "backend" && <BackendIcon sx={{ fontSize: 18, color: colColor(selectedNode.kind) }} />}
                  <Typography variant="subtitle2" fontWeight={700} sx={{ wordBreak: "break-all" }}>{selectedNode.label || selectedNode.name}</Typography>
                </Box>
                <IconButton size="small" onClick={() => setSelectedId(null)}><CloseIcon fontSize="small" /></IconButton>
              </Box>
              <Chip label={selectedNode.kind.toUpperCase()} size="small" sx={{ mb: 1.5, backgroundColor: alpha(colColor(selectedNode.kind), 0.1), color: colColor(selectedNode.kind), fontWeight: 700, fontSize: "0.65rem" }} />

              {selectedNode.kind === "server" && (
                <>
                  <DetailRow label="Server Name" value={selectedNode.name} mono />
                  <DetailRow label="Proxy Name" value={selectedNode.proxy_server_name} mono />
                  <DetailRow label="Listen Ports" value={(selectedNode.listen_ports || []).join(", ")} />
                  <DetailRow label="SSL" value={selectedNode.ssl_enabled ? (selectedNode.ssl_force_https ? "Enabled + Force HTTPS" : "Enabled") : "Disabled"} />
                  <DetailRow label="WAF" value={selectedNode.waf_enabled ? "Enabled" : "Disabled"} />
                  <DetailRow label="Cache" value={selectedNode.cache_enabled ? "Enabled" : "Disabled"} />
                  <DetailRow label="Rate Limit" value={selectedNode.rate_limit_enabled ? "Enabled" : "Disabled"} />
                  <DetailRow label="Rules" value={selectedNode.rule_count || 0} />
                  <DetailRow label="Custom Headers" value={selectedNode.custom_headers_count || 0} />
                  <DetailRow label="Response Headers" value={selectedNode.custom_response_headers_count || 0} />
                  {outEdges.length > 0 && (
                    <>
                      <Divider sx={{ my: 1 }} />
                      <Typography variant="caption" fontWeight={700} sx={{ mb: 0.5, display: "block" }}>Connected Rules</Typography>
                      {outEdges.map((e, i) => {
                        const target = nodes.find((n) => n.id === e.to);
                        return <DetailRow key={i} label={`→ ${target?.label || target?.name || e.to}`} value={target?.action || ""} />;
                      })}
                    </>
                  )}
                </>
              )}

              {selectedNode.kind === "rule" && (
                <>
                  <DetailRow label="Action" value={selectedNode.action?.toUpperCase()} />
                  <DetailRow label="Status Code" value={selectedNode.status_code} />
                  <DetailRow label="Priority" value={selectedNode.priority} />
                  <Divider sx={{ my: 0.5 }} />
                  <Typography variant="caption" fontWeight={700} sx={{ mb: 0.3, display: "block", color: secondaryColor }}>Path Matching</Typography>
                  <DetailRow label="Path" value={selectedNode.path} mono />
                  <DetailRow label="Match Type" value={selectedNode.path_key} />
                  <DetailRow label="Strip Path" value={selectedNode.strip_path ? "Yes" : "No"} />
                  <DetailRow label="Force HTTPS" value={selectedNode.auto_redirect_https ? "Yes" : "No"} />
                  <Divider sx={{ my: 0.5 }} />
                  <Typography variant="caption" fontWeight={700} sx={{ mb: 0.3, display: "block", color: secondaryColor }}>Conditions</Typography>
                  <DetailRow label="Count" value={selectedNode.condition_count || 0} />
                  {selectedNode.conditions?.length > 0 && <DetailRow label="Types" value={selectedNode.conditions.join(", ")} />}
                  {selectedNode.has_backends && (
                    <>
                      <Divider sx={{ my: 0.5 }} />
                      <Typography variant="caption" fontWeight={700} sx={{ mb: 0.3, display: "block", color: secondaryColor }}>Traffic Routing</Typography>
                      <DetailRow label="Mode" value={selectedNode.routing_mode || "weighted"} />
                      <DetailRow label="Backends" value={selectedNode.backend_count || 0} />
                      {selectedNode.routing_sticky && <DetailRow label="Sticky Sessions" value="Enabled" />}
                      {selectedNode.routing_header_name && <DetailRow label="Header" value={selectedNode.routing_header_name} />}
                      {selectedNode.routing_cookie_name && <DetailRow label="Cookie" value={selectedNode.routing_cookie_name} />}
                    </>
                  )}
                  {inEdges.length > 0 && (
                    <>
                      <Divider sx={{ my: 0.5 }} />
                      <Typography variant="caption" fontWeight={700} sx={{ mb: 0.3, display: "block", color: secondaryColor }}>Parent Servers</Typography>
                      {inEdges.map((e, i) => {
                        const src = nodes.find((n) => n.id === e.from);
                        return <DetailRow key={i} label={`← ${src?.label || src?.name || e.from}`} value="" />;
                      })}
                    </>
                  )}
                  {outEdges.length > 0 && (
                    <>
                      <Divider sx={{ my: 0.5 }} />
                      <Typography variant="caption" fontWeight={700} sx={{ mb: 0.3, display: "block", color: secondaryColor }}>Backend Targets</Typography>
                      {outEdges.map((e, i) => {
                        const target = nodes.find((n) => n.id === e.to);
                        return <DetailRow key={i} label={`→ ${target?.label || target?.name || e.to}`} value={e.weight ? `${e.weight}%` : ""} />;
                      })}
                    </>
                  )}
                </>
              )}

              {selectedNode.kind === "backend" && (
                <>
                  <DetailRow label="Address" value={selectedNode.address} mono />
                  <DetailRow label="Host" value={selectedNode.host} mono />
                  <DetailRow label="Port" value={selectedNode.port || "80"} />
                  <DetailRow label="Scheme" value={selectedNode.scheme || "http"} />
                  <DetailRow label="Type" value={selectedNode.backend_type || "origin"} />
                  {selectedNode.path && <DetailRow label="Path" value={selectedNode.path} mono />}
                  {selectedNode.weight != null && <DetailRow label="Weight" value={`${selectedNode.weight}%`} />}
                  {selectedNode.stats && (
                    <>
                      <Divider sx={{ my: 0.5 }} />
                      <Typography variant="caption" fontWeight={700} sx={{ mb: 0.3, display: "block", color: secondaryColor }}>Traffic Stats</Typography>
                      <DetailRow label="Requests" value={selectedNode.stats.requests || 0} />
                      <DetailRow label="Errors" value={selectedNode.stats.errors || 0} />
                      <DetailRow label="Error Rate" value={selectedNode.stats.error_rate ? `${(selectedNode.stats.error_rate * 100).toFixed(1)}%` : "0%"} />
                      <DetailRow label="Avg Latency" value={`${selectedNode.stats.avg_latency_ms || 0}ms`} />
                    </>
                  )}
                  {inEdges.length > 0 && (
                    <>
                      <Divider sx={{ my: 0.5 }} />
                      <Typography variant="caption" fontWeight={700} sx={{ mb: 0.3, display: "block", color: secondaryColor }}>Served by Rules</Typography>
                      {inEdges.map((e, i) => {
                        const src = nodes.find((n) => n.id === e.from);
                        return <DetailRow key={i} label={`← ${src?.label || src?.name || e.from}`} value={e.weight ? `${e.weight}%` : ""} />;
                      })}
                    </>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </Box>
      )}
    </Box>
  );
};

export default TopologyTab;
