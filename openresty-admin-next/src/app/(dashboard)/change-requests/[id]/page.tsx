'use client';


import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  Chip,
  Stack,
  TextField,
  Card,
  CardContent,
  Grid,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
} from '@mui/material';
import AssignmentTurnedInRoundedIcon from '@mui/icons-material/AssignmentTurnedInRounded';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useParams, useRouter } from 'next/navigation';
import PageHeader from '@/components/ui/PageHeader';
import StatusBadge from '@/components/ui/StatusBadge';
import DiffViewer from '@/components/ui/DiffViewer';
import { useApi } from '@/hooks/useApi';
import { useNotification } from '@/contexts/NotificationContext';
import { config } from '@/lib/config/env';
import { getHeaders } from '@/lib/api/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Approval {
  user: string;
  approved_at?: number;
  comment?: string;
}

interface Rejection {
  user: string;
  rejected_at?: number;
  reason?: string;
}

interface ChangeRequest {
  id: string;
  state?: string;
  resource_name?: string;
  resource_type?: string;
  profile?: string;
  version?: number;
  change_type?: string;
  created_by?: string;
  created_at?: number;
  description?: string;
  approvals?: Approval[];
  rejections?: Rejection[];
  required_approvals?: number;
  diff?: DiffData;
  [key: string]: unknown;
}

interface DiffData {
  v1?: { version?: number; state?: string; created_by?: string };
  v2?: { version?: number; state?: string; created_by?: string };
  changes?: Array<{ change_type: string; field: string; old_value: unknown; new_value: unknown }>;
  total_changes?: number;
}

interface CRConfig {
  has_passphrase?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const formatDate = (timestamp?: number): string => {
  if (!timestamp) return '-';
  return new Date(timestamp * 1000).toLocaleString();
};

// ---------------------------------------------------------------------------
// Change Request Detail Page
// ---------------------------------------------------------------------------

export default function ChangeRequestDetailPage() {
  const params = useParams();
  const router = useRouter();
  const api = useApi();
  const { notify } = useNotification();
  const crId = params.id as string;
  const apiUrl = config.apiUrl;

  const [cr, setCr] = useState<ChangeRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [diffData, setDiffData] = useState<DiffData | null>(null);
  const [crConfig, setCrConfig] = useState<CRConfig>({});

  // Approve dialog
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [approverUser, setApproverUser] = useState('');
  const [approveComment, setApproveComment] = useState('');
  const [approvePassphrase, setApprovePassphrase] = useState('');

  // Reject dialog
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const fetchCR = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.getOne('change-requests', { id: crId });
      const data = result.data as unknown as ChangeRequest;
      setCr(data);

      // If CR has version info, attempt to fetch the diff
      if (data?.resource_type && data?.resource_name && data?.profile && data?.version) {
        try {
          const liveVersion = (data.version || 1) - 1;
          if (liveVersion > 0) {
            const diffUrl = `${apiUrl}/versions/${data.resource_type}/${data.profile}/${data.resource_name}/diff/${liveVersion}/${data.version}?timestamp=${Date.now()}`;
            const diffResponse = await fetch(diffUrl, { method: 'GET', headers: getHeaders() });
            if (diffResponse.ok) {
              const diffResult = await diffResponse.json();
              setDiffData(diffResult.data || null);
            }
          }
        } catch {
          // Diff is optional - silently ignore
        }
      }
    } catch (error) {
      console.error('Failed to fetch CR:', error);
      notify('Failed to load change request', { type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [api, crId, apiUrl, notify]);

  const fetchCRConfig = useCallback(async () => {
    try {
      const url = `${apiUrl}/change-requests/config?timestamp=${Date.now()}`;
      const response = await fetch(url, { method: 'GET', headers: getHeaders() });
      const result = await response.json();
      setCrConfig(result.data || {});
    } catch {
      // Config is optional
    }
  }, [apiUrl]);

  useEffect(() => {
    fetchCR();
    fetchCRConfig();
  }, [fetchCR, fetchCRConfig]);

  const handleApprove = async () => {
    if (!approverUser) return;
    try {
      const url = `${apiUrl}/change-requests/${crId}/approve`;
      const response = await fetch(url, {
        method: 'PUT',
        headers: { ...getHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ user: approverUser, comment: approveComment, passphrase: approvePassphrase }),
      });
      const result = await response.json();
      if (response.ok) {
        notify(result.message || 'CR approved', { type: 'success' });
        setApproveDialogOpen(false);
        setApproverUser('');
        setApproveComment('');
        setApprovePassphrase('');
        fetchCR();
      } else {
        notify(result?.data?.message || 'Failed to approve', { type: 'error' });
      }
    } catch {
      notify('Failed to approve CR', { type: 'error' });
    }
  };

  const handleReject = async () => {
    if (!approverUser) return;
    try {
      const url = `${apiUrl}/change-requests/${crId}/reject`;
      const response = await fetch(url, {
        method: 'PUT',
        headers: { ...getHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ user: approverUser, reason: rejectReason }),
      });
      const result = await response.json();
      if (response.ok) {
        notify(result.message || 'CR rejected', { type: 'success' });
        setRejectDialogOpen(false);
        setApproverUser('');
        setRejectReason('');
        fetchCR();
      } else {
        notify(result?.data?.message || 'Failed to reject', { type: 'error' });
      }
    } catch {
      notify('Failed to reject CR', { type: 'error' });
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!cr) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <Typography color="text.secondary">Change request not found</Typography>
        <Button startIcon={<ArrowBackIcon />} onClick={() => router.push('/change-requests')} sx={{ mt: 2 }}>
          Back to Change Requests
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <PageHeader
        title={`Change Request: ${cr.id}`}
        subtitle={`${cr.resource_type} / ${cr.resource_name}`}
        icon={<AssignmentTurnedInRoundedIcon />}
        actions={
          <Stack direction="row" spacing={1}>
            <Button startIcon={<ArrowBackIcon />} onClick={() => router.push('/change-requests')}>
              Back
            </Button>
            {cr.state === 'pending_approval' && (
              <>
                <Button
                  variant="contained"
                  color="success"
                  startIcon={<CheckCircleIcon />}
                  onClick={() => setApproveDialogOpen(true)}
                >
                  Approve
                </Button>
                <Button
                  variant="contained"
                  color="error"
                  startIcon={<CancelIcon />}
                  onClick={() => setRejectDialogOpen(true)}
                >
                  Reject
                </Button>
              </>
            )}
          </Stack>
        }
      />

      {/* CR Details */}
      <Card variant="outlined" sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={2}>
            <Grid item xs={6} sm={3}>
              <Typography variant="caption" color="text.secondary">Status</Typography>
              <Box sx={{ mt: 0.5 }}>
                <StatusBadge status={cr.state} />
              </Box>
            </Grid>
            <Grid item xs={6} sm={3}>
              <Typography variant="caption" color="text.secondary">Resource</Typography>
              <Typography variant="body2">{cr.resource_name}</Typography>
              <Typography variant="caption" color="text.secondary">{cr.resource_type}</Typography>
            </Grid>
            <Grid item xs={6} sm={3}>
              <Typography variant="caption" color="text.secondary">Version</Typography>
              <Typography variant="body2">
                <Chip label={`v${cr.version}`} size="small" variant="outlined" />
              </Typography>
            </Grid>
            <Grid item xs={6} sm={3}>
              <Typography variant="caption" color="text.secondary">Change Type</Typography>
              <Typography variant="body2">{cr.change_type}</Typography>
            </Grid>
            <Grid item xs={6} sm={3}>
              <Typography variant="caption" color="text.secondary">Profile</Typography>
              <Typography variant="body2">{cr.profile}</Typography>
            </Grid>
            <Grid item xs={6} sm={3}>
              <Typography variant="caption" color="text.secondary">Created By</Typography>
              <Typography variant="body2">{cr.created_by}</Typography>
            </Grid>
            <Grid item xs={6} sm={3}>
              <Typography variant="caption" color="text.secondary">Created At</Typography>
              <Typography variant="body2">{formatDate(cr.created_at)}</Typography>
            </Grid>
            <Grid item xs={12}>
              <Typography variant="caption" color="text.secondary">Description</Typography>
              <Typography variant="body2">{cr.description || '-'}</Typography>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Diff Viewer */}
      {diffData && (
        <Card variant="outlined" sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>Changes</Typography>
            <DiffViewer diffData={diffData} />
          </CardContent>
        </Card>
      )}

      {/* Approval History */}
      <Card variant="outlined" sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
            Approvals ({cr.approvals?.length || 0} / {cr.required_approvals || 2})
          </Typography>
          {cr.approvals && cr.approvals.length > 0 ? (
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600 }}>Approver</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Time</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Comment</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {cr.approvals.map((a, idx) => (
                    <TableRow key={idx}>
                      <TableCell>{a.user}</TableCell>
                      <TableCell>{formatDate(a.approved_at)}</TableCell>
                      <TableCell>{a.comment || '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          ) : (
            <Alert severity="warning">No approvals yet</Alert>
          )}
        </CardContent>
      </Card>

      {/* Rejection History */}
      {cr.rejections && cr.rejections.length > 0 && (
        <Card variant="outlined" sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>Rejections</Typography>
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600 }}>User</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Time</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Reason</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {cr.rejections.map((r, idx) => (
                    <TableRow key={idx}>
                      <TableCell>{r.user}</TableCell>
                      <TableCell>{formatDate(r.rejected_at)}</TableCell>
                      <TableCell>{r.reason || '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      )}

      {/* Approve Dialog */}
      <Dialog open={approveDialogOpen} onClose={() => setApproveDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Approve Change Request: {cr.id}</DialogTitle>
        <DialogContent>
          <Alert severity="info" sx={{ mb: 2 }}>
            <strong>4-Eyes Principle:</strong> You cannot approve a CR you created.
            Two different users must approve before the change goes live.
            {crConfig.has_passphrase && (
              <>
                <br /><strong>Approval passphrase required.</strong>
              </>
            )}
          </Alert>
          <TextField
            label="Your Username"
            fullWidth
            value={approverUser}
            onChange={(e) => setApproverUser(e.target.value)}
            sx={{ mb: 2 }}
            required
            helperText="Must be different from the CR creator"
          />
          {crConfig.has_passphrase && (
            <TextField
              label="Approval Passphrase"
              fullWidth
              type="password"
              value={approvePassphrase}
              onChange={(e) => setApprovePassphrase(e.target.value)}
              sx={{ mb: 2 }}
              required
              inputProps={{ autoComplete: 'new-password' }}
            />
          )}
          <TextField
            label="Comment (optional)"
            fullWidth
            multiline
            rows={2}
            value={approveComment}
            onChange={(e) => setApproveComment(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setApproveDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            color="success"
            onClick={handleApprove}
            disabled={!approverUser || (!!crConfig.has_passphrase && !approvePassphrase)}
          >
            Approve
          </Button>
        </DialogActions>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={rejectDialogOpen} onClose={() => setRejectDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Reject Change Request: {cr.id}</DialogTitle>
        <DialogContent>
          <TextField
            label="Your Username"
            fullWidth
            value={approverUser}
            onChange={(e) => setApproverUser(e.target.value)}
            sx={{ mb: 2 }}
            required
          />
          <TextField
            label="Reason for rejection"
            fullWidth
            multiline
            rows={3}
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            helperText="Explain why this change should not be applied"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRejectDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" color="error" onClick={handleReject} disabled={!approverUser}>
            Reject
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
