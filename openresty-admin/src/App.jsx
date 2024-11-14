import React from "react";
import { Admin, Resource, useStore } from "react-admin";
import dataProvider from "./dataProvider";
import authProvider from "./authProvider";
import { i18nProvider } from './i18nProvider';
import Theme from "./Theme";
import { QueryClient } from 'react-query';
import { MyLayout } from "./Layout";

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

import UserIcon from "@mui/icons-material/Group";
import SessionIcon from "@mui/icons-material/HistoryToggleOff";
import ServerIcon from "@mui/icons-material/Storage";
import RuleIcon from "@mui/icons-material/Rule";
import ProfileIcon from '@mui/icons-material/RecentActors';
import SecretIcon from '@mui/icons-material/Key';
import InstanceIcon from '@mui/icons-material/Padding';

import { Puff } from 'react-loader-spinner';
import CheckModal from "./component/CheckModal";

const API_URL = import.meta.env.VITE_API_URL;
const deploymentTime = import.meta.env.VITE_DEPLOYMENT_TIME
const versionNumber = import.meta.env.VITE_APP_VERSION
const buildNumber = import.meta.env.VITE_APP_BUILD_NUMBER;

const App = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1000,
      },
    },
  });
  const [isLoading] = useStore('fetch.data.loading', false)
  const [syncPopupOpen, setSyncPopupOpen] = useStore('sync.data.success', false);
  return (
    <div style={isLoading ? { filter: "blur" } : {}}>
      <Puff
        height="80"
        width="80"
        radius={1}
        color="#4fa94d"
        ariaLabel="puff-loading"
        wrapperStyle={{
          zIndex: "9",
          top: "50%",
          position: "absolute",
          left: "50%",
          transform: "translate(-50%, 0px)"
        }}
        wrapperClass=""
        visible={isLoading}
      />
      <CheckModal open={syncPopupOpen} onClose={() => setSyncPopupOpen(false)} />
      <Admin
        loginPage={Login}
        i18nProvider={i18nProvider}
        dataProvider={dataProvider(API_URL)}
        authProvider={authProvider}
        dashboard={Dashboard}
        theme={Theme}
        layout={MyLayout}
        queryClient={queryClient}
      >
        <Resource name="users" {...Users} icon={UserIcon} />
        <Resource name="sessions" {...Sessions} icon={SessionIcon} />
        <Resource name="servers" {...Servers} icon={ServerIcon} />
        <Resource name="rules" {...Rules} icon={RuleIcon} />
        <Resource name="settings" {...Settings} icon={RuleIcon} />
        <Resource name="profiles" {...Profiles} icon={ProfileIcon} />
        <Resource name="secrets" {...Secrets} icon={SecretIcon} />
        <Resource name="instances" {...Instances} icon={InstanceIcon} />
      </Admin>
      <div
        style={{
          position: "sticky",
          right: 0,
          bottom: 0,
          left: 0,
          zIndex: 100,
          padding: 6,
          backgroundColor: "#efefef",
          textAlign: "left",
          color: "#213547"
        }}
      >
        <p>
          <span>Version: {versionNumber}, </span>
          <span>Build: {buildNumber}, </span>
          <span>Deployment timestamp: {deploymentTime}, </span>
          <span><a href="/swagger/" target="_blank">API Endpoints</a></span>
        </p>
      </div>
    </div>
  )
};

export default App;
