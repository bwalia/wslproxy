import React from 'react';
import { useDataProvider, useNotify } from 'react-admin';
import TextareaAutosize from '@mui/base/TextareaAutosize';
import { Grid, Typography } from "@mui/material";

const Logs = () => {
    const dataProvider = useDataProvider();
    const notify = useNotify();
    const [logData, setLogData] = React.useState({});
    React.useEffect(() => {
        const logs = dataProvider.getLogs("openresty_logs")
        logs.then(log => {
            setLogData(log?.data?.logs)
        });
        logs.catch(error => notify(error, { type: 'error' }));
    }, [])
    return (
        <Grid>
            <Typography 
                variant="h5" 
                sx={{ 
                    textAlign: 'center',
                    marginBottom: '10px'
                }}
            >
                Nginx Error Logs
            </Typography>
            <TextareaAutosize
                defaultValue={logData}
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