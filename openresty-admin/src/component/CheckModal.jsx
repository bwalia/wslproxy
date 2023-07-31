import React from 'react';
import { Dialog, DialogContent, Typography, IconButton } from "@mui/material";
import CheckCircle from '@mui/icons-material/CheckCircle';

const CheckModal = ({ open, onClose }) => {
  return (
    <Dialog open={open} onClose={onClose}>
      <DialogContent>
        <IconButton>
          <CheckCircle color="primary" sx={{ fontSize: 40 }} />
        </IconButton>
        <Typography variant="h6">API data synced</Typography>
      </DialogContent>
    </Dialog>
  )
}

export default CheckModal