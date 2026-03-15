'use client';

import React, { useState, useCallback } from 'react';
import { Button, Chip } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import SettingsIcon from '@mui/icons-material/Settings';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/ui/PageHeader';
import DataTable, { Column } from '@/components/ui/DataTable';
import { useApi, useFetch } from '@/hooks/useApi';

interface Setting {
  id: string;
  key: string;
  value: string;
  storage_type: string;
  [key: string]: unknown;
}

export default function SettingsListPage() {
  const api = useApi();
  const router = useRouter();
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');

  const { data, loading } = useFetch(() =>
    api.getList('settings', {
      pagination: { page: page + 1, perPage: 25 },
      filter: search ? { q: search } : {},
    })
  );

  const columns: Column<Setting>[] = [
    { field: 'key', label: 'Key', sortable: true },
    {
      field: 'value',
      label: 'Value',
      render: (record) => {
        const val = String(record.value || '');
        return val.length > 80 ? val.substring(0, 80) + '...' : val;
      },
    },
    {
      field: 'storage_type',
      label: 'Storage Type',
      render: (record) =>
        record.storage_type ? (
          <Chip label={record.storage_type} size="small" variant="outlined" />
        ) : (
          '-'
        ),
    },
  ];

  const handleSearch = useCallback((query: string) => {
    setSearch(query);
    setPage(0);
  }, []);

  return (
    <>
      <PageHeader
        title="Settings"
        subtitle="Manage application settings"
        icon={<SettingsIcon />}
        actions={
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => router.push('/settings/create')}
          >
            Create
          </Button>
        }
      />
      <DataTable<Setting>
        columns={columns}
        data={(data?.data as Setting[]) || []}
        total={data?.total}
        loading={loading}
        page={page}
        perPage={25}
        onPageChange={setPage}
        onRowClick={(record) => router.push(`/settings/${record.id}`)}
        onSearch={handleSearch}
        searchPlaceholder="Search settings..."
        emptyMessage="settings"
      />
    </>
  );
}
