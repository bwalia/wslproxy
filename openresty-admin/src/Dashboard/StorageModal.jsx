import * as React from "react";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import Slide from "@mui/material/Slide";
import { useDataProvider, useStore, useTranslate } from "react-admin";

const Transition = React.forwardRef(function Transition(props, ref) {
  return <Slide direction="up" ref={ref} {...props} />;
});

const StorageModal = ({ isOpen }) => {
  const dataProvider = useDataProvider();
  const [storageMgmt, setStorageMgmt] = useStore('storageManagement.type', 'redis');
  const [sModalOpen, setSModalOpen] = useStore('storage.modal', false);
  const [open, setOpen] = React.useState(isOpen);
  const storageType = localStorage.getItem("storageManagement");
  const translate = useTranslate();

  const setStorage = (storageType) => {
    dataProvider
      .saveStorageFlag("storage/management", { storage: storageType })
      .then(({ data }) => {
        const { storage } = data;
        setOpen(false);
        localStorage.setItem("storageManagement", storage);
        setStorageMgmt(storage);
        window.location.reload();
      })
      .catch((error) => {
        console.log(error);
      });
  };

  const handleRedis = () => {
    setStorage("redis");
  };
  const HandleDisk = () => {
    setStorage("disk");
  };

  const handleClose = () => {
    setOpen(false);
    setSModalOpen(false)
  };

  return (
    <div>
      <Dialog
        open={open}
        TransitionComponent={Transition}
        keepMounted
        onClose={handleClose}
        aria-describedby="alert-dialog-slide-description"
      >
        <DialogTitle>
          {translate('brahmstra.dashboard.storage.title')}
        </DialogTitle>
        <DialogContent>
          <DialogContentText id="alert-dialog-slide-description">
            {translate('brahmstra.dashboard.storage.subtitle')}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button 
            variant={storageMgmt == "redis" ? "contained" : "outlined"} 
            onClick={handleRedis}
          >
            {translate('brahmstra.dashboard.storage.redis')}
          </Button>
          <Button 
            variant={storageMgmt == "disk" ? "contained" : "outlined"}
            onClick={HandleDisk}
          >
            {translate('brahmstra.dashboard.storage.disk')}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
};

export default StorageModal;
