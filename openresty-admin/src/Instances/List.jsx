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
} from "react-admin";
import Empty from '../component/Empty';

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

const List = () => {
  return (
    <RaList
      title={"Instances"}
      sort={{ field: 'created_at', order: 'DESC' }}
      empty={<Empty resource={"instances"} />}
      filters={secretFilters}
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