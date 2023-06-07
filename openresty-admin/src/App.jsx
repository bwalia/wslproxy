import React from "react";
import { Admin, Resource, Layout } from "react-admin";
import dataProvider from "./dataProvider";
import authProvider from "./authProvider";
import Dashboard from "./Dashboard/Dashboard";
import Sessions from "./Sessions";
import Users from "./Users";
import Login from "./Login";
import Servers from "./Servers";
import Theme from "./Theme";
import UserIcon from "@mui/icons-material/Group";
import SessionIcon from "@mui/icons-material/HistoryToggleOff";
import ServerIcon from "@mui/icons-material/Storage";
import RuleIcon from "@mui/icons-material/Rule";
import Rules from "./Rules";
import AppBar from "./AppBar";

const API_URL = import.meta.env.VITE_API_URL;
const deploymentTime = import.meta.env.VITE_DEPLOYMENT_TIME

export const MyLayout = (props) => <Layout {...props} appBar={AppBar} />;

const App = () => (
  <React.Fragment>
    <Admin
      loginPage={Login}
      dataProvider={dataProvider(API_URL)}
      authProvider={authProvider}
      dashboard={Dashboard}
      theme={Theme}
      layout={MyLayout}
    >
      <Resource name="users" {...Users} icon={UserIcon} />
      <Resource name="sessions" {...Sessions} icon={SessionIcon} />
      <Resource name="servers" {...Servers} icon={ServerIcon} />
      <Resource name="rules" {...Rules} icon={RuleIcon} />
    </Admin>
    <div
      style={{
        position: "fixed",
        right: 0,
        bottom: 0,
        left: 0,
        zIndex: 100,
        padding: 6,
        backgroundColor: "#efefef",
        textAlign: "center",
      }}
    >
      <p>Deploy at: {deploymentTime}</p>
    </div>
  </React.Fragment>
);

export default App;
