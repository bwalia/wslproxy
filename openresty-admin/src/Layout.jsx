import React from "react";
import { Layout, useDataProvider, useStore } from "react-admin";
import { Box, useTheme } from "@mui/material";
import AppBar from "./AppBar";
import { Menu } from "./Menu";
import { useThemeMode, createAppTheme } from "./Theme";

export const MyLayout = (props) => {
  const dataProvider = useDataProvider();
  const [settings, setSettings] = useStore('app.settings', {});
  const { mode } = useThemeMode();
  const muiTheme = useTheme();
  
  React.useEffect(() => {
    const globalSettings = dataProvider.loadSettings("global/settings", {});
    globalSettings.then(settings => {
      setSettings(settings.data);
    });
  }, []);

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100vh',
        backgroundColor: muiTheme.palette.background.default,
      }}
    >
      <Layout
        {...props}
        appBar={AppBar}
        menu={Menu}
        sx={{
          '& .RaLayout-content': {
            padding: 3,
            paddingTop: '80px', // Add top padding to account for fixed AppBar
            backgroundColor: muiTheme.palette.background.default,
            maxWidth: '100% !important', // Override react-admin default max-width
            width: '100%',
          },
          '& .RaLayout-appFrame': {
            marginTop: 0,
          },
          '& .RaLayout-contentWithSidebar': {
            marginTop: '64px', // Standard AppBar height
          },
          // Ensure full width for all content containers
          '& .MuiContainer-root': {
            maxWidth: '100% !important',
            paddingLeft: 0,
            paddingRight: 0,
          },
          '& main': {
            maxWidth: '100% !important',
            width: '100%',
          },
        }}
      />
    </Box>
  );
};