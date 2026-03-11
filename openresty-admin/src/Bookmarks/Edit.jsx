import React from "react";
import { Edit as RaEdit } from "react-admin";
import Form from "./Form";

const Edit = () => {
  return (
    <RaEdit title="Edit Bookmark" redirect="list">
      <Form type="edit" />
    </RaEdit>
  );
};

export default Edit;
