import React from 'react';
import { ReferenceInput, SelectInput, useDataProvider } from 'react-admin';
import { Dialog, DialogContent } from "@mui/material";

const EnvProfileHandler = ({ open, onClose }) => {
    const dataProvider = useDataProvider();
    const handleProfileChange = () => {
        dataProvider.syncAPI("frontdoor/opsapi/sync", {})
      }
    return (
        <Dialog open={open} onClose={onClose}>
            <DialogContent>
                <ReferenceInput source="profile_id" reference="profiles" >
                    <SelectInput
                        sx={{ marginTop: "0", marginBottom: "0" }}
                        fullWidth
                        optionText="name"
                        onChange={handleProfileChange}
                    />
                </ReferenceInput>
            </DialogContent>
        </Dialog>
    )
}

export default EnvProfileHandler