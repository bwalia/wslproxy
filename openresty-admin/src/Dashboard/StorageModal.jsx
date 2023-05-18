import * as React from "react";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import Slide from "@mui/material/Slide";
import { useDataProvider } from "react-admin";

const Transition = React.forwardRef(function Transition(props, ref) {
  return <Slide direction="up" ref={ref} {...props} />;
});

const StorageModal = ({ isOpen }) => {
  const dataProvider = useDataProvider();
  const [open, setOpen] = React.useState(isOpen);

  const setStorage = (storageType) => {
    dataProvider
      .saveStorageFlag("storage/management", { storage: storageType })
      .then(({ data }) => {
        const { storage } = data;
        setOpen(false);
        localStorage.setItem("storageManagement", storage);
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
          <Button onClick={handleRedis}>Redis</Button>
          <Button onClick={HandleDisk}>Disk</Button>
        </DialogActions>
      </Dialog>
    </div>
  );
};

export default StorageModal;
