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
  Card,
  CardContent,
  Grid,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  IconButton,
  Tooltip,
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
import VisibilityIcon from '@mui/icons-material/Visibility';
import RefreshIcon from '@mui/icons-material/Refresh';
import SettingsIcon from '@mui/icons-material/Settings';
import PageHeader from '@/components/ui/PageHeader';
import StatusBadge from '@/components/ui/StatusBadge';
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
  [key: string]: unknown;
}

interface CRConfig {
  has_passphrase?: boolean;
  passphrase_set_by?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const formatDate = (timestamp?: number): string => {
  if (!timestamp) return '-';
  return new Date(timestamp * 1000).toLocaleString();
};

// ---------------------------------------------------------------------------
// Change Requests Page
// ---------------------------------------------------------------------------

export default function ChangeRequestListPage() {
  const api = useApi();
  const { notify } = useNotification();
  const [crs, setCrs] = useState<ChangeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [stateFilter, setStateFilter] = useState('');
  const [pendingCount, setPendingCount] = useState(0);

  // Dialog states
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedCR, setSelectedCR] = useState<ChangeRequest | null>(null);
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [actionCR, setActionCR] = useState<ChangeRequest | null>(null);
  const [approverUser, setApproverUser] = useState('');
  const [approveComment, setApproveComment] = useState('');
  const [approvePassphrase, setApprovePassphrase] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [crConfig, setCrConfig] = useState<CRConfig>({});
  const [passphraseDialogOpen, setPassphraseDialogOpen] = useState(false);
  const [newPassphrase, setNewPassphrase] = useState('');
  const [passphraseUser, setPassphraseUser] = useState('');

  const apiUrl = config.apiUrl;

  const fetchCRs = useCallback(async () => {
    setLoading(true);
    try {
      const filter: Record<string, string> = {};
      if (stateFilter) filter.state = stateFilter;
      const result = await api.getList('change-requests', { filter, timestamp: Date.now() });
      setCrs((result.data as unknown as ChangeRequest[]) || []);
    } catch (error) {
      console.error('Failed to fetch CRs:', error);
    } finally {
      setLoading(false);
    }
  }, [api, stateFilter]);

  const fetchPendingCount = useCallback(async () => {
    try {
      const url = `${apiUrl}/change-requests/pending-count?timestamp=${Date.now()}`;
      const response = await fetch(url, { method: 'GET', headers: getHeaders() });
      const result = await response.json();
      setPendingCount(result.data?.count || 0);
    } catch (error) {
      console.error('Failed to fetch pending count:', error);
    }
  }, [apiUrl]);

  const fetchCRConfig = useCallback(async () => {
    try {
      const url = `${apiUrl}/change-requests/config?timestamp=${Date.now()}`;
      const response = await fetch(url, { method: 'GET', headers: getHeaders() });
      const result = await response.json();
      setCrConfig(result.data || {});
    } catch (error) {
      console.error('Failed to fetch CR config:', error);
    }
  }, [apiUrl]);

  useEffect(() => {
    fetchCRs();
    fetchPendingCount();
    fetchCRConfig();
  }, [fetchCRs, fetchPendingCount, fetchCRConfig]);

  const handleViewCR = (cr: ChangeRequest) => {
    setSelectedCR(cr);
    setDetailOpen(true);
  };

  const handleApprove = async () => {
    if (!actionCR || !approverUser) return;
    try {
      const url = `${apiUrl}/change-requests/${actionCR.id}/approve`;
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
        fetchCRs();
        fetchPendingCount();
      } else {
        notify(result?.data?.message || 'Failed to approve', { type: 'error' });
      }
    } catch {
      notify('Failed to approve CR', { type: 'error' });
    }
  };

  const handleSetPassphrase = async () => {
    if (!newPassphrase || !passphraseUser) return;
    try {
      const url = `${apiUrl}/change-requests/config/passphrase`;
      const response = await fetch(url, {
        method: 'PUT',
        headers: { ...getHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ passphrase: newPassphrase, user: passphraseUser }),
      });
      if (response.ok) {
        notify('CR approval passphrase updated', { type: 'success' });
        setPassphraseDialogOpen(false);
        setNewPassphrase('');
        setPassphraseUser('');
        fetchCRConfig();
      } else {
        const result = await response.json();
        notify(result?.data?.message || 'Failed to set passphrase', { type: 'error' });
      }
    } catch {
      notify('Failed to set passphrase', { type: 'error' });
    }
  };

  const handleReject = async () => {
    if (!actionCR || !approverUser) return;
    try {
      const url = `${apiUrl}/change-requests/${actionCR.id}/reject`;
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
        fetchCRs();
        fetchPendingCount();
      } else {
        notify(result?.data?.message || 'Failed to reject', { type: 'error' });
      }
    } catch {
      notify('Failed to reject CR', { type: 'error' });
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <PageHeader
        title="Change Requests"
        subtitle="4-eyes approval workflow for configuration changes"
        icon={<AssignmentTurnedInRoundedIcon />}
        actions={
          <Stack direction="row" spacing={1}>
            <Button variant="outlined" size="small" startIcon={<RefreshIcon />} onClick={fetchCRs}>
              Refresh
            </Button>
            <Button
              variant="outlined"
              size="small"
              startIcon={<SettingsIcon />}
              onClick={() => setPassphraseDialogOpen(true)}
              color={crConfig.has_passphrase ? 'success' : 'warning'}
            >
              {crConfig.has_passphrase ? 'Passphrase Set' : 'Set Approval Passphrase'}
            </Button>
          </Stack>
        }
      />

      {/* Summary Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={3}>
          <Card variant="outlined" sx={{ borderColor: pendingCount > 0 ? 'warning.main' : 'divider' }}>
            <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
              <Typography variant="caption" color="text.secondary">Pending Approval</Typography>
              <Typography variant="h5" color={pendingCount > 0 ? 'warning.main' : 'text.primary'} sx={{ fontWeight: 700 }}>
                {pendingCount}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={3}>
          <Card variant="outlined">
            <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
              <Typography variant="caption" color="text.secondary">Total CRs</Typography>
              <Typography variant="h5" sx={{ fontWeight: 700 }}>{crs.length}</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Filters */}
      <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
        <TextField
          select
          size="small"
          label="State"
          value={stateFilter}
          onChange={(e) => setStateFilter(e.target.value)}
          sx={{ minWidth: 180 }}
        >
          <MenuItem value="">All</MenuItem>
          <MenuItem value="pending_approval">Pending Approval</MenuItem>
          <MenuItem value="approved">Approved</MenuItem>
          <MenuItem value="rejected">Rejected</MenuItem>
          <MenuItem value="cancelled">Cancelled</MenuItem>
        </TextField>
      </Stack>

      {/* CR Table */}
      {loading ? (
        <Box sx={{ textAlign: 'center', py: 5 }}>
          <CircularProgress size={30} />
        </Box>
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 600 }}>CR ID</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Resource</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Version</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Type</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Created By</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Created At</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Approvals</TableCell>
                <TableCell sx={{ fontWeight: 600, textAlign: 'right' }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {crs.map((cr) => (
                <TableRow
                  key={cr.id}
                  sx={{
                    backgroundColor: cr.state === 'pending_approval' ? '#fff8e1' : 'inherit',
                    '&:hover': { backgroundColor: 'action.hover' },
                  }}
                >
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 600, fontFamily: 'monospace' }}>
                      {cr.id}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={cr.state} />
                  </TableCell>
                  <TableCell>
                    <Stack>
                      <Typography variant="body2">{cr.resource_name}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {cr.resource_type} / {cr.profile}
                      </Typography>
                    </Stack>
                  </TableCell>
                  <TableCell>
                    <Chip label={`v${cr.version}`} size="small" variant="outlined" />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">{cr.change_type}</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">{cr.created_by}</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption">{formatDate(cr.created_at)}</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">
                      {cr.approvals?.length || 0} / {cr.required_approvals || 2}
                    </Typography>
                  </TableCell>
                  <TableCell sx={{ textAlign: 'right' }}>
                    <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                      <Tooltip title="View Details">
                        <IconButton size="small" onClick={() => handleViewCR(cr)}>
                          <VisibilityIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      {cr.state === 'pending_approval' && (
                        <>
                          <Tooltip title="Approve">
                            <IconButton
                              size="small"
                              color="success"
                              onClick={() => { setActionCR(cr); setApproveDialogOpen(true); }}
                            >
                              <CheckCircleIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Reject">
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() => { setActionCR(cr); setRejectDialogOpen(true); }}
                            >
                              <CancelIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </>
                      )}
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
              {crs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} sx={{ textAlign: 'center', py: 4 }}>
                    <Typography color="text.secondary">
                      {stateFilter ? `No ${stateFilter} change requests found` : 'No change requests found'}
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* CR Detail Dialog */}
      <Dialog open={detailOpen} onClose={() => setDetailOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          {selectedCR?.id}
          <Box sx={{ display: 'inline-block', ml: 2 }}>
            <StatusBadge status={selectedCR?.state} />
          </Box>
        </DialogTitle>
        <DialogContent>
          {selectedCR && (
            <Box>
              <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid item xs={6} sm={3}>
                  <Typography variant="caption" color="text.secondary">Resource</Typography>
                  <Typography variant="body2">{selectedCR.resource_name}</Typography>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Typography variant="caption" color="text.secondary">Type</Typography>
                  <Typography variant="body2">{selectedCR.resource_type} / {selectedCR.change_type}</Typography>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Typography variant="caption" color="text.secondary">Version</Typography>
                  <Typography variant="body2">v{selectedCR.version}</Typography>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Typography variant="caption" color="text.secondary">Profile</Typography>
                  <Typography variant="body2">{selectedCR.profile}</Typography>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Typography variant="caption" color="text.secondary">Created By</Typography>
                  <Typography variant="body2">{selectedCR.created_by}</Typography>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Typography variant="caption" color="text.secondary">Created At</Typography>
                  <Typography variant="body2">{formatDate(selectedCR.created_at)}</Typography>
                </Grid>
                <Grid item xs={12}>
                  <Typography variant="caption" color="text.secondary">Description</Typography>
                  <Typography variant="body2">{selectedCR.description || '-'}</Typography>
                </Grid>
              </Grid>

              {/* Approvals */}
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Approvals ({selectedCR.approvals?.length || 0} / {selectedCR.required_approvals || 2})
              </Typography>
              {selectedCR.approvals && selectedCR.approvals.length > 0 ? (
                <TableContainer component={Paper} variant="outlined" sx={{ mb: 2 }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 600 }}>Approver</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Time</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Comment</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {selectedCR.approvals.map((a, idx) => (
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
                <Alert severity="warning" sx={{ mb: 2 }}>No approvals yet</Alert>
              )}

              {/* Rejections */}
              {selectedCR.rejections && selectedCR.rejections.length > 0 && (
                <>
                  <Typography variant="subtitle2" sx={{ mb: 1 }}>Rejections</Typography>
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
                        {selectedCR.rejections.map((r, idx) => (
                          <TableRow key={idx}>
                            <TableCell>{r.user}</TableCell>
                            <TableCell>{formatDate(r.rejected_at)}</TableCell>
                            <TableCell>{r.reason || '-'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          {selectedCR?.state === 'pending_approval' && (
            <>
              <Button
                color="success"
                variant="contained"
                onClick={() => { setActionCR(selectedCR); setDetailOpen(false); setApproveDialogOpen(true); }}
                startIcon={<CheckCircleIcon />}
              >
                Approve
              </Button>
              <Button
                color="error"
                variant="contained"
                onClick={() => { setActionCR(selectedCR); setDetailOpen(false); setRejectDialogOpen(true); }}
                startIcon={<CancelIcon />}
              >
                Reject
              </Button>
            </>
          )}
          <Button onClick={() => setDetailOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Approve Dialog */}
      <Dialog open={approveDialogOpen} onClose={() => setApproveDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Approve Change Request: {actionCR?.id}</DialogTitle>
        <DialogContent>
          <Alert severity="info" sx={{ mb: 2 }}>
            <strong>4-Eyes Principle:</strong> You cannot approve a CR you created.
            Two different users must approve before the change goes live.
            {crConfig.has_passphrase && (
              <>
                <br /><strong>Approval passphrase required.</strong> Contact your admin if you do not have it.
              </>
            )}
          </Alert>
          <Typography variant="body2" sx={{ mb: 2 }}>
            Resource: {actionCR?.resource_name} (v{actionCR?.version})
          </Typography>
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
              helperText="Secret code required to approve changes"
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

      {/* Set Passphrase Dialog */}
      <Dialog open={passphraseDialogOpen} onClose={() => setPassphraseDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>CR Approval Passphrase</DialogTitle>
        <DialogContent>
          <Alert severity={crConfig.has_passphrase ? 'success' : 'warning'} sx={{ mb: 2 }}>
            {crConfig.has_passphrase
              ? `Passphrase is configured (set by ${crConfig.passphrase_set_by || 'unknown'}). Anyone approving a CR must provide this passphrase.`
              : 'No passphrase is configured. Anyone can approve CRs without a secret code. Set one to secure the approval process.'}
          </Alert>
          <TextField
            label="Your Username"
            fullWidth
            value={passphraseUser}
            onChange={(e) => setPassphraseUser(e.target.value)}
            sx={{ mb: 2 }}
            required
          />
          <TextField
            label={crConfig.has_passphrase ? 'New Passphrase (replaces existing)' : 'Set Passphrase'}
            fullWidth
            type="password"
            value={newPassphrase}
            onChange={(e) => setNewPassphrase(e.target.value)}
            required
            helperText="This passphrase will be required for all future CR approvals"
            inputProps={{ autoComplete: 'new-password' }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPassphraseDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleSetPassphrase}
            disabled={!newPassphrase || !passphraseUser}
          >
            {crConfig.has_passphrase ? 'Update Passphrase' : 'Set Passphrase'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={rejectDialogOpen} onClose={() => setRejectDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Reject Change Request: {actionCR?.id}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            Resource: {actionCR?.resource_name} (v{actionCR?.version})
          </Typography>
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
