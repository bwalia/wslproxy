'use client';

import React, { useState, useCallback } from 'react';
import { Button, Chip } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/ui/PageHeader';
import DataTable, { Column } from '@/components/ui/DataTable';
import { useApi, useFetch } from '@/hooks/useApi';

interface Upstream {
  id: string;
  name: string;
  servers: Array<Record<string, unknown>>;
  created_at: string;
  [key: string]: unknown;
}

export default function UpstreamsListPage() {
  const api = useApi();
  const router = useRouter();
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');

  const { data, loading } = useFetch(() =>
    api.getList('upstreams', {
      pagination: { page: page + 1, perPage: 25 },
      filter: search ? { q: search } : {},
    })
  );

  const columns: Column<Upstream>[] = [
    { field: 'name', label: 'Name', sortable: true },
    {
      field: 'servers',
      label: 'Servers',
      render: (record) => {
        const count = Array.isArray(record.servers) ? record.servers.length : 0;
        return <Chip label={`${count} server${count !== 1 ? 's' : ''}`} size="small" variant="outlined" />;
      },
    },
    {
      field: 'created_at',
      label: 'Created',
      render: (record) =>
        record.created_at ? new Date(record.created_at).toLocaleDateString() : '-',
    },
  ];

  const handleSearch = useCallback((query: string) => {
    setSearch(query);
    setPage(0);
  }, []);

  return (
    <>
      <PageHeader
        title="Upstreams"
        subtitle="Manage upstream backend servers"
        icon={<AccountTreeIcon />}
        actions={
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => router.push('/upstreams/create')}
          >
            Create
          </Button>
        }
      />
      <DataTable<Upstream>
        columns={columns}
        data={(data?.data as Upstream[]) || []}
        total={data?.total}
        loading={loading}
        page={page}
        perPage={25}
        onPageChange={setPage}
        onRowClick={(record) => router.push(`/upstreams/${encodeURIComponent(String(record.id))}`)}
        onSearch={handleSearch}
        searchPlaceholder="Search upstreams..."
        emptyMessage="upstreams"
      />
    </>
  );
}
