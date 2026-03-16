'use client';

import React, { useState } from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Slide,
} from '@mui/material';
import type { TransitionProps } from '@mui/material/transitions';
import { useApi } from '@/hooks/useApi';

const Transition = React.forwardRef(function Transition(
  props: TransitionProps & { children: React.ReactElement },
  ref: React.Ref<unknown>,
) {
  return <Slide direction="up" ref={ref} {...props} />;
});

interface StorageModalProps {
  isOpen: boolean;
}

const StorageModal: React.FC<StorageModalProps> = ({ isOpen }) => {
  const api = useApi();
  const [open, setOpen] = useState(isOpen);
  const storageType = typeof window !== 'undefined'
    ? localStorage.getItem('storageManagement') || 'redis'
    : 'redis';
  const [currentStorage, setCurrentStorage] = useState(storageType);

  const setStorage = (type: string) => {
    api
      .saveStorageFlag('storage/management', { data: { storage: type } })
      .then(({ data }) => {
        const storage = (data as { storage?: string })?.storage || type;
        setOpen(false);
        localStorage.setItem('storageManagement', storage);
        setCurrentStorage(storage);
        window.location.reload();
      })
      .catch((error: unknown) => {
        console.error('Failed to set storage:', error);
      });
  };

  const handleRedis = () => {
    setStorage('redis');
  };

  const handleDisk = () => {
    setStorage('disk');
  };

  const handleClose = () => {
    setOpen(false);
  };

  return (
    <Dialog
      open={open}
      TransitionComponent={Transition}
      keepMounted
      onClose={handleClose}
      aria-describedby="storage-dialog-description"
    >
      <DialogTitle>Select Storage Type</DialogTitle>
      <DialogContent>
        <DialogContentText id="storage-dialog-description">
          Choose how configuration data should be stored. Redis provides
          distributed storage while Disk uses local file storage.
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button
          variant={currentStorage === 'redis' ? 'contained' : 'outlined'}
          onClick={handleRedis}
        >
          Redis
        </Button>
        <Button
          variant={currentStorage === 'disk' ? 'contained' : 'outlined'}
          onClick={handleDisk}
        >
          Disk
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default StorageModal;
