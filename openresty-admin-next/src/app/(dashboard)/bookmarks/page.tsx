'use client';

import React, { useState, useCallback } from 'react';
import { Button, Link } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import BookmarkIcon from '@mui/icons-material/Bookmark';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/ui/PageHeader';
import DataTable, { Column } from '@/components/ui/DataTable';
import { useApi, useFetch } from '@/hooks/useApi';

interface Bookmark {
  id: string;
  name: string;
  url: string;
  created_at: string;
  [key: string]: unknown;
}

export default function BookmarksListPage() {
  const api = useApi();
  const router = useRouter();
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');

  const { data, loading } = useFetch(() =>
    api.getList('bookmarks', {
      pagination: { page: page + 1, perPage: 25 },
      filter: search ? { q: search } : {},
    })
  );

  const columns: Column<Bookmark>[] = [
    { field: 'name', label: 'Name', sortable: true },
    {
      field: 'url',
      label: 'URL',
      render: (record) => (
        <Link
          href={String(record.url)}
          target="_blank"
          rel="noopener"
          onClick={(e) => e.stopPropagation()}
        >
          {String(record.url)}
        </Link>
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
        title="Bookmarks"
        subtitle="Manage bookmarks"
        icon={<BookmarkIcon />}
        actions={
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => router.push('/bookmarks/create')}
          >
            Create
          </Button>
        }
      />
      <DataTable<Bookmark>
        columns={columns}
        data={(data?.data as Bookmark[]) || []}
        total={data?.total}
        loading={loading}
        page={page}
        perPage={25}
        onPageChange={setPage}
        onRowClick={(record) => router.push(`/bookmarks/${record.id}`)}
        onSearch={handleSearch}
        searchPlaceholder="Search bookmarks..."
        emptyMessage="bookmarks"
      />
    </>
  );
}
