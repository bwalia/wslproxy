import {
  Grid,
  Box,
  Card,
  Typography,
  useTheme,
  alpha,
  IconButton,
  Tooltip,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
} from "@mui/material";
import React from "react";
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
} from "recharts";
import { useDataProvider, useNotify } from "react-admin";
import ServerIcon from "@mui/icons-material/DnsRounded";
import RuleIcon from "@mui/icons-material/RuleRounded";
import UserIcon from "@mui/icons-material/GroupRounded";
import TrendingUpIcon from "@mui/icons-material/TrendingUpRounded";
import TrendingDownIcon from "@mui/icons-material/TrendingDownRounded";
import RefreshIcon from "@mui/icons-material/RefreshRounded";
import SecurityIcon from "@mui/icons-material/SecurityRounded";
import HttpIcon from "@mui/icons-material/HttpRounded";
import ErrorIcon from "@mui/icons-material/ErrorOutlineRounded";
import SpeedIcon from "@mui/icons-material/SpeedRounded";
import StorageIcon from "@mui/icons-material/StorageRounded";
import LanguageIcon from "@mui/icons-material/LanguageRounded";
import DataUsageIcon from "@mui/icons-material/DataUsageRounded";
import MemoryIcon from "@mui/icons-material/MemoryRounded";
import InsertDriveFileIcon from "@mui/icons-material/InsertDriveFileRounded";
import ShieldIcon from "@mui/icons-material/ShieldRounded";
import VerifiedUserIcon from "@mui/icons-material/VerifiedUserRounded";
import NotificationsActiveIcon from "@mui/icons-material/NotificationsActiveRounded";
import BlockIcon from "@mui/icons-material/BlockRounded";

import StorageModal from "./StorageModal";
import Logs from "../component/Logs";
import Welcome from "../component/Welcome";
import GeoTrafficMap from "./GeoTrafficMap";
import { useThemeMode } from "../Theme";
import PublicIcon from "@mui/icons-material/PublicRounded";

// Format bytes to human readable
const formatBytes = (bytes, decimals = 2) => {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
};

// Format large numbers
const formatNumber = (num) => {
  if (!num) return "0";
  if (num >= 1000000) return (num / 1000000).toFixed(1) + "M";
  if (num >= 1000) return (num / 1000).toFixed(1) + "K";
  return num.toString();
};

// Stat Card Component - Enhanced design
const StatCard = ({
  title,
  value,
  icon: Icon,
  color,
  trend,
  trendDirection = "up",
  subtitle,
  large = false,
}) => {
  const theme = useTheme();
  const { mode } = useThemeMode();
  const isDark = mode === "dark";

  const isPositiveTrend = trendDirection === "up";
  const TrendIcon = isPositiveTrend ? TrendingUpIcon : TrendingDownIcon;
  const trendColor = isPositiveTrend
    ? theme.palette.success.main
    : theme.palette.error.main;

  return (
    <Card
      sx={{
        p: 0,
        height: "100%",
        minHeight: large ? 180 : 140,
        display: "flex",
        flexDirection: "column",
        position: "relative",
        overflow: "hidden",
        background: isDark
          ? `linear-gradient(145deg, ${alpha(color, 0.12)} 0%, ${alpha(theme.palette.background.paper, 0.95)} 100%)`
          : `linear-gradient(145deg, ${alpha(color, 0.06)} 0%, ${theme.palette.background.paper} 100%)`,
        border: `1px solid ${isDark ? alpha(color, 0.2) : alpha(color, 0.12)}`,
        borderRadius: 4,
        transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
        "&:hover": {
          transform: "translateY(-6px)",
          boxShadow: isDark
            ? `0 20px 40px ${alpha(color, 0.25)}, 0 0 0 1px ${alpha(color, 0.25)}`
            : `0 20px 40px ${alpha(color, 0.18)}, 0 0 0 1px ${alpha(color, 0.15)}`,
          borderColor: alpha(color, 0.4),
          "& .stat-icon-box": {
            transform: "scale(1.05)",
            boxShadow: `0 12px 28px ${alpha(color, 0.5)}`,
          },
        },
      }}
    >
      {/* Decorative gradient overlay */}
      <Box
        sx={{
          position: "absolute",
          top: 0,
          right: 0,
          width: "60%",
          height: "100%",
          background: `radial-gradient(circle at top right, ${alpha(color, 0.12)} 0%, transparent 70%)`,
          pointerEvents: "none",
        }}
      />

      {/* Bottom decorative bar */}
      <Box
        sx={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 4,
          background: `linear-gradient(90deg, ${color}, ${alpha(color, 0.3)})`,
          opacity: 0.6,
        }}
      />

      <Box
        sx={{
          p: large ? 3 : 2.5,
          flex: 1,
          display: "flex",
          flexDirection: "column",
          position: "relative",
          zIndex: 1,
        }}
      >
        {/* Header with icon */}
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            mb: large ? 2 : 1.5,
          }}
        >
          <Box
            className="stat-icon-box"
            sx={{
              width: large ? 56 : 48,
              height: large ? 56 : 48,
              borderRadius: 3,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: `linear-gradient(135deg, ${color} 0%, ${alpha(color, 0.75)} 100%)`,
              color: "#fff",
              boxShadow: `0 8px 24px ${alpha(color, 0.4)}`,
              transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
            }}
          >
            <Icon sx={{ fontSize: large ? 28 : 24 }} />
          </Box>
          {trend && (
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 0.5,
                px: 1.25,
                py: 0.5,
                borderRadius: 2,
                backgroundColor: alpha(trendColor, 0.12),
                color: trendColor,
                border: `1px solid ${alpha(trendColor, 0.2)}`,
              }}
            >
              <TrendIcon sx={{ fontSize: 14 }} />
              <Typography variant="caption" fontWeight={700} fontSize="0.7rem">
                {trend}
              </Typography>
            </Box>
          )}
        </Box>

        {/* Value */}
        <Typography
          variant="h4"
          sx={{
            fontWeight: 800,
            color: theme.palette.text.primary,
            mb: 0.5,
            fontSize: large
              ? { xs: "1.75rem", sm: "2.25rem" }
              : { xs: "1.5rem", sm: "1.85rem" },
            letterSpacing: "-0.02em",
            lineHeight: 1.1,
            background: isDark
              ? `linear-gradient(135deg, ${theme.palette.text.primary} 0%, ${alpha(color, 0.9)} 100%)`
              : "none",
            backgroundClip: isDark ? "text" : "unset",
            WebkitBackgroundClip: isDark ? "text" : "unset",
            WebkitTextFillColor: isDark ? "transparent" : "unset",
          }}
        >
          {value}
        </Typography>

        {/* Title */}
        <Typography
          variant="body2"
          sx={{
            color: theme.palette.text.secondary,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            fontSize: large ? "0.75rem" : "0.7rem",
          }}
        >
          {title}
        </Typography>

        {/* Subtitle */}
        {subtitle && (
          <Typography
            variant="caption"
            sx={{
              color: alpha(theme.palette.text.secondary, 0.7),
              mt: "auto",
              pt: 1,
              fontSize: "0.7rem",
            }}
          >
            {subtitle}
          </Typography>
        )}
      </Box>
    </Card>
  );
};

// Chart Card Component - Enhanced
const ChartCard = ({
  title,
  subtitle,
  children,
  onRefresh,
  height = "auto",
  accentColor,
}) => {
  const theme = useTheme();
  const { mode } = useThemeMode();
  const isDark = mode === "dark";
  const accent = accentColor || theme.palette.primary.main;

  return (
    <Card
      sx={{
        height: height,
        border: `1px solid ${isDark ? alpha(theme.palette.divider, 0.5) : theme.palette.divider}`,
        borderRadius: 3,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        transition: "all 0.3s ease",
        "&:hover": {
          boxShadow: isDark
            ? `0 8px 24px ${alpha("#000", 0.3)}`
            : `0 8px 24px ${alpha("#000", 0.08)}`,
        },
      }}
    >
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          px: 2.5,
          py: 2,
          borderBottom: `1px solid ${theme.palette.divider}`,
          backgroundColor: isDark
            ? alpha(theme.palette.background.paper, 0.5)
            : theme.palette.grey[50],
          position: "relative",
          "&::before": {
            content: '""',
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: 3,
            background: `linear-gradient(180deg, ${accent}, ${alpha(accent, 0.3)})`,
            borderRadius: "0 2px 2px 0",
          },
        }}
      >
        <Box sx={{ pl: 1 }}>
          <Typography
            variant="subtitle1"
            fontWeight={700}
            color="text.primary"
            sx={{ mb: 0.25 }}
          >
            {title}
          </Typography>
          {subtitle && (
            <Typography
              variant="caption"
              color="text.secondary"
              fontSize="0.7rem"
            >
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
                "&:hover": {
                  backgroundColor: alpha(accent, 0.15),
                  color: accent,
                },
                transition: "all 0.2s ease",
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

// Custom Legend Component
const CustomLegend = ({ payload }) => {
  return (
    <Box sx={{ display: "flex", justifyContent: "center", gap: 3, mt: 1 }}>
      {payload?.map((entry, index) => (
        <Box
          key={index}
          sx={{ display: "flex", alignItems: "center", gap: 0.75 }}
        >
          <Box
            sx={{
              width: 10,
              height: 10,
              borderRadius: "50%",
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

const Dashboard = () => {
  const storageManagement = localStorage.getItem("storageManagement");
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const theme = useTheme();
  const { mode } = useThemeMode();
  const isDark = mode === "dark";

  const [errorLogData, setErrorLogData] = React.useState({});
  const [accessLogData, setAccessLogData] = React.useState({});
  const [trafficData, setTrafficData] = React.useState([]);
  const [trafficSummary, setTrafficSummary] = React.useState({
    total_requests_24h: 0,
    total_success_24h: 0,
    total_errors_24h: 0,
    total_bandwidth_24h: 0,
    success_rate: 0,
    avg_requests_per_hour: 0,
  });
  const [topDomains, setTopDomains] = React.useState([]);
  const [errorCodes, setErrorCodes] = React.useState([]);
  const [latencyData, setLatencyData] = React.useState({});
  const [methodsData, setMethodsData] = React.useState({});
  const [geoData, setGeoData] = React.useState([]);
  const [logMetrics, setLogMetrics] = React.useState({
    available: false,
    metrics: {},
  });
  const [stats, setStats] = React.useState({
    servers: 0,
    rules: 0,
    users: 0,
    profiles: 0,
  });

  // Error details modal state
  const [errorModalOpen, setErrorModalOpen] = React.useState(false);
  const [selectedErrorCode, setSelectedErrorCode] = React.useState(null);
  const [errorDetails, setErrorDetails] = React.useState([]);
  const [loadingErrorDetails, setLoadingErrorDetails] = React.useState(false);

  // Instance info state
  const [instanceInfo, setInstanceInfo] = React.useState({
    hostname: "Loading...",
    ip_addresses: [],
    os: "Loading...",
    cpu: { model: "Loading...", cores: "Loading...", usage_percent: "0" },
    memory: {
      total: "Loading...",
      used: "Loading...",
      available: "Loading...",
      free: "Loading...",
    },
    disk: {
      total: "Loading...",
      used: "Loading...",
      available: "Loading...",
      percent: "0%",
    },
    uptime: "Loading...",
  });

  // Cache stats state
  const [cacheStats, setCacheStats] = React.useState({
    available: false,
    total_entries: 0,
    total_size_bytes: 0,
    entries_by_host: [],
    entries_by_extension: [],
    top_urls: [],
  });

  // WAF stats state
  const [wafStats, setWafStats] = React.useState({
    totalRules: 0,
    totalPolicies: 0,
    recentEvents: 0,
    blockedEvents: 0,
  });

  const fetchErrorLogs = React.useCallback(() => {
    const logs = dataProvider.getLogs("openresty/error_logs");
    logs.then((log) => {
      setErrorLogData(log?.data?.logs);
    });
    logs.catch((error) => notify(error, { type: "error" }));
  }, [dataProvider, notify]);

  const fetchAccessLogs = React.useCallback(() => {
    const accessLogs = dataProvider.getLogs("openresty/access_logs");
    accessLogs.then((log) => {
      setAccessLogData(log?.data?.logs);
    });
    accessLogs.catch((error) => notify(error, { type: "error" }));
  }, [dataProvider, notify]);

  const fetchTrafficStats = React.useCallback(() => {
    dataProvider
      .getTrafficStats()
      .then((response) => {
        const data = response?.data || {};

        // Traffic chart data - ensure it's always an array
        const chartData = Array.isArray(data.chart_data) ? data.chart_data : [];
        const transformedData = chartData.map((item) => ({
          name: item.name,
          uv: item.requests || 0,
          pv: item.responses || 0,
          errors: item.errors || 0,
          bandwidth: item.bandwidth || 0,
        }));
        setTrafficData(transformedData);

        // Summary - ensure it's always an object
        setTrafficSummary(
          data.summary && typeof data.summary === "object" ? data.summary : {},
        );

        // Top domains - ensure it's always an array
        setTopDomains(Array.isArray(data.top_domains) ? data.top_domains : []);

        // Error codes - ensure it's always an array
        setErrorCodes(Array.isArray(data.error_codes) ? data.error_codes : []);

        // Latency distribution
        setLatencyData(data.latency || {});

        // Methods distribution
        setMethodsData(data.methods || {});

        // Geographic data
        setGeoData(Array.isArray(data.geo_data) ? data.geo_data : []);
      })
      .catch((error) => {
        console.log("Failed to fetch traffic stats:", error);
      });
  }, [dataProvider]);

  const fetchLogMetrics = React.useCallback(() => {
    dataProvider
      .getLogMetrics()
      .then((response) => {
        const data = response?.data || {};
        setLogMetrics({
          available: data.available || false,
          metrics: data.metrics || {},
          message: data.message || "",
        });
      })
      .catch((error) => {
        console.log("Failed to fetch log metrics:", error);
        setLogMetrics({ available: false, metrics: {} });
      });
  }, [dataProvider]);

  const fetchInstanceInfo = React.useCallback(() => {
    dataProvider
      .getInstanceInfo()
      .then((response) => {
        const data = response?.data || {};
        setInstanceInfo(data);
      })
      .catch((error) => {
        console.log("Failed to fetch instance info:", error);
      });
  }, [dataProvider]);

  const fetchCacheStats = React.useCallback(() => {
    dataProvider
      .getCacheStats()
      .then((response) => {
        const data = response?.data || {};
        setCacheStats({
          available: data.available !== false,
          total_entries: data.total_entries || 0,
          total_size_bytes: data.total_size_bytes || 0,
          entries_by_host: data.entries_by_host || [],
          entries_by_extension: data.entries_by_extension || [],
          top_urls: data.top_urls || [],
        });
      })
      .catch((error) => {
        console.log("Failed to fetch cache stats:", error);
        setCacheStats({
          available: false,
          total_entries: 0,
          total_size_bytes: 0,
        });
      });
  }, [dataProvider]);

  // Fetch error details when clicking on an error code
  const handleErrorCodeClick = React.useCallback(
    (errorCode) => {
      setSelectedErrorCode(errorCode);
      setErrorModalOpen(true);
      setLoadingErrorDetails(true);
      setErrorDetails([]);

      dataProvider
        .getErrorDetails(errorCode)
        .then((response) => {
          const errors = response?.data?.errors || [];
          setErrorDetails(errors);
          setLoadingErrorDetails(false);
        })
        .catch((error) => {
          console.log("Failed to fetch error details:", error);
          setLoadingErrorDetails(false);
        });
    },
    [dataProvider],
  );

  const handleCloseErrorModal = () => {
    setErrorModalOpen(false);
    setSelectedErrorCode(null);
    setErrorDetails([]);
  };

  React.useEffect(() => {
    fetchErrorLogs();
    fetchAccessLogs();
    fetchTrafficStats();
    fetchLogMetrics();
    fetchInstanceInfo();
    fetchCacheStats();

    // Fetch entity counts
    Promise.all([
      dataProvider.getList("servers", {
        pagination: { page: 1, perPage: 1 },
        sort: { field: "id", order: "ASC" },
        filter: {},
      }),
      dataProvider.getList("rules", {
        pagination: { page: 1, perPage: 1 },
        sort: { field: "id", order: "ASC" },
        filter: {},
      }),
      dataProvider.getList("users", {
        pagination: { page: 1, perPage: 1 },
        sort: { field: "id", order: "ASC" },
        filter: {},
      }),
      dataProvider.getList("profiles", {
        pagination: { page: 1, perPage: 1 },
        sort: { field: "id", order: "ASC" },
        filter: {},
      }),
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
      dataProvider.getList("waf_rules", {
        pagination: { page: 1, perPage: 1 },
        sort: { field: "id", order: "ASC" },
        filter: {},
      }),
      dataProvider.getList("waf_policies", {
        pagination: { page: 1, perPage: 1 },
        sort: { field: "id", order: "ASC" },
        filter: {},
      }),
      dataProvider.getList("waf_events", {
        pagination: { page: 1, perPage: 1 },
        sort: { field: "id", order: "ASC" },
        filter: {},
      }),
      dataProvider.getList("waf_events", {
        pagination: { page: 1, perPage: 1 },
        sort: { field: "id", order: "ASC" },
        filter: { type: "blocked" },
      }),
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

    // Auto-refresh traffic data every 60 seconds
    const trafficInterval = setInterval(fetchTrafficStats, 60000);
    return () => clearInterval(trafficInterval);
  }, []);

  // Prepare pie chart data
  const latency = latencyData || {};
  const latencyChartData = [
    {
      name: "< 100ms",
      value: latency.fast || 0,
      color: theme.palette.success.main,
    },
    {
      name: "100-500ms",
      value: latency.normal || 0,
      color: theme.palette.info.main,
    },
    {
      name: "500ms-1s",
      value: latency.slow || 0,
      color: theme.palette.warning.main,
    },
    {
      name: "> 1s",
      value: latency.very_slow || 0,
      color: theme.palette.error.main,
    },
  ].filter((d) => d.value > 0);

  const methodsChartData = Object.entries(methodsData || {})
    .map(([method, count]) => ({
      name: method,
      value: count,
    }))
    .filter((d) => d.value > 0);

  const METHODS_COLORS = {
    GET: theme.palette.primary.main,
    POST: theme.palette.success.main,
    PUT: theme.palette.warning.main,
    DELETE: theme.palette.error.main,
    PATCH: theme.palette.info.main,
    OPTIONS: theme.palette.grey[500],
    HEAD: theme.palette.secondary.main,
  };

  return (
    <Box
      sx={{
        width: "100%",
        maxWidth: "100%",
        minHeight: "100vh",
        boxSizing: "border-box",
      }}
    >
      {/* Welcome Section */}
      <Box sx={{ mb: 2, width: "100%" }}>
        <Welcome instanceInfo={instanceInfo} />
      </Box>

      {/* Traffic Stats Cards - Large prominent cards */}
      <Box
        sx={{
          display: "flex",
          flexWrap: "wrap",
          gap: 3,
          mb: 4,
          width: "100%",
          "& > *": {
            flex: {
              xs: "1 1 calc(50% - 12px)",
              sm: "1 1 calc(50% - 12px)",
              md: "1 1 calc(33.333% - 16px)",
              lg: "1 1 calc(16.666% - 20px)",
            },
            minWidth: {
              xs: "calc(50% - 12px)",
              sm: "calc(50% - 12px)",
              md: "calc(33.333% - 16px)",
              lg: "calc(16.666% - 20px)",
            },
            maxWidth: {
              xs: "calc(50% - 12px)",
              sm: "calc(50% - 12px)",
              md: "calc(33.333% - 16px)",
              lg: "calc(16.666% - 20px)",
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

      {/* Geographic Traffic Map - Full Width */}
      <Box sx={{ mb: 4, width: "100%" }}>
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
            <Box
              sx={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                height: "100%",
                gap: 1.5,
              }}
            >
              <Box
                sx={{
                  width: 64,
                  height: 64,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: alpha(theme.palette.primary.main, 0.1),
                }}
              >
                <PublicIcon
                  sx={{ fontSize: 32, color: theme.palette.primary.main }}
                />
              </Box>
              <Typography
                variant="body2"
                color="text.secondary"
                fontWeight={500}
              >
                No geographic data yet
              </Typography>
              <Typography variant="caption" color="text.disabled">
                Country stats will appear after traffic
              </Typography>
            </Box>
          )}
        </ChartCard>
      </Box>

      {/* Charts Row - Top Domains, Error Codes, Latency, Methods */}
      <Box
        sx={{
          display: "flex",
          flexWrap: "wrap",
          gap: 3,
          mb: 4,
          width: "100%",
          "& > *": {
            flex: {
              xs: "1 1 100%",
              sm: "1 1 calc(50% - 12px)",
              lg: "1 1 calc(25% - 18px)",
            },
            minWidth: {
              xs: "100%",
              sm: "calc(50% - 12px)",
              lg: "calc(25% - 18px)",
            },
            maxWidth: {
              xs: "100%",
              sm: "calc(50% - 12px)",
              lg: "calc(25% - 18px)",
            },
          },
        }}
      >
        {/* Top Domains */}
        <Box>
          <ChartCard
            title="Top Domains"
            subtitle="By request count"
            height="100%"
            accentColor="#8b5cf6"
          >
            <Box
              sx={{
                height: 320,
                overflow: "auto",
                scrollbarWidth: "none",
                msOverflowStyle: "none",
                "&::-webkit-scrollbar": { display: "none" },
              }}
            >
              {topDomains.slice(0, 8).map((domain, index) => {
                const maxRequests = topDomains[0]?.requests || 1;
                const percentage = Math.round(
                  (domain.requests / maxRequests) * 100,
                );
                return (
                  <Box
                    key={index}
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1.5,
                      py: 1.25,
                      px: 0.5,
                      borderRadius: 1.5,
                      transition: "all 0.2s",
                      "&:hover": {
                        backgroundColor: alpha(
                          theme.palette.primary.main,
                          0.05,
                        ),
                      },
                    }}
                  >
                    <Box
                      sx={{
                        width: 24,
                        height: 24,
                        borderRadius: "50%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor:
                          index < 3
                            ? alpha(theme.palette.primary.main, 0.15)
                            : alpha(theme.palette.grey[500], 0.1),
                        color:
                          index < 3
                            ? theme.palette.primary.main
                            : theme.palette.text.secondary,
                        fontSize: "0.7rem",
                        fontWeight: 700,
                      }}
                    >
                      {index + 1}
                    </Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: 600,
                          fontSize: "0.8rem",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {domain.domain}
                      </Typography>
                      <Box
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          gap: 1,
                          mt: 0.5,
                        }}
                      >
                        <Box
                          sx={{
                            flex: 1,
                            height: 4,
                            borderRadius: 2,
                            backgroundColor: alpha(
                              theme.palette.primary.main,
                              0.1,
                            ),
                            overflow: "hidden",
                          }}
                        >
                          <Box
                            sx={{
                              width: `${percentage}%`,
                              height: "100%",
                              borderRadius: 2,
                              background: `linear-gradient(90deg, ${theme.palette.primary.main}, ${alpha(theme.palette.primary.main, 0.7)})`,
                            }}
                          />
                        </Box>
                      </Box>
                    </Box>
                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: 700,
                        color: theme.palette.text.primary,
                        fontSize: "0.8rem",
                      }}
                    >
                      {formatNumber(domain.requests)}
                    </Typography>
                  </Box>
                );
              })}
              {topDomains.length === 0 && (
                <Box
                  sx={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    height: "100%",
                    gap: 1.5,
                  }}
                >
                  <Box
                    sx={{
                      width: 64,
                      height: 64,
                      borderRadius: "50%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: alpha(theme.palette.primary.main, 0.1),
                    }}
                  >
                    <LanguageIcon
                      sx={{ fontSize: 32, color: theme.palette.primary.main }}
                    />
                  </Box>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    fontWeight={500}
                  >
                    No domains yet
                  </Typography>
                  <Typography variant="caption" color="text.disabled">
                    Domain stats will appear after traffic
                  </Typography>
                </Box>
              )}
            </Box>
          </ChartCard>
        </Box>

        {/* Error Codes */}
        <Box>
          <ChartCard
            title="Error Codes"
            subtitle="HTTP 4xx & 5xx - Click for details"
            height="100%"
            accentColor="#ef4444"
          >
            <Box
              sx={{
                height: 320,
                overflow: "auto",
                scrollbarWidth: "none",
                msOverflowStyle: "none",
                "&::-webkit-scrollbar": { display: "none" },
              }}
            >
              {errorCodes.slice(0, 8).map((error, index) => {
                const isServerError = error.code >= 500;
                const errorColor = isServerError
                  ? theme.palette.error.main
                  : theme.palette.warning.main;
                const maxCount = errorCodes[0]?.count || 1;
                const percentage = Math.round((error.count / maxCount) * 100);

                return (
                  <Box
                    key={index}
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1.5,
                      py: 1.25,
                      px: 0.5,
                      borderRadius: 1.5,
                      transition: "all 0.2s",
                      "&:hover": {
                        backgroundColor: alpha(errorColor, 0.05),
                      },
                    }}
                  >
                    <Chip
                      label={error.code}
                      size="small"
                      onClick={() => handleErrorCodeClick(error.code)}
                      sx={{
                        minWidth: 52,
                        height: 26,
                        backgroundColor: alpha(errorColor, 0.15),
                        color: errorColor,
                        fontWeight: 700,
                        fontSize: "0.75rem",
                        cursor: "pointer",
                        "& .MuiChip-label": { px: 1 },
                        "&:hover": {
                          backgroundColor: alpha(errorColor, 0.25),
                        },
                      }}
                    />
                    <Box sx={{ flex: 1 }}>
                      <Box
                        sx={{
                          height: 6,
                          borderRadius: 3,
                          backgroundColor: alpha(errorColor, 0.1),
                          overflow: "hidden",
                        }}
                      >
                        <Box
                          sx={{
                            width: `${percentage}%`,
                            height: "100%",
                            borderRadius: 3,
                            background: `linear-gradient(90deg, ${errorColor}, ${alpha(errorColor, 0.6)})`,
                          }}
                        />
                      </Box>
                    </Box>
                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: 700,
                        color: theme.palette.text.primary,
                        fontSize: "0.8rem",
                        minWidth: 45,
                        textAlign: "right",
                      }}
                    >
                      {formatNumber(error.count)}
                    </Typography>
                  </Box>
                );
              })}
              {errorCodes.length === 0 && (
                <Box
                  sx={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    height: "100%",
                    gap: 1.5,
                  }}
                >
                  <Box
                    sx={{
                      width: 64,
                      height: 64,
                      borderRadius: "50%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: alpha(theme.palette.success.main, 0.1),
                    }}
                  >
                    <SecurityIcon
                      sx={{ fontSize: 32, color: theme.palette.success.main }}
                    />
                  </Box>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    fontWeight={500}
                  >
                    No errors recorded
                  </Typography>
                  <Typography variant="caption" color="text.disabled">
                    All systems operational
                  </Typography>
                </Box>
              )}
            </Box>
          </ChartCard>
        </Box>

        {/* Latency Distribution */}
        <Box>
          <ChartCard
            title="Response Time"
            subtitle="Latency distribution"
            height="100%"
            accentColor="#10b981"
          >
            <Box sx={{ height: 320 }}>
              {latencyChartData.length > 0 ? (
                <Box
                  sx={{
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  {/* Bar-style display for latency */}
                  <Box sx={{ flex: 1 }}>
                    {[
                      {
                        name: "< 100ms",
                        key: "fast",
                        color: theme.palette.success.main,
                      },
                      {
                        name: "100-500ms",
                        key: "normal",
                        color: theme.palette.info.main,
                      },
                      {
                        name: "500ms-1s",
                        key: "slow",
                        color: theme.palette.warning.main,
                      },
                      {
                        name: "> 1s",
                        key: "very_slow",
                        color: theme.palette.error.main,
                      },
                    ].map((item) => {
                      const value = latencyData[item.key] || 0;
                      const total =
                        Object.values(latencyData || {}).reduce(
                          (sum, v) => sum + v,
                          0,
                        ) || 1;
                      const percentage = Math.round((value / total) * 100);

                      return (
                        <Box
                          key={item.key}
                          sx={{
                            display: "flex",
                            alignItems: "center",
                            gap: 1.5,
                            py: 1.5,
                            px: 0.5,
                            borderRadius: 1.5,
                            transition: "all 0.2s",
                            "&:hover": {
                              backgroundColor: alpha(item.color, 0.05),
                            },
                          }}
                        >
                          <Box
                            sx={{
                              minWidth: 80,
                              px: 1,
                              py: 0.5,
                              borderRadius: 1,
                              backgroundColor: alpha(item.color, 0.15),
                              textAlign: "center",
                            }}
                          >
                            <Typography
                              sx={{
                                fontSize: "0.7rem",
                                fontWeight: 700,
                                color: item.color,
                              }}
                            >
                              {item.name}
                            </Typography>
                          </Box>
                          <Box sx={{ flex: 1 }}>
                            <Box
                              sx={{
                                height: 8,
                                borderRadius: 4,
                                backgroundColor: alpha(item.color, 0.1),
                                overflow: "hidden",
                              }}
                            >
                              <Box
                                sx={{
                                  width: `${percentage}%`,
                                  height: "100%",
                                  borderRadius: 4,
                                  background: `linear-gradient(90deg, ${item.color}, ${alpha(item.color, 0.6)})`,
                                  transition: "width 0.5s ease",
                                }}
                              />
                            </Box>
                          </Box>
                          <Box sx={{ textAlign: "right", minWidth: 50 }}>
                            <Typography
                              variant="body2"
                              sx={{
                                fontWeight: 700,
                                fontSize: "0.8rem",
                                color: theme.palette.text.primary,
                              }}
                            >
                              {formatNumber(value)}
                            </Typography>
                            <Typography
                              variant="caption"
                              sx={{
                                color: theme.palette.text.secondary,
                                fontSize: "0.65rem",
                              }}
                            >
                              {percentage}%
                            </Typography>
                          </Box>
                        </Box>
                      );
                    })}
                  </Box>
                </Box>
              ) : (
                <Box
                  sx={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    height: "100%",
                    gap: 1.5,
                  }}
                >
                  <Box
                    sx={{
                      width: 64,
                      height: 64,
                      borderRadius: "50%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: alpha(theme.palette.info.main, 0.1),
                    }}
                  >
                    <SpeedIcon
                      sx={{ fontSize: 32, color: theme.palette.info.main }}
                    />
                  </Box>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    fontWeight={500}
                  >
                    No latency data yet
                  </Typography>
                  <Typography variant="caption" color="text.disabled">
                    Metrics will appear after traffic
                  </Typography>
                </Box>
              )}
            </Box>
          </ChartCard>
        </Box>

        {/* HTTP Methods */}
        <Box>
          <ChartCard
            title="HTTP Methods"
            subtitle="Request distribution"
            height="100%"
            accentColor="#06b6d4"
          >
            {methodsChartData.length > 0 ? (
              <Box
                sx={{
                  height: 320,
                  overflow: "auto",
                  scrollbarWidth: "none",
                  msOverflowStyle: "none",
                  "&::-webkit-scrollbar": { display: "none" },
                }}
              >
                {methodsChartData.map((method, index) => {
                  const total = methodsChartData.reduce(
                    (sum, m) => sum + m.value,
                    0,
                  );
                  const percentage = Math.round((method.value / total) * 100);
                  const color =
                    METHODS_COLORS[method.name] || theme.palette.grey[500];

                  return (
                    <Box
                      key={index}
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 1.5,
                        py: 1.25,
                        px: 0.5,
                        borderRadius: 1.5,
                        transition: "all 0.2s",
                        "&:hover": {
                          backgroundColor: alpha(color, 0.05),
                        },
                      }}
                    >
                      <Box
                        sx={{
                          minWidth: 56,
                          px: 1,
                          py: 0.5,
                          borderRadius: 1,
                          backgroundColor: alpha(color, 0.15),
                          textAlign: "center",
                        }}
                      >
                        <Typography
                          sx={{
                            fontSize: "0.7rem",
                            fontWeight: 700,
                            color: color,
                            fontFamily: "monospace",
                          }}
                        >
                          {method.name}
                        </Typography>
                      </Box>
                      <Box sx={{ flex: 1 }}>
                        <Box
                          sx={{
                            height: 8,
                            borderRadius: 4,
                            backgroundColor: alpha(color, 0.1),
                            overflow: "hidden",
                          }}
                        >
                          <Box
                            sx={{
                              width: `${percentage}%`,
                              height: "100%",
                              borderRadius: 4,
                              background: `linear-gradient(90deg, ${color}, ${alpha(color, 0.6)})`,
                              transition: "width 0.5s ease",
                            }}
                          />
                        </Box>
                      </Box>
                      <Box sx={{ textAlign: "right", minWidth: 55 }}>
                        <Typography
                          variant="body2"
                          sx={{
                            fontWeight: 700,
                            fontSize: "0.8rem",
                            color: theme.palette.text.primary,
                          }}
                        >
                          {formatNumber(method.value)}
                        </Typography>
                        <Typography
                          variant="caption"
                          sx={{
                            color: theme.palette.text.secondary,
                            fontSize: "0.65rem",
                          }}
                        >
                          {percentage}%
                        </Typography>
                      </Box>
                    </Box>
                  );
                })}
              </Box>
            ) : (
              <Box
                sx={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  height: 320,
                  gap: 1.5,
                }}
              >
                <Box
                  sx={{
                    width: 64,
                    height: 64,
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: alpha(theme.palette.primary.main, 0.1),
                  }}
                >
                  <HttpIcon
                    sx={{ fontSize: 32, color: theme.palette.primary.main }}
                  />
                </Box>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  fontWeight={500}
                >
                  No HTTP methods data
                </Typography>
                <Typography variant="caption" color="text.disabled">
                  Metrics will appear after traffic
                </Typography>
              </Box>
            )}
          </ChartCard>
        </Box>
      </Box>

      {/* Traffic Chart - Full Width */}
      <Box sx={{ mb: 3, width: "100%" }}>
        <ChartCard
          title="Traffic Overview"
          subtitle={`Last 24 hours - ${formatNumber(trafficSummary.total_requests_24h)} total requests`}
          onRefresh={fetchTrafficStats}
          accentColor="#6366f1"
        >
          <Box sx={{ width: "100%", height: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={trafficData}
                margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="colorUv" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="5%"
                      stopColor={theme.palette.primary.main}
                      stopOpacity={0.4}
                    />
                    <stop
                      offset="95%"
                      stopColor={theme.palette.primary.main}
                      stopOpacity={0.05}
                    />
                  </linearGradient>
                  <linearGradient id="colorPv" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="5%"
                      stopColor={theme.palette.success.main}
                      stopOpacity={0.4}
                    />
                    <stop
                      offset="95%"
                      stopColor={theme.palette.success.main}
                      stopOpacity={0.05}
                    />
                  </linearGradient>
                  <linearGradient id="colorErr" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="5%"
                      stopColor={theme.palette.error.main}
                      stopOpacity={0.4}
                    />
                    <stop
                      offset="95%"
                      stopColor={theme.palette.error.main}
                      stopOpacity={0.05}
                    />
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
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke={theme.palette.divider}
                  vertical={false}
                />
                <ChartTooltip
                  contentStyle={{
                    backgroundColor: theme.palette.background.paper,
                    border: `1px solid ${theme.palette.divider}`,
                    borderRadius: 8,
                    boxShadow: isDark
                      ? "0 8px 24px rgba(0,0,0,0.4)"
                      : "0 8px 24px rgba(0,0,0,0.12)",
                    padding: "10px 14px",
                  }}
                  labelStyle={{
                    color: theme.palette.text.primary,
                    fontWeight: 600,
                    marginBottom: 6,
                  }}
                />
                <Legend content={<CustomLegend />} />
                <Area
                  type="monotone"
                  dataKey="uv"
                  stroke={theme.palette.primary.main}
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorUv)"
                  name="Requests"
                  dot={false}
                />
                <Area
                  type="monotone"
                  dataKey="pv"
                  stroke={theme.palette.success.main}
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorPv)"
                  name="Success"
                  dot={false}
                />
                <Area
                  type="monotone"
                  dataKey="errors"
                  stroke={theme.palette.error.main}
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorErr)"
                  name="Errors"
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </Box>
        </ChartCard>
      </Box>

      {/* SSL Error Tracking - Full Width */}
      <Box sx={{ mb: 3, width: "100%" }}>
        <ChartCard
          title="SSL/TLS Error Tracking"
          subtitle="Auto-SSL certificate and OCSP errors monitored via nginx_log_errors_total{component='ssl'}"
          onRefresh={fetchLogMetrics}
          height={320}
          accentColor="#ef4444"
        >
          {logMetrics.available ? (
            <Box
              sx={{
                display: "flex",
                flexDirection: "column",
                gap: 2.5,
                py: 2,
              }}
            >
              {/* SSL Error Categories */}
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: {
                    xs: "1fr",
                    sm: "1fr 1fr",
                    md: "1fr 1fr 1fr",
                  },
                  gap: 2,
                }}
              >
                {[
                  {
                    title: "SNI Detection Failures",
                    metric: "nginx_log_warnings_total",
                    component: "ssl",
                    pattern:
                      "could not determine domain for request (SNI not supported?)",
                    level: "WARN",
                    color: theme.palette.warning.main,
                    icon: SecurityIcon,
                  },
                  {
                    title: "OCSP Stapling Failures",
                    metric: "nginx_log_warnings_total",
                    component: "ssl",
                    pattern:
                      "failed to set ocsp stapling - failed to get OCSP responder",
                    level: "WARN",
                    color: theme.palette.warning.main,
                    icon: SecurityIcon,
                  },
                  {
                    title: "Domain Not Allowed",
                    metric: "nginx_log_notices_total",
                    component: "ssl",
                    pattern: "auto-ssl: domain not allowed - using fallback",
                    level: "NOTICE",
                    color: theme.palette.info.main,
                    icon: SecurityIcon,
                  },
                ].map((item, index) => (
                  <Box
                    key={index}
                    sx={{
                      p: 2.5,
                      borderRadius: 2,
                      border: `1px solid ${alpha(item.color, 0.3)}`,
                      backgroundColor: alpha(item.color, 0.05),
                      display: "flex",
                      flexDirection: "column",
                      gap: 1.5,
                      transition: "all 0.2s",
                      "&:hover": {
                        backgroundColor: alpha(item.color, 0.08),
                        transform: "translateY(-2px)",
                        boxShadow: `0 4px 16px ${alpha(item.color, 0.2)}`,
                      },
                    }}
                  >
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 1.5,
                      }}
                    >
                      <Box
                        sx={{
                          width: 42,
                          height: 42,
                          borderRadius: 2,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor: alpha(item.color, 0.15),
                        }}
                      >
                        <item.icon sx={{ fontSize: 22, color: item.color }} />
                      </Box>
                      <Box sx={{ flex: 1 }}>
                        <Typography
                          variant="subtitle2"
                          sx={{
                            fontWeight: 700,
                            color: theme.palette.text.primary,
                            fontSize: "0.95rem",
                            mb: 0.25,
                          }}
                        >
                          {item.title}
                        </Typography>
                        <Chip
                          label={item.level}
                          size="small"
                          sx={{
                            height: 20,
                            fontSize: "0.65rem",
                            fontWeight: 700,
                            backgroundColor: alpha(item.color, 0.15),
                            color: item.color,
                            "& .MuiChip-label": { px: 1 },
                          }}
                        />
                      </Box>
                    </Box>
                    <Typography
                      variant="caption"
                      sx={{
                        color: theme.palette.text.secondary,
                        fontSize: "0.7rem",
                        fontFamily: "monospace",
                        lineHeight: 1.4,
                        p: 1,
                        borderRadius: 1,
                        backgroundColor: alpha(
                          theme.palette.background.default,
                          0.5,
                        ),
                      }}
                    >
                      {item.pattern}
                    </Typography>
                    <Box
                      sx={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        pt: 0.5,
                      }}
                    >
                      <Typography
                        variant="caption"
                        sx={{
                          color: theme.palette.text.disabled,
                          fontSize: "0.65rem",
                          fontWeight: 600,
                        }}
                      >
                        Metric: {item.metric}
                      </Typography>
                      <Chip
                        label={`component="${item.component}"`}
                        size="small"
                        variant="outlined"
                        sx={{
                          height: 18,
                          fontSize: "0.6rem",
                          borderColor: alpha(item.color, 0.3),
                          color: theme.palette.text.secondary,
                          "& .MuiChip-label": { px: 0.75 },
                        }}
                      />
                    </Box>
                  </Box>
                ))}
              </Box>

              {/* Info Banner */}
              <Box
                sx={{
                  p: 2.5,
                  borderRadius: 2,
                  background: `linear-gradient(135deg, ${alpha(theme.palette.error.main, 0.08)} 0%, ${alpha(theme.palette.warning.main, 0.08)} 100%)`,
                  border: `1px solid ${alpha(theme.palette.error.main, 0.2)}`,
                  display: "flex",
                  gap: 2,
                }}
              >
                <Box
                  sx={{
                    width: 40,
                    height: 40,
                    borderRadius: 2,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: alpha(theme.palette.error.main, 0.15),
                    flexShrink: 0,
                  }}
                >
                  <SecurityIcon
                    sx={{ fontSize: 22, color: theme.palette.error.main }}
                  />
                </Box>
                <Box sx={{ flex: 1 }}>
                  <Typography
                    variant="body2"
                    fontWeight={700}
                    color="text.primary"
                    sx={{ mb: 1 }}
                  >
                    SSL Error Monitoring Active
                  </Typography>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: "block", mb: 1, lineHeight: 1.5 }}
                  >
                    All SSL/TLS certificate errors from lua-resty-auto-ssl are
                    automatically tracked and available in Prometheus. These
                    include SNI detection failures, OCSP stapling issues, and
                    domain validation errors.
                  </Typography>
                  <Box
                    sx={{
                      display: "flex",
                      gap: 1,
                      flexWrap: "wrap",
                      alignItems: "center",
                    }}
                  >
                    <Typography
                      variant="caption"
                      sx={{
                        fontWeight: 600,
                        color: theme.palette.text.secondary,
                        fontSize: "0.7rem",
                      }}
                    >
                      Prometheus Query:
                    </Typography>
                    <Box
                      sx={{
                        fontFamily: "monospace",
                        fontSize: "0.7rem",
                        px: 1.5,
                        py: 0.5,
                        borderRadius: 1,
                        backgroundColor: alpha(
                          theme.palette.background.paper,
                          0.8,
                        ),
                        border: `1px solid ${alpha(theme.palette.divider, 0.5)}`,
                        color: theme.palette.error.main,
                        fontWeight: 600,
                      }}
                    >
                      rate(nginx_log_errors_total&#123;component="ssl"&#125;[5m])
                    </Box>
                  </Box>
                </Box>
              </Box>
            </Box>
          ) : (
            <Box
              sx={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                height: 200,
                gap: 1.5,
              }}
            >
              <Box
                sx={{
                  width: 64,
                  height: 64,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: alpha(theme.palette.warning.main, 0.1),
                }}
              >
                <SecurityIcon
                  sx={{ fontSize: 32, color: theme.palette.warning.main }}
                />
              </Box>
              <Typography
                variant="body2"
                color="text.secondary"
                fontWeight={500}
              >
                SSL metrics not available
              </Typography>
              <Typography variant="caption" color="text.disabled">
                Ensure log interceptor is initialized
              </Typography>
            </Box>
          )}
        </ChartCard>
      </Box>

      {/* Log Level Metrics - Full Width */}
      <Box sx={{ mb: 3, width: "100%" }}>
        <ChartCard
          title="Nginx Log Level Tracking"
          subtitle="Real-time nginx log monitoring via Prometheus"
          onRefresh={fetchLogMetrics}
          height={280}
          accentColor="#f59e0b"
        >
          {logMetrics.available ? (
            <Box
              sx={{
                display: "flex",
                flexDirection: "column",
                gap: 3,
                py: 2,
              }}
            >
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-around",
                  flexWrap: "wrap",
                  gap: 2,
                }}
              >
                {[
                  {
                    name: "Error Logs",
                    metric: "nginx_log_errors_total",
                    icon: ErrorIcon,
                    color: theme.palette.error.main,
                  },
                  {
                    name: "Warning Logs",
                    metric: "nginx_log_warnings_total",
                    icon: ErrorIcon,
                    color: theme.palette.warning.main,
                  },
                  {
                    name: "Notice Logs",
                    metric: "nginx_log_notices_total",
                    icon: ErrorIcon,
                    color: theme.palette.info.main,
                  },
                  {
                    name: "All Levels",
                    metric: "nginx_log_messages_total",
                    icon: DataUsageIcon,
                    color: theme.palette.success.main,
                  },
                ].map((item, index) => (
                  <Box
                    key={index}
                    sx={{
                      flex: "1 1 calc(25% - 12px)",
                      minWidth: 200,
                      p: 2.5,
                      borderRadius: 2,
                      border: `1px solid ${alpha(item.color, 0.2)}`,
                      backgroundColor: alpha(item.color, 0.05),
                      display: "flex",
                      flexDirection: "column",
                      gap: 1.5,
                      transition: "all 0.2s",
                      "&:hover": {
                        backgroundColor: alpha(item.color, 0.08),
                        transform: "translateY(-2px)",
                        boxShadow: `0 4px 12px ${alpha(item.color, 0.15)}`,
                      },
                    }}
                  >
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 1.5,
                      }}
                    >
                      <Box
                        sx={{
                          width: 40,
                          height: 40,
                          borderRadius: 2,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor: alpha(item.color, 0.15),
                        }}
                      >
                        <item.icon sx={{ fontSize: 20, color: item.color }} />
                      </Box>
                      <Box>
                        <Typography
                          variant="h6"
                          sx={{
                            fontWeight: 700,
                            color: item.color,
                            fontSize: "1.1rem",
                          }}
                        >
                          {item.name}
                        </Typography>
                        <Typography
                          variant="caption"
                          sx={{
                            color: theme.palette.text.secondary,
                            fontFamily: "monospace",
                            fontSize: "0.65rem",
                          }}
                        >
                          {item.metric}
                        </Typography>
                      </Box>
                    </Box>
                    <Typography
                      variant="caption"
                      sx={{
                        color: theme.palette.text.secondary,
                        fontSize: "0.7rem",
                      }}
                    >
                      Tracked by component: ssl, auth, upstream, cache, nginx
                    </Typography>
                  </Box>
                ))}
              </Box>
              <Box
                sx={{
                  p: 2,
                  borderRadius: 2,
                  backgroundColor: alpha(theme.palette.info.main, 0.08),
                  border: `1px solid ${alpha(theme.palette.info.main, 0.2)}`,
                  display: "flex",
                  alignItems: "center",
                  gap: 2,
                }}
              >
                <Box
                  sx={{
                    width: 36,
                    height: 36,
                    borderRadius: 1.5,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: alpha(theme.palette.info.main, 0.15),
                  }}
                >
                  <DataUsageIcon
                    sx={{ fontSize: 20, color: theme.palette.info.main }}
                  />
                </Box>
                <Box sx={{ flex: 1 }}>
                  <Typography
                    variant="body2"
                    fontWeight={600}
                    color="text.primary"
                    sx={{ mb: 0.5 }}
                  >
                    {logMetrics.message || "Log metrics are being tracked"}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    All nginx log messages (ERROR, WARN, NOTICE, INFO, DEBUG)
                    are automatically captured and exposed at the{" "}
                    <Box
                      component="span"
                      sx={{
                        fontFamily: "monospace",
                        fontWeight: 600,
                        color: theme.palette.info.main,
                      }}
                    >
                      /metrics
                    </Box>{" "}
                    endpoint
                  </Typography>
                </Box>
              </Box>
            </Box>
          ) : (
            <Box
              sx={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                height: 200,
                gap: 1.5,
              }}
            >
              <Box
                sx={{
                  width: 64,
                  height: 64,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: alpha(theme.palette.warning.main, 0.1),
                }}
              >
                <ErrorIcon
                  sx={{ fontSize: 32, color: theme.palette.warning.main }}
                />
              </Box>
              <Typography
                variant="body2"
                color="text.secondary"
                fontWeight={500}
              >
                Log metrics not available
              </Typography>
              <Typography variant="caption" color="text.disabled">
                Ensure Prometheus metrics are initialized
              </Typography>
            </Box>
          )}
        </ChartCard>
      </Box>

      {/* Cache Statistics - Full Width */}
      <Box sx={{ mb: 3, width: "100%" }}>
        <ChartCard
          title="Cache Statistics"
          subtitle="Static content caching metrics and hit ratios"
          onRefresh={fetchCacheStats}
        >
          {cacheStats.available && cacheStats.total_entries > 0 ? (
            <Box>
              {/* Summary Stats */}
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: {
                    xs: "1fr",
                    sm: "repeat(2, 1fr)",
                    md: "repeat(4, 1fr)",
                  },
                  gap: 2,
                  mb: 3,
                }}
              >
                <StatCard
                  title="Total Cached Items"
                  value={formatNumber(cacheStats.total_entries)}
                  icon={StorageIcon}
                  color="#10b981"
                  subtitle="Entries in cache"
                />
                <StatCard
                  title="Cache Size"
                  value={formatBytes(cacheStats.total_size_bytes)}
                  icon={MemoryIcon}
                  color="#6366f1"
                  subtitle="Total cached data"
                />
                <StatCard
                  title="Hosts Cached"
                  value={formatNumber(cacheStats.entries_by_host?.length || 0)}
                  icon={ServerIcon}
                  color="#f59e0b"
                  subtitle="Unique domains"
                />
                <StatCard
                  title="File Types"
                  value={formatNumber(
                    cacheStats.entries_by_extension?.length || 0,
                  )}
                  icon={InsertDriveFileIcon}
                  color="#8b5cf6"
                  subtitle="Content types"
                />
              </Box>

              {/* Cache by Host Chart */}
              {cacheStats.entries_by_host &&
                cacheStats.entries_by_host.length > 0 && (
                  <Box sx={{ mb: 3 }}>
                    <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
                      Cached Entries by Host
                    </Typography>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={cacheStats.entries_by_host.slice(0, 10)}>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke={theme.palette.divider}
                        />
                        <XAxis
                          dataKey="host"
                          stroke={theme.palette.text.secondary}
                          tick={{ fontSize: 12 }}
                          angle={-45}
                          textAnchor="end"
                          height={80}
                        />
                        <YAxis stroke={theme.palette.text.secondary} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: theme.palette.background.paper,
                            border: `1px solid ${theme.palette.divider}`,
                            borderRadius: 8,
                          }}
                        />
                        <Bar
                          dataKey="count"
                          fill="#10b981"
                          radius={[8, 8, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </Box>
                )}

              {/* Cache by File Extension Chart */}
              {cacheStats.entries_by_extension &&
                cacheStats.entries_by_extension.length > 0 && (
                  <Box sx={{ mb: 3 }}>
                    <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
                      Cached Entries by File Type
                    </Typography>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart
                        data={cacheStats.entries_by_extension.slice(0, 10)}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke={theme.palette.divider}
                        />
                        <XAxis
                          dataKey="extension"
                          stroke={theme.palette.text.secondary}
                          tick={{ fontSize: 12 }}
                        />
                        <YAxis stroke={theme.palette.text.secondary} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: theme.palette.background.paper,
                            border: `1px solid ${theme.palette.divider}`,
                            borderRadius: 8,
                          }}
                        />
                        <Bar
                          dataKey="count"
                          fill="#6366f1"
                          radius={[8, 8, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </Box>
                )}

              {/* Top Cached URLs */}
              {cacheStats.top_urls && cacheStats.top_urls.length > 0 && (
                <Box>
                  <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
                    Top Cached URLs
                  </Typography>
                  <Box
                    sx={{
                      maxHeight: 300,
                      overflowY: "auto",
                      borderRadius: 2,
                      backgroundColor: alpha(
                        theme.palette.background.default,
                        0.5,
                      ),
                      p: 2,
                    }}
                  >
                    {cacheStats.top_urls.slice(0, 20).map((item, index) => (
                      <Box
                        key={index}
                        sx={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          p: 1.5,
                          mb: 1,
                          borderRadius: 1,
                          backgroundColor: theme.palette.background.paper,
                          border: `1px solid ${theme.palette.divider}`,
                        }}
                      >
                        <Box sx={{ flex: 1, mr: 2 }}>
                          <Typography
                            variant="body2"
                            fontWeight={500}
                            sx={{
                              fontFamily: "JetBrains Mono, monospace",
                              fontSize: "0.8rem",
                            }}
                          >
                            {item.host}
                          </Typography>
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{
                              fontFamily: "JetBrains Mono, monospace",
                              fontSize: "0.7rem",
                            }}
                          >
                            {item.url}
                          </Typography>
                        </Box>
                        <Typography
                          variant="body2"
                          fontWeight={600}
                          color="primary"
                        >
                          {formatBytes(item.size)}
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                </Box>
              )}
            </Box>
          ) : (
            <Box
              sx={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                py: 6,
                gap: 2,
              }}
            >
              <Box
                sx={{
                  width: 64,
                  height: 64,
                  borderRadius: 2,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: alpha(theme.palette.info.main, 0.1),
                }}
              >
                <StorageIcon
                  sx={{ fontSize: 32, color: theme.palette.info.main }}
                />
              </Box>
              <Typography
                variant="body2"
                color="text.secondary"
                fontWeight={500}
              >
                No cached items yet
              </Typography>
              <Typography variant="caption" color="text.disabled">
                Cache will populate as static content is served
              </Typography>
            </Box>
          )}
        </ChartCard>
      </Box>

      {/* WAF Security Panel */}
      <Box sx={{ mb: 4, width: "100%" }}>
        <ChartCard
          title="WAF Security Overview"
          subtitle="Web Application Firewall status and recent activity"
          height="auto"
          accentColor="#10b981"
        >
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: {
                xs: "1fr",
                sm: "repeat(2, 1fr)",
                md: "repeat(4, 1fr)",
              },
              gap: 2,
            }}
          >
            <StatCard
              title="WAF Rules"
              value={wafStats.totalRules}
              icon={ShieldIcon}
              color="#6366f1"
              subtitle="Active detection rules"
            />
            <StatCard
              title="WAF Policies"
              value={wafStats.totalPolicies}
              icon={VerifiedUserIcon}
              color="#10b981"
              subtitle="Configured policies"
            />
            <StatCard
              title="Total Events"
              value={formatNumber(wafStats.recentEvents)}
              icon={NotificationsActiveIcon}
              color="#f59e0b"
              subtitle="WAF events recorded"
            />
            <StatCard
              title="Blocked Threats"
              value={formatNumber(wafStats.blockedEvents)}
              icon={BlockIcon}
              color="#ef4444"
              subtitle="Requests blocked"
            />
          </Box>
        </ChartCard>
      </Box>

      {/* Entity Stats Cards - Smaller secondary cards */}
      <Box
        sx={{
          display: "flex",
          flexWrap: "wrap",
          gap: 2,
          mb: 4,
          width: "100%",
          "& > *": {
            flex: {
              xs: "1 1 calc(50% - 8px)",
              sm: "1 1 calc(50% - 8px)",
              md: "1 1 calc(25% - 12px)",
            },
            minWidth: {
              xs: "calc(50% - 8px)",
              sm: "calc(50% - 8px)",
              md: "calc(25% - 12px)",
            },
            maxWidth: {
              xs: "calc(50% - 8px)",
              sm: "calc(50% - 8px)",
              md: "calc(25% - 12px)",
            },
          },
        }}
      >
        <Box>
          <StatCard
            title="Servers"
            value={stats.servers}
            icon={ServerIcon}
            color="#6366f1"
            subtitle="Active configs"
          />
        </Box>
        <Box>
          <StatCard
            title="Rules"
            value={stats.rules}
            icon={RuleIcon}
            color="#ec4899"
            subtitle="Routing rules"
          />
        </Box>
        <Box>
          <StatCard
            title="Users"
            value={stats.users}
            icon={UserIcon}
            color="#f59e0b"
            subtitle="Registered"
          />
        </Box>
        <Box>
          <StatCard
            title="Profiles"
            value={stats.profiles}
            icon={StorageIcon}
            color="#06b6d4"
            subtitle="Environments"
          />
        </Box>
      </Box>

      {/* Logs Section - Two columns */}
      <Grid container spacing={2}>
        <Grid item xs={12} lg={6}>
          <Logs
            data={errorLogData}
            heading="Nginx Error Logs"
            onRefresh={fetchErrorLogs}
          />
        </Grid>
        <Grid item xs={12} lg={6}>
          <Logs
            data={accessLogData}
            heading="Nginx Access Logs"
            onRefresh={fetchAccessLogs}
          />
        </Grid>
      </Grid>

      {!storageManagement && <StorageModal isOpen={true} />}

      {/* Error Details Modal */}
      <Dialog
        open={errorModalOpen}
        onClose={handleCloseErrorModal}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3,
            maxHeight: "80vh",
          },
        }}
      >
        <DialogTitle
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottom: `1px solid ${theme.palette.divider}`,
            pb: 2,
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
            <Chip
              label={selectedErrorCode}
              sx={{
                backgroundColor: alpha(
                  selectedErrorCode >= 500
                    ? theme.palette.error.main
                    : theme.palette.warning.main,
                  0.15,
                ),
                color:
                  selectedErrorCode >= 500
                    ? theme.palette.error.main
                    : theme.palette.warning.main,
                fontWeight: 700,
                fontSize: "1rem",
              }}
            />
            <Typography variant="h6" fontWeight={600}>
              Error Details
            </Typography>
          </Box>
          <IconButton onClick={handleCloseErrorModal} size="small">
            <ErrorIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ p: 0 }}>
          {loadingErrorDetails ? (
            <Box
              sx={{
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                py: 8,
              }}
            >
              <CircularProgress />
            </Box>
          ) : errorDetails.length > 0 ? (
            <Table stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell
                    sx={{
                      fontWeight: 700,
                      backgroundColor: isDark
                        ? theme.palette.background.paper
                        : theme.palette.grey[50],
                    }}
                  >
                    Timestamp
                  </TableCell>
                  <TableCell
                    sx={{
                      fontWeight: 700,
                      backgroundColor: isDark
                        ? theme.palette.background.paper
                        : theme.palette.grey[50],
                    }}
                  >
                    Method
                  </TableCell>
                  <TableCell
                    sx={{
                      fontWeight: 700,
                      backgroundColor: isDark
                        ? theme.palette.background.paper
                        : theme.palette.grey[50],
                    }}
                  >
                    Host
                  </TableCell>
                  <TableCell
                    sx={{
                      fontWeight: 700,
                      backgroundColor: isDark
                        ? theme.palette.background.paper
                        : theme.palette.grey[50],
                    }}
                  >
                    URL
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {errorDetails.map((error, index) => (
                  <TableRow
                    key={index}
                    sx={{
                      "&:hover": {
                        backgroundColor: alpha(
                          theme.palette.primary.main,
                          0.04,
                        ),
                      },
                    }}
                  >
                    <TableCell
                      sx={{ whiteSpace: "nowrap", fontSize: "0.8rem" }}
                    >
                      {error.datetime}
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={error.method}
                        size="small"
                        sx={{
                          backgroundColor: alpha(
                            METHODS_COLORS[error.method] ||
                              theme.palette.grey[500],
                            0.15,
                          ),
                          color:
                            METHODS_COLORS[error.method] ||
                            theme.palette.grey[500],
                          fontWeight: 600,
                          fontSize: "0.7rem",
                        }}
                      />
                    </TableCell>
                    <TableCell
                      sx={{
                        fontSize: "0.8rem",
                        color: theme.palette.text.secondary,
                      }}
                    >
                      {error.host}
                    </TableCell>
                    <TableCell
                      sx={{
                        fontSize: "0.8rem",
                        fontFamily: "monospace",
                        maxWidth: 300,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      <Tooltip title={error.url} placement="top-start">
                        <span>{error.url}</span>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <Box
              sx={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                py: 8,
                gap: 2,
              }}
            >
              <Box
                sx={{
                  width: 64,
                  height: 64,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: alpha(theme.palette.info.main, 0.1),
                }}
              >
                <ErrorIcon
                  sx={{ fontSize: 32, color: theme.palette.info.main }}
                />
              </Box>
              <Typography variant="body1" color="text.secondary">
                No detailed error logs available
              </Typography>
              <Typography variant="caption" color="text.disabled">
                Error details are recorded for recent requests only
              </Typography>
            </Box>
          )}
        </DialogContent>
      </Dialog>
    </Box>
  );
};

export default Dashboard;
