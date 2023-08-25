import React from 'react';
import { Box, Typography } from '@mui/material';
import { CreateButton } from 'react-admin';
import ImportJsonButton from './ImportJsonButton';

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
            <ImportJsonButton resource={resource} />
        </Box>
    )
}

export default Empty