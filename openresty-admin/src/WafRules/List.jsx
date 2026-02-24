import React from 'react';
import {
  BooleanField,
  Datagrid,
  NumberField,
  List as RaList,
  TextField,
  FunctionField,
  SearchInput,
  SelectInput,
} from 'react-admin'
import Empty from '../component/Empty';
import ToolBar from '../component/ToolBar';
import { MyPagination } from '../component/MyPagination';
import { Chip } from '@mui/material';

const categoryColors = {
  sqli: '#ef4444',
  xss: '#f97316',
  cmdi: '#a855f7',
  lfi: '#3b82f6',
  rfi: '#6366f1',
  protocol: '#6b7280',
  custom: '#14b8a6',
};

const severityColors = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#eab308',
  low: '#3b82f6',
  info: '#6b7280',
};

const actionColors = {
  block: '#ef4444',
  monitor: '#f97316',
  allow: '#22c55e',
};

const wafRulesFilters = [
  <SearchInput source="q" alwaysOn fullWidth />,
  <SelectInput
    source="category"
    choices={[
      { id: 'sqli', name: 'SQL Injection' },
      { id: 'xss', name: 'XSS' },
      { id: 'cmdi', name: 'Command Injection' },
      { id: 'lfi', name: 'Local File Inclusion' },
      { id: 'rfi', name: 'Remote File Inclusion' },
      { id: 'protocol', name: 'Protocol' },
      { id: 'custom', name: 'Custom' },
    ]}
    alwaysOn
  />,
];

const List = () => {
  return (
    <RaList
      title={"WAF Rules"}
      perPage={1000}
      pagination={<MyPagination />}
      empty={<Empty resource={"waf_rules"} />}
      filters={wafRulesFilters}
      actions={<ToolBar resource={"waf_rules"} />}
    >
      <Datagrid rowClick="edit">
        <TextField source='name' />
        <FunctionField
          source='category'
          render={(record) => {
            const color = categoryColors[record.category] || '#6b7280';
            return (
              <Chip
                label={record.category}
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
        <TextField source='target' />
        <FunctionField
          source='action'
          render={(record) => {
            const color = actionColors[record.action] || '#6b7280';
            return (
              <Chip
                label={record.action}
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
        <BooleanField source='enabled' />
        <NumberField source='score' />
      </Datagrid>
    </RaList>
  )
}

export default List