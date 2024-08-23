import * as React from 'react';
import { useDataProvider, useNotify, useStore } from 'react-admin';
import { Button, Stack } from "@mui/material";
import { isEmpty } from 'lodash';
import PublishSharpIcon from '@mui/icons-material/PublishSharp';

const ImportJsonButton = ({ resource }) => {
    const [ruleProfileFilter, setRuleProfileFilter] = useStore('rules.listParams', {});
    const [serverProfileFilter, setServerProfileFilter] = useStore('servers.listParams', {});
    const notify = useNotify();
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
                dataProvider.importProjects("projects/import", data).then((data) => {
                    if (!isEmpty(ruleProfileFilter)) {
                        const ruleFilter = {...ruleProfileFilter};
                        ruleFilter.filter.profile_id = data.data
                        setRuleProfileFilter(ruleFilter);
                        let displayedFilters = window.location.href;
                        displayedFilters = displayedFilters.split("?")[0];
                        window.history.pushState({}, "", displayedFilters);
                    }
                    if (!isEmpty(serverProfileFilter)) {
                        const serverFilter = {...serverProfileFilter};
                        serverFilter.filter.profile_id = data.data
                        setServerProfileFilter(serverFilter);
                    }
                    localStorage.setItem('environment', data.data);
                    window.location.reload();
                });
            };
            reader.readAsText(file);
        }
    };

    const handleProfileNotify = () => {
        notify(
            `Please be sure with the profile, imported data automatically goes to belonging profile. You can check the profile in json file. Open the json file -> search for profile_id, For example if it's test then all your imported data will goes to test profile, No matter which profile currently you have selected.`, 
            { type: 'info', autoHideDuration: 5000, multiLine: true }
        );
    }

    return (
        <Stack direction="row" alignItems="center" spacing={2} sx={{ marginTop: "5px" }} className="json-button-wrapper">
            <Button startIcon={<PublishSharpIcon />} variant="contained" component="label" onClick={handleProfileNotify} className="json-button">
                Import
                <input hidden type="file" accept=".json" onChange={handleFileUpload} />
            </Button>
        </Stack>
    );
};

export default ImportJsonButton;
