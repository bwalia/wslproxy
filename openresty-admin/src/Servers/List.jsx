import React from "react";
import { Datagrid, List as RaList, TextField } from "react-admin";

const List = () => {
  return (
    <RaList title={"Servers"}>
      <Datagrid rowClick="edit">
        <TextField source="listen" />
        <TextField source="server_name" />
        <TextField source="root" />
        <TextField source="access_log" />
      </Datagrid>
    </RaList>
  );
};

export default List;
