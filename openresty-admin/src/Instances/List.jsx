import React from "react";
import {
  Datagrid,
  List as RaList,
  TextField,
  CloneButton,
  ReferenceInput,
  SelectInput,
  ArrayField,
  SingleFieldList,
  ChipField,
  TopToolbar,
  Button,
} from "react-admin";
import InfoIcon from '@mui/icons-material/Info';
import Empty from '../component/Empty';
import { MyPagination } from '../component/MyPagination';

const handleProfileChange = (e) => {
  localStorage.setItem('environment', e.target.value);
}
const secretFilters = [
  <ReferenceInput source="profile_id" reference="profiles" alwaysOn >
    <SelectInput
      sx={{ marginTop: "0", marginBottom: "0" }}
      fullWidth
      optionText="name"
      onChange={handleProfileChange}
    />
  </ReferenceInput>,
];

const ListActions = () => (
  <TopToolbar>
    <Button
      href="/#/instance-info"
      label="Server Instance Info"
      startIcon={<InfoIcon />}
      variant="contained"
      sx={{ fontWeight: 600 }}
    />
  </TopToolbar>
);

const List = () => {
  return (
    <RaList
      title={"Instances"}
      perPage={1000}
      pagination={<MyPagination />}
      sort={{ field: 'created_at', order: 'DESC' }}
      empty={<Empty resource={"instances"} />}
      filters={secretFilters}
      actions={<ListActions />}
    >
      <Datagrid rowClick="edit">
        <TextField source="instance_name" />
        {/* <ArrayField source="tags">
          <SingleFieldList linkType={false}>
            <ChipField source="instance_tags" size="small" />
          </SingleFieldList>
        </ArrayField> */}
        <CloneButton />
      </Datagrid>
    </RaList>
  )
}

export default List