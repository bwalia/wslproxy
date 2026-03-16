'use client';

import React, { useState, useCallback } from 'react';
import { Button, Chip, Stack } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import VpnKeyIcon from '@mui/icons-material/VpnKey';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/ui/PageHeader';
import DataTable, { Column } from '@/components/ui/DataTable';
import { useApi, useFetch } from '@/hooks/useApi';

interface Secret {
  id: string;
  name: string;
  tags: string[];
  created_at: string;
  [key: string]: unknown;
}

export default function SecretsListPage() {
  const api = useApi();
  const router = useRouter();
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');

  const { data, loading } = useFetch(() =>
    api.getList('secrets', {
      pagination: { page: page + 1, perPage: 25 },
      filter: search ? { q: search } : {},
    })
  );

  const columns: Column<Secret>[] = [
    { field: 'name', label: 'Name', sortable: true },
    {
      field: 'tags',
      label: 'Tags',
      render: (record) => {
        const tags = Array.isArray(record.tags) ? record.tags : [];
        return (
          <Stack direction="row" spacing={0.5} flexWrap="wrap">
            {tags.map((tag: string) => (
              <Chip key={tag} label={tag} size="small" variant="outlined" />
            ))}
          </Stack>
        );
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
        title="Secrets"
        subtitle="Manage secret values"
        icon={<VpnKeyIcon />}
        actions={
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => router.push('/secrets/create')}
          >
            Create
          </Button>
        }
      />
      <DataTable<Secret>
        columns={columns}
        data={(data?.data as Secret[]) || []}
        total={data?.total}
        loading={loading}
        page={page}
        perPage={25}
        onPageChange={setPage}
        onRowClick={(record) => router.push(`/secrets/${encodeURIComponent(String(record.id))}`)}
        onSearch={handleSearch}
        searchPlaceholder="Search secrets..."
        emptyMessage="secrets"
      />
    </>
  );
}
