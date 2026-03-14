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
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Alert,
  Stack,
  Card,
  CardContent,
  Grid,
  CircularProgress,
} from "@mui/material";
import CompareArrowsIcon from "@mui/icons-material/CompareArrows";
import RestoreIcon from "@mui/icons-material/Restore";
import VisibilityIcon from "@mui/icons-material/Visibility";
import AddCircleIcon from "@mui/icons-material/AddCircle";
import SendIcon from "@mui/icons-material/Send";
import { useRecordContext, useNotify } from "react-admin";
import StatusBadge from "../component/StatusBadge";
import DiffViewer from "./DiffViewer";
import get from "lodash/get";

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

const VersionHistoryTab = ({ resourceType }) => {
  const record = useRecordContext();
  const notify = useNotify();
  const [versions, setVersions] = useState([]);
  const [meta, setMeta] = useState({});
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);

  // Dialog states
  const [diffDialogOpen, setDiffDialogOpen] = useState(false);
  const [diffData, setDiffData] = useState(null);
  const [diffV1, setDiffV1] = useState("");
  const [diffV2, setDiffV2] = useState("");
  const [versionDetailOpen, setVersionDetailOpen] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState(null);
  const [crDialogOpen, setCrDialogOpen] = useState(false);
  const [crVersion, setCrVersion] = useState(null);
  const [crDescription, setCrDescription] = useState("");
  const [crUser, setCrUser] = useState("");

  const resourceName = resourceType === "servers"
    ? get(record, "id")
    : get(record, "id");
  const profile = get(record, "profile_id") || localStorage.getItem("environment") || "prod";

  const fetchVersions = useCallback(async () => {
    if (!resourceName || !profile) return;
    setLoading(true);
    try {
      const url = `${API_URL}/versions/${resourceType}/${profile}/${resourceName}?timestamp=${Date.now()}`;
      const response = await fetch(url, { method: "GET", headers: getHeaders() });
      const result = await response.json();
      setVersions(result.data || []);
      setMeta(result.meta || {});
      setInitialized((result.meta?.latest_version || 0) > 0);
    } catch (error) {
      console.error("Failed to fetch versions:", error);
    } finally {
      setLoading(false);
    }
  }, [resourceName, profile, resourceType]);

  useEffect(() => {
    fetchVersions();
  }, [fetchVersions]);

  const handleInitialize = async () => {
    try {
      const url = `${API_URL}/versions/${resourceType}/${profile}/${resourceName}/initialize`;
      const response = await fetch(url, {
        method: "POST",
        headers: getHeaders(),
      });
      if (response.ok) {
        notify("Versioning initialized successfully", { type: "success" });
        fetchVersions();
      } else {
        const result = await response.json();
        notify(result?.data?.message || "Failed to initialize", { type: "error" });
      }
    } catch (error) {
      notify("Failed to initialize versioning", { type: "error" });
    }
  };

  const handleCreateDraft = async () => {
    try {
      const url = `${API_URL}/versions/${resourceType}/${profile}/${resourceName}`;
      const body = {
        config_payload: record,
        description: "New draft from current config",
        created_by: crUser || "admin",
      };
      const response = await fetch(url, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify(body),
      });
      if (response.ok) {
        notify("Draft version created", { type: "success" });
        fetchVersions();
      } else {
        const result = await response.json();
        notify(result?.data?.message || "Failed to create draft", { type: "error" });
      }
    } catch (error) {
      notify("Failed to create draft", { type: "error" });
    }
  };

  const handleViewDiff = async (v1, v2) => {
    try {
      const url = `${API_URL}/versions/${resourceType}/${profile}/${resourceName}/diff/${v1}/${v2}?timestamp=${Date.now()}`;
      const response = await fetch(url, { method: "GET", headers: getHeaders() });
      const result = await response.json();
      setDiffData(result.data);
      setDiffDialogOpen(true);
    } catch (error) {
      notify("Failed to load diff", { type: "error" });
    }
  };

  const handleViewVersion = async (version) => {
    try {
      const url = `${API_URL}/versions/${resourceType}/${profile}/${resourceName}/${version}?timestamp=${Date.now()}`;
      const response = await fetch(url, { method: "GET", headers: getHeaders() });
      const result = await response.json();
      setSelectedVersion(result.data);
      setVersionDetailOpen(true);
    } catch (error) {
      notify("Failed to load version", { type: "error" });
    }
  };

  const handleRollback = async (version) => {
    try {
      const url = `${API_URL}/versions/${resourceType}/${profile}/${resourceName}/rollback/${version}`;
      const response = await fetch(url, {
        method: "POST",
        headers: getHeaders(),
      });
      if (response.ok) {
        notify("Rollback draft created. Submit a CR to apply.", { type: "success" });
        fetchVersions();
      } else {
        const result = await response.json();
        notify(result?.data?.message || "Failed to create rollback", { type: "error" });
      }
    } catch (error) {
      notify("Failed to create rollback", { type: "error" });
    }
  };

  const handleCreateCR = async () => {
    if (!crVersion) return;
    try {
      const url = `${API_URL}/change-requests`;
      const body = {
        resource_type: resourceType,
        resource_name: resourceName,
        profile: profile,
        version: crVersion,
        change_type: "update",
        description: crDescription,
        created_by: crUser || "admin",
      };
      const response = await fetch(url, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify(body),
      });
      if (response.ok) {
        notify("Change Request created", { type: "success" });
        setCrDialogOpen(false);
        setCrDescription("");
        fetchVersions();
      } else {
        const result = await response.json();
        notify(result?.data?.message || "Failed to create CR", { type: "error" });
      }
    } catch (error) {
      notify("Failed to create CR", { type: "error" });
    }
  };

  if (loading && versions.length === 0) {
    return (
      <Box sx={{ p: 3, textAlign: "center" }}>
        <CircularProgress size={24} />
        <Typography variant="body2" sx={{ mt: 1 }}>Loading version history...</Typography>
      </Box>
    );
  }

  if (!initialized) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="info" sx={{ mb: 2 }}>
          Versioning has not been initialized for this {resourceType === "servers" ? "server" : "rule"}.
          Click below to create the initial version from the current configuration.
        </Alert>
        <Button variant="contained" onClick={handleInitialize} startIcon={<AddCircleIcon />}>
          Initialize Versioning
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 2 }}>
      {/* Header */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={4}>
          <Card variant="outlined">
            <CardContent sx={{ py: 1.5, "&:last-child": { pb: 1.5 } }}>
              <Typography variant="caption" color="text.secondary">Live Version</Typography>
              <Typography variant="h6" color="success.main">
                v{meta.live_version || "-"}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={4}>
          <Card variant="outlined">
            <CardContent sx={{ py: 1.5, "&:last-child": { pb: 1.5 } }}>
              <Typography variant="caption" color="text.secondary">Latest Version</Typography>
              <Typography variant="h6">v{meta.latest_version || "-"}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={4}>
          <Card variant="outlined">
            <CardContent sx={{ py: 1.5, "&:last-child": { pb: 1.5 } }}>
              <Typography variant="caption" color="text.secondary">Total Versions</Typography>
              <Typography variant="h6">{versions.length}</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Actions */}
      <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
        <Button variant="contained" size="small" startIcon={<AddCircleIcon />} onClick={handleCreateDraft}>
          Create Draft
        </Button>
        <Button
          variant="outlined"
          size="small"
          startIcon={<CompareArrowsIcon />}
          onClick={() => {
            if (versions.length >= 2) {
              setDiffV1(String(versions[1]?.version || ""));
              setDiffV2(String(versions[0]?.version || ""));
            }
            setDiffDialogOpen(true);
            if (versions.length >= 2) {
              handleViewDiff(versions[1].version, versions[0].version);
            }
          }}
          disabled={versions.length < 2}
        >
          Compare Versions
        </Button>
      </Stack>

      {/* Versions Table */}
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 600 }}>Version</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Created By</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Created At</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Description</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>CR</TableCell>
              <TableCell sx={{ fontWeight: 600, textAlign: "right" }}>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {versions.map((v) => (
              <TableRow
                key={v.version}
                sx={{
                  backgroundColor: v.state === "live" ? "#e8f5e920" : "inherit",
                  "&:hover": { backgroundColor: "action.hover" },
                }}
              >
                <TableCell>
                  <Typography variant="body2" sx={{ fontWeight: v.state === "live" ? 700 : 400 }}>
                    v{v.version}
                  </Typography>
                </TableCell>
                <TableCell>
                  <StatusBadge status={v.state} />
                </TableCell>
                <TableCell>
                  <Typography variant="body2">{v.created_by}</Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="caption">{formatDate(v.created_at)}</Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2" sx={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>
                    {v.description || "-"}
                  </Typography>
                </TableCell>
                <TableCell>
                  {v.cr_id ? (
                    <Typography
                      variant="body2"
                      sx={{ color: "primary.main", cursor: "pointer", fontWeight: 500 }}
                      onClick={() => window.location.hash = `#/change-requests/${v.cr_id}`}
                    >
                      {v.cr_id}
                    </Typography>
                  ) : "-"}
                </TableCell>
                <TableCell sx={{ textAlign: "right" }}>
                  <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                    <Tooltip title="View">
                      <IconButton size="small" onClick={() => handleViewVersion(v.version)}>
                        <VisibilityIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    {meta.live_version && v.version !== meta.live_version && (
                      <Tooltip title={`Diff vs live (v${meta.live_version})`}>
                        <IconButton size="small" onClick={() => handleViewDiff(meta.live_version, v.version)}>
                          <CompareArrowsIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                    {v.state === "draft" && (
                      <Tooltip title="Submit Change Request">
                        <IconButton
                          size="small"
                          color="primary"
                          onClick={() => { setCrVersion(v.version); setCrDialogOpen(true); }}
                        >
                          <SendIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                    {(v.state === "archived" || v.state === "live") && v.version !== meta.live_version && (
                      <Tooltip title="Rollback to this version">
                        <IconButton size="small" color="warning" onClick={() => handleRollback(v.version)}>
                          <RestoreIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                  </Stack>
                </TableCell>
              </TableRow>
            ))}
            {versions.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} sx={{ textAlign: "center", py: 3 }}>
                  <Typography color="text.secondary">No versions found</Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Diff Dialog */}
      <Dialog open={diffDialogOpen} onClose={() => setDiffDialogOpen(false)} maxWidth="lg" fullWidth>
        <DialogTitle>Version Comparison</DialogTitle>
        <DialogContent>
          {diffData ? (
            <DiffViewer diffData={diffData} />
          ) : (
            <Box sx={{ textAlign: "center", py: 3 }}>
              <CircularProgress size={24} />
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDiffDialogOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Version Detail Dialog */}
      <Dialog open={versionDetailOpen} onClose={() => setVersionDetailOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          Version {selectedVersion?.version} Details
          <Box sx={{ display: "inline-block", ml: 2 }}>
            <StatusBadge status={selectedVersion?.state} />
          </Box>
        </DialogTitle>
        <DialogContent>
          {selectedVersion && (
            <Box>
              <Grid container spacing={2} sx={{ mb: 2 }}>
                <Grid item xs={6} sm={3}>
                  <Typography variant="caption" color="text.secondary">Created By</Typography>
                  <Typography variant="body2">{selectedVersion.created_by}</Typography>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Typography variant="caption" color="text.secondary">Created At</Typography>
                  <Typography variant="body2">{formatDate(selectedVersion.created_at)}</Typography>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Typography variant="caption" color="text.secondary">Description</Typography>
                  <Typography variant="body2">{selectedVersion.description || "-"}</Typography>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Typography variant="caption" color="text.secondary">CR ID</Typography>
                  <Typography variant="body2">{selectedVersion.cr_id || "-"}</Typography>
                </Grid>
              </Grid>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>Configuration Payload</Typography>
              <Paper variant="outlined" sx={{ p: 2, maxHeight: 400, overflow: "auto" }}>
                <pre style={{ margin: 0, fontSize: "0.8rem", whiteSpace: "pre-wrap" }}>
                  {JSON.stringify(selectedVersion.config_payload, null, 2)}
                </pre>
              </Paper>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setVersionDetailOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Create CR Dialog */}
      <Dialog open={crDialogOpen} onClose={() => setCrDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Create Change Request</DialogTitle>
        <DialogContent>
          <Alert severity="info" sx={{ mb: 2 }}>
            This will submit version v{crVersion} for approval.
            Two approvers are required before it can go live (4-eyes principle).
          </Alert>
          <TextField
            label="Your Username"
            fullWidth
            value={crUser}
            onChange={(e) => setCrUser(e.target.value)}
            sx={{ mb: 2 }}
            helperText="Who is submitting this change request"
          />
          <TextField
            label="Description"
            fullWidth
            multiline
            rows={3}
            value={crDescription}
            onChange={(e) => setCrDescription(e.target.value)}
            helperText="Describe what this change does and why"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCrDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleCreateCR}
            disabled={!crUser}
            startIcon={<SendIcon />}
          >
            Submit CR
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default VersionHistoryTab;
