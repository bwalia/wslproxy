import React from 'react';
import { 
  BooleanField,
  Datagrid,
  NumberField,
  List as RaList,
  TextField,
  ReferenceInput,
  SelectInput,
  SearchInput,
} from 'react-admin'
import ExportJsonButton from './toolbar/ExportJsonButton';
import ImportJsonButton from '../component/ImportJsonButton';
import Empty from '../component/Empty';

const handleProfileChange = (e) => {
  localStorage.setItem('environment', e.target.value);
}
const rulesFilters = [
  <SearchInput source="q" alwaysOn />,
  <ReferenceInput source="profile_id" reference="profiles" alwaysOn>
    <SelectInput
      sx={{ marginTop: "0", marginBottom: "0" }}
      fullWidth
      optionText="name"
      onChange={handleProfileChange}
    />
  </ReferenceInput>,
];

const List = () => {
  return (
    <>
    <RaList className="Ralist-css"
      title={"Rules"}
      exporter={ExportJsonButton}
      empty={<Empty resource={"rules"} />}
      filters={rulesFilters}
    >
      <Datagrid rowClick="edit"
        sx={{
          '& .RaDatagrid-row': {
              height: '45px',
          },
          '& .RaDatagrid-root': {
            marginTop: '400px'
          }
      }}
      >
        <TextField source='name' />
        <TextField source='priority' />
        <TextField source='profile_id' />
        <TextField source='match.rules.path' />
        <NumberField source='match.rules.client_ip' />
        <BooleanField source='match.response.allow' />
      </Datagrid>
    </RaList>
      <ImportJsonButton resource={"rules"} />
    </>
  )
}

export default List