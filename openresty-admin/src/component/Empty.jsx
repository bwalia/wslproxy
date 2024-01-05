import React from 'react';
import { Box, Typography } from '@mui/material';
import { CreateButton, FilterButton, ReferenceInput, SelectInput } from 'react-admin';
import ImportJsonButton from './ImportJsonButton';

const handleProfileChange = (e) => {
    localStorage.setItem('environment', e.target.value);
  }
  const rulesFilters = [
    <ReferenceInput source="profile_id" reference="profiles" >
      <SelectInput
        sx={{ marginTop: "0", marginBottom: "0" }}
        fullWidth
        optionText="name"
        onChange={handleProfileChange}
      />
    </ReferenceInput>,
  ];

const Empty = ({resource}) => {
    return (
        <Box textAlign="center" m={"auto"} sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: "90vh", flexDirection: "column" }}>
            <Typography variant="h4" paragraph>
                No {resource} available
            </Typography>
            <Typography variant="body1">
                Create one or import from a JSON file
            </Typography>
            <CreateButton />
            {/* <FilterButton filters={rulesFilters} /> */}
            <ImportJsonButton resource={resource} />
        </Box>
    )
}

export default Empty