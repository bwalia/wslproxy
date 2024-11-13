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
  SelectArrayInput,
  AutocompleteInput,
} from "react-admin";

import LocationInput from "./input/LocationInput";
import CreateServerText from "./input/CreateServerText";
import Toolbar from "./toolbar/Toolbar";
import CreateTags from "../component/CreateTags";

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

  const secretTags = localStorage.getItem('servers.tags') || "";

  const [choices, setChoices] = React.useState([]);
  React.useEffect(() => {
    if (secretTags && secretTags != "undefined") {
      const tags = JSON.parse(secretTags);
      const prevTags = tags.map((tag) => { return { id: tag, name: tag } })
      setChoices(prevTags);
    }
  }, [secretTags]);

  return (
    <TabbedForm toolbar={<Toolbar />}>
      <TabbedForm.Tab label="Nginx Server">
        <Grid container spacing={2}>
          <Grid item md={3} sm={6} xs={12}>
            <ArrayInput
              source="listens"
              label=""
              defaultValue={[{ listen: "" }]}
              fullWidth
            >
              <SimpleFormIterator initialValues={initialValues}>
                <TextInput source="listen" fullWidth className="serverListen" />
              </SimpleFormIterator>
            </ArrayInput>
          </Grid>
          <Grid item md={3} sm={6} xs={12}>
            <TextInput
              source="server_name"
              fullWidth
              label="Server/Domain name"
              validate={[required()]}
              disabled={type === "edit" ? true : false}
            />
          </Grid>
          <Grid item md={3} sm={6} xs={12}>
            <TextInput
              source="proxy_server_name"
              fullWidth
              label="Proxy Server/Domain name"
            />
          </Grid>
          <Grid item md={3} sm={6} xs={12}>
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
          <Grid item md={3} sm={6} xs={12}>
            <SelectArrayInput
              source="servers_tags"
              choices={choices}
              create={<CreateTags choices={choices} />}
              fullWidth
            />
          </Grid>
          <Grid item md={3} sm={6} xs={12}>
            <TextInput source="root" defaultValue={"/var/www/html"} fullWidth label="Root path" />
          </Grid>
          <Grid item md={2} sm={4} xs={12}>
            <TextInput source="index" defaultValue={"index.html"} fullWidth label="Index file" />
          </Grid>
          <Grid item md={2} sm={4} xs={12}>
            <TextInput source="access_log" defaultValue={"logs/access.log"} fullWidth label="Access logs path" />
          </Grid>
          <Grid item md={2} sm={4} xs={12}>
            <TextInput source="error_log" defaultValue={"logs/error.log"} fullWidth label="Error logs path" />
          </Grid>

          <Grid item md={12} sm={12} xs={12}>
            <LocationInput source="locations" />
          </Grid>
          <Grid item md={12} sm={12} xs={12}>
            <ArrayInput fullWidth source="custom_block" label="Additional Server block">
              <SimpleFormIterator fullWidth>
                <TextInput multiline fullWidth source="additional_block" className="config-block" />
              </SimpleFormIterator>
            </ArrayInput>
          </Grid>
          <Grid item md={12} sm={12} xs={12}>
            <ArrayInput fullWidth source="custom_location_block" label="Additional Location block">
              <SimpleFormIterator fullWidth>
                <TextInput multiline source="additional_location_block" fullWidth className="config-block" />
              </SimpleFormIterator>
            </ArrayInput>
          </Grid>
          <Grid item md={12} sm={12} xs={12}>
            <ArrayInput source="custom_http_block" label="Additional Http block" fullWidth>
              <SimpleFormIterator fullWidth>
                <TextInput multiline source="additional_http_block" fullWidth className="config-block" />
              </SimpleFormIterator>
            </ArrayInput>
          </Grid>
          <Grid item md={12} sm={12} xs={12}>
            <CreateServerText source="config" />
          </Grid>
        </Grid>
      </TabbedForm.Tab>
      <TabbedForm.Tab label="Varnish Server">
        {totalResults >= 1 ? (
          <Grid container spacing={2}>
            <Grid item md={12} sm={12} xs={12}>
              <TextInput
                multiline
                fullWidth
                source="varnish_vcl_config"
                label="Generated Varnish Server Config"
                className="code_area"
              />
            </Grid>
          </Grid>
        ) : (
          <React.Fragment>
            <p>There are no rules available yet please create here!</p>
            <Menu.Item to="/rules" primaryText="Rules" />
          </React.Fragment>
        )}
      </TabbedForm.Tab>
      <TabbedForm.Tab label="Server Rules">
        {totalResults >= 1 ? (
          <React.Fragment>
            <ReferenceArrayInput source="rules" reference="rules" perPage={1000} fullWidth>
              <AutocompleteInput optionText="name" fullWidth />
            </ReferenceArrayInput>
            <FormDataConsumer>
              {({ formData, ...rest }) => (
                <div>
                  {formData?.rules && totalResults > 1 && (
                    <ArrayInput source="match_cases" fullWidth>
                      <SimpleFormIterator inline fullWidth>
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
                          fullWidth
                        >
                          <AutocompleteInput optionText="name" fullWidth />
                        </ReferenceArrayInput>
                      </SimpleFormIterator>
                    </ArrayInput>
                  )}
                </div>
              )}
            </FormDataConsumer>
          </React.Fragment>
        ) : (
          <React.Fragment>
            <p>There are no rules available yet please create here!</p>
            <Menu.Item to="/rules" primaryText="Rules" />
          </React.Fragment>
        )}
      </TabbedForm.Tab>
    </TabbedForm>
  );
};

export default Form;
