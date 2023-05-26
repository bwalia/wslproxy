import React from "react";
import { AppBar as RaAppBar, TitlePortal } from "react-admin";
import SdStorageIcon from "@mui/icons-material/SdStorage";
import { IconButton, Tooltip } from "@mui/material";
import StorageModal from "./Dashboard/StorageModal"

const SettingsButton = () => {
  const [isStrgTypeSet, setStrgTypeSet] = React.useState(false);
  const handleStorgeType = () => {
    setStrgTypeSet(true);
  };
  return (
    <>
      <Tooltip title="Select Storage Type">
        <IconButton color="inherit" onClick={handleStorgeType}>
          <SdStorageIcon />
        </IconButton>
      </Tooltip>
      {isStrgTypeSet && <StorageModal isOpen={true} />}
    </>
  );
};

const AppBar = () => (
  <RaAppBar>
    <TitlePortal />
    <SettingsButton />
  </RaAppBar>
);

export default AppBar;
