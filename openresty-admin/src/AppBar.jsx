import React from "react";
import {
  AppBar as RaAppBar,
  TitlePortal,
  useRedirect,
  useDataProvider,
  useStore,
  LocalesMenuButton,
  useNotify,
  UserMenu,
  Logout,
} from "react-admin";
import {
  IconButton,
  Tooltip,
  Box,
  Divider,
  useTheme,
  alpha,
} from "@mui/material";
import SdStorageIcon from "@mui/icons-material/SdStorage";
import StorageModal from "./Dashboard/StorageModal";
import SettingsIcon from "@mui/icons-material/Settings";
import CloudSyncIcon from "@mui/icons-material/CloudSync";
import ProfileIcon from "@mui/icons-material/RememberMe";
import StatusCheckIcon from "@mui/icons-material/ScreenSearchDesktop";
import LightModeIcon from "@mui/icons-material/LightMode";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import EnvProfileHandler from "./component/EnvProfileHandler";
import ResetPassword from "./component/ResetPassword";
import Logo from "./component/Logo";
import { useThemeMode } from "./Theme";
import { ApiHealthIndicator } from "./component/ApiHealthBanner";

const targetPlatform = import.meta.env.VITE_TARGET_PLATFORM;

// Theme Toggle Button
const ThemeToggleButton = () => {
  const { mode, toggleTheme } = useThemeMode();
  const theme = useTheme();
  
  return (
    <Tooltip title={mode === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}>
      <IconButton
        color="inherit"
        onClick={toggleTheme}
        sx={{
          transition: 'all 0.2s ease',
          '&:hover': {
            backgroundColor: alpha(theme.palette.primary.main, 0.1),
            transform: 'rotate(12deg)',
          },
        }}
      >
        {mode === 'dark' ? (
          <LightModeIcon sx={{ color: '#fbbf24' }} />
        ) : (
          <DarkModeIcon sx={{ color: '#6366f1' }} />
        )}
      </IconButton>
    </Tooltip>
  );
};

const StorageButton = () => {
  const [isStrgTypeSet, setStrgTypeSet] = React.useState(false);
  const theme = useTheme();
  
  const handleStorgeType = () => {
    setStrgTypeSet(true);
  };
  
  return (
    <>
      <Tooltip title="Select Storage Type">
        <IconButton
          color="inherit"
          onClick={handleStorgeType}
          sx={{
            transition: 'all 0.2s ease',
            '&:hover': {
              backgroundColor: alpha(theme.palette.primary.main, 0.1),
            },
          }}
        >
          <SdStorageIcon />
        </IconButton>
      </Tooltip>
      {isStrgTypeSet && <StorageModal isOpen={true} />}
    </>
  );
};

const ApiSync = () => {
  const dataProvider = useDataProvider();
  const theme = useTheme();
  
  const handleSyncAPI = () => {
    dataProvider.syncAPI("frontdoor/opsapi/sync", {});
  };
  
  return (
    <Tooltip title="Sync API Storage">
      <IconButton
        color="inherit"
        onClick={handleSyncAPI}
        sx={{
          transition: 'all 0.2s ease',
          '&:hover': {
            backgroundColor: alpha(theme.palette.primary.main, 0.1),
          },
        }}
      >
        <CloudSyncIcon />
      </IconButton>
    </Tooltip>
  );
};

const ProfileHandler = () => {
  const [isProfileModalOpen, setProfileModalOpen] = React.useState(false);
  const theme = useTheme();

  const handleOpenModal = () => {
    setProfileModalOpen(true);
  };

  const handleCloseModal = () => {
    setProfileModalOpen(false);
  };
  
  return (
    <>
      <Tooltip title="Select Environment Profile">
        <IconButton
          color="inherit"
          onClick={handleOpenModal}
          sx={{
            transition: 'all 0.2s ease',
            '&:hover': {
              backgroundColor: alpha(theme.palette.primary.main, 0.1),
            },
          }}
        >
          <ProfileIcon />
        </IconButton>
      </Tooltip>
      {isProfileModalOpen && (
        <EnvProfileHandler
          open={isProfileModalOpen}
          onClose={handleCloseModal}
          title="Please select the profile for frontdoor."
          content="This is profile modal."
        />
      )}
    </>
  );
};

const SettingButton = () => {
  const redirect = useRedirect();
  const theme = useTheme();
  
  const handleSettings = () => {
    redirect("/settings");
  };
  
  return (
    <Tooltip title="Basic site settings">
      <IconButton
        color="inherit"
        onClick={handleSettings}
        sx={{
          transition: 'all 0.2s ease',
          '&:hover': {
            backgroundColor: alpha(theme.palette.primary.main, 0.1),
          },
        }}
      >
        <SettingsIcon />
      </IconButton>
    </Tooltip>
  );
};

const CheckStatus = () => {
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const theme = useTheme();
  
  const handleSettings = async () => {
    const opStatus = await dataProvider.checkORStatus("openresty_status", {});
    notify(opStatus?.message, {
      autoHideDuration: 30000,
      type: opStatus?.check_status,
    });
  };
  
  return (
    <Tooltip title="Check Openresty Status">
      <IconButton
        color="inherit"
        onClick={handleSettings}
        sx={{
          transition: 'all 0.2s ease',
          '&:hover': {
            backgroundColor: alpha(theme.palette.primary.main, 0.1),
          },
        }}
      >
        <StatusCheckIcon />
      </IconButton>
    </Tooltip>
  );
};

const AppBar = () => {
  const [settings] = useStore("app.settings", {});
  const theme = useTheme();
  const { mode } = useThemeMode();
  
  return (
    <RaAppBar
      sx={{
        backgroundColor: theme.palette.background.paper,
        color: theme.palette.text.primary,
        borderBottom: `1px solid ${theme.palette.divider}`,
        boxShadow: 'none',
        '& .RaAppBar-toolbar': {
          minHeight: 64,
        },
      }}
      userMenu={
        <UserMenu>
          <ResetPassword />
          <Logout />
        </UserMenu>
      }
    >
      {/* Logo Section */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          mr: 2,
          py: 1,
        }}
      >
        <Logo 
          width={180} 
          height={40} 
          theme={mode}
        />
      </Box>
      
      <TitlePortal />
      
      {/* Action Buttons */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
        }}
      >
        {targetPlatform !== "DOCKER" && <ApiSync />}
        {settings.storage_type === "disk" && <StorageButton />}
        <ApiHealthIndicator />
        <CheckStatus />
        <ProfileHandler />
        
        <Divider
          orientation="vertical"
          flexItem
          sx={{
            mx: 1,
            borderColor: theme.palette.divider,
          }}
        />
        
        <LocalesMenuButton />
        <ThemeToggleButton />
      </Box>
    </RaAppBar>
  );
};

export default AppBar;
