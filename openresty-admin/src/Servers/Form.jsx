import { Box, Grid } from "@mui/material";
import React from "react";
import { NumberInput, SimpleForm, TextInput } from "react-admin";

const Form = () => {
  return (
    <SimpleForm>
      <Box sx={{ width: '100%' }}>
          <TextInput multiline source="server_text" fullWidth />
      </Box>
    </SimpleForm>
  );
};

export default Form;
