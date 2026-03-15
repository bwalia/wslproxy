import React from "react";
import {
  Datagrid,
  List as RaList,
  TextField,
  ReferenceInput,
  SelectInput,
  SearchInput,
  BooleanField,
  CloneButton,
  FunctionField,
} from "react-admin";
import { Box, Chip, useTheme, alpha, Typography, Link as MuiLink } from "@mui/material";
import DnsIcon from "@mui/icons-material/DnsRounded";
import CheckCircleIcon from "@mui/icons-material/CheckCircleRounded";
import CancelIcon from "@mui/icons-material/CancelRounded";
import LockIcon from "@mui/icons-material/LockRounded";
import CachedIcon from "@mui/icons-material/CachedRounded";
import ShieldIcon from "@mui/icons-material/ShieldRounded";
import HistoryIcon from "@mui/icons-material/HistoryRounded";
import ExportJsonButton from './toolbar/ExportJsonButton';
import Empty from '../component/Empty';
import ToolBar from "../component/ToolBar";
import { MyPagination } from '../component/MyPagination';

const handleProfileChange = (e) => {
  localStorage.setItem('environment', e.target.value);
};

const serverFilters = [
  <SearchInput 
    source="q" 
    alwaysOn 
    fullWidth
    placeholder="Search servers..."
    sx={{
      '& .MuiOutlinedInput-root': {
        borderRadius: 2,
      },
    }}
  />,
  <ReferenceInput source="profile_id" reference="profiles" alwaysOn>
    <SelectInput
      fullWidth
      optionText="name"
      onChange={handleProfileChange}
      sx={{
        '& .MuiOutlinedInput-root': {
          borderRadius: 2,
        },
      }}
    />
  </ReferenceInput>,
];

// Custom boolean chip field
const StatusChip = ({ source, label, successLabel = "Enabled", failLabel = "Disabled" }) => {
  const theme = useTheme();
  
  return (
    <FunctionField
      source={source}
      label={label}
      render={record => {
        const value = record[source];
        return (
          <Chip
            icon={value ? <CheckCircleIcon /> : <CancelIcon />}
            label={value ? successLabel : failLabel}
            size="small"
            sx={{
              backgroundColor: value 
                ? alpha(theme.palette.success.main, 0.12)
                : alpha(theme.palette.error.main, 0.12),
              color: value 
                ? theme.palette.success.main
                : theme.palette.error.main,
              fontWeight: 500,
              fontSize: '0.75rem',
              '& .MuiChip-icon': {
                fontSize: 14,
                color: 'inherit',
              },
            }}
          />
        );
      }}
    />
  );
};

// Server link field
const ServerLinkField = () => {
  const theme = useTheme();
  
  return (
    <FunctionField
      source="server_name"
      label="Server Name"
      render={record => (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <DnsIcon 
            sx={{ 
              fontSize: 18, 
              color: theme.palette.primary.main,
              opacity: 0.7,
            }} 
          />
          <MuiLink
            href={`https://${record.server_name}`}
            target="_blank"
            rel="noopener noreferrer"
            sx={{
              color: theme.palette.primary.main,
              textDecoration: 'none',
              fontWeight: 500,
              '&:hover': {
                textDecoration: 'underline',
              },
            }}
          >
            {record.server_name}
          </MuiLink>
        </Box>
      )}
    />
  );
};

// Listen port field with styling
const ListenField = () => {
  const theme = useTheme();
  
  return (
    <FunctionField
      source="listens[0].listen"
      label="Listen Port"
      sortable={false}
      render={record => (
        <Chip
          label={record.listens?.[0]?.listen || 'N/A'}
          size="small"
          variant="outlined"
          sx={{
            fontFamily: '"JetBrains Mono", monospace',
            fontWeight: 600,
            borderColor: theme.palette.divider,
            color: theme.palette.text.secondary,
          }}
        />
      )}
    />
  );
};

const List = () => {
  const theme = useTheme();
  
  return (
    <Box sx={{ pt: 2 }}>
      {/* Header */}
      <Box sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 2 }}>
        <Box
          sx={{
            width: 48,
            height: 48,
            borderRadius: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: alpha(theme.palette.primary.main, 0.1),
            color: theme.palette.primary.main,
          }}
        >
          <DnsIcon sx={{ fontSize: 24 }} />
        </Box>
        <Box>
          <Typography variant="h5" fontWeight={700} color="text.primary">
            Virtual Servers
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Configure your virtual servers
          </Typography>
        </Box>
      </Box>

      <RaList
        title={" "}
        perPage={1000}
        pagination={<MyPagination />}
        sort={{ field: 'created_at', order: 'DESC' }}
        exporter={ExportJsonButton}
        empty={<Empty resource={"servers"} />}
        filters={serverFilters}
        actions={<ToolBar resource={"servers"} />}
        sx={{
          '& .RaList-main': {
            boxShadow: 'none',
          },
          '& .RaList-content': {
            borderRadius: 3,
            border: `1px solid ${theme.palette.divider}`,
            boxShadow: 'none',
            overflow: 'hidden',
          },
        }}
      >
        <Datagrid 
          rowClick="edit"
          sx={{
            '& .RaDatagrid-table': {
              borderCollapse: 'separate',
              borderSpacing: 0,
            },
            '& .RaDatagrid-headerCell': {
              fontWeight: 600,
              fontSize: '0.8125rem',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              backgroundColor: theme.palette.mode === 'dark' 
                ? alpha(theme.palette.background.paper, 0.5)
                : theme.palette.grey[50],
              borderBottom: `2px solid ${theme.palette.divider}`,
              py: 2,
            },
            '& .RaDatagrid-row': {
              cursor: 'pointer',
              transition: 'background-color 0.15s ease',
              '&:hover': {
                backgroundColor: alpha(theme.palette.primary.main, 0.04),
              },
            },
            '& .RaDatagrid-rowCell': {
              py: 1.5,
              borderBottom: `1px solid ${theme.palette.divider}`,
            },
          }}
        >
          <ListenField />
          <ServerLinkField />
          <TextField source='profile_id' label="Profile" />
          <FunctionField
            source="ssl_enabled"
            label="SSL"
            render={record => (
              <Chip
                icon={<LockIcon />}
                label={record.ssl_enabled ? "Secure" : "No SSL"}
                size="small"
                sx={{
                  backgroundColor: record.ssl_enabled 
                    ? alpha(theme.palette.success.main, 0.12)
                    : alpha(theme.palette.warning.main, 0.12),
                  color: record.ssl_enabled 
                    ? theme.palette.success.main
                    : theme.palette.warning.main,
                  fontWeight: 500,
                  fontSize: '0.75rem',
                  '& .MuiChip-icon': {
                    fontSize: 14,
                    color: 'inherit',
                  },
                }}
              />
            )}
          />
          <FunctionField
            source="cache_enabled"
            label="Cache"
            render={record => (
              <Chip
                icon={<CachedIcon />}
                label={record.cache_enabled ? "Cached" : "No Cache"}
                size="small"
                sx={{
                  backgroundColor: record.cache_enabled 
                    ? alpha(theme.palette.info.main, 0.12)
                    : alpha(theme.palette.grey[500], 0.12),
                  color: record.cache_enabled 
                    ? theme.palette.info.main
                    : theme.palette.text.secondary,
                  fontWeight: 500,
                  fontSize: '0.75rem',
                  '& .MuiChip-icon': {
                    fontSize: 14,
                    color: 'inherit',
                  },
                }}
              />
            )}
          />
          <FunctionField
            source="waf_enabled"
            label="WAF"
            render={record => (
              <Chip
                icon={<ShieldIcon />}
                label={record.waf_enabled ? "Protected" : "Off"}
                size="small"
                sx={{
                  backgroundColor: record.waf_enabled
                    ? alpha(theme.palette.warning.main, 0.12)
                    : alpha(theme.palette.grey[500], 0.12),
                  color: record.waf_enabled
                    ? theme.palette.warning.main
                    : theme.palette.text.secondary,
                  fontWeight: 500,
                  fontSize: '0.75rem',
                  '& .MuiChip-icon': {
                    fontSize: 14,
                    color: 'inherit',
                  },
                }}
              />
            )}
          />
          <FunctionField
            source="_version_control"
            label="Version"
            sortable={false}
            render={record => {
              const vc = record._version_control;
              if (vc && vc.managed) {
                return (
                  <Chip
                    icon={<HistoryIcon />}
                    label={`v${vc.live_version}`}
                    size="small"
                    sx={{
                      backgroundColor: alpha(theme.palette.success.main, 0.12),
                      color: theme.palette.success.main,
                      fontWeight: 600,
                      fontSize: '0.75rem',
                      '& .MuiChip-icon': {
                        fontSize: 14,
                        color: 'inherit',
                      },
                    }}
                  />
                );
              }
              return (
                <Chip
                  label="No VC"
                  size="small"
                  variant="outlined"
                  sx={{
                    color: theme.palette.text.disabled,
                    borderColor: theme.palette.divider,
                    fontSize: '0.75rem',
                  }}
                />
              );
            }}
          />
          <StatusChip source="config_status" label="Status" successLabel="Active" failLabel="Inactive" />
          <CloneButton />
        </Datagrid>
      </RaList>
    </Box>
  );
};

export default List;
