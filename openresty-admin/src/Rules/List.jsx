import React from 'react';
import { BooleanField, Datagrid, NumberField, List as RaList, TextField, TopToolbar } from 'react-admin'
import ExportJsonButton from './toolbar/ExportJsonButton';
import ImportJsonButton from './toolbar/ImportJsonButton';

const ListActions = () => (
  <TopToolbar>
      <ImportJsonButton />
  </TopToolbar>
);

const List = () => {
  return (
    <RaList title={"Rules"} exporter={ExportJsonButton} actions={<ListActions/>}>
        <Datagrid rowClick="edit">
            <TextField source='name' />
            <TextField source='priority' />
            <TextField source='match.rules.path' />
            <NumberField source='match.rules.client_ip' /> 
            <BooleanField source='match.response.allow' /> 
        </Datagrid>
    </RaList>
  )
}

export default List