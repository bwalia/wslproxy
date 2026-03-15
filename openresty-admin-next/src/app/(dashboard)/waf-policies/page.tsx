'use client';

import React, { useState, useCallback } from 'react';
import { Button, Chip } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import PolicyIcon from '@mui/icons-material/Policy';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/ui/PageHeader';
import DataTable, { Column } from '@/components/ui/DataTable';
import StatusChip from '@/components/ui/StatusChip';
import { useApi, useFetch } from '@/hooks/useApi';

interface WafPolicy {
  id: string;
  name: string;
  mode: string;
  enabled: boolean;
  anomaly_threshold: number;
  paranoia_level: number;
  [key: string]: unknown;
}

export default function WafPoliciesListPage() {
  const api = useApi();
  const router = useRouter();
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');

  const { data, loading } = useFetch(() =>
    api.getList('waf_policies', {
      pagination: { page: page + 1, perPage: 25 },
      filter: search ? { q: search } : {},
    })
  );

  const columns: Column<WafPolicy>[] = [
    { field: 'name', label: 'Name', sortable: true },
    {
      field: 'mode',
      label: 'Mode',
      render: (record) =>
        record.mode ? (
          <Chip
            label={record.mode}
            size="small"
            color={record.mode === 'block' ? 'error' : 'warning'}
            variant="outlined"
          />
        ) : '-',
    },
    {
      field: 'enabled',
      label: 'Enabled',
      render: (record) => <StatusChip value={!!record.enabled} />,
    },
    { field: 'anomaly_threshold', label: 'Anomaly Threshold' },
    { field: 'paranoia_level', label: 'Paranoia Level' },
  ];

  const handleSearch = useCallback((query: string) => {
    setSearch(query);
    setPage(0);
  }, []);

  return (
    <>
      <PageHeader
        title="WAF Policies"
        subtitle="Manage Web Application Firewall policies"
        icon={<PolicyIcon />}
        actions={
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => router.push('/waf-policies/create')}
          >
            Create
          </Button>
        }
      />
      <DataTable<WafPolicy>
        columns={columns}
        data={(data?.data as WafPolicy[]) || []}
        total={data?.total}
        loading={loading}
        page={page}
        perPage={25}
        onPageChange={setPage}
        onRowClick={(record) => router.push(`/waf-policies/${record.id}`)}
        onSearch={handleSearch}
        searchPlaceholder="Search WAF policies..."
        emptyMessage="WAF policies"
      />
    </>
  );
}
