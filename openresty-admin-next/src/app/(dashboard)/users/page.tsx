'use client';

import React, { useState, useCallback } from 'react';
import { Button, Chip } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import PeopleIcon from '@mui/icons-material/People';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/ui/PageHeader';
import DataTable, { Column } from '@/components/ui/DataTable';
import { useApi, useFetch } from '@/hooks/useApi';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  created_at: string;
  [key: string]: unknown;
}

export default function UsersListPage() {
  const api = useApi();
  const router = useRouter();
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');

  const { data, loading } = useFetch(() =>
    api.getList('users', {
      pagination: { page: page + 1, perPage: 25 },
      filter: search ? { q: search } : {},
    })
  );

  const columns: Column<User>[] = [
    { field: 'name', label: 'Name', sortable: true },
    { field: 'email', label: 'Email', sortable: true },
    {
      field: 'role',
      label: 'Role',
      render: (record) => (
        <Chip label={record.role || 'user'} size="small" color="primary" variant="outlined" />
      ),
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
        title="Users"
        subtitle="Manage user accounts"
        icon={<PeopleIcon />}
        actions={
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => router.push('/users/create')}
          >
            Create
          </Button>
        }
      />
      <DataTable<User>
        columns={columns}
        data={(data?.data as User[]) || []}
        total={data?.total}
        loading={loading}
        page={page}
        perPage={25}
        onPageChange={setPage}
        onRowClick={(record) => router.push(`/users/${encodeURIComponent(String(record.id))}`)}
        onSearch={handleSearch}
        searchPlaceholder="Search users..."
        emptyMessage="users"
      />
    </>
  );
}
