import React from "react";
import {
  Datagrid,
  List as RaList,
  TextField,
  ReferenceInput,
  SelectInput,
  SearchInput,
  CloneButton
} from "react-admin";
import ExportJsonButton from './toolbar/ExportJsonButton';
import ImportJsonButton from '../component/ImportJsonButton';
import Empty from '../component/Empty';

const handleProfileChange = (e) => {
  localStorage.setItem('environment', e.target.value);
}
const serverFilters = [
  <SearchInput source="q" alwaysOn fullWidth />,
  <ReferenceInput source="profile_id" reference="profiles" alwaysOn >
    <SelectInput
      sx={{ marginTop: "0", marginBottom: "0" }}
      fullWidth
      optionText="name"
      onChange={handleProfileChange}
    />
  </ReferenceInput>,
];

const List = () => {
  return (
    <RaList
      title={"Servers"}
      sort={{ field: 'created_at', order: 'DESC' }}
      exporter={ExportJsonButton}
      empty={<Empty resource={"servers"} />}
      filters={serverFilters}
    >
      <Datagrid rowClick="edit">
        <TextField source="listens[0].listen" label="Listen" sortable={false} />
        <TextField source="server_name" />
        <TextField source="root" />
        <TextField source="access_log" />
        <TextField source='profile_id' />
        <CloneButton />
      </Datagrid>
      <ImportJsonButton resource={"servers"} />
    </RaList>
  );
};

export default List;
