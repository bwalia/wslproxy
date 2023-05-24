import { Box, Grid } from "@mui/material";
import React from "react";
import {
  NumberInput,
  SimpleForm,
  TextInput,
  TabbedForm,
  ArrayInput,
  SimpleFormIterator,
  SelectInput,
  useGetList,
  ReferenceArrayInput,
  FormDataConsumer,
} from "react-admin";

const Form = () => {
  
  return (
    <TabbedForm>
      <TabbedForm.Tab label="Server Details">
        <Grid container spacing={2}>
          <Grid item xs={6}>
            <TextInput source="listen" fullWidth />
          </Grid>
          <Grid item xs={6}>
            <TextInput source="server_name" fullWidth label="Domain Name" />
          </Grid>
          <Grid item xs={12}>
            <TextInput
              multiline
              source="config"
              helperText="For example: server {listen       8000; listen       somename:8080; server_name  somename  alias  another.alias; location / { root   html; index  index.html index.htm; }}"
              fullWidth
            />
          </Grid>
        </Grid>
      </TabbedForm.Tab>
      <TabbedForm.Tab label="Request/Security Rules">
        <ReferenceArrayInput source="rules" reference="rules">
          <SelectInput optionText="name" sx={{ minWidth: "342px" }} />
        </ReferenceArrayInput>
        <FormDataConsumer>
          {({ formData, ...rest }) => (
            <div>
              {/* {console.log({ formData })} */}
              {formData?.rules && (
                <ArrayInput source="conditions">
                  <SimpleFormIterator inline>
                    <SelectInput
                      defaultValue={"none"}
                      source="condition"
                      fullWidth
                      label="Condition"
                      choices={[
                        { id: "none", name: "N/A" },
                        { id: "or", name: "OR" },
                        { id: "and", name: "AND" },
                      ]}
                    />
                    <ReferenceArrayInput
                      source="statement"
                      filter={{ id: formData?.rules }}
                      allowEmpty
                      reference="rules"
                    >
                      <SelectInput
                        optionText="name"
                        parse={(value) =>
                          value === "not defined" ? undefined : null
                        }
                        fullWidth
                      />
                    </ReferenceArrayInput>
                  </SimpleFormIterator>
                </ArrayInput>
              )}
            </div>
          )}
        </FormDataConsumer>
      </TabbedForm.Tab>
    </TabbedForm>
  );
};

export default Form;
