'use client';

import React, { useState, useCallback } from 'react';
import TimerIcon from '@mui/icons-material/Timer';
import { PageHeader } from '@/components/ui/PageHeader';
import DataTable, { Column } from '@/components/ui/DataTable';
import { useApi, useFetch } from '@/hooks/useApi';

interface Session {
  id: string;
  user_id: string;
  created_at: string;
  expires_at: string;
  [key: string]: unknown;
}

export default function SessionsListPage() {
  const api = useApi();
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');

  const { data, loading } = useFetch(() =>
    api.getList('sessions', {
      pagination: { page: page + 1, perPage: 25 },
      filter: search ? { q: search } : {},
    })
  );

  const columns: Column<Session>[] = [
    { field: 'id', label: 'Session ID', sortable: true },
    { field: 'user_id', label: 'User ID', sortable: true },
    {
      field: 'created_at',
      label: 'Created',
      render: (record) =>
        record.created_at ? new Date(record.created_at).toLocaleString() : '-',
    },
    {
      field: 'expires_at',
      label: 'Expires',
      render: (record) =>
        record.expires_at ? new Date(record.expires_at).toLocaleString() : '-',
    },
  ];

  const handleSearch = useCallback((query: string) => {
    setSearch(query);
    setPage(0);
  }, []);

  return (
    <>
      <PageHeader
        title="Sessions"
        subtitle="View active user sessions"
        icon={<TimerIcon />}
      />
      <DataTable<Session>
        columns={columns}
        data={(data?.data as Session[]) || []}
        total={data?.total}
        loading={loading}
        page={page}
        perPage={25}
        onPageChange={setPage}
        onSearch={handleSearch}
        searchPlaceholder="Search sessions..."
        emptyMessage="sessions"
      />
    </>
  );
}
