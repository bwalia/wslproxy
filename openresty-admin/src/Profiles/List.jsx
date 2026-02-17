import React from 'react';
import { List as RaList, Datagrid, TextField } from 'react-admin';
import { MyPagination } from '../component/MyPagination';

const List = () => {
  return (
    <RaList 
      perPage={1000}
      pagination={<MyPagination />}
    >      <Datagrid
        rowClick="edit"
      >
        <TextField source='name' />
        {/* <TextField source='name' /> */}
      </Datagrid>
    </RaList>
  )
}

export default List