import { Grid } from "@mui/material";
import React from "react";
import { SimpleForm, ImageInput, ImageField, TextInput } from "react-admin";

const Form = () => {
  return (
    <SimpleForm title="Settings">
      <Grid container spacing={2}>
        <Grid item xs={12}>
          <TextInput source="company_name" fullWidth />
        </Grid>
        <Grid item xs={12}>
          <ImageInput source="site_logo">
            <ImageField source="src" title="title" />
          </ImageInput>
        </Grid>
      </Grid>
    </SimpleForm>
  );
};

export default Form;
