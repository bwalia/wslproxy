import React from "react";
import { Datagrid, List as RaList, TextField } from "react-admin";

const List = () => {
  return (
    <RaList title={"Servers"} sort={{ field: 'created_at', order: 'DESC' }}>
      <Datagrid rowClick="edit">
        <TextField source="listens[0].listen" label="Listen" />
        <TextField source="server_name" />
        <TextField source="root" />
        <TextField source="access_log" />
      </Datagrid>
    </RaList>
  );
};

export default List;
