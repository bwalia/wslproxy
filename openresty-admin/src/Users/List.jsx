import React from "react";
import { Datagrid, EmailField, List as RaList, TextField } from "react-admin";

const List = () => {
  return (
    <RaList title={"Users"}>
      <Datagrid rowClick="edit">
        <TextField source="id" />
        <TextField source="phone" />
        <EmailField source="email" />
        <TextField source="website" />
        <TextField source="name" />
        <TextField source="address.city" />
        <TextField source="company.name" />
      </Datagrid>
    </RaList>
  );
};

export default List;
