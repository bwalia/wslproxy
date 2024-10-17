import React from "react";
import { Edit as RaEdit } from "react-admin";
import Form from "./Form";

const Edit = () => {
  return (
    <RaEdit title={"Secrets"} redirect="list">
      <Form />
    </RaEdit>
  );
};

export default Edit;
