import { Admin, Resource, ListGuesser } from "react-admin";
import dataProvider from "./dataProvider";
import Dashboard from "./Dashboard/Dashboard";
import Sessions from "./Sessions";
import Users from "./Users";
const API_URL = "http://localhost:8080/api"

const App = () => (
  <Admin dataProvider={dataProvider(API_URL)} dashboard={Dashboard}>
    <Resource name="users" {...Users} />
    <Resource name="sessions" {...Sessions} />
  </Admin>
);

export default App;
