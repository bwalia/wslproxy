import React from 'react';
import { BooleanField, Datagrid, NumberField, List as RaList, TextField } from 'react-admin'
import ExportJsonButton from './toolbar/ExportJsonButton';
import ImportJsonButton from '../component/ImportJsonButton';
import Empty from '../component/Empty';

const List = () => {
  return (
    <RaList 
      title={"Rules"} 
      exporter={ExportJsonButton} 
      empty={<Empty resource={"rules"} />} 
    >
      <Datagrid rowClick="edit">
        <TextField source='name' />
        <TextField source='priority' />
        <TextField source='match.rules.path' />
        <NumberField source='match.rules.client_ip' />
        <BooleanField source='match.response.allow' />
      </Datagrid>
      <ImportJsonButton resource={"rules"} />
    </RaList>
  )
}

export default List