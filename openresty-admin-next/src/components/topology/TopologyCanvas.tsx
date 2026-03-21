"use client";

/**
 * TopologyCanvas — ArgoCD-style visual canvas for WSLProxy.
 *
 * Layout (left → right):
 *   VirtualServer ──▶ Rule ──▶ Backend Origin
 *
 * SVG cubic-bezier edges connect nodes across columns. Clicking any node
 * opens a detail panel on the right. Health is colour-coded.
 *
 * Props:
 *   filterServerId — if set, only show this server and its rules/backends
 *   filterRuleId   — if set, show this rule, its server(s), and its backends
 */

import { useState, useMemo, useCallback, useEffect } from "react";
import { useDataProvider } from "@/hooks/useResource";
import {
  RefreshCw,
  ExternalLink,
  X,
  Globe,
  GitBranch,
  Server,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  Shield,
  Lock,
  Zap,
  ArrowRight,
  Network,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface TopologyNode {
  id: string;
  kind: "server" | "rule" | "backend";
  name: string;
  status: string;
  // Server fields
  ssl_enabled?: boolean;
  ssl_force_https?: boolean;
  waf_enabled?: boolean;
  rate_limit_enabled?: boolean;
  cache_enabled?: boolean;
  proxy_server_name?: string;
  listen_ports?: string[];
  rule_count?: number;
  custom_headers_count?: number;
  custom_response_headers_count?: number;
  // Rule fields
  action?: string;
  status_code?: number;
  priority?: number;
  path?: string;
  path_key?: string;
  conditions?: string[];
  condition_count?: number;
  has_backends?: boolean;
  auto_redirect_https?: boolean;
  strip_path?: boolean;
  // Backend fields
  address?: string;
  host?: string;
  port?: number;
  scheme?: string;
  backend_type?: string;
  weight?: number;
  stats?: Record<string, unknown>;
}

interface TopologyEdge {
  from: string;
  to: string;
  label?: string;
  weight?: number;
}

interface TopologyData {
  nodes: TopologyNode[];
  edges: TopologyEdge[];
  summary: {
    total_nodes: number;
    total_edges: number;
    servers: number;
    rules: number;
    backends: number;
    profile_id: string;
  };
}

interface TopologyCanvasProps {
  filterServerId?: string;
  filterRuleId?: string;
  compact?: boolean;
}

// ── Layout constants ──────────────────────────────────────────────────────────
const NW = 220;
const NH = 84;
const NY_GAP = 14;
const COL_GAP = 100;
const PAD_X = 32;
const PAD_Y = 48;

type ColKind = "server" | "rule" | "backend";
const COLUMNS: ColKind[] = ["server", "rule", "backend"];
const COL_LABELS: Record<ColKind, string> = {
  server: "Virtual Servers",
  rule: "Rules",
  backend: "Backend Origins",
};

interface LayoutNode {
  node: TopologyNode;
  x: number;
  y: number;
}

function buildLayout(nodes: TopologyNode[]): {
  layoutMap: Map<string, LayoutNode>;
  canvasW: number;
  canvasH: number;
} {
  const byCol: Record<ColKind, TopologyNode[]> = { server: [], rule: [], backend: [] };
  for (const n of nodes) byCol[n.kind].push(n);

  const layoutMap = new Map<string, LayoutNode>();

  COLUMNS.forEach((col, ci) => {
    const x = PAD_X + ci * (NW + COL_GAP);
    byCol[col].forEach((node, ri) => {
      const y = PAD_Y + ri * (NH + NY_GAP);
      layoutMap.set(node.id, { node, x, y });
    });
  });

  const maxRows = Math.max(...COLUMNS.map((c) => byCol[c].length), 1);
  const canvasH = PAD_Y * 2 + maxRows * (NH + NY_GAP);
  const canvasW = PAD_X * 2 + COLUMNS.length * NW + (COLUMNS.length - 1) * COL_GAP;

  return { layoutMap, canvasW, canvasH };
}

function edgePath(fx: number, fy: number, tx: number, ty: number): string {
  const mx = (fx + tx) / 2;
  return `M ${fx} ${fy} C ${mx} ${fy}, ${mx} ${ty}, ${tx} ${ty}`;
}

// ── Colour helpers ────────────────────────────────────────────────────────────

const KIND_COLORS: Record<string, string> = {
  server: "#0ea5e9",
  rule: "#8b5cf6",
  backend: "#10b981",
};

function kindColor(kind: string): string {
  return KIND_COLORS[kind] ?? "#6b7280";
}

function statusColor(status: string): string {
  switch (status) {
    case "healthy": return "#22c55e";
    case "degraded": return "#ef4444";
    case "pending": return "#f59e0b";
    default: return "#6b7280";
  }
}

function StatusIcon({ status, size = 12 }: { status: string; size?: number }) {
  const s = { width: size, height: size };
  switch (status) {
    case "healthy": return <CheckCircle2 style={s} className="shrink-0 text-green-400" />;
    case "degraded": return <AlertTriangle style={s} className="shrink-0 text-red-400" />;
    default: return <HelpCircle style={s} className="shrink-0 text-gray-400" />;
  }
}

function KindIcon({ kind, size = 14 }: { kind: string; size?: number }) {
  const s = { width: size, height: size };
  switch (kind) {
    case "server": return <Globe className="shrink-0" style={s} />;
    case "rule": return <GitBranch className="shrink-0" style={s} />;
    case "backend": return <Server className="shrink-0" style={s} />;
    default: return <HelpCircle className="shrink-0" style={s} />;
  }
}

function actionBadgeColor(action: string): string {
  switch (action) {
    case "proxy": return "#10b981";
    case "redirect_permanent":
    case "redirect_temporary": return "#f59e0b";
    case "block": return "#ef4444";
    case "captcha": return "#8b5cf6";
    case "static_content": return "#0ea5e9";
    default: return "#6b7280";
  }
}

function actionLabel(action: string): string {
  switch (action) {
    case "proxy": return "PROXY";
    case "redirect_permanent": return "301";
    case "redirect_temporary": return "302";
    case "block": return "403";
    case "captcha": return "CAPTCHA";
    case "static_content": return "200";
    default: return action?.toUpperCase() ?? "?";
  }
}

// ── Node Card ─────────────────────────────────────────────────────────────────

function NodeCard({
  node,
  selected,
  onClick,
}: {
  node: TopologyNode;
  selected: boolean;
  onClick: () => void;
}) {
  const accent = kindColor(node.kind);
  const border = selected ? accent : "rgba(255,255,255,0.1)";

  return (
    <div
      onClick={onClick}
      title={node.name}
      style={{
        width: NW,
        height: NH,
        border: `1.5px solid ${border}`,
        boxShadow: selected ? `0 0 0 2px ${accent}55` : undefined,
      }}
      className="absolute bg-[#0f1117] rounded-lg cursor-pointer hover:brightness-125 transition-all select-none overflow-hidden"
    >
      <div style={{ height: 3, background: accent }} />
      <div className="px-3 pt-2 pb-1 flex flex-col gap-1">
        {/* Kind badge + status */}
        <div className="flex items-center gap-1.5">
          <span
            className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
            style={{ color: accent, background: accent + "22" }}
          >
            {node.kind}
          </span>
          <StatusIcon status={node.status} size={11} />
          {node.kind === "server" && node.ssl_enabled && (
            <Lock className="w-3 h-3 text-green-400" />
          )}
          {node.kind === "server" && node.waf_enabled && (
            <Shield className="w-3 h-3 text-amber-400" />
          )}
          {node.kind === "rule" && node.action && (
            <span
              className="text-[9px] font-bold px-1 rounded"
              style={{
                color: actionBadgeColor(node.action),
                background: actionBadgeColor(node.action) + "22",
              }}
            >
              {actionLabel(node.action)}
            </span>
          )}
        </div>

        {/* Name */}
        <p className="text-white text-xs font-semibold truncate leading-tight">
          {node.name}
        </p>

        {/* Sub-line */}
        <div className="text-[10px] text-gray-400 truncate leading-tight">
          {node.kind === "server" && (
            <>
              {node.listen_ports?.join(", ") ?? "80"}
              {node.rule_count !== undefined && (
                <span className="ml-1">
                  · {node.rule_count} rule{node.rule_count !== 1 ? "s" : ""}
                </span>
              )}
            </>
          )}
          {node.kind === "rule" && (
            <>
              {node.path_key ?? "starts_with"} <span className="text-sky-300 font-mono">{node.path ?? "/"}</span>
              {node.priority !== undefined && node.priority > 0 && (
                <span className="ml-1 text-amber-400">P{node.priority}</span>
              )}
            </>
          )}
          {node.kind === "backend" && (
            <>
              <span className="font-mono">{node.host}:{node.port}</span>
              {node.scheme === "https" && <Lock className="w-2.5 h-2.5 inline ml-1 text-green-400" />}
              {node.weight !== undefined && (
                <span className="ml-1 text-amber-300">W:{node.weight}</span>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Detail Panel ──────────────────────────────────────────────────────────────

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-gray-500 shrink-0 w-28">{label}</span>
      <span className="text-gray-200 break-all flex-1">{children}</span>
    </div>
  );
}

function DetailPanel({
  node,
  onClose,
}: {
  node: TopologyNode;
  onClose: () => void;
}) {
  const accent = kindColor(node.kind);

  return (
    <div className="w-80 shrink-0 bg-[#0f1117] border-l border-white/10 flex flex-col">
      <div
        className="flex items-center justify-between px-4 py-3 border-b"
        style={{ borderColor: accent + "55" }}
      >
        <div className="flex items-center gap-2">
          <KindIcon kind={node.kind} size={16} />
          <span className="font-bold text-white text-sm truncate max-w-[180px]">
            {node.name}
          </span>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-white p-1 rounded hover:bg-white/10"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 text-xs">
        <Row label="Status">
          <span className="flex items-center gap-1.5">
            <StatusIcon status={node.status} size={11} />
            <span className="capitalize">{node.status}</span>
          </span>
        </Row>
        <Row label="Kind">
          <span style={{ color: accent }} className="capitalize">{node.kind}</span>
        </Row>

        {/* Server details */}
        {node.kind === "server" && (
          <>
            <Row label="Ports">{node.listen_ports?.join(", ") ?? "80"}</Row>
            <Row label="SSL">{node.ssl_enabled ? "Enabled" : "Disabled"}</Row>
            {node.ssl_force_https && <Row label="Force HTTPS">Yes</Row>}
            <Row label="WAF">{node.waf_enabled ? "Enabled" : "Disabled"}</Row>
            <Row label="Rate Limit">{node.rate_limit_enabled ? "Enabled" : "Disabled"}</Row>
            <Row label="Cache">{node.cache_enabled ? "Enabled" : "Disabled"}</Row>
            {node.proxy_server_name && (
              <Row label="Proxy Host">{node.proxy_server_name}</Row>
            )}
            <Row label="Rules">{node.rule_count ?? 0}</Row>
            {(node.custom_headers_count ?? 0) > 0 && (
              <Row label="Custom Headers">{node.custom_headers_count}</Row>
            )}
          </>
        )}

        {/* Rule details */}
        {node.kind === "rule" && (
          <>
            <Row label="Action">
              <span
                className="font-bold"
                style={{ color: actionBadgeColor(node.action ?? "") }}
              >
                {actionLabel(node.action ?? "")}
              </span>
            </Row>
            <Row label="Status Code">{node.status_code}</Row>
            <Row label="Path">
              <span className="font-mono text-sky-300">{node.path ?? "/"}</span>
            </Row>
            <Row label="Match">{node.path_key ?? "starts_with"}</Row>
            <Row label="Priority">{node.priority ?? 0}</Row>
            {node.conditions && node.conditions.length > 0 && (
              <Row label="Conditions">
                <div className="flex flex-wrap gap-1">
                  {node.conditions.map((c) => (
                    <span
                      key={c}
                      className="bg-white/5 rounded px-1.5 py-0.5 font-mono text-[10px] text-gray-300"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              </Row>
            )}
            {node.auto_redirect_https && <Row label="Auto HTTPS">Yes</Row>}
            {node.strip_path && <Row label="Strip Path">Yes</Row>}
          </>
        )}

        {/* Backend details */}
        {node.kind === "backend" && (
          <>
            <Row label="Address">
              <span className="font-mono">{node.address}</span>
            </Row>
            <Row label="Host">{node.host}</Row>
            <Row label="Port">{node.port}</Row>
            <Row label="Scheme">{node.scheme}</Row>
            <Row label="Type">
              <span className="capitalize">{node.backend_type}</span>
            </Row>
            {node.path && <Row label="Path">{node.path}</Row>}
            {node.weight !== undefined && <Row label="Weight">{node.weight}</Row>}
            {node.stats && Object.keys(node.stats).length > 0 && (
              <div>
                <p className="text-gray-500 uppercase tracking-wider text-[10px] mb-1.5 mt-2">
                  Stats
                </p>
                {Object.entries(node.stats).map(([k, v]) => (
                  <Row key={k} label={k}>
                    {String(v)}
                  </Row>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Column Header ─────────────────────────────────────────────────────────────

function ColHeader({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest" style={{ color }}>
      {label}
      {count > 0 && (
        <span
          className="text-[9px] rounded-full px-1.5 py-0.5 font-mono"
          style={{ background: color + "28", color }}
        >
          {count}
        </span>
      )}
    </div>
  );
}

// ── Legend ─────────────────────────────────────────────────────────────────────

function Legend() {
  return (
    <div className="flex items-center gap-4 px-4 py-2 border-t border-white/10 text-[10px] text-gray-500 flex-wrap">
      {Object.entries(KIND_COLORS).map(([kind, color]) => (
        <span key={kind} className="flex items-center gap-1 capitalize">
          <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: color }} />
          {kind}
        </span>
      ))}
      <span className="ml-auto flex items-center gap-3">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> Healthy
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> Degraded
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-gray-500 inline-block" /> Unknown
        </span>
      </span>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function TopologyCanvas({ filterServerId, filterRuleId, compact }: TopologyCanvasProps) {
  const dp = useDataProvider();
  const [data, setData] = useState<TopologyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<TopologyNode | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await dp.getTopologyGraph();
      setData((result?.data as TopologyData) ?? null);
    } catch (err) {
      setError("Failed to load topology");
    } finally {
      setLoading(false);
    }
  }, [dp]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Filter nodes/edges if filterServerId or filterRuleId is set
  const { filteredNodes, filteredEdges } = useMemo(() => {
    if (!data) return { filteredNodes: [], filteredEdges: [] };

    let nodes = data.nodes;
    let edges = data.edges;

    if (filterServerId) {
      const serverId = "server/" + filterServerId;
      // Find rules connected to this server
      const ruleIds = new Set(
        edges.filter((e) => e.from === serverId).map((e) => e.to),
      );
      // Find backends connected to those rules
      const backendIds = new Set(
        edges.filter((e) => ruleIds.has(e.from)).map((e) => e.to),
      );
      const keepIds = new Set([serverId, ...ruleIds, ...backendIds]);
      nodes = nodes.filter((n) => keepIds.has(n.id));
      edges = edges.filter((e) => keepIds.has(e.from) && keepIds.has(e.to));
    } else if (filterRuleId) {
      const ruleId = "rule/" + filterRuleId;
      // Find servers connected to this rule
      const serverIds = new Set(
        edges.filter((e) => e.to === ruleId).map((e) => e.from),
      );
      // Find backends connected to this rule
      const backendIds = new Set(
        edges.filter((e) => e.from === ruleId).map((e) => e.to),
      );
      const keepIds = new Set([ruleId, ...serverIds, ...backendIds]);
      nodes = nodes.filter((n) => keepIds.has(n.id));
      edges = edges.filter((e) => keepIds.has(e.from) && keepIds.has(e.to));
    }

    return { filteredNodes: nodes, filteredEdges: edges };
  }, [data, filterServerId, filterRuleId]);

  const { layoutMap, canvasW, canvasH } = useMemo(() => {
    if (filteredNodes.length === 0)
      return { layoutMap: new Map<string, LayoutNode>(), canvasW: 900, canvasH: 200 };
    return buildLayout(filteredNodes);
  }, [filteredNodes]);

  const svgEdges = useMemo(() => {
    if (filteredEdges.length === 0) return [];
    return filteredEdges.flatMap((e) => {
      const src = layoutMap.get(e.from);
      const tgt = layoutMap.get(e.to);
      if (!src || !tgt) return [];
      const fx = src.x + NW;
      const fy = src.y + NH / 2;
      const tx = tgt.x;
      const ty = tgt.y + NH / 2;
      return [
        {
          path: edgePath(fx, fy, tx, ty),
          key: e.from + "->" + e.to,
          label: e.label,
          weight: e.weight,
          from: e.from,
          to: e.to,
        },
      ];
    });
  }, [filteredEdges, layoutMap]);

  const counts = useMemo(() => {
    const c: Record<ColKind, number> = { server: 0, rule: 0, backend: 0 };
    filteredNodes.forEach((n) => { c[n.kind]++; });
    return c;
  }, [filteredNodes]);

  return (
    <div
      className={`flex flex-col bg-[#080a0f] rounded-lg border border-white/10 overflow-hidden ${
        compact ? "h-[400px]" : "h-full"
      }`}
    >
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-white/10 shrink-0">
        <Network className="w-4 h-4 text-sky-400" />
        <span className="text-sm font-bold text-white tracking-wide">
          {filterServerId
            ? "Server Topology"
            : filterRuleId
            ? "Rule Topology"
            : "Service Topology"}
        </span>
        {data?.summary && (
          <span className="text-[10px] text-gray-500 ml-2">
            {data.summary.servers} servers · {data.summary.rules} rules · {data.summary.backends} backends
          </span>
        )}
        <button
          onClick={fetchData}
          className="ml-auto p-1.5 rounded hover:bg-white/10 text-gray-400 hover:text-white"
          title="Refresh"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Canvas + detail panel */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <div className="flex-1 overflow-auto p-4">
          {loading && (
            <div className="flex items-center justify-center h-40 text-gray-500 text-sm">
              Loading topology...
            </div>
          )}
          {error && (
            <div className="flex items-center justify-center h-40 text-red-400 text-sm">
              {error}
            </div>
          )}
          {!loading && !error && filteredNodes.length === 0 && (
            <div className="flex items-center justify-center h-40 text-gray-500 text-sm">
              No topology data found.
            </div>
          )}
          {!loading && !error && filteredNodes.length > 0 && (
            <div
              style={{ position: "relative", width: canvasW, height: canvasH }}
              className="select-none"
            >
              {/* Column headers */}
              {COLUMNS.map((col, ci) => {
                const x = PAD_X + ci * (NW + COL_GAP);
                return (
                  <div key={col} style={{ position: "absolute", left: x, top: 8, width: NW }}>
                    <ColHeader label={COL_LABELS[col]} count={counts[col]} color={KIND_COLORS[col]} />
                  </div>
                );
              })}

              {/* SVG edge layer */}
              <svg
                style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "visible" }}
                width={canvasW}
                height={canvasH}
              >
                {svgEdges.map(({ path, key }) => (
                  <path
                    key={key}
                    d={path}
                    fill="none"
                    stroke="rgba(255,255,255,0.12)"
                    strokeWidth={1.5}
                  />
                ))}
                {/* Highlighted edges for selected node */}
                {selected &&
                  filteredEdges
                    .filter((e) => e.from === selected.id || e.to === selected.id)
                    .flatMap((e) => {
                      const src = layoutMap.get(e.from);
                      const tgt = layoutMap.get(e.to);
                      if (!src || !tgt) return [];
                      const fx = src.x + NW;
                      const fy = src.y + NH / 2;
                      const tx = tgt.x;
                      const ty = tgt.y + NH / 2;
                      const col = kindColor(selected.kind);
                      return [
                        <path
                          key={e.from + "->" + e.to + "-hl"}
                          d={edgePath(fx, fy, tx, ty)}
                          fill="none"
                          stroke={col}
                          strokeWidth={2.5}
                          opacity={0.7}
                        />,
                      ];
                    })}
                {/* Edge weight labels */}
                {svgEdges.map(({ key, path, weight, label }) => {
                  if (!weight && !label) return null;
                  const src = layoutMap.get(key.split("->")[0]);
                  const tgt = layoutMap.get(key.split("->")[1]);
                  if (!src || !tgt) return null;
                  const mx = (src.x + NW + tgt.x) / 2;
                  const my = (src.y + NH / 2 + tgt.y + NH / 2) / 2;
                  return (
                    <text
                      key={key + "-label"}
                      x={mx}
                      y={my - 6}
                      fill="rgba(255,255,255,0.35)"
                      fontSize={9}
                      textAnchor="middle"
                    >
                      {weight && weight < 100 ? `W:${weight}` : ""}
                    </text>
                  );
                })}
              </svg>

              {/* Node cards */}
              {filteredNodes.map((node) => {
                const ln = layoutMap.get(node.id);
                if (!ln) return null;
                return (
                  <div key={node.id} style={{ position: "absolute", left: ln.x, top: ln.y + 20 }}>
                    <NodeCard
                      node={node}
                      selected={selected?.id === node.id}
                      onClick={() => setSelected((prev) => (prev?.id === node.id ? null : node))}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Detail panel */}
        {selected && <DetailPanel node={selected} onClose={() => setSelected(null)} />}
      </div>

      <Legend />
    </div>
  );
}
