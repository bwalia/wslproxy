import { startCase } from "lodash";
import React from "react";
import {
  TextInput,
  ArrayInput,
  SimpleFormIterator,
  FormDataConsumer,
  SelectArrayInput,
} from "react-admin";

const LocationInput = ({source}) => {
  return (
    <ArrayInput source={source}>
      <SimpleFormIterator>
        <TextInput source="location_path" />
        <SelectArrayInput
          source="location_opts"
          label="Location options"
          choices={[
            { id: "proxy_pass", name: "Proxy Pass" },
            { id: "proxy_set_header", name: "Proxy set Header" },
            { id: "allow", name: "Allowed IPs" },
            { id: "deny", name: "Denied IPs" },
            { id: "root", name: "Root Dir of Location" },
            { id: "index", name: "Index file of Location" },
            { id: "try_files", name: "Try Files" },
            { id: "rewrite", name: "Rewrite Rules" },
            { id: "fastcgi_pass", name: "Fast CGI Pass" },
            { id: "expires", name: "Expires" },
            { id: "auth_basic", name: "Auth Basic" },
          ]}
        />
        <FormDataConsumer>
          {({ formData, scopedFormData, getSource }) => {
            const selectedOptions = scopedFormData.location_opts || [];
            return selectedOptions.map((option, index) => (
              <React.Fragment key={index}>
                <TextInput
                  source={getSource(`location_vals[${option}]`)}
                  label={startCase(option)}
                />
              </React.Fragment>
            ));
          }}
        </FormDataConsumer>
      </SimpleFormIterator>
    </ArrayInput>
  );
};

export default LocationInput;
