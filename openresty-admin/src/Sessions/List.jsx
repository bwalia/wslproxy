import React from 'react';
import { Datagrid, DateField, EmailField, List as RaList, TextField } from 'react-admin';

const List = () => {
  return (
    <RaList title={"Sessions"}>
      <Datagrid>
        <TextField source='id' />
        <TextField source='name' />
        <EmailField source='email' />
        <DateField source='createdAt' />
      </Datagrid>
    </RaList>
  )
}

export default List;