import { Admin, Resource, ListGuesser } from "react-admin";
import dataProvider from "./dataProvider";
import authProvider from "./authProvider";
import Dashboard from "./Dashboard/Dashboard";
import Sessions from "./Sessions";
import Users from "./Users";
import Login from "./Login";
import Servers from "./Servers";
import Theme from "./Theme";
import UserIcon from '@mui/icons-material/Group';
import SessionIcon from '@mui/icons-material/HistoryToggleOff';
import ServerIcon from '@mui/icons-material/Storage';
import RuleIcon from '@mui/icons-material/Rule';
import Rules from "./Rules";

const API_URL = "http://localhost:8080/api";

const App = () => (
  <Admin
    loginPage={Login}
    dataProvider={dataProvider(API_URL)}
    authProvider={authProvider}
    dashboard={Dashboard}
    theme={Theme}
  >
    <Resource name="users" {...Users} icon={UserIcon} />
    <Resource name="sessions" {...Sessions} icon={SessionIcon} />
    <Resource name="servers" {...Servers} icon={ServerIcon} />
    <Resource name="rules" {...Rules} icon={RuleIcon} />
  </Admin>
);

export default App;
