import React from 'react';
// import TextareaAutosize from '@mui/base/TextareaAutosize';
import { Grid, Typography, TextareaAutosize } from "@mui/material";

const Logs = ({ data, heading }) => {
    return (
        <Grid>
            <Typography
                variant="h5"
                sx={{
                    textAlign: 'center',
                    marginBottom: '10px'
                }}
            >
                { heading }
            </Typography>
            <TextareaAutosize
                defaultValue={data}
                maxRows={40}
                style={{
                    width: '100%',
                    padding: '15px',
                    background: '#161616',
                    color: '#fff',
                    fontSize: '16px'
                }}
                disabled
            />
        </Grid>
    )
}

export default Logs