'use client';

import React, { useState, useCallback } from 'react';
import { Chip } from '@mui/material';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { PageHeader } from '@/components/ui/PageHeader';
import DataTable, { Column } from '@/components/ui/DataTable';
import { useApi, useFetch } from '@/hooks/useApi';

interface WafEvent {
  id: string;
  timestamp: string;
  type: string;
  host: string;
  rule_name: string;
  category: string;
  severity: string;
  client_ip: string;
  uri: string;
  method: string;
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

export default function WafEventsListPage() {
  const api = useApi();
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');

  const { data, loading } = useFetch(() =>
    api.getList('waf_events', {
      pagination: { page: page + 1, perPage: 25 },
      sort: { field: 'timestamp', order: 'DESC' },
      filter: search ? { q: search } : {},
    })
  );

  const columns: Column<WafEvent>[] = [
    {
      field: 'timestamp',
      label: 'Timestamp',
      sortable: true,
      render: (record) =>
        record.timestamp ? new Date(record.timestamp).toLocaleString() : '-',
    },
    {
      field: 'type',
      label: 'Type',
      render: (record) =>
        record.type ? <Chip label={record.type} size="small" variant="outlined" /> : '-',
    },
    { field: 'host', label: 'Host' },
    { field: 'rule_name', label: 'Rule' },
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
    { field: 'client_ip', label: 'Client IP' },
    { field: 'uri', label: 'URI' },
    {
      field: 'method',
      label: 'Method',
      render: (record) =>
        record.method ? <Chip label={record.method} size="small" variant="outlined" /> : '-',
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
        title="WAF Events"
        subtitle="View Web Application Firewall event log"
        icon={<WarningAmberIcon />}
      />
      <DataTable<WafEvent>
        columns={columns}
        data={(data?.data as WafEvent[]) || []}
        total={data?.total}
        loading={loading}
        page={page}
        perPage={25}
        onPageChange={setPage}
        onSearch={handleSearch}
        searchPlaceholder="Search WAF events..."
        emptyMessage="WAF events"
      />
    </>
  );
}
