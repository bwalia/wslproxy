import { Grid, Box, Card, Typography, useTheme, alpha, IconButton, Tooltip } from "@mui/material";
import React from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ChartTooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from "recharts";
import { useDataProvider, useNotify } from 'react-admin';
import ServerIcon from "@mui/icons-material/DnsRounded";
import RuleIcon from "@mui/icons-material/RuleRounded";
import UserIcon from "@mui/icons-material/GroupRounded";
import TrendingUpIcon from "@mui/icons-material/TrendingUpRounded";
import RefreshIcon from "@mui/icons-material/RefreshRounded";

import StorageModal from "./StorageModal";
import Logs from "../component/Logs";
import Welcome from "../component/Welcome";
import lineChart from "../static/line-chart";
import { useThemeMode } from "../Theme";

// Stat Card Component
const StatCard = ({ title, value, icon: Icon, color, trend, subtitle }) => {
  const theme = useTheme();
  const { mode } = useThemeMode();
  const isDark = mode === 'dark';
  
  return (
    <Card
      sx={{
        p: 3,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        overflow: 'hidden',
        border: `1px solid ${theme.palette.divider}`,
        transition: 'all 0.2s ease',
        '&:hover': {
          transform: 'translateY(-4px)',
          boxShadow: isDark 
            ? `0 12px 24px ${alpha('#000', 0.4)}`
            : `0 12px 24px ${alpha('#000', 0.1)}`,
        },
      }}
    >
      {/* Decorative gradient background */}
      <Box
        sx={{
          position: 'absolute',
          top: 0,
          right: 0,
          width: 100,
          height: 100,
          background: `radial-gradient(circle, ${alpha(color, 0.15)} 0%, transparent 70%)`,
          transform: 'translate(30%, -30%)',
        }}
      />
      
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
        <Box
          sx={{
            width: 48,
            height: 48,
            borderRadius: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: alpha(color, 0.12),
            color: color,
          }}
        >
          <Icon sx={{ fontSize: 24 }} />
        </Box>
        {trend && (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
              px: 1,
              py: 0.5,
              borderRadius: 1,
              backgroundColor: alpha(theme.palette.success.main, 0.1),
              color: theme.palette.success.main,
            }}
          >
            <TrendingUpIcon sx={{ fontSize: 14 }} />
            <Typography variant="caption" fontWeight={600}>{trend}</Typography>
          </Box>
        )}
      </Box>
      
      <Typography 
        variant="h3" 
        sx={{ 
          fontWeight: 700, 
          color: theme.palette.text.primary,
          mb: 0.5,
        }}
      >
        {value}
      </Typography>
      
      <Typography 
        variant="body2" 
        sx={{ 
          color: theme.palette.text.secondary,
          fontWeight: 500,
        }}
      >
        {title}
      </Typography>
      
      {subtitle && (
        <Typography 
          variant="caption" 
          sx={{ 
            color: theme.palette.text.disabled,
            mt: 0.5,
          }}
        >
          {subtitle}
        </Typography>
      )}
    </Card>
  );
};

// Chart Card Component
const ChartCard = ({ title, children, onRefresh }) => {
  const theme = useTheme();
  const { mode } = useThemeMode();
  const isDark = mode === 'dark';
  
  return (
    <Card
      sx={{
        p: 3,
        height: '100%',
        border: `1px solid ${theme.palette.divider}`,
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h6" fontWeight={600} color="text.primary">
          {title}
        </Typography>
        {onRefresh && (
          <Tooltip title="Refresh data">
            <IconButton 
              size="small" 
              onClick={onRefresh}
              sx={{ 
                color: theme.palette.text.secondary,
                '&:hover': {
                  backgroundColor: alpha(theme.palette.primary.main, 0.1),
                },
              }}
            >
              <RefreshIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Box>
      {children}
    </Card>
  );
};

const Dashboard = () => {
  const data = lineChart;
  const storageManagement = localStorage.getItem("storageManagement");
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const theme = useTheme();
  const { mode } = useThemeMode();
  const isDark = mode === 'dark';
  
  const [errorLogData, setErrorLogData] = React.useState({});
  const [accessLogData, setAccessLogData] = React.useState({});
  const [stats, setStats] = React.useState({
    servers: 0,
    rules: 0,
    users: 0,
  });

  const fetchErrorLogs = React.useCallback(() => {
    const logs = dataProvider.getLogs("openresty/error_logs");
    logs.then(log => {
      setErrorLogData(log?.data?.logs);
    });
    logs.catch(error => notify(error, { type: 'error' }));
  }, [dataProvider, notify]);

  const fetchAccessLogs = React.useCallback(() => {
    const accessLogs = dataProvider.getLogs("openresty/access_logs");
    accessLogs.then(log => {
      setAccessLogData(log?.data?.logs);
    });
    accessLogs.catch(error => notify(error, { type: 'error' }));
  }, [dataProvider, notify]);

  React.useEffect(() => {
    fetchErrorLogs();
    fetchAccessLogs();
    
    // Fetch stats
    Promise.all([
      dataProvider.getList('servers', { pagination: { page: 1, perPage: 1 }, sort: { field: 'id', order: 'ASC' }, filter: {} }),
      dataProvider.getList('rules', { pagination: { page: 1, perPage: 1 }, sort: { field: 'id', order: 'ASC' }, filter: {} }),
      dataProvider.getList('users', { pagination: { page: 1, perPage: 1 }, sort: { field: 'id', order: 'ASC' }, filter: {} }),
    ]).then(([servers, rules, users]) => {
      setStats({
        servers: servers?.total || 0,
        rules: rules?.total || 0,
        users: users?.total || 0,
      });
    }).catch(() => {
      // Silently fail for stats
    });
  }, []);

  return (
    <Box sx={{ pb: 4 }}>
      {/* Welcome Section */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12}>
          <Welcome />
        </Grid>
      </Grid>
      
      {/* Stats Cards */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={4}>
          <StatCard
            title="Total Servers"
            value={stats.servers}
            icon={ServerIcon}
            color={theme.palette.primary.main}
            trend="+12%"
            subtitle="Active configurations"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <StatCard
            title="Routing Rules"
            value={stats.rules}
            icon={RuleIcon}
            color={theme.palette.secondary.main}
            trend="+5%"
            subtitle="Active rules"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <StatCard
            title="Total Users"
            value={stats.users}
            icon={UserIcon}
            color={theme.palette.warning.main}
            subtitle="Registered accounts"
          />
        </Grid>
      </Grid>

      {/* Traffic Chart */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12}>
          <ChartCard title="Traffic Overview">
            <ResponsiveContainer height={350}>
              <AreaChart
                data={data}
                margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="colorUv" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={theme.palette.primary.main} stopOpacity={0.3}/>
                    <stop offset="95%" stopColor={theme.palette.primary.main} stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorPv" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={theme.palette.secondary.main} stopOpacity={0.3}/>
                    <stop offset="95%" stopColor={theme.palette.secondary.main} stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis 
                  dataKey="name" 
                  stroke={theme.palette.text.secondary}
                  tick={{ fill: theme.palette.text.secondary, fontSize: 12 }}
                  axisLine={{ stroke: theme.palette.divider }}
                  tickLine={{ stroke: theme.palette.divider }}
                />
                <YAxis 
                  stroke={theme.palette.text.secondary}
                  tick={{ fill: theme.palette.text.secondary, fontSize: 12 }}
                  axisLine={{ stroke: theme.palette.divider }}
                  tickLine={{ stroke: theme.palette.divider }}
                />
                <CartesianGrid 
                  strokeDasharray="3 3" 
                  stroke={theme.palette.divider}
                  vertical={false}
                />
                <ChartTooltip 
                  contentStyle={{
                    backgroundColor: theme.palette.background.paper,
                    border: `1px solid ${theme.palette.divider}`,
                    borderRadius: 8,
                    boxShadow: isDark 
                      ? '0 4px 12px rgba(0,0,0,0.4)'
                      : '0 4px 12px rgba(0,0,0,0.1)',
                  }}
                  labelStyle={{ color: theme.palette.text.primary }}
                />
                <Area 
                  type="monotone" 
                  dataKey="uv" 
                  stroke={theme.palette.primary.main} 
                  strokeWidth={2}
                  fillOpacity={1} 
                  fill="url(#colorUv)" 
                  name="Requests"
                />
                <Area 
                  type="monotone" 
                  dataKey="pv" 
                  stroke={theme.palette.secondary.main} 
                  strokeWidth={2}
                  fillOpacity={1} 
                  fill="url(#colorPv)" 
                  name="Responses"
                />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>
        </Grid>
      </Grid>

      {/* Logs Section */}
      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Logs 
            data={errorLogData} 
            heading="Nginx Error Logs" 
            onRefresh={fetchErrorLogs}
          />
        </Grid>
        <Grid item xs={12} md={6}>
          <Logs 
            data={accessLogData} 
            heading="Nginx Access Logs" 
            onRefresh={fetchAccessLogs}
          />
        </Grid>
      </Grid>
      
      {!storageManagement && <StorageModal isOpen={true} />}
    </Box>
  );
};

export default Dashboard;
