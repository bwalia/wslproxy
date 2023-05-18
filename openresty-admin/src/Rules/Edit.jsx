import React from 'react';
import { Edit as RaEdit } from 'react-admin'
import Form from './Form';
import { Grid } from "@mui/material";
import {
  ArrayInput,
  BooleanInput,
  NumberInput,
  RichTextField,
  SimpleForm,
  SimpleFormIterator,
  TextInput,
} from "react-admin";

const Edit = () => {
  return (
    <RaEdit title={"Rule"}>
        <SimpleForm>
      <ArrayInput source="data" >
        <SimpleFormIterator inline>
          <Grid container spacing={2}>
            <Grid item xs={6}>
              <TextInput source="name" fullWidth />
            </Grid>
            <Grid item xs={3}>
              <NumberInput source="version" fullWidth />
            </Grid>
            <Grid item xs={3}>
              <NumberInput source="priority" fullWidth />
            </Grid>
            <Grid item xs={4}>
              <TextInput source="match.rules.path" fullWidth />
            </Grid>
            <Grid item xs={4}>
              <TextInput source="match.rules.client_ip" fullWidth />
            </Grid>
            <Grid item xs={4}>
              <TextInput source="match.rules.country" fullWidth />
            </Grid>
            <Grid item xs={2}>
              <TextInput source="match.operator.lookup" fullWidth />
            </Grid>
            <Grid item xs={2}>
              <NumberInput source="match.response.code" fullWidth />
            </Grid>
            <Grid item xs={6}>
              <TextInput source="match.response.redirect_uri" fullWidth />
            </Grid>
            <Grid item xs={2}>
              <BooleanInput source="match.response.allow" fullWidth />
            </Grid>
            <Grid item xs={12}>
              <TextInput multiline source="match.response.message" fullWidth />
            </Grid>
          </Grid>
        </SimpleFormIterator>
      </ArrayInput>
    </SimpleForm>
    </RaEdit>
  )
}

export default Edit