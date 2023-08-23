import * as React from 'react';
import { Button, useDataProvider } from 'react-admin';

const ImportJsonButton = ({ resource }) => {
    const dataProvider = useDataProvider();
    const handleFileUpload = (event) => {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                const jsonData = event.target.result;
                dataProvider.importProjects("projects/import", JSON.parse(jsonData))
            };
            reader.readAsText(file);
        }
    };

    return (
        <div>
            <input type="file" accept=".json" onChange={handleFileUpload} />
            <Button label="Import JSON" component="label" htmlFor="import-json" />
        </div>
    );
};

export default ImportJsonButton;
