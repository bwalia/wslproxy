import React from "react";
import {
  AppBar as RaAppBar,
  TitlePortal,
  Toolbar,
  useRedirect,
  useDataProvider,
  useStore,
  LocalesMenuButton,
  ToggleThemeButton,
  useNotify
} from "react-admin";
import SdStorageIcon from "@mui/icons-material/SdStorage";
import { IconButton, Tooltip, Typography } from "@mui/material";
import StorageModal from "./Dashboard/StorageModal";
import SettingsIcon from "@mui/icons-material/Settings";
import CloudSyncIcon from '@mui/icons-material/CloudSync';
import ProfileIcon from '@mui/icons-material/RememberMe';
import StatusCheckIcon from '@mui/icons-material/ScreenSearchDesktop';
import EnvProfileHandler from './component/EnvProfileHandler'

const appDisplayNname = import.meta.env.VITE_APP_DISPLAY_NAME;
const targetPlatform = import.meta.env.VITE_TARGET_PLATFORM;

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
  const [isProfileModalOpen, setProfileModalOpen] = React.useState(false);

  const handleOpenModal = () => {
    setProfileModalOpen(true);
  };

  const handleCloseModal = () => {
    setProfileModalOpen(false);
  };
  return (
    <>
      <Tooltip title="Select Environment Profile">
        <IconButton color="inherit" onClick={handleOpenModal}>
          <ProfileIcon />
        </IconButton>
      </Tooltip>
      {isProfileModalOpen && <EnvProfileHandler open={isProfileModalOpen}
        onClose={handleCloseModal}
        title="Please select the profile for frontdoor."
        content="This is profile modal." />}
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
const CheckStatus = () => {
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const handleSettings = async () => {
    const opStatus = await dataProvider.checkORStatus("openresty_status", {});
    notify(opStatus?.message, { autoHideDuration: 30000, type: opStatus?.check_status })
  };
  return (
    <Tooltip title="Check Openresty Status">
      <IconButton color="inherit" onClick={handleSettings}>
        <StatusCheckIcon />
      </IconButton>
    </Tooltip>
  );
};

const AppBar = () => {
  const [settings] = useStore('app.settings', {});
  return (
    <RaAppBar>
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
            textShadow: "0 13.36px 8.896px #FFEB55, 0 -2px 1px #EE66A6",
            color: "#FFEB55",
          }}
        >
          {appDisplayNname}
        </Typography>
      </Toolbar>
      <TitlePortal />
      {targetPlatform !== "DOCKER" && <ApiSync />}
      {settings.storage_type === "disk" && <StorageButton />}
      {/* <SettingButton /> */}
      <CheckStatus />
      <ProfileHandler />
      <LocalesMenuButton />
      {/* <ToggleThemeButton /> */}
    </RaAppBar>
  );
}

export default AppBar;
