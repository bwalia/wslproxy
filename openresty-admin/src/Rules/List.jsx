import React from 'react';
import {
  BooleanField,
  Datagrid,
  NumberField,
  List as RaList,
  TextField,
  ReferenceInput,
  SelectInput,
  SearchInput,
  CloneButton,
  FunctionField,
} from 'react-admin'
import { Chip, useTheme, alpha } from "@mui/material";
import HistoryIcon from "@mui/icons-material/HistoryRounded";
import ExportJsonButton from './toolbar/ExportJsonButton';
import ImportJsonButton from '../component/ImportJsonButton';
import Empty from '../component/Empty';
import ToolBar from '../component/ToolBar';
import { MyPagination } from '../component/MyPagination';

const handleProfileChange = (e) => {
  localStorage.setItem('environment', e.target.value);
}
const rulesFilters = [
  <SearchInput source="q" alwaysOn fullWidth />,
  <ReferenceInput source="profile_id" reference="profiles" alwaysOn>
    <SelectInput
      fullWidth
      optionText="name"
      onChange={handleProfileChange}
    />
  </ReferenceInput>,
];

const List = () => {
  const theme = useTheme();

  return (
    <RaList
      title={"Server Rules"}
      perPage={1000}
      pagination={<MyPagination />}
      exporter={ExportJsonButton}
      empty={<Empty resource={"rules"} />}
      filters={rulesFilters}
      actions={<ToolBar resource={"rules"} />}
    >
      <Datagrid rowClick="edit">
        <TextField source='name' />
        <TextField source='priority' />
        <TextField source='profile_id' />
        <TextField source='match.rules.path' />
        <NumberField source='match.rules.client_ip' />
        <BooleanField source='match.response.allow' />
        <FunctionField
          source="_version_control"
          label="Version"
          sortable={false}
          render={record => {
            const vc = record._version_control;
            if (vc && vc.managed) {
              return (
                <Chip
                  icon={<HistoryIcon />}
                  label={`v${vc.live_version}`}
                  size="small"
                  sx={{
                    backgroundColor: alpha(theme.palette.success.main, 0.12),
                    color: theme.palette.success.main,
                    fontWeight: 600,
                    fontSize: '0.75rem',
                    '& .MuiChip-icon': { fontSize: 14, color: 'inherit' },
                  }}
                />
              );
            }
            return (
              <Chip
                label="No VC"
                size="small"
                variant="outlined"
                sx={{
                  color: theme.palette.text.disabled,
                  borderColor: theme.palette.divider,
                  fontSize: '0.75rem',
                }}
              />
            );
          }}
        />
        <CloneButton />
      </Datagrid>
      {/* <ImportJsonButton resource={"rules"} /> */}
    </RaList>
  )
}

export default List