import { Grid } from "@mui/material";
import React from "react";
import {
  TextInput,
  TabbedForm,
  ArrayInput,
  SimpleFormIterator,
  SelectInput,
  useDataProvider,
  ReferenceArrayInput,
  FormDataConsumer,
  Menu,
  required,
} from "react-admin";

import LocationInput from "./input/LocationInput";
import CreateServerText from "./input/CreateServerText";

const Form = () => {
  const dataProvider = useDataProvider();
  const [totalResults, setTotalResults] = React.useState(0);
  const initialValues = [{ quantity: 1 }];

  React.useEffect(() => {
    const fetchData = async () => {
      try {
        const { data, total } = await dataProvider.getList("rules", {
          filter: {}, // Adjust the filter based on your API
          pagination: { page: 1, perPage: 10 }, // Adjust pagination if needed
        });

        const totalCount = total; // Extract the total count from the API response
        setTotalResults(totalCount);
      } catch (error) {
        console.log({ error });
      }
    };
    fetchData();
  }, []);
  return (
    <TabbedForm>
      <TabbedForm.Tab label="Server details">
        <Grid container spacing={2}>
          <Grid item xs={4}>
            <ArrayInput
              source="listens"
              label=""
              defaultValue={[{ listen: "" }]}
            >
              <SimpleFormIterator initialValues={initialValues}>
                <TextInput source="listen" fullWidth />
              </SimpleFormIterator>
            </ArrayInput>
          </Grid>
          <Grid item xs={8}>
            <TextInput
              source="server_name"
              fullWidth
              label="Server/Domain name"
              validate={[required()]}
            />
          </Grid>
          <Grid item xs={3}>
            <TextInput source="root" fullWidth label="Root path" />
          </Grid>
          <Grid item xs={3}>
            <TextInput source="index" fullWidth label="Index file" />
          </Grid>
          <Grid item xs={3}>
            <TextInput source="access_log" fullWidth label="Access logs path" />
          </Grid>
          <Grid item xs={3}>
            <TextInput source="error_log" fullWidth label="Error logs path" />
          </Grid>
          <Grid item xs={12}>
            <LocationInput />
          </Grid>
          <Grid item xs={12}>
            <ArrayInput source="custom_block" label="Additional block">
              <SimpleFormIterator>
                <TextInput multiline source="additional_block" />
              </SimpleFormIterator>
            </ArrayInput>
          </Grid>
          <Grid item xs={12}>
            <CreateServerText />
          </Grid>
        </Grid>
      </TabbedForm.Tab>
      <TabbedForm.Tab label="Request/Security rules">
        {totalResults >= 1 ? (
          <>
            <ReferenceArrayInput source="rules" reference="rules">
              <SelectInput optionText="name" sx={{ minWidth: "342px" }} />
            </ReferenceArrayInput>
            <FormDataConsumer>
              {({ formData, ...rest }) => (
                <div>
                  {formData?.rules && totalResults > 1 && (
                    <ArrayInput source="match_cases">
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
                          queryOptions={{ meta: { exclude: formData?.rules } }}
                          reference="rules"
                        >
                          <SelectInput optionText="name" fullWidth />
                        </ReferenceArrayInput>
                      </SimpleFormIterator>
                    </ArrayInput>
                  )}
                </div>
              )}
            </FormDataConsumer>
          </>
        ) : (
          <>
            <p>There are no rules available yet please create here!</p>
            <Menu.Item to="/rules" primaryText="Rules" />
          </>
        )}
      </TabbedForm.Tab>
    </TabbedForm>
  );
};

export default Form;
