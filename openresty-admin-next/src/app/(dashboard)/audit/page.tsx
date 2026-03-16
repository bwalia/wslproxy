'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  Chip,
  Stack,
  TextField,
  MenuItem,
  CircularProgress,
} from '@mui/material';
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded';
import RefreshIcon from '@mui/icons-material/Refresh';
import PageHeader from '@/components/ui/PageHeader';
import DataTable from '@/components/ui/DataTable';
import type { Column } from '@/components/ui/DataTable';
import { useApi } from '@/hooks/useApi';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AuditEntry {
  id?: string;
  timestamp?: number;
  datetime?: string;
  action?: string;
  user?: string;
  resource_name?: string;
  resource_type?: string;
  details?: Record<string, unknown>;
  ip_address?: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const formatDate = (timestamp?: number): string => {
  if (!timestamp) return '-';
  return new Date(timestamp * 1000).toLocaleString();
};

const actionColors: Record<string, 'info' | 'warning' | 'success' | 'default' | 'error'> = {
  version_created: 'info',
  version_state_changed: 'warning',
  version_activated: 'success',
  version_archived: 'default',
  version_migrated: 'info',
  draft_updated: 'default',
  rollback_initiated: 'warning',
  cr_created: 'info',
  cr_approved: 'success',
  cr_fully_approved: 'success',
  cr_rejected: 'error',
  cr_cancelled: 'default',
};

// ---------------------------------------------------------------------------
// Audit Log Page
// ---------------------------------------------------------------------------

export default function AuditLogPage() {
  const api = useApi();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [actionFilter, setActionFilter] = useState('');
  const [resourceTypeFilter, setResourceTypeFilter] = useState('');

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const filter: Record<string, string> = {};
      if (actionFilter) filter.action = actionFilter;
      if (resourceTypeFilter) filter.resource_type = resourceTypeFilter;

      const result = await api.getList('audit', {
        filter,
        timestamp: Date.now(),
      });

      setEntries((result.data as unknown as AuditEntry[]) || []);
      setTotal(result.total || 0);
    } catch (error) {
      console.error('Failed to fetch audit logs:', error);
    } finally {
      setLoading(false);
    }
  }, [api, actionFilter, resourceTypeFilter]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const columns: Column<AuditEntry>[] = [
    {
      field: 'timestamp',
      label: 'Time',
      render: (entry) => (
        <Typography variant="caption">
          {entry.datetime || formatDate(entry.timestamp)}
        </Typography>
      ),
    },
    {
      field: 'action',
      label: 'Action',
      render: (entry) => (
        <Chip
          label={entry.action?.replace(/_/g, ' ')}
          size="small"
          color={actionColors[entry.action || ''] || 'default'}
          variant="outlined"
          sx={{ fontSize: '0.7rem', textTransform: 'capitalize' }}
        />
      ),
    },
    {
      field: 'user',
      label: 'User',
      render: (entry) => (
        <Typography variant="body2">{entry.user}</Typography>
      ),
    },
    {
      field: 'resource_name',
      label: 'Resource',
      render: (entry) => (
        <Stack>
          <Typography variant="body2">{entry.resource_name}</Typography>
          <Typography variant="caption" color="text.secondary">{entry.resource_type}</Typography>
        </Stack>
      ),
    },
    {
      field: 'details',
      label: 'Details',
      render: (entry) => (
        <Typography
          variant="caption"
          sx={{
            fontFamily: 'monospace',
            fontSize: '0.75rem',
            maxWidth: 300,
            display: 'block',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {entry.details ? JSON.stringify(entry.details) : '-'}
        </Typography>
      ),
    },
    {
      field: 'ip_address',
      label: 'IP',
      render: (entry) => (
        <Typography variant="caption" color="text.secondary">
          {entry.ip_address || '-'}
        </Typography>
      ),
    },
  ];

  const filterControls = (
    <Stack direction="row" spacing={2} alignItems="center">
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
    </Stack>
  );

  return (
    <Box sx={{ p: 3 }}>
      <PageHeader
        title="Audit Log"
        subtitle={`${total} entries`}
        icon={<HistoryRoundedIcon />}
        actions={
          <Button variant="outlined" size="small" startIcon={<RefreshIcon />} onClick={fetchLogs}>
            Refresh
          </Button>
        }
      />

      {loading && !entries.length ? (
        <Box sx={{ textAlign: 'center', py: 5 }}>
          <CircularProgress size={30} />
        </Box>
      ) : (
        <DataTable<AuditEntry>
          columns={columns}
          data={entries}
          total={total}
          loading={loading}
          filters={filterControls}
          emptyMessage="audit entries"
        />
      )}
    </Box>
  );
}
