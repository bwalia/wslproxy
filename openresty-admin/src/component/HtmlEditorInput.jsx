import React, { useState, useCallback, useRef, useEffect } from "react";
import { useInput } from "ra-core";
import {
  Box,
  Tabs,
  Tab,
  Typography,
  FormHelperText,
  Paper,
  useTheme,
} from "@mui/material";
import CodeMirror from "@uiw/react-codemirror";
import { html } from "@codemirror/lang-html";

/**
 * Try to decode a value that may be Base64-encoded or URI-encoded.
 * Returns the decoded HTML string, or the original value if decoding fails.
 */
function tryDecodeBase64(value) {
  if (!value) return "";
  // Try Base64 decode first
  try {
    const decoded = decodeURIComponent(escape(atob(value)));
    if (/^[\x20-\x7E\t\n\r]*$/.test(decoded) || decoded.includes("<")) {
      return decoded;
    }
  } catch (e) {
    // Not valid Base64
  }
  // Try URI-decoded (legacy encoding used by old Toolbar)
  try {
    const decoded = decodeURIComponent(value);
    if (decoded !== value) return decoded;
  } catch (e) {
    // Not URI-encoded
  }
  return value;
}

const HtmlEditorInput = ({ source, label, ...rest }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";

  const {
    field,
    fieldState: { error },
  } = useInput({ source, ...rest });

  const [activeTab, setActiveTab] = useState(0);
  const [htmlValue, setHtmlValue] = useState("");
  const initializedRef = useRef(false);

  // Decode the stored value on first load
  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true;
      setHtmlValue(tryDecodeBase64(field.value));
    }
  }, [field.value]);

  const handleChange = useCallback(
    (val) => {
      setHtmlValue(val);
      // Store raw HTML in form state; Base64 encoding happens in Toolbar on save
      field.onChange(val);
    },
    [field]
  );

  return (
    <Box sx={{ width: "100%" }}>
      <Typography
        variant="caption"
        sx={{ mb: 0.5, color: "text.secondary" }}
      >
        {label || "Response Body (HTML)"}
      </Typography>

      <Paper
        variant="outlined"
        sx={{
          overflow: "hidden",
          borderColor: isDark ? "#334155" : theme.palette.divider,
          bgcolor: "background.paper",
        }}
      >
        <Tabs
          value={activeTab}
          onChange={(_, v) => setActiveTab(v)}
          sx={{
            minHeight: 36,
            borderBottom: 1,
            borderColor: isDark ? "#334155" : "divider",
            bgcolor: isDark ? "rgba(15, 23, 42, 0.5)" : "grey.50",
            "& .MuiTab-root": {
              minHeight: 36,
              textTransform: "none",
              fontSize: "0.8125rem",
              color: "text.secondary",
              "&.Mui-selected": {
                color: "primary.main",
              },
            },
            "& .MuiTabs-indicator": {
              backgroundColor: "primary.main",
            },
          }}
        >
          <Tab label="HTML Editor" />
          <Tab label="Preview" />
        </Tabs>

        {/* Editor Tab */}
        {activeTab === 0 && (
          <CodeMirror
            value={htmlValue}
            height="300px"
            theme={isDark ? "dark" : "light"}
            extensions={[html()]}
            onChange={handleChange}
            basicSetup={{
              lineNumbers: true,
              foldGutter: true,
              bracketMatching: true,
              closeBrackets: true,
              autocompletion: true,
            }}
            style={{
              fontSize: "0.875rem",
            }}
          />
        )}

        {/* Preview Tab */}
        {activeTab === 1 && (
          <Box sx={{ minHeight: 300, p: 0, bgcolor: "background.paper" }}>
            {htmlValue ? (
              <iframe
                title="HTML Preview"
                srcDoc={`<!DOCTYPE html>
<html>
<head><style>
  body {
    font-family: ${theme.typography.fontFamily};
    margin: 12px;
    color: ${theme.palette.text.primary};
    background: ${theme.palette.background.paper};
  }
</style></head>
<body>${htmlValue}</body>
</html>`}
                sandbox="allow-same-origin"
                style={{
                  width: "100%",
                  height: 300,
                  border: "none",
                  display: "block",
                }}
              />
            ) : (
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  height: 300,
                  color: "text.disabled",
                }}
              >
                <Typography variant="body2">
                  No HTML content to preview
                </Typography>
              </Box>
            )}
          </Box>
        )}
      </Paper>

      <FormHelperText error={!!error} sx={{ color: "text.secondary" }}>
        {error?.message ||
          "Write HTML directly \u2014 it will be automatically Base64-encoded when saved"}
      </FormHelperText>
    </Box>
  );
};

export default HtmlEditorInput;
