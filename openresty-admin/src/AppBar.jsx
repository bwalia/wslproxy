import React from "react";
import {
  AppBar as RaAppBar,
  TitlePortal,
  Toolbar,
  useRedirect,
  useDataProvider
} from "react-admin";
import SdStorageIcon from "@mui/icons-material/SdStorage";
import { IconButton, Tooltip, Typography } from "@mui/material";
import StorageModal from "./Dashboard/StorageModal";
import SettingsIcon from "@mui/icons-material/Settings";
import CloudSyncIcon from '@mui/icons-material/CloudSync';
import ProfileIcon from '@mui/icons-material/RememberMe';
import EnvProfileHandler from './component/EnvProfileHandler'

const StorageButton = () => {
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

const ApiSync = () => {
  const dataProvider = useDataProvider()
  const handleSyncAPI = () => {
    dataProvider.syncAPI("frontdoor/opsapi/sync", {})
  }
  return (
    <React.Fragment>
      <Tooltip title="Sync API Storage">
        <IconButton color="inherit" onClick={handleSyncAPI}>
          <CloudSyncIcon />
        </IconButton>
      </Tooltip>
    </React.Fragment>
  )
}
const ProfileHandler = () => {
  const [envProfile, setEnvProfile] = React.useState(false);
  const handleEnvProfile = () => {
    setEnvProfile(true);
  };
  return (
    <>
      <Tooltip title="Select Storage Type">
        <IconButton color="inherit" onClick={handleEnvProfile}>
          <ProfileIcon />
        </IconButton>
      </Tooltip>
      {envProfile && <EnvProfileHandler open={envProfile} onClose={() => setEnvProfile(false)} />}
    </>
  )
}

const SettingButton = () => {
  const redirect = useRedirect();
  const handleSettings = () => {
    redirect("/settings");
  };
  return (
    <Tooltip title="Basic site settings">
      <IconButton color="inherit" onClick={handleSettings}>
        <SettingsIcon />
      </IconButton>
    </Tooltip>
  );
};

const AppBar = () => (
  <RaAppBar sx={{ background: "green" }}>
    <Toolbar
      sx={{
        background: "transparent",
      }}
    >
      <img
        src="falcon-removebg-preview.png"
        alt="Logo"
        style={{ height: "50px" }}
      />
      <Typography
        variant="h5"
        sx={{
          textShadow: "0 13.36px 8.896px #2c482e, 0 -2px 1px #aeffb4",
          color: "#6fb374",
        }}
      >
        Whitefalcon
      </Typography>
    </Toolbar>
    <TitlePortal />
    <ApiSync />
    <StorageButton />
    <SettingButton />
    <ProfileHandler />
  </RaAppBar>
);

export default AppBar;
