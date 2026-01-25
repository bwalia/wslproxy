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
            backgroundColor: muiTheme.palette.background.default,
          },
          '& .RaLayout-appFrame': {
            marginTop: 0,
          },
        }}
      />
    </Box>
  );
};