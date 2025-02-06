import React from "react";
import {
  Datagrid,
  List as RaList,
  TextField,
  ReferenceInput,
  SelectInput,
  SearchInput,
  BooleanField,
  CloneButton,
  FunctionField,
} from "react-admin";
import ExportJsonButton from './toolbar/ExportJsonButton';
import Empty from '../component/Empty';
import ToolBar from "../component/ToolBar";

const handleProfileChange = (e) => {
  localStorage.setItem('environment', e.target.value);
}
const serverFilters = [
  <SearchInput source="q" alwaysOn fullWidth />,
  <ReferenceInput source="profile_id" reference="profiles" alwaysOn >
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
      title={"Servers"}
      sort={{ field: 'created_at', order: 'DESC' }}
      exporter={ExportJsonButton}
      empty={<Empty resource={"servers"} />}
      filters={serverFilters}
      actions={<ToolBar resource={"servers"} />}
    >
      <Datagrid rowClick="edit">
        <TextField source="listens[0].listen" label="Listen" sortable={false} />
        <FunctionField
          source="server_name"
          render={record => (<a href={`https://${record.server_name}`} target="_blank">https://{record.server_name}</a>)}
          />
        {/* <TextField source="root" />
        <TextField source="access_log" /> */}
        <TextField source='profile_id' />
        <BooleanField source="config_status" />
        <CloneButton />
      </Datagrid>
      {/* <ImportJsonButton resource={"servers"} /> */}
    </RaList>
  );
};

export default List;
