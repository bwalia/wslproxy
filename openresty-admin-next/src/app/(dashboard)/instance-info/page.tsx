'use client';

import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  Grid,
  Divider,
  Chip,
  useTheme,
  alpha,
  Table,
  TableBody,
  TableRow,
  TableCell,
  CircularProgress,
} from '@mui/material';
import DnsRoundedIcon from '@mui/icons-material/DnsRounded';
import StorageIcon from '@mui/icons-material/Storage';
import MemoryIcon from '@mui/icons-material/Memory';
import RouterIcon from '@mui/icons-material/Router';
import NetworkCheckIcon from '@mui/icons-material/NetworkCheck';
import PageHeader from '@/components/ui/PageHeader';
import { useApi } from '@/hooks/useApi';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface InstanceInfoData {
  hostname?: string;
  fqdn?: string;
  environment?: string;
  uptime?: string;
  load_average?: string;
  os?: string;
  kernel?: string;
  cpu?: { model?: string; cores?: number; usage_percent?: string };
  memory?: { total?: string; used?: string; available?: string; free?: string };
  disk?: { total?: string; used?: string; available?: string; percent?: string };
  ip_addresses?: string[];
  network?: { interfaces?: string[]; routes?: string[] };
}

// ---------------------------------------------------------------------------
// Info Card
// ---------------------------------------------------------------------------

interface InfoCardProps {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
}

const InfoCard: React.FC<InfoCardProps> = ({ title, icon: Icon, children }) => {
  const theme = useTheme();

  return (
    <Card
      sx={{
        p: 3,
        height: '100%',
        border: `1px solid ${alpha(theme.palette.divider, 0.5)}`,
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

// ---------------------------------------------------------------------------
// Info Row
// ---------------------------------------------------------------------------

interface InfoRowProps {
  label: string;
  value?: string | number | null;
  mono?: boolean;
}

const InfoRow: React.FC<InfoRowProps> = ({ label, value, mono = false }) => {
  const theme = useTheme();
  return (
    <TableRow>
      <TableCell
        sx={{
          borderBottom: `1px solid ${alpha(theme.palette.divider, 0.3)}`,
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
          borderBottom: `1px solid ${alpha(theme.palette.divider, 0.3)}`,
          fontFamily: mono ? 'monospace' : 'inherit',
          fontSize: '0.875rem',
          fontWeight: 500,
        }}
      >
        {value || 'N/A'}
      </TableCell>
    </TableRow>
  );
};

// ---------------------------------------------------------------------------
// Instance Info Page
// ---------------------------------------------------------------------------

export default function InstanceInfoPage() {
  const api = useApi();
  const theme = useTheme();
  const [instanceInfo, setInstanceInfo] = useState<InstanceInfoData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getInstanceInfo('system')
      .then((response) => {
        setInstanceInfo((response as { data: InstanceInfoData }).data || {});
        setLoading(false);
      })
      .catch((error) => {
        console.error('Failed to fetch instance info:', error);
        setLoading(false);
      });
  }, [api]);

  if (loading || !instanceInfo) {
    return (
      <Box sx={{ p: 3, display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <PageHeader
        title="Server Instance Information"
        subtitle="Detailed information about the current server instance"
        icon={<DnsRoundedIcon />}
      />

      <Grid container spacing={3}>
        {/* Server Details */}
        <Grid item xs={12} md={6}>
          <InfoCard title="Server Details" icon={DnsRoundedIcon}>
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
          <InfoCard title="CPU & Memory" icon={MemoryIcon}>
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
          <InfoCard title="Storage" icon={StorageIcon}>
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
          <InfoCard title="IP Addresses" icon={NetworkCheckIcon}>
            {instanceInfo.ip_addresses && instanceInfo.ip_addresses.length > 0 ? (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {instanceInfo.ip_addresses.map((ip, index) => (
                  <Chip
                    key={index}
                    label={ip}
                    sx={{
                      fontFamily: 'monospace',
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
          <InfoCard title="Network Interfaces" icon={RouterIcon}>
            {instanceInfo.network?.interfaces && instanceInfo.network.interfaces.length > 0 ? (
              <Box
                sx={{
                  backgroundColor: alpha(theme.palette.background.default, 0.5),
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
                      fontFamily: 'monospace',
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
          <InfoCard title="Network Routes" icon={RouterIcon}>
            {instanceInfo.network?.routes && instanceInfo.network.routes.length > 0 ? (
              <Box
                sx={{
                  backgroundColor: alpha(theme.palette.background.default, 0.5),
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
                      fontFamily: 'monospace',
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
}
