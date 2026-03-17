'use client';

import React, { useState, useCallback } from 'react';
import { Button } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DnsIcon from '@mui/icons-material/Dns';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/ui/PageHeader';
import DataTable, { Column } from '@/components/ui/DataTable';
import { useApi, useFetch } from '@/hooks/useApi';

interface Instance {
  id: string;
  name: string;
  instance_hash: string;
  serial_number: string;
  created_at: string;
  [key: string]: unknown;
}

export default function InstancesListPage() {
  const api = useApi();
  const router = useRouter();
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');

  const { data, loading } = useFetch(() =>
    api.getList('instances', {
      pagination: { page: page + 1, perPage: 25 },
      filter: search ? { q: search } : {},
    })
  );

  const columns: Column<Instance>[] = [
    { field: 'name', label: 'Name', sortable: true },
    { field: 'instance_hash', label: 'Instance Hash' },
    { field: 'serial_number', label: 'Serial Number' },
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
        title="Instances"
        subtitle="Manage proxy instances"
        icon={<DnsIcon />}
        actions={
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => router.push('/instances/create')}
          >
            Create
          </Button>
        }
      />
      <DataTable<Instance>
        columns={columns}
        data={(data?.data as Instance[]) || []}
        total={data?.total}
        loading={loading}
        page={page}
        perPage={25}
        onPageChange={setPage}
        onRowClick={(record) => router.push(`/instances/${encodeURIComponent(String(record.id))}`)}
        onSearch={handleSearch}
        searchPlaceholder="Search instances..."
        emptyMessage="instances"
      />
    </>
  );
}
