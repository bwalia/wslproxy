'use client';

import React from 'react';
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
  Chip,
  Card,
  CardContent,
  Grid,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import EditIcon from '@mui/icons-material/Edit';
import StatusBadge from '@/components/ui/StatusBadge';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface VersionInfo {
  version?: number;
  state?: string;
  created_by?: string;
}

interface Change {
  change_type: string;
  field: string;
  old_value: unknown;
  new_value: unknown;
}

export interface DiffData {
  v1?: VersionInfo;
  v2?: VersionInfo;
  changes?: Change[];
  total_changes?: number;
}

interface DiffViewerProps {
  diffData: DiffData;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const changeTypeConfig: Record<string, { icon: React.ReactElement; color: string; bg: string; label: string }> = {
  added: { icon: <AddIcon fontSize="small" />, color: '#2e7d32', bg: '#e8f5e9', label: 'Added' },
  removed: { icon: <RemoveIcon fontSize="small" />, color: '#c62828', bg: '#ffebee', label: 'Removed' },
  modified: { icon: <EditIcon fontSize="small" />, color: '#e65100', bg: '#fff3e0', label: 'Modified' },
};

const formatValue = (value: unknown): React.ReactNode => {
  if (value === null || value === undefined) return <em style={{ color: '#999' }}>null</em>;
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
};

// ---------------------------------------------------------------------------
// DiffViewer Component
// ---------------------------------------------------------------------------

const DiffViewer: React.FC<DiffViewerProps> = ({ diffData }) => {
  if (!diffData) return null;

  const { v1, v2, changes, total_changes } = diffData;

  return (
    <Box>
      {/* Version Headers */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={6}>
          <Card variant="outlined">
            <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
              <Typography variant="body2" color="text.secondary">
                Version {v1?.version}
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                <StatusBadge status={v1?.state} />
                <Typography variant="caption" color="text.secondary">
                  by {v1?.created_by}
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6}>
          <Card variant="outlined">
            <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
              <Typography variant="body2" color="text.secondary">
                Version {v2?.version}
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                <StatusBadge status={v2?.state} />
                <Typography variant="caption" color="text.secondary">
                  by {v2?.created_by}
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Changes Summary */}
      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        {total_changes} change{total_changes !== 1 ? 's' : ''} found
      </Typography>

      {/* Changes Table */}
      {total_changes && total_changes > 0 ? (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 600, width: '15%' }}>Type</TableCell>
                <TableCell sx={{ fontWeight: 600, width: '25%' }}>Field</TableCell>
                <TableCell sx={{ fontWeight: 600, width: '30%' }}>v{v1?.version} Value</TableCell>
                <TableCell sx={{ fontWeight: 600, width: '30%' }}>v{v2?.version} Value</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {changes?.map((change, idx) => {
                const cfg = changeTypeConfig[change.change_type] || changeTypeConfig.modified;
                return (
                  <TableRow key={idx} sx={{ backgroundColor: cfg.bg + '40' }}>
                    <TableCell>
                      <Chip
                        icon={cfg.icon}
                        label={cfg.label}
                        size="small"
                        sx={{
                          backgroundColor: cfg.bg,
                          color: cfg.color,
                          fontWeight: 500,
                          fontSize: '0.7rem',
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                        {change.field}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Box
                        sx={{
                          fontFamily: 'monospace',
                          fontSize: '0.8rem',
                          whiteSpace: 'pre-wrap',
                          maxHeight: 120,
                          overflow: 'auto',
                          backgroundColor: change.change_type === 'removed' ? '#ffebee' : 'transparent',
                          p: 0.5,
                          borderRadius: 0.5,
                        }}
                      >
                        {formatValue(change.old_value)}
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Box
                        sx={{
                          fontFamily: 'monospace',
                          fontSize: '0.8rem',
                          whiteSpace: 'pre-wrap',
                          maxHeight: 120,
                          overflow: 'auto',
                          backgroundColor: change.change_type === 'added' ? '#e8f5e9' : 'transparent',
                          p: 0.5,
                          borderRadius: 0.5,
                        }}
                      >
                        {formatValue(change.new_value)}
                      </Box>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      ) : (
        <Paper variant="outlined" sx={{ p: 3, textAlign: 'center' }}>
          <Typography color="text.secondary">No differences found between these versions</Typography>
        </Paper>
      )}
    </Box>
  );
};

export default DiffViewer;
