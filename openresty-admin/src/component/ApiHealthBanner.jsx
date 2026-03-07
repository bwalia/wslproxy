import React, { useState, useEffect, useCallback } from "react";
import { Box, Typography, alpha } from "@mui/material";
import CircleIcon from "@mui/icons-material/CircleRounded";

const API_URL = import.meta.env.VITE_API_URL;

// Health states: "checking" | "healthy" | "degraded" | "down"
const STATUS_CONFIG = {
  checking: { color: "#f59e0b", label: "Checking API...", bg: "#f59e0b" },
  healthy: { color: "#10b981", label: "API Online", bg: "#10b981" },
  degraded: { color: "#f59e0b", label: "API Slow", bg: "#f59e0b" },
  down: { color: "#ef4444", label: "API Unreachable", bg: "#ef4444" },
};

const SLOW_THRESHOLD_MS = 3000;
const POLL_INTERVAL_MS = 30000;

const useApiHealth = () => {
  const [status, setStatus] = useState("checking");
  const [latency, setLatency] = useState(null);

  const checkHealth = useCallback(async () => {
    if (!API_URL) {
      setStatus("down");
      return;
    }
    const start = Date.now();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(`${API_URL}/ping?timestamp=${Date.now()}`, {
        method: "GET",
        signal: controller.signal,
        headers: { "x-platform": "react-admin" },
      });
      clearTimeout(timeout);
      const elapsed = Date.now() - start;
      setLatency(elapsed);
      if (res.ok) {
        setStatus(elapsed > SLOW_THRESHOLD_MS ? "degraded" : "healthy");
      } else {
        setStatus("down");
      }
    } catch {
      setLatency(null);
      setStatus("down");
    }
  }, []);

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [checkHealth]);

  return { status, latency, refresh: checkHealth };
};

// Full-width banner for the login page
export const ApiHealthBanner = () => {
  const { status, latency } = useApiHealth();
  const config = STATUS_CONFIG[status];

  return (
    <Box
      sx={{
        width: "100%",
        py: 0.75,
        px: 2,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 1,
        backgroundColor: alpha(config.bg, 0.15),
        borderBottom: `2px solid ${alpha(config.bg, 0.4)}`,
        position: "relative",
        zIndex: 10,
      }}
    >
      <CircleIcon
        sx={{
          fontSize: 10,
          color: config.color,
          animation: status === "checking" ? "pulse 1.5s infinite" : "none",
          "@keyframes pulse": {
            "0%, 100%": { opacity: 1 },
            "50%": { opacity: 0.3 },
          },
        }}
      />
      <Typography
        variant="caption"
        sx={{ fontWeight: 600, color: config.color, fontSize: "0.75rem" }}
      >
        {config.label}
      </Typography>
      {latency !== null && status !== "checking" && (
        <Typography
          variant="caption"
          sx={{ color: alpha(config.color, 0.8), fontSize: "0.7rem" }}
        >
          ({latency}ms)
        </Typography>
      )}
    </Box>
  );
};

// Compact indicator for the AppBar
export const ApiHealthIndicator = () => {
  const { status, latency } = useApiHealth();
  const config = STATUS_CONFIG[status];

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 0.75,
        px: 1.5,
        py: 0.5,
        borderRadius: 2,
        backgroundColor: alpha(config.bg, 0.12),
        border: `1px solid ${alpha(config.bg, 0.25)}`,
        cursor: "default",
      }}
      title={latency !== null ? `API response: ${latency}ms` : config.label}
    >
      <CircleIcon
        sx={{
          fontSize: 8,
          color: config.color,
          animation: status === "checking" ? "pulse 1.5s infinite" : "none",
          "@keyframes pulse": {
            "0%, 100%": { opacity: 1 },
            "50%": { opacity: 0.3 },
          },
        }}
      />
      <Typography
        variant="caption"
        sx={{
          fontWeight: 600,
          color: config.color,
          fontSize: "0.7rem",
          lineHeight: 1,
          whiteSpace: "nowrap",
        }}
      >
        {config.label}
      </Typography>
      {latency !== null && status !== "checking" && (
        <Typography
          variant="caption"
          sx={{
            color: alpha(config.color, 0.7),
            fontSize: "0.65rem",
            lineHeight: 1,
          }}
        >
          {latency}ms
        </Typography>
      )}
    </Box>
  );
};

export default ApiHealthBanner;
