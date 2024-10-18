import React from 'react'
import {
    SimpleForm,
    TextInput,
    ArrayInput,
    SimpleFormIterator,
    SelectArrayInput,
    required
} from 'react-admin'
import { Grid } from "@mui/material";
import CreateTags from '../component/CreateTags';

const Form = () => {
    const secretTags = localStorage.getItem('secrets.tags') || "";
    
    const [choices, setChoices] = React.useState([]);
    React.useEffect(() => {
        if (secretTags && secretTags != "undefined") {
            const tags = JSON.parse(secretTags);
            const prevTags = tags.map((tag) => { return { id: tag, name: tag } })
            setChoices(prevTags);
        }
    }, [secretTags]);

    return (
        <SimpleForm>
            <Grid container spacing={2}>
                <Grid item xs={12} sm={12}>
                    <TextInput
                        source="secret_name"
                        label="Secret Name"
                        validate={[required()]}
                        fullWidth
                    />
                </Grid>
                <Grid item xs={12} sm={12}>
                    <SelectArrayInput
                        source="secrets_tags"
                        choices={choices}
                        create={<CreateTags choices={choices} />}
                    />
                </Grid>
                <Grid item xs={12} sm={12}>
                    <ArrayInput source="secrets">
                        <SimpleFormIterator inline>
                            <TextInput source="key" helperText={false} fullWidth />
                            <TextInput source="value" helperText={false} fullWidth />
                        </SimpleFormIterator>
                    </ArrayInput>
                </Grid>
            </Grid>
        </SimpleForm>
    )
}

export default Form