import React, { useState, useEffect, useCallback } from "react";
import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Button,
  Chip,
  Stack,
  TextField,
  MenuItem,
  CircularProgress,
} from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";

const API_URL = import.meta.env.VITE_API_URL;

const getHeaders = () => {
  const token = localStorage.getItem("token");
  const accessToken = token ? JSON.parse(token) : {};
  const headers = { "x-platform": "react-admin" };
  if (accessToken?.accessToken) {
    headers.Authorization = `Bearer ${accessToken.accessToken}`;
  }
  return headers;
};

const formatDate = (timestamp) => {
  if (!timestamp) return "-";
  return new Date(timestamp * 1000).toLocaleString();
};

const actionColors = {
  version_created: "info",
  version_state_changed: "warning",
  version_activated: "success",
  version_archived: "default",
  version_migrated: "info",
  draft_updated: "default",
  rollback_initiated: "warning",
  cr_created: "info",
  cr_approved: "success",
  cr_fully_approved: "success",
  cr_rejected: "error",
  cr_cancelled: "default",
};

const AuditLog = () => {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [actionFilter, setActionFilter] = useState("");
  const [resourceTypeFilter, setResourceTypeFilter] = useState("");

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (actionFilter) params.action = actionFilter;
      if (resourceTypeFilter) params.resource_type = resourceTypeFilter;
      const queryParams = Object.keys(params).length > 0
        ? `&params=${encodeURIComponent(JSON.stringify({ filter: params }))}`
        : "";
      const url = `${API_URL}/audit?timestamp=${Date.now()}${queryParams}`;
      const response = await fetch(url, { method: "GET", headers: getHeaders() });
      const result = await response.json();
      setEntries(result.data || []);
      setTotal(result.total || 0);
    } catch (error) {
      console.error("Failed to fetch audit logs:", error);
    } finally {
      setLoading(false);
    }
  }, [actionFilter, resourceTypeFilter]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" sx={{ mb: 3, fontWeight: 600 }}>Audit Log</Typography>

      {/* Filters */}
      <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
        <TextField
          select
          size="small"
          label="Action"
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          sx={{ minWidth: 200 }}
        >
          <MenuItem value="">All Actions</MenuItem>
          <MenuItem value="version_created">Version Created</MenuItem>
          <MenuItem value="version_activated">Version Activated</MenuItem>
          <MenuItem value="version_archived">Version Archived</MenuItem>
          <MenuItem value="draft_updated">Draft Updated</MenuItem>
          <MenuItem value="rollback_initiated">Rollback Initiated</MenuItem>
          <MenuItem value="cr_created">CR Created</MenuItem>
          <MenuItem value="cr_approved">CR Approved</MenuItem>
          <MenuItem value="cr_fully_approved">CR Fully Approved</MenuItem>
          <MenuItem value="cr_rejected">CR Rejected</MenuItem>
          <MenuItem value="cr_cancelled">CR Cancelled</MenuItem>
        </TextField>
        <TextField
          select
          size="small"
          label="Resource Type"
          value={resourceTypeFilter}
          onChange={(e) => setResourceTypeFilter(e.target.value)}
          sx={{ minWidth: 150 }}
        >
          <MenuItem value="">All</MenuItem>
          <MenuItem value="servers">Servers</MenuItem>
          <MenuItem value="rules">Rules</MenuItem>
        </TextField>
        <Button variant="outlined" size="small" startIcon={<RefreshIcon />} onClick={fetchLogs}>
          Refresh
        </Button>
        <Typography variant="body2" color="text.secondary" sx={{ alignSelf: "center" }}>
          {total} entries
        </Typography>
      </Stack>

      {/* Log Table */}
      {loading ? (
        <Box sx={{ textAlign: "center", py: 5 }}>
          <CircularProgress size={30} />
        </Box>
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 600 }}>Time</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Action</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>User</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Resource</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Details</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>IP</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {entries.map((entry, idx) => (
                <TableRow key={idx} sx={{ "&:hover": { backgroundColor: "action.hover" } }}>
                  <TableCell>
                    <Typography variant="caption">{entry.datetime || formatDate(entry.timestamp)}</Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={entry.action?.replace(/_/g, " ")}
                      size="small"
                      color={actionColors[entry.action] || "default"}
                      variant="outlined"
                      sx={{ fontSize: "0.7rem", textTransform: "capitalize" }}
                    />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">{entry.user}</Typography>
                  </TableCell>
                  <TableCell>
                    <Stack>
                      <Typography variant="body2">{entry.resource_name}</Typography>
                      <Typography variant="caption" color="text.secondary">{entry.resource_type}</Typography>
                    </Stack>
                  </TableCell>
                  <TableCell>
                    <Typography
                      variant="caption"
                      sx={{ fontFamily: "monospace", fontSize: "0.75rem", maxWidth: 300, display: "block", overflow: "hidden", textOverflow: "ellipsis" }}
                    >
                      {entry.details ? JSON.stringify(entry.details) : "-"}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption" color="text.secondary">{entry.ip_address || "-"}</Typography>
                  </TableCell>
                </TableRow>
              ))}
              {entries.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} sx={{ textAlign: "center", py: 4 }}>
                    <Typography color="text.secondary">No audit entries found</Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
};

export default AuditLog;
