import { Grid } from "@mui/material";
import React from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { useDataProvider, useNotify } from 'react-admin';

import StorageModal from "./StorageModal";
import Logs from "../component/Logs";
import Welcome from "../component/Welcome";
import lineChart from "../static/line-chart";

const Dashboard = () => {
  const data = lineChart;
  const storageManagement = localStorage.getItem("storageManagement");
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const [errorLogData, setErrorLogData] = React.useState({});
  const [accessLogData, setAccessLogData] = React.useState({});

  React.useEffect(() => {
    const logs = dataProvider.getLogs("openresty/error_logs")
    logs.then(log => {
      setErrorLogData(log?.data?.logs)
    });
    logs.catch(error => notify(error, { type: 'error' }));
  }, []);

  React.useEffect(() => {
    const accessLogs = dataProvider.getLogs("openresty/access_logs")
    accessLogs.then(log => {
      setAccessLogData(log?.data?.logs)
    });
    accessLogs.catch(error => notify(error, { type: 'error' }));
  }, []);

  return (
    <Grid container spacing={2}>
      <Grid item xs={12}>
        <Welcome />
      </Grid>
      <Grid item xs={12}>
        <ResponsiveContainer height={400}>
          <LineChart
            data={data}
            margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
          >
            <XAxis dataKey="name" />
            <Tooltip />
            <CartesianGrid stroke="#f5f5f5" />
            <Line type="monotone" dataKey="uv" stroke="#ff7300" yAxisId={0} />
            <Line type="monotone" dataKey="pv" stroke="#387908" yAxisId={1} />
          </LineChart>
        </ResponsiveContainer>
      </Grid>
      <Grid item md={6} sx={{ width: '100%' }}>
        <Logs data={errorLogData} heading={"Nginx Error Logs"} />
      </Grid>
      <Grid item md={6} sx={{ width: '100%' }}>
        <Logs data={accessLogData} heading={"Nginx Access Logs"} />
      </Grid>
      {!storageManagement && <StorageModal isOpen={true} />}
    </Grid>
  );
};

export default Dashboard;
