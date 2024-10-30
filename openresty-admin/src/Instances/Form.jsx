import React from 'react'
import {
    SimpleForm,
    TextInput,
    SelectArrayInput,
    required
} from 'react-admin'
import { Grid } from "@mui/material";
import CreateTags from '../component/CreateTags';

const Form = ({ isEdit }) => {
    const instanceTags = localStorage.getItem('instances.tags') || "";

    const [choices, setChoices] = React.useState([]);
    React.useEffect(() => {
        if (instanceTags && instanceTags != "undefined") {
            const tags = JSON.parse(instanceTags);
            const prevTags = tags.map((tag) => { return { id: tag, name: tag } })
            setChoices(prevTags);
        }
    }, [instanceTags]);
    
    return (
        <SimpleForm>
            <Grid container spacing={2}>
                <Grid item xs={12} sm={12}>
                    <TextInput
                        source="instance_name"
                        label="Instance Name"
                        validate={[required()]}
                        fullWidth
                    />
                </Grid>
                <Grid item xs={12} sm={12}>
                    <TextInput
                        source="host_ip"
                        label="Host IP"
                        validate={[required()]}
                        fullWidth
                    />
                </Grid>
                <Grid item xs={12} sm={12}>
                    <TextInput
                        source="host_port"
                        label="Host Port"
                        validate={[required()]}
                        fullWidth
                    />
                </Grid>
                <Grid item xs={12} sm={12}>
                    <TextInput
                        source="host_type"
                        label="Host Type"
                        validate={[required()]}
                        fullWidth
                    />
                </Grid>
                <Grid item xs={12} sm={12}>
                    <SelectArrayInput
                        source="instances_tags"
                        choices={choices}
                        create={<CreateTags choices={choices} />}
                    />
                </Grid>
            </Grid>
        </SimpleForm>
    )
}

export default Form