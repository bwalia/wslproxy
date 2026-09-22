import React from "react";
import { useInput } from "react-admin";
import {
  Box,
  Button,
  Grid,
  IconButton,
  MenuItem,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";

/**
 * Editor for `api_gw.rate_limit.profiles`.
 *
 * That field is a MAP — `{ standard: {limit, window_seconds, key}, ... }` —
 * not an array, so ArrayInput/SimpleFormIterator cannot represent it: they
 * would turn the profile names into indices and the gateway would stop
 * finding them by name. This keeps the record shape exactly as
 * docs/api-gw.schema.json defines it and edits rows in between, so what the
 * form writes back is what api_gw/config.lua reads.
 *
 * Leaving this empty is the normal case: api_gw/config.lua ships defaults for
 * health, auth, public, standard, expensive and webhook. Rows here override a
 * default by name, or add a new profile.
 */

// Mirrors default_rate_profiles() in api/api_gw/config.lua, shown as
// placeholder text so an operator can see what they are overriding.
const SHIPPED_DEFAULTS = {
  health: { limit: 600, window_seconds: 60, key: "ip" },
  auth: { limit: 10, window_seconds: 60, key: "ip" },
  public: { limit: 120, window_seconds: 60, key: "ip" },
  standard: { limit: 600, window_seconds: 60, key: "consumer" },
  expensive: { limit: 30, window_seconds: 60, key: "consumer" },
  webhook: { limit: 1200, window_seconds: 60, key: "ip" },
};

const KEY_CHOICES = [
  { id: "ip", name: "ip — per client address" },
  { id: "consumer", name: "consumer — per authenticated identity" },
  { id: "jwt.sub", name: "jwt.sub — per token subject" },
  { id: "header", name: "header — per named request header" },
];

export const toRows = (value) =>
  Object.entries(value && typeof value === "object" ? value : {}).map(
    ([name, cfg]) => ({ name, ...(cfg && typeof cfg === "object" ? cfg : {}) })
  );

export const toMap = (rows) => {
  const out = {};
  rows.forEach(({ name, ...cfg }) => {
    const trimmed = (name || "").trim();
    if (!trimmed) return; // a half-typed row is not a profile yet
    const entry = {};
    if (cfg.limit !== "" && cfg.limit != null) entry.limit = Number(cfg.limit);
    if (cfg.window_seconds !== "" && cfg.window_seconds != null)
      entry.window_seconds = Number(cfg.window_seconds);
    if (cfg.key) entry.key = cfg.key;
    if (cfg.header) entry.header = cfg.header;
    out[trimmed] = entry;
  });
  return out;
};

const RateProfilesInput = ({ source }) => {
  const { field } = useInput({ source });
  // Row identity has to survive a rename, so rows live in local state and the
  // map is derived from them. Deriving rows from the map instead would
  // re-key the list on every keystroke and steal focus.
  const [rows, setRows] = React.useState(() => toRows(field.value));

  const commit = (next) => {
    setRows(next);
    field.onChange(toMap(next));
  };

  const update = (idx, patch) =>
    commit(rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));

  const duplicate = (name, idx) =>
    !!name && rows.some((r, i) => i !== idx && r.name === name);

  return (
    <Box>
      {rows.length === 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          No overrides — the six built-in profiles (health, auth, public,
          standard, expensive, webhook) apply as shipped.
        </Typography>
      )}

      {rows.map((row, idx) => {
        const shipped = SHIPPED_DEFAULTS[row.name];
        return (
          <Grid container spacing={1} key={idx} alignItems="center" sx={{ mb: 1 }}>
            <Grid item xs={12} sm={3}>
              <TextField
                fullWidth
                size="small"
                label="Profile name"
                value={row.name || ""}
                error={duplicate(row.name, idx)}
                helperText={
                  duplicate(row.name, idx)
                    ? "Duplicate — the last row would win"
                    : shipped
                    ? "Overrides a built-in profile"
                    : " "
                }
                onChange={(e) => update(idx, { name: e.target.value })}
              />
            </Grid>
            <Grid item xs={6} sm={2}>
              <TextField
                fullWidth
                size="small"
                type="number"
                label="Limit"
                value={row.limit ?? ""}
                placeholder={shipped ? String(shipped.limit) : ""}
                helperText=" "
                onChange={(e) => update(idx, { limit: e.target.value })}
              />
            </Grid>
            <Grid item xs={6} sm={2}>
              <TextField
                fullWidth
                size="small"
                type="number"
                label="Window (s)"
                value={row.window_seconds ?? ""}
                placeholder={shipped ? String(shipped.window_seconds) : "60"}
                helperText=" "
                onChange={(e) => update(idx, { window_seconds: e.target.value })}
              />
            </Grid>
            <Grid item xs={8} sm={3}>
              <TextField
                select
                fullWidth
                size="small"
                label="Key"
                value={row.key || ""}
                helperText=" "
                onChange={(e) => update(idx, { key: e.target.value })}
              >
                {KEY_CHOICES.map((c) => (
                  <MenuItem key={c.id} value={c.id}>
                    {c.name}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={4} sm={2}>
              {row.key === "header" ? (
                <TextField
                  fullWidth
                  size="small"
                  label="Header"
                  value={row.header || ""}
                  helperText=" "
                  onChange={(e) => update(idx, { header: e.target.value })}
                />
              ) : (
                <Tooltip title="Remove this profile">
                  <IconButton
                    aria-label="Remove profile"
                    onClick={() => commit(rows.filter((_, i) => i !== idx))}
                  >
                    ✕
                  </IconButton>
                </Tooltip>
              )}
            </Grid>
            {row.key === "header" && (
              <Grid item xs={12}>
                <Button
                  size="small"
                  onClick={() => commit(rows.filter((_, i) => i !== idx))}
                >
                  Remove {row.name || "profile"}
                </Button>
              </Grid>
            )}
          </Grid>
        );
      })}

      <Button
        size="small"
        variant="outlined"
        onClick={() =>
          commit([...rows, { name: "", limit: "", window_seconds: 60, key: "ip" }])
        }
      >
        Add rate profile
      </Button>
    </Box>
  );
};

export default RateProfilesInput;
