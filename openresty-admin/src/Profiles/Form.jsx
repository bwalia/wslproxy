import React from 'react'
import { SimpleForm, TextInput, required } from 'react-admin';
import { Grid } from '@mui/material'
const Form = () => {
    return (
        <SimpleForm>
            <h3>Profiles</h3>
            <Grid container spacing={2}>
                <Grid item xs={12}>
                    <TextInput
                        source="name"
                        label="Environment Name"
                        validate={[required()]}
                        fullWidth
                    />
                </Grid>
            </Grid>
        </SimpleForm>
    )
}

export default Form