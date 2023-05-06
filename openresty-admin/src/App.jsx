import { Admin, Resource, ListGuesser } from "react-admin";
import dataProvider from "./dataProvider";
import authProvider from "./authProvider";
import Dashboard from "./Dashboard/Dashboard";
import Sessions from "./Sessions";
import Users from "./Users";
import Login from "./Login";
import Servers from "./Servers";
const API_URL = "http://localhost:8080/api";

const App = () => (
  <Admin
    loginPage={Login}
    dataProvider={dataProvider(API_URL)}
    authProvider={authProvider}
    dashboard={Dashboard}
  >
    <Resource name="users" {...Users} />
    <Resource name="sessions" {...Sessions} />
    <Resource name="servers" {...Servers} />
  </Admin>
);

export default App;
