'use client';

import React, { useState, useCallback } from 'react';
import { Button, Chip, Link, alpha, useTheme } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import StorageIcon from '@mui/icons-material/Storage';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/ui/PageHeader';
import DataTable, { Column } from '@/components/ui/DataTable';
import StatusChip from '@/components/ui/StatusChip';
import { useApi, useFetch } from '@/hooks/useApi';

interface Server {
  id: string;
  server_name: string;
  profile_id: string;
  listens: Array<{ listen: string }>;
  ssl_enabled: boolean;
  cache_enabled: boolean;
  waf_enabled: boolean;
  version: number;
  status: string;
  [key: string]: unknown;
}

export default function ServersListPage() {
  const api = useApi();
  const router = useRouter();
  const theme = useTheme();
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');

  const { data, loading } = useFetch(() =>
    api.getList('servers', {
      pagination: { page: page + 1, perPage: 25 },
      filter: search ? { q: search } : {},
    })
  );

  const columns: Column<Server>[] = [
    {
      field: 'listens',
      label: 'Listen Port',
      render: (record) => {
        const listens = Array.isArray(record.listens) ? record.listens : [];
        return listens.map((l: { listen: string }, i: number) => (
          <Chip
            key={i}
            label={l.listen || '-'}
            size="small"
            sx={{
              mr: 0.5,
              backgroundColor: alpha(theme.palette.info.main, 0.1),
              color: theme.palette.info.main,
              fontWeight: 600,
            }}
          />
        ));
      },
    },
    {
      field: 'server_name',
      label: 'Server Name',
      sortable: true,
      render: (record) => (
        <Link
          href={`https://${record.server_name}`}
          target="_blank"
          rel="noopener"
          onClick={(e) => e.stopPropagation()}
          sx={{ fontWeight: 600 }}
        >
          {String(record.server_name)}
        </Link>
      ),
    },
    { field: 'profile_id', label: 'Profile' },
    {
      field: 'ssl_enabled',
      label: 'SSL',
      render: (record) => <StatusChip value={!!record.ssl_enabled} />,
    },
    {
      field: 'cache_enabled',
      label: 'Cache',
      render: (record) => <StatusChip value={!!record.cache_enabled} />,
    },
    {
      field: 'waf_enabled',
      label: 'WAF',
      render: (record) => <StatusChip value={!!record.waf_enabled} />,
    },
    { field: 'version', label: 'Version' },
    {
      field: 'status',
      label: 'Status',
      render: (record) => {
        const status = String(record.status || 'draft');
        const color = status === 'active' ? 'success' : status === 'pending' ? 'warning' : 'default';
        return <Chip label={status} size="small" color={color} variant="outlined" />;
      },
    },
  ];

  const handleSearch = useCallback((query: string) => {
    setSearch(query);
    setPage(0);
  }, []);

  return (
    <>
      <PageHeader
        title="Servers"
        subtitle="Manage virtual server configurations"
        icon={<StorageIcon />}
        actions={
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => router.push('/servers/create')}
          >
            Create
          </Button>
        }
      />
      <DataTable<Server>
        columns={columns}
        data={(data?.data as Server[]) || []}
        total={data?.total}
        loading={loading}
        page={page}
        perPage={25}
        onPageChange={setPage}
        onRowClick={(record) => router.push(`/servers/${encodeURIComponent(String(record.id))}`)}
        onSearch={handleSearch}
        searchPlaceholder="Search servers..."
        emptyMessage="servers"
      />
    </>
  );
}
