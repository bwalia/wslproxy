'use client';
import React from 'react';
import { Chip, alpha, useTheme } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';

interface StatusChipProps {
  value: boolean;
  successLabel?: string;
  failLabel?: string;
}

const StatusChip: React.FC<StatusChipProps> = ({
  value,
  successLabel = 'Enabled',
  failLabel = 'Disabled',
}) => {
  const theme = useTheme();

  const color = value
    ? theme.palette.success.main
    : theme.palette.error.main;

  return (
    <Chip
      icon={value ? <CheckCircleIcon fontSize="small" /> : <CancelIcon fontSize="small" />}
      label={value ? successLabel : failLabel}
      size="small"
      sx={{
        backgroundColor: alpha(color, 0.1),
        color: color,
        fontWeight: 600,
        fontSize: '0.75rem',
        '& .MuiChip-icon': {
          color: color,
        },
      }}
    />
  );
};

export { StatusChip };
export default StatusChip;
