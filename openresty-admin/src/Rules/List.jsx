import React from 'react';
import { BooleanField, Datagrid, NumberField, List as RaList, TextField } from 'react-admin'

const List = () => {
  return (
    <RaList title={"Rules"}>
        <Datagrid>
            <TextField source='name' />
            <TextField source='priority' />
            <TextField source='match.rules.path' />
            <NumberField source='match.rules.client_ip' /> 
            <TextField source='match.operator.lookup' />
            <BooleanField source='match.response.allow' />
        </Datagrid>
    </RaList>
  )
}

export default List