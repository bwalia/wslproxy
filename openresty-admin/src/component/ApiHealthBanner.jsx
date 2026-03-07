import React, { useState, useEffect, useCallback } from "react";
import { Box, Typography, alpha } from "@mui/material";
import CircleIcon from "@mui/icons-material/CircleRounded";

const API_URL = import.meta.env.VITE_API_URL;

const SLOW_THRESHOLD_MS = 3000;
const POLL_INTERVAL_MS = 30000;

// Status configs for authenticated context (AppBar)
const AUTH_STATUS_CONFIG = {
  checking: { color: "#f59e0b", label: "Checking API...", bg: "#f59e0b" },
  healthy: { color: "#10b981", label: "API Online (200)", bg: "#10b981" },
  degraded: { color: "#f59e0b", label: "API Slow", bg: "#f59e0b" },
  down: { color: "#ef4444", label: "API Unreachable", bg: "#ef4444" },
  error: { color: "#ef4444", label: "API Error", bg: "#ef4444" },
};

// Status configs for unauthenticated context (Login page)
const UNAUTH_STATUS_CONFIG = {
  checking: { color: "#f59e0b", label: "Checking API...", bg: "#f59e0b" },
  reachable: { color: "#10b981", label: "API Reachable", bg: "#10b981" },
  auth_required: { color: "#06b6d4", label: "API Reachable (401 - Unauthenticated)", bg: "#06b6d4" },
  down: { color: "#ef4444", label: "API Unreachable", bg: "#ef4444" },
};

const getAuthHeaders = () => {
  try {
    const token = localStorage.getItem("token");
    if (token) {
      const parsed = JSON.parse(token);
      if (parsed?.accessToken) {
        return {
          "x-platform": "react-admin",
          Authorization: `Bearer ${parsed.accessToken}`,
        };
      }
    }
  } catch {}
  return { "x-platform": "react-admin" };
};

// authenticated = true: sends token, expects 200
// authenticated = false: no token, 401 means API is reachable
const useApiHealth = (authenticated = false) => {
  const [status, setStatus] = useState("checking");
  const [latency, setLatency] = useState(null);
  const [httpStatus, setHttpStatus] = useState(null);

  const checkHealth = useCallback(async () => {
    if (!API_URL) {
      setStatus("down");
      return;
    }
    const start = Date.now();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const headers = authenticated ? getAuthHeaders() : { "x-platform": "react-admin" };
      const res = await fetch(`${API_URL}/ping?timestamp=${Date.now()}`, {
        method: "GET",
        signal: controller.signal,
        headers,
      });
      clearTimeout(timeout);
      const elapsed = Date.now() - start;
      setLatency(elapsed);
      setHttpStatus(res.status);

      if (authenticated) {
        // Logged-in context: 200 = healthy, anything else = problem
        if (res.ok) {
          setStatus(elapsed > SLOW_THRESHOLD_MS ? "degraded" : "healthy");
        } else {
          setStatus("error");
        }
      } else {
        // Login page context: any HTTP response means API is reachable
        if (res.status === 401 || res.status === 403) {
          setStatus("auth_required");
        } else if (res.ok) {
          setStatus("reachable");
        } else {
          // API responded but with unexpected error — still reachable
          setStatus("reachable");
        }
      }
    } catch {
      setLatency(null);
      setHttpStatus(null);
      setStatus("down");
    }
  }, [authenticated]);

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [checkHealth]);

  return { status, latency, httpStatus, refresh: checkHealth };
};

// Full-width banner for the login page (unauthenticated)
export const ApiHealthBanner = () => {
  const { status, latency, httpStatus } = useApiHealth(false);
  const config = UNAUTH_STATUS_CONFIG[status] || UNAUTH_STATUS_CONFIG.down;

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

// Compact indicator for the AppBar (authenticated)
export const ApiHealthIndicator = () => {
  const { status, latency, httpStatus } = useApiHealth(true);
  const config = AUTH_STATUS_CONFIG[status] || AUTH_STATUS_CONFIG.down;
  const displayLabel = httpStatus && status !== "checking"
    ? `${config.label}`
    : config.label;

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
      title={
        latency !== null
          ? `API: ${API_URL} | HTTP ${httpStatus} | ${latency}ms`
          : config.label
      }
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
        {displayLabel}
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
