import { Admin, Resource, Layout } from "react-admin";
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
import AppBar from "./AppBar"

console.log(import.meta.env.VITE_API_URL) 

//console.log(__API_URL__);
const API_URL = __API_URL__;

export const MyLayout = props => <Layout {...props} appBar={AppBar} />;

const App = () => (
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
);

export default App;
