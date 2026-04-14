import React, { useCallback, useEffect, useState } from "react";
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Chip,
  CircularProgress,
  Alert,
  Divider,
  List,
  ListItem,
  ListItemText,
  IconButton,
  Collapse,
  useTheme,
  alpha,
} from "@mui/material";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesomeRounded";
import RefreshIcon from "@mui/icons-material/RefreshRounded";
import ExpandMoreIcon from "@mui/icons-material/ExpandMoreRounded";
import ExpandLessIcon from "@mui/icons-material/ExpandLessRounded";
import { useDataProvider } from "react-admin";

const SEVERITY_COLOR = {
  critical: "#ef4444",
  high: "#f97316",
  medium: "#f59e0b",
  low: "#0ea5e9",
};

/**
 * Reusable panel that calls /api/ai/analyze (local Ollama) with log entries
 * and renders the structured analysis envelope.
 *
 * Props:
 *   title, subtitle                  — header text
 *   logsRef           (function)     — returns an array of log entries (or
 *                                      a string that will be split by newline)
 *                                      when the user clicks "Analyze with AI".
 *                                      Evaluated lazily so callers don't have
 *                                      to fetch logs until the button is pressed.
 *   question          (string)       — optional analysis question
 *   context           (string)       — optional free-text context (e.g. server name)
 *   emptyLogsMessage  (string)       — shown if logsRef() returns no entries
 */
const AiInsightsPanel = ({
  title = "AI Insights",
  subtitle = "Local Ollama log analysis",
  logsRef,
  question,
  context,
  emptyLogsMessage = "No log entries available to analyse yet.",
}) => {
  const theme = useTheme();
  const dataProvider = useDataProvider();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [modelInfo, setModelInfo] = useState(null);
  const [expandedCauses, setExpandedCauses] = useState(true);
  const [expandedRecs, setExpandedRecs] = useState(true);
  const [expandedPatterns, setExpandedPatterns] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await dataProvider.getAiModels();
        if (!cancelled) setModelInfo(res?.data);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dataProvider]);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let logs = typeof logsRef === "function" ? logsRef() : logsRef;
      if (typeof logs === "string") {
        logs = logs
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => ({ raw: line }));
      }
      if (!Array.isArray(logs) || logs.length === 0) {
        setError(emptyLogsMessage);
        setLoading(false);
        return;
      }
      const res = await dataProvider.analyzeLogsAi({ logs, question, context });
      const envelope = res?.data;
      if (!envelope) {
        setError("Empty response from AI analyzer");
      } else {
        setResult(envelope);
      }
    } catch (e) {
      setError(e?.message || "Analysis failed");
    } finally {
      setLoading(false);
    }
  }, [dataProvider, logsRef, question, context, emptyLogsMessage]);

  const severityColor = SEVERITY_COLOR[result?.severity] || SEVERITY_COLOR.low;
  const aiAvailable = modelInfo && Array.isArray(modelInfo.models) && modelInfo.models.length > 0;

  return (
    <Card
      variant="outlined"
      sx={{
        borderRadius: 3,
        border: `1px solid ${theme.palette.divider}`,
        borderTop: `3px solid ${alpha(theme.palette.primary.main, 0.6)}`,
        mb: 2,
      }}
    >
      <CardContent sx={{ p: 3 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 1 }}>
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: 2,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: alpha(theme.palette.primary.main, 0.1),
              color: theme.palette.primary.main,
            }}
          >
            <AutoAwesomeIcon sx={{ fontSize: 22 }} />
          </Box>
          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="subtitle1" fontWeight={700}>
              {title}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {subtitle}
              {modelInfo?.default ? ` · model: ${modelInfo.default}` : ""}
            </Typography>
          </Box>
          <Button
            variant="contained"
            size="small"
            disabled={loading}
            onClick={run}
            startIcon={
              loading ? (
                <CircularProgress size={14} color="inherit" />
              ) : result ? (
                <RefreshIcon fontSize="small" />
              ) : (
                <AutoAwesomeIcon fontSize="small" />
              )
            }
            sx={{ textTransform: "none", borderRadius: 2 }}
          >
            {loading ? "Analysing..." : result ? "Re-analyse" : "Analyze with AI"}
          </Button>
        </Box>

        {!aiAvailable && modelInfo !== null && (
          <Alert severity="info" sx={{ mt: 1 }}>
            No local Ollama models detected. Start Ollama on the host and pull a
            model (e.g. <code>ollama pull llama3.2</code>) to enable analysis.
          </Alert>
        )}

        {error && (
          <Alert severity="error" sx={{ mt: 1 }}>
            {error}
          </Alert>
        )}

        {!result && !loading && !error && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Click <em>Analyze with AI</em> to run a local LLM analysis over
            the current log entries. Data never leaves this host.
          </Typography>
        )}

        {result && (
          <Box sx={{ mt: 2 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
              <Chip
                label={(result.severity || "low").toUpperCase()}
                size="small"
                sx={{
                  backgroundColor: alpha(severityColor, 0.12),
                  color: severityColor,
                  fontWeight: 700,
                  fontSize: "0.7rem",
                }}
              />
            </Box>

            {result.analysis && (
              <Typography
                variant="body2"
                color="text.primary"
                sx={{ whiteSpace: "pre-wrap", mb: 2 }}
              >
                {result.analysis}
              </Typography>
            )}

            {Array.isArray(result.root_causes) && result.root_causes.length > 0 && (
              <Box sx={{ mb: 2 }}>
                <Box
                  sx={{ display: "flex", alignItems: "center", cursor: "pointer" }}
                  onClick={() => setExpandedCauses((v) => !v)}
                >
                  <Typography variant="subtitle2" fontWeight={700} sx={{ flexGrow: 1 }}>
                    Root Causes ({result.root_causes.length})
                  </Typography>
                  <IconButton size="small">
                    {expandedCauses ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                  </IconButton>
                </Box>
                <Collapse in={expandedCauses}>
                  <List dense disablePadding>
                    {result.root_causes.map((c, i) => (
                      <ListItem
                        key={i}
                        sx={{
                          alignItems: "flex-start",
                          borderLeft: `3px solid ${alpha(severityColor, 0.5)}`,
                          pl: 2,
                          py: 0.75,
                          mb: 0.5,
                          backgroundColor: alpha(severityColor, 0.04),
                          borderRadius: 1,
                        }}
                      >
                        <ListItemText
                          primary={
                            <Typography variant="body2">{String(c)}</Typography>
                          }
                        />
                      </ListItem>
                    ))}
                  </List>
                </Collapse>
              </Box>
            )}

            {Array.isArray(result.recommendations) && result.recommendations.length > 0 && (
              <Box sx={{ mb: 2 }}>
                <Divider sx={{ my: 1 }} />
                <Box
                  sx={{ display: "flex", alignItems: "center", cursor: "pointer" }}
                  onClick={() => setExpandedRecs((v) => !v)}
                >
                  <Typography variant="subtitle2" fontWeight={700} sx={{ flexGrow: 1 }}>
                    Recommendations ({result.recommendations.length})
                  </Typography>
                  <IconButton size="small">
                    {expandedRecs ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                  </IconButton>
                </Box>
                <Collapse in={expandedRecs}>
                  <List dense disablePadding>
                    {result.recommendations.map((r, i) => (
                      <ListItem
                        key={i}
                        sx={{
                          alignItems: "flex-start",
                          borderLeft: `3px solid ${alpha(theme.palette.success.main, 0.6)}`,
                          pl: 2,
                          py: 0.75,
                          mb: 0.5,
                          backgroundColor: alpha(theme.palette.success.main, 0.04),
                          borderRadius: 1,
                        }}
                      >
                        <ListItemText
                          primary={<Typography variant="body2">{String(r)}</Typography>}
                        />
                      </ListItem>
                    ))}
                  </List>
                </Collapse>
              </Box>
            )}

            {Array.isArray(result.related_patterns) && result.related_patterns.length > 0 && (
              <Box>
                <Divider sx={{ my: 1 }} />
                <Box
                  sx={{ display: "flex", alignItems: "center", cursor: "pointer" }}
                  onClick={() => setExpandedPatterns((v) => !v)}
                >
                  <Typography variant="subtitle2" fontWeight={700} sx={{ flexGrow: 1 }}>
                    Related Patterns ({result.related_patterns.length})
                  </Typography>
                  <IconButton size="small">
                    {expandedPatterns ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                  </IconButton>
                </Box>
                <Collapse in={expandedPatterns}>
                  <List dense disablePadding>
                    {result.related_patterns.map((p, i) => (
                      <ListItem key={i} sx={{ py: 0.25 }}>
                        <ListItemText
                          primary={
                            <Typography variant="caption" color="text.secondary">
                              {String(p)}
                            </Typography>
                          }
                        />
                      </ListItem>
                    ))}
                  </List>
                </Collapse>
              </Box>
            )}
          </Box>
        )}
      </CardContent>
    </Card>
  );
};

export default AiInsightsPanel;
