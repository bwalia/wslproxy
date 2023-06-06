import React from "react";
import { Datagrid, EmailField, List as RaList, TextField } from "react-admin";

const List = () => {
  return (
    <RaList title={"Users"} sort={{ field: 'created_at', order: 'DESC' }}>
      <Datagrid rowClick="edit">
        <TextField source="name" />
        <EmailField source="email" />
        <TextField source="phone" />
        <TextField source="website" />
        <TextField source="address.city" />
        <TextField source="company.name" />
      </Datagrid>
    </RaList>
  );
};

export default List;
