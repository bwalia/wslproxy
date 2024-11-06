import React from "react";
import { Edit as RaEdit, useGetRecordId, } from "react-admin";
import Form from "./Form";

const Edit = () => {
  const recordId = useGetRecordId();
  return (
    <RaEdit title={"Instances"} redirect="list">
      <Form isEdit={true} recordId={recordId} />
    </RaEdit>
  );
};

export default Edit;
