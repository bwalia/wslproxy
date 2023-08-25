import React from "react";
import { Datagrid, List as RaList, TextField } from "react-admin";
import ExportJsonButton from './toolbar/ExportJsonButton';
import ImportJsonButton from '../component/ImportJsonButton';
import Empty from '../component/Empty';

const List = () => {
  return (
    <RaList 
      title={"Servers"} 
      sort={{ field: 'created_at', order: 'DESC' }}
      exporter={ExportJsonButton} 
      empty={<Empty resource={"servers"} />}
    >
      <Datagrid rowClick="edit">
        <TextField source="listens[0].listen" label="Listen" sortable={false} />
        <TextField source="server_name" />
        <TextField source="root" />
        <TextField source="access_log" />
      </Datagrid>
      <ImportJsonButton resource={"servers"} />
    </RaList>
  );
};

export default List;
