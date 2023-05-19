import { Grid } from "@mui/material";
import React from "react";
import {
  ArrayInput,
  BooleanInput,
  NumberInput,
  RichTextField,
  SimpleForm,
  SimpleFormIterator,
  TextInput,
} from "react-admin";

const Form = () => {
  return (
    <SimpleForm>
      <ArrayInput source="data">
        <SimpleFormIterator inline sanitizeEmptyValues={false}>
          <TextInput source="name" fullWidth />
          <NumberInput source="version" fullWidth />
          <NumberInput source="priority" fullWidth />
          <TextInput source="match.rules.path" fullWidth />
          <TextInput source="match.rules.client_ip" fullWidth />
          <TextInput source="match.rules.country" fullWidth />
          <TextInput source="match.operator.lookup" fullWidth />
          <NumberInput source="match.response.code" fullWidth />
          <TextInput source="match.response.redirect_uri" fullWidth />
          <BooleanInput source="match.response.allow" fullWidth />
          <TextInput multiline source="match.response.message" fullWidth />
        </SimpleFormIterator>
      </ArrayInput>
    </SimpleForm>
  );
};

export default Form;