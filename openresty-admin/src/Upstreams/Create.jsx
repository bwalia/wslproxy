import React from "react";
import { Create as RaCreate } from "react-admin";
import Form from "./Form";

const Create = () => {
  return (
    <RaCreate redirect="list" title="Create Upstream">
      <Form type="create" />
    </RaCreate>
  );
};

export default Create;
