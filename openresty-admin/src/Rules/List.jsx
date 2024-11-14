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
  CloneButton
} from 'react-admin'
import ExportJsonButton from './toolbar/ExportJsonButton';
import ImportJsonButton from '../component/ImportJsonButton';
import Empty from '../component/Empty';
import ToolBar from '../component/ToolBar';

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
  return (
    <RaList
      title={"Rules"}
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
        <CloneButton />
      </Datagrid>
      {/* <ImportJsonButton resource={"rules"} /> */}
    </RaList>
  )
}

export default List