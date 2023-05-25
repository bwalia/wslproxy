import React from 'react';
import { Datagrid, DateField, EmailField, List as RaList, TextField } from 'react-admin';

const List = () => {
  return (
    <RaList title={"Sessions"}>
      <Datagrid>
        <TextField source='id' />
        <TextField source='session_id' />
        <TextField source='subject' />
        <TextField source='timeout' />
        <TextField source='quote' />
      </Datagrid>
    </RaList>
  )
}

export default List;