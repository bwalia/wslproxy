import React from 'react';
import {
  Box,
  Card,
  Typography,
  Grid,
  Divider,
  Chip,
  useTheme,
  alpha,
  Table,
  TableBody,
  TableRow,
  TableCell,
} from '@mui/material';
import { useDataProvider } from 'react-admin';
import ServerIcon from '@mui/icons-material/DnsRounded';
import StorageIcon from '@mui/icons-material/Storage';
import MemoryIcon from '@mui/icons-material/Memory';
import RouterIcon from '@mui/icons-material/Router';
import NetworkCheckIcon from '@mui/icons-material/NetworkCheck';
import { useThemeMode } from '../Theme';

const InfoCard = ({ title, icon: Icon, children, isDark }) => {
  const theme = useTheme();

  return (
    <Card
      sx={{
        p: 3,
        height: '100%',
        backgroundColor: isDark ? alpha('#1e293b', 0.8) : '#fff',
        border: `1px solid ${isDark ? alpha('#334155', 0.5) : alpha('#cbd5e1', 0.8)}`,
        borderRadius: 2,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
        <Icon sx={{ color: theme.palette.primary.main, mr: 1 }} />
        <Typography variant="h6" fontWeight={600}>
          {title}
        </Typography>
      </Box>
      <Divider sx={{ mb: 2 }} />
      {children}
    </Card>
  );
};

const InstanceInfo = () => {
  const dataProvider = useDataProvider();
  const theme = useTheme();
  const { mode } = useThemeMode();
  const isDark = mode === 'dark';
  const [instanceInfo, setInstanceInfo] = React.useState(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    dataProvider
      .getInstanceInfo()
      .then((response) => {
        setInstanceInfo(response?.data || {});
        setLoading(false);
      })
      .catch((error) => {
        console.log('Failed to fetch instance info:', error);
        setLoading(false);
      });
  }, [dataProvider]);

  if (loading || !instanceInfo) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <Typography>Loading instance information...</Typography>
      </Box>
    );
  }

  const InfoRow = ({ label, value, mono = false }) => (
    <TableRow>
      <TableCell
        sx={{
          borderBottom: `1px solid ${isDark ? alpha('#334155', 0.3) : alpha('#cbd5e1', 0.5)}`,
          color: theme.palette.text.secondary,
          fontWeight: 500,
          fontSize: '0.875rem',
          width: '35%',
        }}
      >
        {label}
      </TableCell>
      <TableCell
        sx={{
          borderBottom: `1px solid ${isDark ? alpha('#334155', 0.3) : alpha('#cbd5e1', 0.5)}`,
          fontFamily: mono ? 'JetBrains Mono, monospace' : 'inherit',
          fontSize: '0.875rem',
          fontWeight: 500,
        }}
      >
        {value || 'N/A'}
      </TableCell>
    </TableRow>
  );

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 2 }}>
        <ServerIcon sx={{ color: theme.palette.primary.main, fontSize: 32 }} />
        <Box>
          <Typography variant="h4" fontWeight={700}>
            Server Instance Information
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Detailed information about the current server instance
          </Typography>
        </Box>
      </Box>

      <Grid container spacing={3}>
        {/* Server Details */}
        <Grid item xs={12} md={6}>
          <InfoCard title="Server Details" icon={ServerIcon} isDark={isDark}>
            <Table size="small">
              <TableBody>
                <InfoRow label="Hostname" value={instanceInfo.hostname} mono />
                <InfoRow label="FQDN" value={instanceInfo.fqdn} mono />
                <InfoRow label="Environment" value={instanceInfo.environment} />
                <InfoRow label="Uptime" value={instanceInfo.uptime} />
                <InfoRow label="Load Average" value={instanceInfo.load_average} mono />
              </TableBody>
            </Table>
          </InfoCard>
        </Grid>

        {/* System Resources */}
        <Grid item xs={12} md={6}>
          <InfoCard title="CPU & Memory" icon={MemoryIcon} isDark={isDark}>
            <Table size="small">
              <TableBody>
                <InfoRow label="OS" value={instanceInfo.os} />
                <InfoRow label="Kernel" value={instanceInfo.kernel} mono />
                <InfoRow label="CPU Model" value={instanceInfo.cpu?.model} />
                <InfoRow label="CPU Cores" value={instanceInfo.cpu?.cores} />
                <InfoRow label="CPU Usage" value={`${instanceInfo.cpu?.usage_percent || '0'}%`} />
                <InfoRow label="Memory Total" value={instanceInfo.memory?.total} />
                <InfoRow label="Memory Used" value={instanceInfo.memory?.used} />
                <InfoRow label="Memory Available" value={instanceInfo.memory?.available} />
                <InfoRow label="Memory Free" value={instanceInfo.memory?.free} />
              </TableBody>
            </Table>
          </InfoCard>
        </Grid>

        {/* Storage */}
        <Grid item xs={12} md={6}>
          <InfoCard title="Storage" icon={StorageIcon} isDark={isDark}>
            <Table size="small">
              <TableBody>
                <InfoRow label="Disk Total" value={instanceInfo.disk?.total} />
                <InfoRow label="Disk Used" value={instanceInfo.disk?.used} />
                <InfoRow label="Disk Available" value={instanceInfo.disk?.available} />
                <InfoRow label="Disk Usage" value={instanceInfo.disk?.percent} />
              </TableBody>
            </Table>
          </InfoCard>
        </Grid>

        {/* IP Addresses */}
        <Grid item xs={12} md={6}>
          <InfoCard title="IP Addresses" icon={NetworkCheckIcon} isDark={isDark}>
            {instanceInfo.ip_addresses && instanceInfo.ip_addresses.length > 0 ? (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {instanceInfo.ip_addresses.map((ip, index) => (
                  <Chip
                    key={index}
                    label={ip}
                    sx={{
                      fontFamily: 'JetBrains Mono, monospace',
                      backgroundColor: alpha(theme.palette.primary.main, 0.1),
                      color: theme.palette.primary.main,
                      fontWeight: 600,
                    }}
                  />
                ))}
              </Box>
            ) : (
              <Typography variant="body2" color="text.secondary">
                No IP addresses available
              </Typography>
            )}
          </InfoCard>
        </Grid>

        {/* Network Interfaces */}
        <Grid item xs={12}>
          <InfoCard title="Network Interfaces" icon={RouterIcon} isDark={isDark}>
            {instanceInfo.network?.interfaces && instanceInfo.network.interfaces.length > 0 ? (
              <Box
                sx={{
                  backgroundColor: isDark ? alpha('#0f172a', 0.5) : alpha('#f8fafc', 1),
                  p: 2,
                  borderRadius: 1,
                  maxHeight: '300px',
                  overflowY: 'auto',
                }}
              >
                {instanceInfo.network.interfaces.map((iface, index) => (
                  <Typography
                    key={index}
                    variant="body2"
                    sx={{
                      fontFamily: 'JetBrains Mono, monospace',
                      fontSize: '0.75rem',
                      mb: 0.5,
                      color: theme.palette.text.primary,
                    }}
                  >
                    {iface}
                  </Typography>
                ))}
              </Box>
            ) : (
              <Typography variant="body2" color="text.secondary">
                No network interfaces available
              </Typography>
            )}
          </InfoCard>
        </Grid>

        {/* Routes */}
        <Grid item xs={12}>
          <InfoCard title="Network Routes" icon={RouterIcon} isDark={isDark}>
            {instanceInfo.network?.routes && instanceInfo.network.routes.length > 0 ? (
              <Box
                sx={{
                  backgroundColor: isDark ? alpha('#0f172a', 0.5) : alpha('#f8fafc', 1),
                  p: 2,
                  borderRadius: 1,
                  maxHeight: '300px',
                  overflowY: 'auto',
                }}
              >
                {instanceInfo.network.routes.map((route, index) => (
                  <Typography
                    key={index}
                    variant="body2"
                    sx={{
                      fontFamily: 'JetBrains Mono, monospace',
                      fontSize: '0.75rem',
                      mb: 0.5,
                      color: theme.palette.text.primary,
                    }}
                  >
                    {route}
                  </Typography>
                ))}
              </Box>
            ) : (
              <Typography variant="body2" color="text.secondary">
                No routes available
              </Typography>
            )}
          </InfoCard>
        </Grid>
      </Grid>
    </Box>
  );
};

export default InstanceInfo;
