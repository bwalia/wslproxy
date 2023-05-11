import { Box, Grid } from "@mui/material";
import React from "react";
import { NumberInput, SimpleForm, TextInput } from "react-admin";

const Form = () => {
  return (
    <SimpleForm>
      <Grid container spacing={2}>
        <Grid item xs={6}>
          <NumberInput source="listen" fullWidth />
        </Grid>
        <Grid item xs={6}>
          <TextInput source="server_name" fullWidth />
        </Grid>
        <Grid item xs={12}>
          <TextInput
            multiline
            source="server_text"
            helperText="For example: server {listen       8000; listen       somename:8080; server_name  somename  alias  another.alias; location / { root   html; index  index.html index.htm; }}"
            fullWidth
          />
        </Grid>
      </Grid>
    </SimpleForm>
  );
};

export default Form;
