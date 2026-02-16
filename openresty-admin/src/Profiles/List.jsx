import React from 'react';
import { List as RaList, Datagrid, TextField } from 'react-admin';

const List = () => {
  return (
    <RaList perPage={1000}>
      <Datagrid
        rowClick="edit"
      >
        <TextField source='name' />
        {/* <TextField source='name' /> */}
      </Datagrid>
    </RaList>
  )
}

export default List