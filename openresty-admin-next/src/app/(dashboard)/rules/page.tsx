'use client';

import React, { useState, useCallback } from 'react';
import { Button, Chip, Stack } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import RuleIcon from '@mui/icons-material/Rule';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/ui/PageHeader';
import DataTable, { Column } from '@/components/ui/DataTable';
import { useApi, useFetch } from '@/hooks/useApi';

interface Rule {
  id: string;
  name: string;
  match: {
    rules?: {
      path?: string;
      path_key?: string;
      country?: string;
    };
    response?: {
      allow?: boolean;
      code?: number;
    };
  };
  status: string;
  rules_tags: string[];
  [key: string]: unknown;
}

export default function RulesListPage() {
  const api = useApi();
  const router = useRouter();
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');

  const { data, loading } = useFetch(() =>
    api.getList('rules', {
      pagination: { page: page + 1, perPage: 25 },
      filter: search ? { q: search } : {},
    })
  );

  const columns: Column<Rule>[] = [
    { field: 'name', label: 'Name', sortable: true },
    {
      field: 'match',
      label: 'Match Conditions',
      render: (record) => {
        const match = record.match as Rule['match'];
        const parts: string[] = [];
        if (match?.rules?.path) {
          parts.push(`${match.rules.path_key || 'starts_with'}: ${match.rules.path}`);
        }
        if (match?.rules?.country) {
          parts.push(`country: ${match.rules.country}`);
        }
        return parts.length > 0 ? parts.join(', ') : '-';
      },
    },
    {
      field: 'status',
      label: 'Status',
      render: (record) => {
        const status = String(record.status || 'draft');
        const color = status === 'active' ? 'success' : status === 'pending' ? 'warning' : 'default';
        return <Chip label={status} size="small" color={color} variant="outlined" />;
      },
    },
    {
      field: 'rules_tags',
      label: 'Tags',
      render: (record) => {
        const tags = Array.isArray(record.rules_tags) ? record.rules_tags : [];
        return (
          <Stack direction="row" spacing={0.5} flexWrap="wrap">
            {tags.map((tag: string) => (
              <Chip key={tag} label={tag} size="small" variant="outlined" />
            ))}
          </Stack>
        );
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
        title="Rules"
        subtitle="Manage request matching and response rules"
        icon={<RuleIcon />}
        actions={
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => router.push('/rules/create')}
          >
            Create
          </Button>
        }
      />
      <DataTable<Rule>
        columns={columns}
        data={(data?.data as Rule[]) || []}
        total={data?.total}
        loading={loading}
        page={page}
        perPage={25}
        onPageChange={setPage}
        onRowClick={(record) => router.push(`/rules/${record.id}`)}
        onSearch={handleSearch}
        searchPlaceholder="Search rules..."
        emptyMessage="rules"
      />
    </>
  );
}
