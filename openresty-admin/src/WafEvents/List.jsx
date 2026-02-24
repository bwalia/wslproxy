import React from 'react';
import {
  Datagrid,
  DateField,
  NumberField,
  List as RaList,
  TextField,
  FunctionField,
  SearchInput,
  SelectInput,
  TopToolbar,
  FilterButton,
  ExportButton,
} from 'react-admin'
import { MyPagination } from '../component/MyPagination';
import { Chip } from '@mui/material';

const typeColors = {
  blocked: '#ef4444',
  monitored: '#f97316',
  error: '#6b7280',
};

const severityColors = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#eab308',
  low: '#3b82f6',
  info: '#6b7280',
};

const wafEventsFilters = [
  <SearchInput source="q" alwaysOn fullWidth />,
  <SelectInput
    source="type"
    choices={[
      { id: 'blocked', name: 'Blocked' },
      { id: 'monitored', name: 'Monitored' },
      { id: 'error', name: 'Error' },
    ]}
    alwaysOn
  />,
];

// Read-only toolbar (no create button)
const WafEventsToolbar = () => (
  <TopToolbar>
    <FilterButton />
    <ExportButton />
  </TopToolbar>
);

const List = () => {
  return (
    <RaList
      title={"WAF Events"}
      perPage={1000}
      pagination={<MyPagination />}
      filters={wafEventsFilters}
      actions={<WafEventsToolbar />}
    >
      <Datagrid bulkActionButtons={false}>
        <DateField source='timestamp' showTime />
        <FunctionField
          source='type'
          render={(record) => {
            const color = typeColors[record.type] || '#6b7280';
            return (
              <Chip
                label={record.type}
                size="small"
                sx={{
                  backgroundColor: `${color}20`,
                  color: color,
                  fontWeight: 600,
                  fontSize: '0.75rem',
                }}
              />
            );
          }}
        />
        <TextField source='host' />
        <TextField source='rule_name' />
        <TextField source='category' />
        <FunctionField
          source='severity'
          render={(record) => {
            const color = severityColors[record.severity] || '#6b7280';
            return (
              <Chip
                label={record.severity}
                size="small"
                sx={{
                  backgroundColor: `${color}20`,
                  color: color,
                  fontWeight: 600,
                  fontSize: '0.75rem',
                }}
              />
            );
          }}
        />
        <TextField source='client_ip' />
        <TextField source='uri' />
        <TextField source='method' />
        <NumberField source='score' />
      </Datagrid>
    </RaList>
  )
}

export default List