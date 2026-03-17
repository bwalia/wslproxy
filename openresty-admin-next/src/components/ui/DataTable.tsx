'use client';
import React, { useState } from 'react';
import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  TableSortLabel,
  TextField,
  InputAdornment,
  Checkbox,
  Skeleton,
  Paper,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import get from 'lodash/get';
import Empty from '@/components/ui/Empty';

interface Column<T> {
  field: string;
  label: string;
  sortable?: boolean;
  render?: (record: T) => React.ReactNode;
  width?: string | number;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  total?: number;
  loading?: boolean;
  page?: number;
  perPage?: number;
  sort?: { field: string; order: 'ASC' | 'DESC' };
  onSort?: (field: string) => void;
  onPageChange?: (page: number) => void;
  onRowClick?: (record: T) => void;
  emptyMessage?: string;
  searchPlaceholder?: string;
  onSearch?: (query: string) => void;
  filters?: React.ReactNode;
  toolbar?: React.ReactNode;
  selectable?: boolean;
  onSelectionChange?: (selected: string[]) => void;
}

function DataTable<T extends Record<string, unknown>>({
  columns,
  data: rawData,
  total,
  loading = false,
  page = 0,
  perPage = 10,
  sort,
  onSort,
  onPageChange,
  onRowClick,
  emptyMessage,
  searchPlaceholder = 'Search...',
  onSearch,
  filters,
  toolbar,
  selectable = false,
  onSelectionChange,
}: DataTableProps<T>) {
  const data = Array.isArray(rawData) ? rawData : [];
  const [selected, setSelected] = useState<string[]>([]);

  const handleSelectAll = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.checked) {
      const allIds = data.map((row) => String(get(row, 'id', '')));
      setSelected(allIds);
      onSelectionChange?.(allIds);
    } else {
      setSelected([]);
      onSelectionChange?.([]);
    }
  };

  const handleSelectRow = (id: string) => {
    const newSelected = selected.includes(id)
      ? selected.filter((s) => s !== id)
      : [...selected, id];
    setSelected(newSelected);
    onSelectionChange?.(newSelected);
  };

  const totalCount = total ?? data.length;

  const headerCellSx = {
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    fontSize: '0.75rem',
    color: 'text.secondary',
    letterSpacing: '0.05em',
  };

  return (
    <Paper variant="outlined" sx={{ width: '100%', overflow: 'hidden' }}>
      {/* Search and filters bar */}
      {(onSearch || filters || toolbar) && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            p: 2,
            gap: 2,
            flexWrap: 'wrap',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1 }}>
            {onSearch && (
              <TextField
                size="small"
                placeholder={searchPlaceholder}
                onChange={(e) => onSearch(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon fontSize="small" />
                    </InputAdornment>
                  ),
                }}
                sx={{ minWidth: 240 }}
              />
            )}
            {filters}
          </Box>
          {toolbar && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {toolbar}
            </Box>
          )}
        </Box>
      )}

      <TableContainer>
        <Table>
          <TableHead>
            <TableRow>
              {selectable && (
                <TableCell padding="checkbox" sx={headerCellSx}>
                  <Checkbox
                    indeterminate={selected.length > 0 && selected.length < data.length}
                    checked={data.length > 0 && selected.length === data.length}
                    onChange={handleSelectAll}
                  />
                </TableCell>
              )}
              {columns.map((col) => (
                <TableCell
                  key={col.field}
                  sx={{ ...headerCellSx, width: col.width }}
                >
                  {col.sortable && onSort ? (
                    <TableSortLabel
                      active={sort?.field === col.field}
                      direction={
                        sort?.field === col.field
                          ? (sort.order.toLowerCase() as 'asc' | 'desc')
                          : 'asc'
                      }
                      onClick={() => onSort(col.field)}
                    >
                      {col.label}
                    </TableSortLabel>
                  ) : (
                    col.label
                  )}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {loading
              ? Array.from({ length: perPage }).map((_, idx) => (
                  <TableRow key={`skeleton-${idx}`}>
                    {selectable && (
                      <TableCell padding="checkbox">
                        <Skeleton variant="rectangular" width={24} height={24} />
                      </TableCell>
                    )}
                    {columns.map((col) => (
                      <TableCell key={col.field}>
                        <Skeleton variant="text" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              : data.length === 0
                ? (
                    <TableRow>
                      <TableCell
                        colSpan={columns.length + (selectable ? 1 : 0)}
                        sx={{ border: 0 }}
                      >
                        <Empty resource={emptyMessage || 'records'} />
                      </TableCell>
                    </TableRow>
                  )
                : data.map((row, rowIdx) => {
                    const rowId = String(get(row, 'id', rowIdx));
                    return (
                      <TableRow
                        key={rowId}
                        hover
                        onClick={() => onRowClick?.(row)}
                        sx={{
                          cursor: onRowClick ? 'pointer' : 'default',
                        }}
                      >
                        {selectable && (
                          <TableCell padding="checkbox">
                            <Checkbox
                              checked={selected.includes(rowId)}
                              onClick={(e) => e.stopPropagation()}
                              onChange={() => handleSelectRow(rowId)}
                            />
                          </TableCell>
                        )}
                        {columns.map((col) => (
                          <TableCell key={col.field}>
                            {col.render
                              ? col.render(row)
                              : String(get(row, col.field, '') ?? '')}
                          </TableCell>
                        ))}
                      </TableRow>
                    );
                  })}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Pagination */}
      {totalCount > 0 && (
        <TablePagination
          component="div"
          count={totalCount}
          page={page}
          rowsPerPage={perPage}
          rowsPerPageOptions={[perPage]}
          onPageChange={(_, newPage) => onPageChange?.(newPage)}
        />
      )}
    </Paper>
  );
}

export { DataTable };
export default DataTable;
export type { Column, DataTableProps };
