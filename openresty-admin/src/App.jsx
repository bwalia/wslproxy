import React, { useMemo } from "react";
import { Admin, Resource, useStore, CustomRoutes } from "react-admin";
import dataProvider from "./dataProvider";
import authProvider from "./authProvider";
import { i18nProvider } from "./i18nProvider";
import { ThemeProvider, useThemeMode, createAppTheme } from "./Theme";
import { QueryClient } from "react-query";
import { MyLayout } from "./Layout";
import {
  Box,
  Typography,
  Link,
  useTheme as useMuiTheme,
  alpha,
} from "@mui/material";

import Dashboard from "./Dashboard/Dashboard";
import Sessions from "./Sessions";
import Users from "./Users";
import Login from "./Login";
import Servers from "./Servers";
import Profiles from "./Profiles";
import Secrets from "./Secrets";
import Instances from "./Instances";
import Rules from "./Rules";
import Settings from "./Settings";
import Upstreams from "./Upstreams";

import UserIcon from "@mui/icons-material/GroupRounded";
import SessionIcon from "@mui/icons-material/HistoryToggleOffRounded";
import ServerIcon from "@mui/icons-material/DnsRounded";
import RuleIcon from "@mui/icons-material/RuleRounded";
import ProfileIcon from "@mui/icons-material/RecentActorsRounded";
import SecretIcon from "@mui/icons-material/KeyRounded";
import InstanceIcon from "@mui/icons-material/ViewInArRounded";
import UpstreamIcon from "@mui/icons-material/AccountTree";

import { Puff } from "react-loader-spinner";
import CheckModal from "./component/CheckModal";
import { Route } from "react-router";
import ResetForm from "./component/ResetForm";
import InstanceInfo from "./Instances/InstanceInfo";

const API_URL = import.meta.env.VITE_API_URL;
const deploymentTime = import.meta.env.VITE_DEPLOYMENT_TIME;
const versionNumber = import.meta.env.VITE_APP_VERSION;
const buildNumber = import.meta.env.VITE_APP_BUILD_NUMBER;

// Version footer component
const VersionFooter = () => {
  const { mode } = useThemeMode();
  const isDark = mode === "dark";

  return (
    <Box
      sx={{
        position: "sticky",
        right: 0,
        bottom: 0,
        left: 0,
        zIndex: 100,
        py: 1.5,
        px: 3,
        backgroundColor: isDark ? "#1e293b" : "#f1f5f9",
        borderTop: `1px solid ${isDark ? "#334155" : "#e2e8f0"}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 1,
      }}
    >
      <Typography
        variant="caption"
        sx={{
          color: isDark ? "#94a3b8" : "#64748b",
          display: "flex",
          alignItems: "center",
          gap: 2,
          flexWrap: "wrap",
        }}
      >
        <span>
          Version: <strong>{versionNumber}</strong>
        </span>
        <span>
          Build: <strong>{buildNumber}</strong>
        </span>
        <span>Deployed: {deploymentTime}</span>
      </Typography>
      <Link
        href="/swagger/"
        target="_blank"
        sx={{
          fontSize: "0.75rem",
          color: isDark ? "#818cf8" : "#6366f1",
          textDecoration: "none",
          fontWeight: 500,
          "&:hover": {
            textDecoration: "underline",
          },
        }}
      >
        API Documentation →
      </Link>
    </Box>
  );
};

// Main app content with theme integration
const AppContent = () => {
  const { mode } = useThemeMode();
  const [isLoading] = useStore("fetch.data.loading", false);
  const [syncPopupOpen, setSyncPopupOpen] = useStore(
    "sync.data.success",
    false,
  );

  const queryClient = useMemo(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 1000,
          },
        },
      }),
    [],
  );

  // Create theme based on current mode
  const theme = useMemo(() => createAppTheme(mode), [mode]);
  const isDark = mode === "dark";

  return (
    <Box sx={isLoading ? { filter: "blur(2px)", pointerEvents: "none" } : {}}>
      <Puff
        height="60"
        width="60"
        radius={1}
        color="#6366f1"
        ariaLabel="puff-loading"
        wrapperStyle={{
          zIndex: 9999,
          top: "50%",
          position: "fixed",
          left: "50%",
          transform: "translate(-50%, -50%)",
          backgroundColor: alpha(isDark ? "#0f172a" : "#ffffff", 0.8),
          borderRadius: 16,
          padding: 20,
        }}
        visible={isLoading}
      />
      <CheckModal
        open={syncPopupOpen}
        onClose={() => setSyncPopupOpen(false)}
      />
      <Admin
        loginPage={Login}
        i18nProvider={i18nProvider}
        dataProvider={dataProvider(API_URL)}
        authProvider={authProvider}
        dashboard={Dashboard}
        theme={theme}
        layout={MyLayout}
        queryClient={queryClient}
      >
        <Resource name="users" {...Users} icon={UserIcon} />
        <Resource name="sessions" {...Sessions} icon={SessionIcon} />
        <Resource name="servers" {...Servers} icon={ServerIcon} />
        <Resource name="upstreams" {...Upstreams} icon={UpstreamIcon} />
        <Resource name="rules" {...Rules} icon={RuleIcon} />
        <Resource name="settings" {...Settings} icon={RuleIcon} />
        <Resource name="profiles" {...Profiles} icon={ProfileIcon} />
        <Resource name="secrets" {...Secrets} icon={SecretIcon} />
        <Resource name="instances" {...Instances} icon={InstanceIcon} />
        <CustomRoutes>
          <Route path="/password/reset" element={<ResetForm />} />
          <Route path="/instance-info" element={<InstanceInfo />} />
        </CustomRoutes>
      </Admin>
      <VersionFooter />
    </Box>
  );
};

// Wrap with Theme Provider
const App = () => {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
};

export default App;
