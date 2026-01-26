import React from "react";
import { Edit as RaEdit } from "react-admin";
import Form from "./Form";

const Edit = () => {
  return (
    <RaEdit redirect="list" title="Edit Upstream">
      <Form type="edit" />
    </RaEdit>
  );
};

export default Edit;
