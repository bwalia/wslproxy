'use client';
import React from 'react';
import { Box, Typography, Button } from '@mui/material';
import InboxIcon from '@mui/icons-material/Inbox';
import AddIcon from '@mui/icons-material/Add';

interface EmptyProps {
  resource?: string;
  onCreate?: () => void;
}

const Empty: React.FC<EmptyProps> = ({ resource = 'records', onCreate }) => {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        py: 6,
        px: 2,
      }}
    >
      <InboxIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 2 }} />
      <Typography variant="h6" color="text.secondary" gutterBottom>
        No {resource} found
      </Typography>
      <Typography variant="body2" color="text.disabled" sx={{ mb: 2 }}>
        There are no {resource} to display yet.
      </Typography>
      {onCreate && (
        <Button variant="contained" startIcon={<AddIcon />} onClick={onCreate}>
          Create {resource}
        </Button>
      )}
    </Box>
  );
};

export { Empty };
export default Empty;
