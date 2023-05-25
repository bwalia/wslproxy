import { Box, Grid, Link } from "@mui/material";
import React from "react";
import {
  NumberInput,
  SimpleForm,
  TextInput,
  TabbedForm,
  ArrayInput,
  SimpleFormIterator,
  SelectInput,
  useDataProvider,
  ReferenceArrayInput,
  FormDataConsumer,
  Menu
} from "react-admin";

const Form = () => {
  const dataProvider = useDataProvider();
  const [totalResults, setTotalResults] = React.useState(0);

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
                          filter={{ id: formData?.rules }}
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
        ): (
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
