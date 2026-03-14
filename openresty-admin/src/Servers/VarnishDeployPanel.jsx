import React, { useState, useEffect, useCallback } from "react";
import { useRecordContext, useNotify } from "react-admin";
import {
  Alert,
  Button,
  Grid,
  Typography,
  CircularProgress,
  Chip,
  Stack,
} from "@mui/material";
import RocketLaunchIcon from "@mui/icons-material/RocketLaunch";

const VarnishDeployPanel = () => {
  const record = useRecordContext();
  const notify = useNotify();
  const [deployStatus, setDeployStatus] = useState(null);
  const [deploying, setDeploying] = useState(false);
  const [loading, setLoading] = useState(true);

  const serverName = record?.server_name;
  const accessToken = JSON.parse(
    localStorage.getItem("accessToken") || "{}"
  );

  const fetchStatus = useCallback(async () => {
    if (!serverName) return;
    try {
      const response = await fetch(
        `/api/varnish/status/${serverName}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken.accessToken}`,
            "x-platform": "react-admin",
          },
        }
      );
      if (response.ok) {
        const result = await response.json();
        setDeployStatus(result.data?.deploy_status || null);
      }
    } catch {
      // Status fetch is best-effort
    } finally {
      setLoading(false);
    }
  }, [serverName, accessToken.accessToken]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleDeploy = async (dryRun = false) => {
    if (!serverName) return;
    setDeploying(true);
    try {
      const response = await fetch(
        `/api/varnish/deploy/${serverName}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken.accessToken}`,
            "x-platform": "react-admin",
          },
          body: JSON.stringify({ dry_run: dryRun }),
        }
      );
      const result = await response.json();
      if (result.data?.deployed || result.data?.valid) {
        notify(
          dryRun
            ? "VCL validation passed"
            : `VCL deployed: ${result.data.vcl_label || "success"}`,
          { type: "success" }
        );
        fetchStatus();
      } else {
        notify(
          `Deploy failed: ${result.data?.error || result.data?.validation_output || "Unknown error"}`,
          { type: "error" }
        );
        fetchStatus();
      }
    } catch (err) {
      notify(`Deploy error: ${err.message}`, { type: "error" });
    } finally {
      setDeploying(false);
    }
  };

  const getSeverity = (state) => {
    switch (state) {
      case "deployed":
        return "success";
      case "failed":
        return "error";
      case "pending_changes":
        return "warning";
      default:
        return "info";
    }
  };

  const formatTimestamp = (ts) => {
    if (!ts) return "Never";
    return new Date(ts * 1000).toLocaleString();
  };

  if (loading) {
    return <CircularProgress size={24} />;
  }

  return (
    <Grid container spacing={2}>
      {deployStatus && (
        <Grid item xs={12}>
          <Alert severity={getSeverity(deployStatus.state)}>
            <Stack direction="row" spacing={2} alignItems="center">
              <Typography variant="body2">
                <strong>Status:</strong>{" "}
                <Chip
                  label={deployStatus.state || "idle"}
                  size="small"
                  color={getSeverity(deployStatus.state)}
                />
              </Typography>
              <Typography variant="body2">
                <strong>Last deployed:</strong>{" "}
                {formatTimestamp(deployStatus.last_deployed_at)}
              </Typography>
              {deployStatus.last_vcl_label && (
                <Typography variant="body2">
                  <strong>VCL label:</strong>{" "}
                  <code>{deployStatus.last_vcl_label}</code>
                </Typography>
              )}
            </Stack>
            {deployStatus.last_error && (
              <Typography
                variant="body2"
                color="error"
                sx={{ mt: 1, whiteSpace: "pre-wrap", fontFamily: "monospace" }}
              >
                {deployStatus.last_error}
              </Typography>
            )}
          </Alert>
        </Grid>
      )}
      <Grid item xs={12}>
        <Stack direction="row" spacing={2}>
          <Button
            variant="outlined"
            onClick={() => handleDeploy(true)}
            disabled={deploying}
          >
            {deploying ? (
              <CircularProgress size={20} sx={{ mr: 1 }} />
            ) : null}
            Validate VCL
          </Button>
          <Button
            variant="contained"
            startIcon={
              deploying ? (
                <CircularProgress size={20} />
              ) : (
                <RocketLaunchIcon />
              )
            }
            onClick={() => handleDeploy(false)}
            disabled={deploying}
            color="primary"
          >
            Deploy VCL Configuration
          </Button>
        </Stack>
      </Grid>
    </Grid>
  );
};

export default VarnishDeployPanel;
