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
  ReferenceInput,
  AutocompleteInput,
} from "react-admin";

import LocationInput from "./input/LocationInput";
import CreateServerText from "./input/CreateServerText";
import Toolbar from "./toolbar/Toolbar";

const handleProfileChange = (e) => {
  localStorage.setItem('environment', e.target.value);
}

const Form = ({ type }) => {
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
    <TabbedForm toolbar={<Toolbar />}>
      <TabbedForm.Tab label="Server details">
        <Grid container spacing={2}>
          <Grid item xs={3}>
            <ArrayInput
              source="listens"
              label=""
              defaultValue={[{ listen: "" }]}
            >
              <SimpleFormIterator initialValues={initialValues}>
                <TextInput source="listen" fullWidth className="serverListen" />
              </SimpleFormIterator>
            </ArrayInput>
          </Grid>
          <Grid item xs={3}>
            <TextInput
              source="server_name"
              fullWidth
              label="Server/Domain name"
              validate={[required()]}
              disabled={type === "edit" ? true : false}
            />
          </Grid>
          <Grid item xs={3}>
            <TextInput
              source="proxy_server_name"
              fullWidth
              label="Proxy Server/Domain name"
            />
          </Grid>
          <Grid item xs={3}>
            <ReferenceInput source="profile_id" reference="profiles" >
              <SelectInput
                sx={{ marginTop: "0", marginBottom: "0" }}
                fullWidth
                optionText="name"
                onChange={handleProfileChange}
                validate={[required()]}
              />
            </ReferenceInput>
          </Grid>
          <Grid item xs={3}>
            <TextInput source="root" defaultValue={"/var/www/html"} fullWidth label="Root path" />
          </Grid>
          <Grid item xs={3}>
            <TextInput source="index" defaultValue={"index.html"} fullWidth label="Index file" />
          </Grid>
          <Grid item xs={3}>
            <TextInput source="access_log" defaultValue={"logs/access.log"} fullWidth label="Access logs path" />
          </Grid>
          <Grid item xs={3}>
            <TextInput source="error_log" defaultValue={"logs/error.log"} fullWidth label="Error logs path" />
          </Grid>
          <Grid item xs={12}>
            <LocationInput source="locations" />
          </Grid>
          <Grid item xs={12}>
            <ArrayInput source="custom_block" label="Additional Server block">
              <SimpleFormIterator>
                <TextInput multiline source="additional_block" />
              </SimpleFormIterator>
            </ArrayInput>
          </Grid>
          <Grid item xs={12}>
            <ArrayInput source="custom_location_block" label="Additional Location block">
              <SimpleFormIterator>
                <TextInput multiline source="additional_location_block" />
              </SimpleFormIterator>
            </ArrayInput>
          </Grid>
          <Grid item xs={12}>
            <ArrayInput source="custom_http_block" label="Additional Http block">
              <SimpleFormIterator>
                <TextInput multiline source="additional_http_block" />
              </SimpleFormIterator>
            </ArrayInput>
          </Grid>
          <Grid item xs={12}>
            <CreateServerText source="config" />
          </Grid>
        </Grid>
      </TabbedForm.Tab>
      <TabbedForm.Tab label="Request/Security rules">
        {totalResults >= 1 ? (
          <>
            <ReferenceArrayInput source="rules" reference="rules" perPage={1000}>
              <AutocompleteInput optionText="name" sx={{ minWidth: "342px" }} />
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
                          perPage={1000}
                        >
                          <AutocompleteInput optionText="name" fullWidth />
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
