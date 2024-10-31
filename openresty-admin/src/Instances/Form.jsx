import React from 'react'
import {
    SimpleForm,
    TextInput,
    SelectArrayInput,
    useDataProvider,
    useGetRecordId,
    required
} from 'react-admin'
import { Grid } from "@mui/material";
import CreateTags from '../component/CreateTags';
import Button from "@mui/material/Button";

const Form = ({ isEdit }) => {
    const recordId = useGetRecordId();
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

    const hanlePushData = () => {
        dataProvider.pushDataServers("push-data", { instance: recordId })
        .then(({ data }) => {
          const { storage } = data;
          setOpen(false);
          localStorage.setItem("storageManagement", storage);
          setStorageMgmt(storage);
          window.location.reload();
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
            </Grid>
            <Button variant={"contained"} onClick={hanlePushData}>Push Data to Server</Button>
        </SimpleForm>
    )
}

export default Form