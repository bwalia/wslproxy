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

const actionBadge = (node) => {
  const resp = node?.metadata?.response || {};
  const code = resp.code;
  if (code === 301 || code === 302) return { label: `${code}`, color: "#f59e0b" };
  if (code === 403) return { label: "403", color: "#ef4444" };
  if (resp.is_consul) return { label: "CONSUL", color: "#06b6d4" };
  if (node?.metadata?.backends?.length > 0) return { label: "PROXY", color: "#10b981" };
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
        // Find the matching server node (by id suffix or name)
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

  const colW = 190;
  const nodeH = 36;
  const padX = 30;
  const padY = 40;
  const gapY = 14;
  const col1X = padX;
  const col2X = padX + colW + 70;
  const col3X = padX + (colW + 70) * 2;

  const colHeight = (arr) => arr.length * (nodeH + gapY) - gapY + padY * 2;
  const svgHeight = Math.max(colHeight(servers), colHeight(rules), colHeight(backends), 180);
  const svgWidth = col3X + colW + padX;

  const pos = {};
  const placeColumn = (arr, x) => {
    const totalH = arr.length * (nodeH + gapY) - gapY;
    const startY = Math.max(padY, (svgHeight - totalH) / 2);
    arr.forEach((n, i) => { pos[n.id] = { x, y: startY + i * (nodeH + gapY), w: colW, h: nodeH }; });
  };
  placeColumn(servers, col1X);
  placeColumn(rules, col2X);
  placeColumn(backends, col3X);

  const colColor = (kind) => kind === "server" ? COL_SERVER : kind === "rule" ? COL_RULE : COL_BACKEND;
  const truncate = (s, max) => (s && s.length > max ? s.substring(0, max) + "..." : s || "");

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

            <text x={col1X + colW / 2} y={16} textAnchor="middle" fill={theme.palette.text.secondary} fontSize={10} fontWeight={700} letterSpacing="0.08em">VIRTUAL SERVERS</text>
            <text x={col2X + colW / 2} y={16} textAnchor="middle" fill={theme.palette.text.secondary} fontSize={10} fontWeight={700} letterSpacing="0.08em">RULES</text>
            <text x={col3X + colW / 2} y={16} textAnchor="middle" fill={theme.palette.text.secondary} fontSize={10} fontWeight={700} letterSpacing="0.08em">BACKEND ORIGINS</text>

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
              return (
                <path key={`e-${i}`} d={`M ${x1} ${y1} C ${x1 + cp} ${y1}, ${x2 - cp} ${y2}, ${x2} ${y2}`}
                  fill="none" stroke={hl ? theme.palette.primary.main : theme.palette.text.disabled}
                  strokeWidth={hl ? 2.5 : 1.5} strokeOpacity={hl ? 0.9 : 0.3} markerEnd="url(#topo-tab-arrow)" />
              );
            })}

            {nodes.map((node) => {
              const p = pos[node.id];
              if (!p) return null;
              const color = colColor(node.kind);
              const isSel = selectedId === node.id;
              const badge = node.kind === "rule" ? actionBadge(node) : null;
              return (
                <g key={node.id} style={{ cursor: "pointer" }} onClick={() => setSelectedId(isSel ? null : node.id)}>
                  <rect x={p.x} y={p.y} width={p.w} height={p.h} rx={7}
                    fill={isSel ? alpha(color, 0.2) : alpha(color, 0.08)}
                    stroke={isSel ? color : alpha(color, 0.25)} strokeWidth={isSel ? 2 : 1} />
                  <circle cx={p.x + 12} cy={p.y + p.h / 2} r={3.5}
                    fill={node.status === "error" ? "#ef4444" : node.status === "warning" ? "#f59e0b" : "#10b981"} />
                  <text x={p.x + 22} y={p.y + p.h / 2 + 4} fill={theme.palette.text.primary} fontSize={10} fontWeight={isSel ? 700 : 500}>
                    {truncate(node.label, 20)}
                  </text>
                  {badge && (
                    <>
                      <rect x={p.x + p.w - 42} y={p.y + 5} width={34} height={14} rx={3}
                        fill={alpha(badge.color, 0.15)} stroke={alpha(badge.color, 0.3)} strokeWidth={0.5} />
                      <text x={p.x + p.w - 25} y={p.y + 16} textAnchor="middle" fill={badge.color} fontSize={7} fontWeight={700}>
                        {badge.label}
                      </text>
                    </>
                  )}
                </g>
              );
            })}
          </svg>
        </Box>
      </Box>

      {selectedNode && (
        <Box sx={{ width: 280, flexShrink: 0 }}>
          <Card sx={{ borderRadius: 2, border: `1px solid ${theme.palette.divider}`, borderTop: `3px solid ${colColor(selectedNode.kind)}` }}>
            <CardContent sx={{ p: 2 }}>
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1 }}>
                <Typography variant="subtitle2" fontWeight={700}>{selectedNode.label}</Typography>
                <IconButton size="small" onClick={() => setSelectedId(null)}><CloseIcon fontSize="small" /></IconButton>
              </Box>
              <Chip label={selectedNode.kind} size="small" sx={{ mb: 1, backgroundColor: alpha(colColor(selectedNode.kind), 0.1), color: colColor(selectedNode.kind), fontWeight: 600, fontSize: "0.7rem" }} />
              {Object.entries(selectedNode.metadata || {}).map(([k, v]) => {
                if (typeof v === "object") return null;
                return (
                  <Box key={k} sx={{ display: "flex", justifyContent: "space-between", py: 0.3 }}>
                    <Typography variant="caption" color="text.secondary">{k.replace(/_/g, " ")}</Typography>
                    <Typography variant="caption" fontWeight={600} sx={{ maxWidth: "55%", wordBreak: "break-all", textAlign: "right" }}>
                      {String(v)}
                    </Typography>
                  </Box>
                );
              })}
            </CardContent>
          </Card>
        </Box>
      )}
    </Box>
  );
};

export default TopologyTab;
