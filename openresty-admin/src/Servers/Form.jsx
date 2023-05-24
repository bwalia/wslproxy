import { Box, Grid } from "@mui/material";
import React from "react";
import { NumberInput, SimpleForm, TextInput,
  TabbedForm,
  ArrayInput,
  SimpleFormIterator,
  SelectInput,
  useGetList,
  ReferenceArrayInput,
  AutocompleteArrayInput
  // Edit,
  // Datagrid,
  // TextField,
  // DateField,
  // ReferenceManyField,    
  // DateInput,
  // BooleanInput,
  // EditButton,
  
 } from "react-admin";

 function required()
 {

 }

const Form = () => {

  const { data, total, isLoading, error } = useGetList(
    'rules',
    {}
);
// if (isLoading) { return <p>Loading...</p>; }
// if (error) { return <p>ERROR</p>; }
console.log('rules',data)
const objectToArray = (dataobj = {}) => {
    console.log(dataobj)
    const res = [];
    if(dataobj.lenght>0){
    dataobj.map(obj =>{
      console.log(obj)
      const myobj = {}
      myobj['id'] = obj.id;
      myobj['name'] = obj.name 
      res.push(myobj);
    });
  }
    return res;
};
  return (
   
        <TabbedForm>
            <TabbedForm.Tab label="Server Details">
            <Grid container spacing={2}>
        <Grid item xs={6}>
          <TextInput source="listen" fullWidth />
        </Grid>
        <Grid item xs={6}>
          <TextInput source="server_name" fullWidth />
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
            <ReferenceArrayInput source="rules.match.rule" reference="rules">

              <SelectInput optionText="name" />

            </ReferenceArrayInput>

      
            <ArrayInput source="rules">
                <SimpleFormIterator inline>
                <SelectInput defaultValue={"none"} source="match.rule.condition" fullWidth label="Condition" choices={[
                        { id: 'none', name: 'N/A' },
                        { id: 'or', name: 'OR' },
                        { id: 'and', name: 'AND' },
                    ]} />
                <ReferenceArrayInput source="rules.match.rule.statement" reference="rules">

            <SelectInput optionText="name" />

            </ReferenceArrayInput>
                
                
                
                </SimpleFormIterator>
            </ArrayInput>
            </TabbedForm.Tab>
            {/* <TabbedForm.Tab label="Miscellaneous">
                <TextInput label="Password (if protected post)" source="password" type="password" />
                <DateInput label="Publication date" source="published_at" />
                <NumberInput source="average_note"  />
                <BooleanInput label="Allow comments?" source="commentable" defaultValue />
                <TextInput disabled label="Nb views" source="views" />
            </TabbedForm.Tab>
            <TabbedForm.Tab label="comments">
                <ReferenceManyField reference="comments" target="post_id" label={false}>
                    <Datagrid>
                        <TextField source="body" />
                        <DateField source="created_at" />
                        <EditButton />
                    </Datagrid>
                </ReferenceManyField>
            </TabbedForm.Tab> */}
        </TabbedForm>

  );
};

export default Form;
