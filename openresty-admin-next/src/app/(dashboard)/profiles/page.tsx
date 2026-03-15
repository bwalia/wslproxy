'use client';

import React, { useState, useCallback } from 'react';
import { Button } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import FolderIcon from '@mui/icons-material/Folder';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/ui/PageHeader';
import DataTable, { Column } from '@/components/ui/DataTable';
import { useApi, useFetch } from '@/hooks/useApi';

interface Profile {
  id: string;
  name: string;
  description: string;
  created_at: string;
  [key: string]: unknown;
}

export default function ProfilesListPage() {
  const api = useApi();
  const router = useRouter();
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');

  const { data, loading } = useFetch(() =>
    api.getList('profiles', {
      pagination: { page: page + 1, perPage: 25 },
      filter: search ? { q: search } : {},
    })
  );

  const columns: Column<Profile>[] = [
    { field: 'name', label: 'Name', sortable: true },
    { field: 'description', label: 'Description' },
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
        title="Profiles"
        subtitle="Manage environment profiles"
        icon={<FolderIcon />}
        actions={
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => router.push('/profiles/create')}
          >
            Create
          </Button>
        }
      />
      <DataTable<Profile>
        columns={columns}
        data={(data?.data as Profile[]) || []}
        total={data?.total}
        loading={loading}
        page={page}
        perPage={25}
        onPageChange={setPage}
        onRowClick={(record) => router.push(`/profiles/${record.id}`)}
        onSearch={handleSearch}
        searchPlaceholder="Search profiles..."
        emptyMessage="profiles"
      />
    </>
  );
}
