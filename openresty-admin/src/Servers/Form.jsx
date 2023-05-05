import { Grid } from '@mui/material';
import React from 'react';
import { NumberInput, SimpleForm, TextInput } from 'react-admin';

const Form = () => {
  return (
    <SimpleForm>
      <Grid container spacing={2}>
        <Grid item xs={12}>
          <NumberInput source='listen' fullWidth />
        </Grid>
        <Grid item xs={12}>
          <TextInput source='server_name' fullWidth />
        </Grid>
        <Grid item xs={12}>
          <TextInput source='access_log' fullWidth />
        </Grid>
        <Grid item xs={12}>
          <TextInput source='root' fullWidth />
        </Grid>
      </Grid>
    </SimpleForm>
  )
}

export default Form