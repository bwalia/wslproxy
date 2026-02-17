import React from "react";
import {
  Datagrid,
  List as RaList,
  TextField,
  SearchInput,
  BooleanField,
  CloneButton,
  FunctionField,
  ArrayField,
  SingleFieldList,
  ChipField,
  DeleteButton,
  EditButton,
} from "react-admin";
import Empty from '../component/Empty';
import ToolBar from "../component/ToolBar";

const upstreamFilters = [
  <SearchInput source="q" alwaysOn fullWidth />,
];

const List = () => {
  return (
    <RaList
      title={"Upstreams"}
      perPage={1000}
      sort={{ field: 'created_at', order: 'DESC' }}
      empty={<Empty resource={"upstreams"} />}
      filters={upstreamFilters}
      actions={<ToolBar resource={"upstreams"} />}
    >
      <Datagrid rowClick="edit">
        <TextField source="name" label="Upstream Name" />
        <TextField source="zone_name" label="Zone Name" />
        <TextField source="zone_size" label="Zone Size" />
        <TextField source="load_balancing_method" label="Load Balancing" />
        <FunctionField
          source="servers"
          label="Servers Count"
          render={record => record.servers ? record.servers.length : 0}
        />
        <BooleanField source="enabled" label="Enabled" />
        <EditButton />
        <CloneButton />
        <DeleteButton mutationMode="pessimistic" />
      </Datagrid>
    </RaList>
  );
};

export default List;
