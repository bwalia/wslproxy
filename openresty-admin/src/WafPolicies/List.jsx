import React from 'react';
import {
  BooleanField,
  Datagrid,
  NumberField,
  List as RaList,
  TextField,
  FunctionField,
  SearchInput,
} from 'react-admin'
import Empty from '../component/Empty';
import ToolBar from '../component/ToolBar';
import { MyPagination } from '../component/MyPagination';
import { Chip } from '@mui/material';

const modeColors = {
  block: '#ef4444',
  monitor: '#f97316',
};

const wafPoliciesFilters = [
  <SearchInput source="q" alwaysOn fullWidth />,
];

const List = () => {
  return (
    <RaList
      title={"WAF Policies"}
      perPage={1000}
      pagination={<MyPagination />}
      empty={<Empty resource={"waf_policies"} />}
      filters={wafPoliciesFilters}
      actions={<ToolBar resource={"waf_policies"} />}
    >
      <Datagrid rowClick="edit">
        <TextField source='name' />
        <FunctionField
          source='mode'
          render={(record) => {
            const color = modeColors[record.mode] || '#6b7280';
            return (
              <Chip
                label={record.mode}
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
        <NumberField source='anomaly_threshold' />
        <NumberField source='paranoia_level' />
      </Datagrid>
    </RaList>
  )
}

export default List