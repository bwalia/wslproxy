import React from 'react';
import { Datagrid, DateField, EmailField, List as RaList, TextField } from 'react-admin';
import { MyPagination } from '../component/MyPagination';

const List = () => {
  return (
    <RaList 
      title={"Sessions"} 
      perPage={1000}
      pagination={<MyPagination />}
    >      <Datagrid>
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