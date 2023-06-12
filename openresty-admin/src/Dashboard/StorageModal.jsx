import * as React from "react";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import Slide from "@mui/material/Slide";
import { useDataProvider, useStore } from "react-admin";

const Transition = React.forwardRef(function Transition(props, ref) {
  return <Slide direction="up" ref={ref} {...props} />;
});

const StorageModal = ({ isOpen }) => {
  const dataProvider = useDataProvider();
  const [storageMgmt, setStorageMgmt] = useStore('storageManagement.type', 'redis');
  const [sModalOpen, setSModalOpen] = useStore('storage.modal', false);
  const [open, setOpen] = React.useState(isOpen);
  const storageType = localStorage.getItem("storageManagement")
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
          {"Please choose a option for storage management"}
        </DialogTitle>
        <DialogContent>
          <DialogContentText id="alert-dialog-slide-description">
            Storage Preference, the default is Redis. You can change it by
            selecting any options.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button variant={storageMgmt == "redis" ? "contained" : "outlined"} onClick={handleRedis}>Redis</Button>
          <Button variant={storageMgmt == "disk" ? "contained" : "outlined"} onClick={HandleDisk}>Disk</Button>
        </DialogActions>
      </Dialog>
    </div>
  );
};

export default StorageModal;
