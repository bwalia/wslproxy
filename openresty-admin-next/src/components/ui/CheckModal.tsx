'use client';
import React from 'react';
import { Dialog, DialogContent, Typography, IconButton } from '@mui/material';
import CheckCircle from '@mui/icons-material/CheckCircle';

interface CheckModalProps {
  open: boolean;
  onClose: () => void;
}

const CheckModal: React.FC<CheckModalProps> = ({ open, onClose }) => (
  <Dialog open={open} onClose={onClose}>
    <DialogContent>
      <IconButton>
        <CheckCircle color="primary" sx={{ fontSize: 40 }} />
      </IconButton>
      <Typography variant="h6">API data synced</Typography>
    </DialogContent>
  </Dialog>
);

export default CheckModal;
