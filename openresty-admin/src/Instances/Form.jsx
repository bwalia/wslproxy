import React from 'react'
import {
    SimpleForm,
    TextInput,
    SelectArrayInput,
    useDataProvider,
    BooleanInput,
    FormDataConsumer,
    required
} from 'react-admin'
import { Grid } from "@mui/material";
import CreateTags from '../component/CreateTags';
import Button from "@mui/material/Button";

const Form = ({ isEdit, recordId }) => {
    const dataProvider = useDataProvider();

    const instanceTags = localStorage.getItem('instances.tags') || "";

    const [choices, setChoices] = React.useState([]);
    React.useEffect(() => {
        if (instanceTags && instanceTags != "undefined") {
            const tags = JSON.parse(instanceTags);
            const prevTags = tags.map((tag) => { return { id: tag, name: tag } })
            setChoices(prevTags);
        }
    }, [instanceTags]);

    const hanlePushData = (e) => {
        const elementId = e.target.id;
        const isReplace = elementId == "replace-data" ? true : false;

        dataProvider.pushDataServers("push-data", { instance: recordId, replace_data: isReplace })
            .then(({ data }) => {
                setOpen(false);
            })
            .catch((error) => {
                console.log(error);
            });
    }

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
                <Grid item xs={12} sm={12}>
                    <BooleanInput
                        source="instance_status"
                        label="Active"
                        fullWidth
                        defaultValue={false}
                    />
                </Grid>
            </Grid>
            <FormDataConsumer>
                {({ formData, ...rest }) => (
                    <React.Fragment>
                        {(formData.instance_status && isEdit) && (
                            <>
                                <Grid item md={6}>
                                    <Button
                                        variant={"contained"}
                                        onClick={hanlePushData}
                                        id='append-data'
                                    >
                                        Append Data to Server
                                    </Button>
                                </Grid>
                                {/* <Grid item md={6}>
                                    <Button
                                        variant={"contained"}
                                        onClick={hanlePushData}
                                        id='replace-data'
                                    >
                                        Push and Replace Data to Server
                                    </Button>
                                </Grid> */}
                            </>
                        )}
                    </React.Fragment>
                )}
            </FormDataConsumer>
        </SimpleForm>
    )
}

export default Form