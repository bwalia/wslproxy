'use client';

import React, { useState, useCallback } from 'react';
import { Button, Chip } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ShieldIcon from '@mui/icons-material/Shield';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/ui/PageHeader';
import DataTable, { Column } from '@/components/ui/DataTable';
import StatusChip from '@/components/ui/StatusChip';
import { useApi, useFetch } from '@/hooks/useApi';

interface WafRule {
  id: string;
  name: string;
  category: string;
  severity: string;
  target: string;
  action: string;
  enabled: boolean;
  score: number;
  [key: string]: unknown;
}

const severityColor = (severity: string) => {
  switch (severity?.toLowerCase()) {
    case 'critical': return 'error';
    case 'high': return 'error';
    case 'medium': return 'warning';
    case 'low': return 'info';
    default: return 'default';
  }
};

export default function WafRulesListPage() {
  const api = useApi();
  const router = useRouter();
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');

  const { data, loading } = useFetch(() =>
    api.getList('waf_rules', {
      pagination: { page: page + 1, perPage: 25 },
      filter: search ? { q: search } : {},
    })
  );

  const columns: Column<WafRule>[] = [
    { field: 'name', label: 'Name', sortable: true },
    {
      field: 'category',
      label: 'Category',
      render: (record) =>
        record.category ? <Chip label={record.category} size="small" variant="outlined" /> : '-',
    },
    {
      field: 'severity',
      label: 'Severity',
      render: (record) =>
        record.severity ? (
          <Chip
            label={record.severity}
            size="small"
            color={severityColor(record.severity) as 'error' | 'warning' | 'info' | 'default'}
          />
        ) : '-',
    },
    { field: 'target', label: 'Target' },
    {
      field: 'action',
      label: 'Action',
      render: (record) =>
        record.action ? <Chip label={record.action} size="small" variant="outlined" /> : '-',
    },
    {
      field: 'enabled',
      label: 'Enabled',
      render: (record) => <StatusChip value={!!record.enabled} />,
    },
    { field: 'score', label: 'Score' },
  ];

  const handleSearch = useCallback((query: string) => {
    setSearch(query);
    setPage(0);
  }, []);

  return (
    <>
      <PageHeader
        title="WAF Rules"
        subtitle="Manage Web Application Firewall rules"
        icon={<ShieldIcon />}
        actions={
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => router.push('/waf-rules/create')}
          >
            Create
          </Button>
        }
      />
      <DataTable<WafRule>
        columns={columns}
        data={(data?.data as WafRule[]) || []}
        total={data?.total}
        loading={loading}
        page={page}
        perPage={25}
        onPageChange={setPage}
        onRowClick={(record) => router.push(`/waf-rules/${encodeURIComponent(String(record.id))}`)}
        onSearch={handleSearch}
        searchPlaceholder="Search WAF rules..."
        emptyMessage="WAF rules"
      />
    </>
  );
}
