import React from "react";
import { Edit as RaEdit } from "react-admin";
import Form from "./Form";

const Edit = () => {
  return (
    <RaEdit title={"Instances"} redirect="list">
      <Form isEdit={true} />
    </RaEdit>
  );
};

export default Edit;
