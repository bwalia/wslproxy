'use client';
import React from 'react';
import { Chip } from '@mui/material';

const statusConfig: Record<string, { color: string; bgColor: string; label: string }> = {
  live: { color: '#16a34a', bgColor: '#dcfce7', label: 'Live' },
  draft: { color: '#2563eb', bgColor: '#dbeafe', label: 'Draft' },
  pending_approval: { color: '#d97706', bgColor: '#fef3c7', label: 'Pending Approval' },
  approved: { color: '#0d9488', bgColor: '#ccfbf1', label: 'Approved' },
  archived: { color: '#6b7280', bgColor: '#f3f4f6', label: 'Archived' },
  rolled_back: { color: '#ea580c', bgColor: '#ffedd5', label: 'Rolled Back' },
  rejected: { color: '#dc2626', bgColor: '#fee2e2', label: 'Rejected' },
  cancelled: { color: '#6b7280', bgColor: '#f3f4f6', label: 'Cancelled' },
};

interface StatusBadgeProps {
  status?: string;
}

const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  if (!status) return null;
  const cfg = statusConfig[status] || statusConfig.draft;
  return (
    <Chip
      label={cfg.label}
      size="small"
      sx={{
        backgroundColor: cfg.bgColor,
        color: cfg.color,
        fontWeight: 600,
        fontSize: '0.75rem',
      }}
    />
  );
};

export default StatusBadge;
