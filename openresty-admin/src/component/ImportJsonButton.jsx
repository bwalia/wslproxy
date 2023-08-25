import * as React from 'react';
import { useDataProvider } from 'react-admin';
import { Button, Stack } from "@mui/material";

const ImportJsonButton = ({ resource }) => {
    const dataProvider = useDataProvider();
    const handleFileUpload = (event) => {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                const jsonData = JSON.parse(event.target.result);
                const data = new Object();
                data.data = jsonData;
                data.dataType = resource;
                dataProvider.importProjects("projects/import", data)
            };
            reader.readAsText(file);
        }
    };

    return (
        <Stack direction="row" alignItems="center" spacing={2} sx={{ marginTop: "20px" }}>
            <Button variant="contained" component="label">
                Import
                <input hidden type="file" accept=".json" onChange={handleFileUpload} />
            </Button>
        </Stack>
    );
};

export default ImportJsonButton;
